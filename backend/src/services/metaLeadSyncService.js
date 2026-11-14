const { AppError } = require('../utils/errors');
const { graphRequest } = require('./metaGraph');
const MetaAdsService = require('./metaAdsService');
const MetaAdsSettingsService = require('./metaAdsSettingsService');
const MetaLeadImportService = require('./metaLeadImportService');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const prisma = require('../db/prisma');

// ---------------------------------------------------------------------------
// Phase 2E/2I — historical backfill, bounded retry of failed imports and sync
// history. Both operations run through MetaLeadImportService.importLead (the
// same path the webhook uses), so dedupe, mapping, attribution, self-claim
// eligibility and WhatsApp notifications can never diverge between sources.
//
// Bounded by construction:
// - page cap + page size cap (no unbounded sequential API calls),
// - per-lead transient retry with exponential backoff and an attempt cap,
// - consecutive-failure circuit breaker so a dead token cannot grind through
//   hundreds of leads one timeout at a time,
// - counts reflect what actually committed: a lead is only counted imported
//   after LeadService.createLead resolved (a failed DB transaction lands in
//   `failed`, never in `imported`).
// ---------------------------------------------------------------------------

const BACKFILL_PAGE_SIZE = 50;
const MAX_BACKFILL_PAGES = 10; // 50 × 10 = 500 leads per run (hard cap)
const MAX_CONSECUTIVE_FAILURES = 10;
const MAX_RETRY_EVENTS = 100;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 200;
const HISTORY_LIMIT_DEFAULT = 25;
const HISTORY_LIMIT_MAX = 50;

const digitsOnly = (value) => /^\d+$/.test(String(value || ''));

function utcStartOfDay(dateStr) {
    return new Date(`${dateStr}T00:00:00.000Z`);
}

function utcEndOfDay(dateStr) {
    return new Date(`${dateStr}T23:59:59.999Z`);
}

function finalizeStatus(counts, errorCode) {
    if (errorCode) return 'FAILED';
    if (counts.failed === 0) return 'COMPLETED';
    const touched = counts.imported + counts.duplicates + counts.skipped;
    return touched > 0 ? 'PARTIAL' : 'FAILED';
}

class MetaLeadSyncService {
    // 2E — manual historical import for one Page + form over an optional
    // date range. `since`/`until` travel to Meta as unix bounds where the
    // edge supports them and are re-checked locally when the API reports a
    // created_time (a range is never silently widened into "everything" —
    // the page cap still bounds the run either way).
    static async backfill({ organizationId, userId, pageId, formId, since, until }) {
        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);
        // Same page allow-list contracts as the webhook (503 unconfigured /
        // 400 PAGE_MISMATCH / 500 no organization).
        const resolvedOrgId = await MetaAdsService.resolveLeadgenOrganization(String(pageId), organizationId, eff);
        const token = MetaAdsService.requireToken(eff);

        const sinceDate = since ? utcStartOfDay(since) : null;
        const untilDate = until ? utcEndOfDay(until) : null;

        const run = await prisma.metaLeadSyncRun.create({
            data: {
                organizationId: resolvedOrgId,
                formId: String(formId),
                pageId: String(pageId),
                source: 'BACKFILL',
                status: 'RUNNING',
            },
        });

        const counts = { fetched: 0, imported: 0, duplicates: 0, skipped: 0, failed: 0 };
        const failures = [];
        let truncated = false;
        let abortCode = null;
        let consecutiveFailures = 0;
        let after = null;
        let pages = 0;

        const listParams = {
            limit: BACKFILL_PAGE_SIZE,
            ...(sinceDate ? { since: Math.floor(sinceDate.getTime() / 1000) } : {}),
            ...(untilDate ? { until: Math.floor(untilDate.getTime() / 1000) } : {}),
        };

        paging:
        while (pages < MAX_BACKFILL_PAGES) {
            let data;
            try {
                data = await graphRequest({
                    path: `${formId}/leads`,
                    params: { ...listParams, ...(after ? { after } : {}) },
                    token,
                    version: eff.graphVersion,
                });
            } catch (err) {
                // The listing itself failed (rate limit, dead token, ...):
                // nothing was imported — fail the run honestly.
                abortCode = (err && err.code) || 'META_API_ERROR';
                failures.push({ metaLeadId: null, code: abortCode });
                break paging;
            }
            pages += 1;
            const rows = Array.isArray(data.data) ? data.data : [];

            for (const row of rows) {
                const leadId = row && row.id !== undefined && row.id !== null ? String(row.id) : '';
                if (!digitsOnly(leadId)) continue;
                const createdSeconds = Number(row && row.created_time);
                if (sinceDate && Number.isFinite(createdSeconds) && createdSeconds > 0
                    && createdSeconds * 1000 < sinceDate.getTime()) {
                    continue;
                }
                if (untilDate && Number.isFinite(createdSeconds) && createdSeconds > 0
                    && createdSeconds * 1000 > untilDate.getTime()) {
                    continue;
                }
                counts.fetched += 1;

                try {
                    const result = await MetaLeadImportService.retryTransient(
                        () => MetaLeadImportService.importLead({
                            organizationId: resolvedOrgId,
                            eff,
                            value: {
                                leadgen_id: leadId,
                                page_id: String(pageId),
                                form_id: String(formId),
                                ...(row.created_time !== undefined && row.created_time !== null
                                    ? { created_time: row.created_time } : {}),
                            },
                            source: 'BACKFILL',
                            runId: run.id,
                            resolveToken: () => token,
                        }),
                        { attempts: RETRY_ATTEMPTS, baseMs: RETRY_BASE_MS }
                    );
                    consecutiveFailures = 0;
                    if (result.duplicate) counts.duplicates += 1;
                    else if (result.ignored) counts.skipped += 1;
                    else counts.imported += 1;
                } catch (err) {
                    counts.failed += 1;
                    const code = (err && err.code) || 'UNKNOWN';
                    failures.push({ metaLeadId: leadId, code });
                    await MetaLeadImportService.recordEvent({
                        organizationId: resolvedOrgId,
                        source: 'BACKFILL',
                        metaLeadId: leadId,
                        pageId: String(pageId),
                        formId: String(formId),
                        status: 'FAILED',
                        errorCode: code,
                        runId: run.id,
                    });
                    consecutiveFailures += 1;
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        abortCode = code;
                        break paging;
                    }
                }
            }

            const nextAfter = data.paging && data.paging.cursors ? data.paging.cursors.after : null;
            if (!nextAfter || rows.length === 0) break;
            if (pages >= MAX_BACKFILL_PAGES) {
                truncated = true;
                break;
            }
            after = nextAfter;
        }

        const status = finalizeStatus(counts, abortCode);
        await prisma.metaLeadSyncRun.update({
            where: { id: run.id },
            data: {
                fetchedCount: counts.fetched,
                importedCount: counts.imported,
                duplicateCount: counts.duplicates,
                skippedCount: counts.skipped,
                failedCount: counts.failed,
                status,
                errorCode: abortCode,
                completedAt: new Date(),
            },
        });

        let lastSyncedAt = null;
        if (counts.imported + counts.duplicates > 0) {
            try {
                await prisma.metaLeadFormConfig.updateMany({
                    where: { organizationId: resolvedOrgId, formId: String(formId) },
                    data: { lastSyncedAt: new Date() },
                });
                lastSyncedAt = new Date();
            } catch (err) {
                console.warn('[meta-lead-sync] lastSyncedAt write failed', { code: (err && err.code) || 'UNKNOWN' });
            }
        }

        // Counts and Meta identifiers only — no lead names/phones in audit.
        await audit(resolvedOrgId, userId, AUDIT_ACTIONS.META_LEADS_BACKFILLED,
            'MetaLeadSyncRun', run.id, {
                formId: String(formId),
                pageId: String(pageId),
                fetched: counts.fetched,
                imported: counts.imported,
                duplicates: counts.duplicates,
                skipped: counts.skipped,
                failed: counts.failed,
                status,
            });

        return {
            runId: run.id,
            status,
            fetched: counts.fetched,
            imported: counts.imported,
            duplicates: counts.duplicates,
            skipped: counts.skipped,
            failed: counts.failed,
            truncated,
            failures: failures.slice(0, 50),
            lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
        };
    }

    // 2E — retry the FAILED events of one run through the same import path.
    // Already-imported leads short-circuit as duplicates inside importLead,
    // so retrying can never create a second CRM lead.
    static async retryRun({ organizationId, userId, runId }) {
        const origin = await prisma.metaLeadSyncRun.findFirst({ where: { id: runId, organizationId } });
        if (!origin) throw new AppError('Sync run not found', 404, 'NOT_FOUND');

        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);
        const resolvedOrgId = await MetaAdsService.resolveLeadgenOrganization(origin.pageId, organizationId, eff);
        const token = MetaAdsService.requireToken(eff);

        const events = await prisma.metaLeadSyncEvent.findMany({
            where: {
                organizationId: resolvedOrgId,
                runId: origin.id,
                status: 'FAILED',
                metaLeadId: { not: null },
            },
            orderBy: { createdAt: 'asc' },
            take: MAX_RETRY_EVENTS,
        });

        const run = await prisma.metaLeadSyncRun.create({
            data: {
                organizationId: resolvedOrgId,
                formId: origin.formId,
                pageId: origin.pageId,
                source: 'RETRY',
                status: 'RUNNING',
            },
        });

        const counts = { fetched: 0, imported: 0, duplicates: 0, skipped: 0, failed: 0 };
        const failures = [];
        let abortCode = null;

        for (const event of events) {
            counts.fetched += 1;
            try {
                const result = await MetaLeadImportService.retryTransient(
                    () => MetaLeadImportService.importLead({
                        organizationId: resolvedOrgId,
                        eff,
                        value: {
                            leadgen_id: String(event.metaLeadId),
                            page_id: event.pageId || origin.pageId,
                            form_id: event.formId || origin.formId,
                        },
                        source: 'RETRY',
                        runId: run.id,
                        resolveToken: () => token,
                    }),
                    { attempts: RETRY_ATTEMPTS, baseMs: RETRY_BASE_MS }
                );
                if (result.duplicate) counts.duplicates += 1;
                else if (result.ignored) counts.skipped += 1;
                else counts.imported += 1;
            } catch (err) {
                counts.failed += 1;
                const code = (err && err.code) || 'UNKNOWN';
                failures.push({ metaLeadId: String(event.metaLeadId), code });
                await MetaLeadImportService.recordEvent({
                    organizationId: resolvedOrgId,
                    source: 'RETRY',
                    metaLeadId: String(event.metaLeadId),
                    pageId: event.pageId || origin.pageId,
                    formId: event.formId || origin.formId,
                    status: 'FAILED',
                    errorCode: code,
                    runId: run.id,
                });
            }
        }

        const status = finalizeStatus(counts, abortCode);
        await prisma.metaLeadSyncRun.update({
            where: { id: run.id },
            data: {
                fetchedCount: counts.fetched,
                importedCount: counts.imported,
                duplicateCount: counts.duplicates,
                skippedCount: counts.skipped,
                failedCount: counts.failed,
                status,
                errorCode: abortCode,
                completedAt: new Date(),
            },
        });

        await audit(resolvedOrgId, userId, AUDIT_ACTIONS.META_LEAD_SYNC_RETRIED,
            'MetaLeadSyncRun', run.id, {
                retriedFrom: origin.id,
                formId: origin.formId,
                imported: counts.imported,
                duplicates: counts.duplicates,
                skipped: counts.skipped,
                failed: counts.failed,
                status,
            });

        return {
            runId: run.id,
            retriedFrom: origin.id,
            status,
            fetched: counts.fetched,
            imported: counts.imported,
            duplicates: counts.duplicates,
            skipped: counts.skipped,
            failed: counts.failed,
            failures: failures.slice(0, 50),
        };
    }

    // 2H — sync history (form, page, type, start/complete, counts, status).
    static async listHistory({ organizationId, formId, pageId, source, status, limit } = {}) {
        const take = Math.min(Math.max(parseInt(limit, 10) || HISTORY_LIMIT_DEFAULT, 1), HISTORY_LIMIT_MAX);
        const where = { organizationId };
        if (formId) where.formId = String(formId);
        if (pageId) where.pageId = String(pageId);
        if (source) where.source = String(source);
        if (status) where.status = String(status);
        const [items, total] = await Promise.all([
            prisma.metaLeadSyncRun.findMany({
                where,
                orderBy: { startedAt: 'desc' },
                take,
            }),
            prisma.metaLeadSyncRun.count({ where }),
        ]);
        const failedEvents = await prisma.metaLeadSyncEvent.count({
            where: { organizationId, status: 'FAILED' },
        });
        return {
            items: items.map((run) => ({
                id: run.id,
                formId: run.formId,
                pageId: run.pageId,
                source: run.source,
                status: run.status,
                errorCode: run.errorCode || null,
                startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
                completedAt: run.completedAt ? new Date(run.completedAt).toISOString() : null,
                fetched: run.fetchedCount,
                imported: run.importedCount,
                duplicates: run.duplicateCount,
                skipped: run.skippedCount,
                failed: run.failedCount,
            })),
            total,
            failedEvents,
        };
    }
}

module.exports = MetaLeadSyncService;
