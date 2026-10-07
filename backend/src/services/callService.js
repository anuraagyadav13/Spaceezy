const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { getTelephonyProvider } = require('../providers/telephony');
const { canSeePII, maskPhone } = require('../utils/pii');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');

const ACTIVE_STATUSES = ['INITIATED', 'RINGING', 'IN_PROGRESS'];
const TERMINAL_STATUSES = ['COMPLETED', 'MISSED', 'FAILED'];

const isExecRole = (role) => role === 'SALES_EXECUTIVE' || role === 'CHANNEL_PARTNER';

const WEBHOOK_STATUS_MAP = {
    completed: 'COMPLETED',
    answered: 'IN_PROGRESS',
    in_progress: 'IN_PROGRESS',
    ringing: 'RINGING',
    initiated: 'INITIATED',
    failed: 'FAILED',
    error: 'FAILED',
    no_answer: 'MISSED',
    noanswer: 'MISSED',
    busy: 'MISSED',
    cancelled: 'MISSED',
    rejected: 'MISSED'
};

const maskCall = (call, role) => {
    if (!call || canSeePII(role)) return call;
    const out = { ...call };
    if (out.toNumber) out.toNumber = maskPhone(out.toNumber);
    out.piiMasked = true;
    return out;
};

class CallService {
    static async getStatus() {
        const provider = getTelephonyProvider();
        return {
            provider: provider.name,
            configured: provider.isConfigured(),
            simulated: Boolean(provider.simulated),
            businessNumber: process.env.TELEPHONY_BUSINESS_NUMBER || null
        };
    }

    static async initiateCall(leadId, data, organizationId, userId, role) {
        const provider = getTelephonyProvider();
        if (!provider.isConfigured()) {
            throw new AppError('Telephony not configured. Ask your administrator to configure a telephony provider.', 409, 'TELEPHONY_NOT_CONFIGURED');
        }

        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
        if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
        if (isExecRole(role) && lead.assignedToId !== userId) {
            throw new AppError('You do not have access to this lead', 403, 'FORBIDDEN');
        }
        if (!lead.phone) {
            throw new AppError('This lead has no phone number', 400, 'BAD_REQUEST');
        }

        const businessNumber = process.env.TELEPHONY_BUSINESS_NUMBER || 'unknown';
        const call = await prisma.call.create({
            data: {
                organizationId,
                leadId: lead.id,
                userId,
                direction: data.direction || 'OUTBOUND',
                status: 'INITIATED',
                fromNumber: businessNumber,
                toNumber: lead.phone,
                provider: provider.name,
                notes: data.notes || null,
                startedAt: new Date()
            }
        });

        try {
            const result = await provider.initiateCall({
                callId: call.id,
                toNumber: lead.phone,
                fromNumber: businessNumber,
                direction: call.direction,
                leadId: lead.id,
                webhookUrl: `${process.env.BACKEND_URL || 'http://localhost:8000'}/api/v1/webhooks/telephony/${provider.name}`
            });

            const updated = await prisma.call.update({
                where: { id: call.id },
                data: { status: 'RINGING', vendorCallId: result.providerCallId || null }
            });
            await prisma.callEvent.create({
                data: { callId: call.id, status: 'RINGING', metadata: { eventId: `local_${call.id}_ringing` } }
            });

            await audit(organizationId, userId, AUDIT_ACTIONS.CALL_INITIATED, 'Call', call.id, {
                leadId: lead.id,
                direction: call.direction,
                toNumber: maskPhone(lead.phone),
                provider: provider.name
            });

            return updated;
        } catch (err) {
            await prisma.call.update({
                where: { id: call.id },
                data: { status: 'FAILED', endedAt: new Date() }
            }).catch(() => {});
            if (err instanceof AppError) throw err;
            throw new AppError('Telephony provider is unreachable', 502, 'TELEPHONY_PROVIDER_ERROR');
        }
    }

    static assertCallScope(call, role, userId) {
        if (isExecRole(role) && call.userId !== userId) {
            throw new AppError('You do not have permission to modify this call', 403, 'FORBIDDEN');
        }
    }

    static async getCallById(id, organizationId, role, userId) {
        const call = await prisma.call.findFirst({
            where: { id, organizationId },
            include: {
                lead: { select: { id: true, name: true, status: true, projectId: true, assignedToId: true } },
                user: { select: { id: true, name: true } },
                events: { orderBy: { timestamp: 'asc' } },
                tasks: { select: { id: true, title: true, status: true, dueDate: true } }
            }
        });
        if (!call) throw new AppError('Call not found', 404, 'NOT_FOUND');
        if (isExecRole(role) && call.userId !== userId) {
            throw new AppError('You do not have access to this call', 403, 'FORBIDDEN');
        }

        const seesFull = canSeePII(role);
        if (seesFull) {
            await audit(organizationId, userId, AUDIT_ACTIONS.PII_VIEWED, 'Call', call.id, { leadId: call.leadId });
        }
        return maskCall(call, role);
    }

    static async listCalls(organizationId, query, role, userId) {
        const { page = 1, limit = 20, leadId, status, direction, from, to } = query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = { organizationId };
        if (isExecRole(role)) where.userId = userId;
        if (leadId) where.leadId = leadId;
        if (status) where.status = status;
        if (direction) where.direction = direction;
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lt = new Date(to);
        }

        const [calls, total] = await Promise.all([
            prisma.call.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { createdAt: 'desc' },
                include: {
                    lead: { select: { id: true, name: true, status: true } },
                    user: { select: { id: true, name: true } }
                }
            }),
            prisma.call.count({ where })
        ]);

        return { calls: calls.map((c) => maskCall(c, role)), total, pages: Math.ceil(total / limit) };
    }

    static async hangupCall(id, organizationId, userId, role) {
        const provider = getTelephonyProvider();
        const call = await prisma.call.findFirst({ where: { id, organizationId } });
        if (!call) throw new AppError('Call not found', 404, 'NOT_FOUND');
        CallService.assertCallScope(call, role, userId);

        // Idempotent: already-ended calls are returned as-is.
        if (TERMINAL_STATUSES.includes(call.status)) {
            return call;
        }

        if (provider.isConfigured()) {
            try {
                if (call.vendorCallId) {
                    await provider.hangupCall({ providerCallId: call.vendorCallId, callId: call.id });
                }
            } catch (err) {
                if (!(err instanceof AppError)) {
                    throw new AppError('Telephony provider is unreachable', 502, 'TELEPHONY_PROVIDER_ERROR');
                }
                throw err;
            }
        }

        const now = new Date();
        const startedAt = call.startedAt || call.createdAt;
        const duration = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000));

        const updated = await prisma.$transaction(async (tx) => {
            const result = await tx.call.updateMany({
                where: { id, organizationId, status: { in: ACTIVE_STATUSES } },
                data: { status: 'COMPLETED', endedAt: now, duration }
            });
            const fresh = await tx.call.findFirst({ where: { id } });
            if (result.count > 0) {
                await tx.callEvent.create({
                    data: { callId: id, status: 'COMPLETED', metadata: { eventId: `local_${id}_hangup`, duration } }
                });
            }
            return fresh;
        });

        await audit(organizationId, userId, AUDIT_ACTIONS.CALL_ENDED, 'Call', id, { duration });
        return updated;
    }

    /**
     * Post-call outcome. Records the disposition and executes the chosen
     * NEXT ACTION atomically (callback/follow-up/task or none).
     */
    static async recordOutcome(id, data, organizationId, userId, role) {
        const { disposition, notes, nextAction } = data;

        return await prisma.$transaction(async (tx) => {
            const call = await tx.call.findFirst({ where: { id, organizationId } });
            if (!call) throw new AppError('Call not found', 404, 'NOT_FOUND');
            CallService.assertCallScope(call, role, userId);

            if (!TERMINAL_STATUSES.includes(call.status)) {
                throw new AppError('End the call before recording an outcome', 409, 'CALL_NOT_ENDED');
            }
            if (call.disposition) {
                throw new AppError('An outcome has already been recorded for this call', 409, 'OUTCOME_ALREADY_RECORDED');
            }

            const updatedCall = await tx.call.update({
                where: { id },
                data: { disposition, notes: notes || null }
            });

            let lead = null;
            if (call.leadId) {
                lead = await tx.lead.findFirst({ where: { id: call.leadId, organizationId } });
            }

            let createdFollowUp = null;
            let createdTask = null;

            if (lead) {
                // The call really happened: NEW leads become CONTACTED.
                if (lead.status === 'NEW') {
                    await tx.lead.update({ where: { id: lead.id }, data: { status: 'CONTACTED' } });
                    await tx.leadActivity.create({
                        data: {
                            organizationId,
                            leadId: lead.id,
                            type: 'STATUS_CHANGE',
                            description: 'Stage changed from NEW to CONTACTED',
                            performedById: userId,
                            metadata: { from: 'NEW', to: 'CONTACTED', reason: 'call outcome recorded' }
                        }
                    });
                }

                const actionType = nextAction && nextAction.type ? nextAction.type : 'NONE';

                if (actionType === 'CALL_BACK' || actionType === 'FOLLOW_UP') {
                    if (!nextAction.scheduledAt) {
                        throw new AppError('scheduledAt is required to schedule a callback', 400, 'VALIDATION_ERROR');
                    }
                    const dueDate = new Date(nextAction.scheduledAt);
                    if (Number.isNaN(dueDate.getTime())) {
                        throw new AppError('scheduledAt must be a valid date', 400, 'VALIDATION_ERROR');
                    }

                    createdFollowUp = await tx.task.create({
                        data: {
                            organizationId,
                            leadId: lead.id,
                            type: 'FOLLOW_UP',
                            status: 'PENDING',
                            dueDate,
                            priority: 'HIGH',
                            title: actionType === 'CALL_BACK' ? `Callback: ${lead.name}` : `Follow-up: ${lead.name}`,
                            description: nextAction.reason || notes || null,
                            assignedToId: call.userId || userId,
                            createdById: userId,
                            sourceCallId: call.id
                        }
                    });

                    await tx.lead.update({ where: { id: lead.id }, data: { nextFollowUpAt: dueDate } });

                    await tx.leadActivity.create({
                        data: {
                            organizationId,
                            leadId: lead.id,
                            type: 'FOLLOW_UP',
                            description: `${actionType === 'CALL_BACK' ? 'Callback' : 'Follow-up'} scheduled for ${dueDate.toISOString()}`,
                            performedById: userId,
                            metadata: { taskId: createdFollowUp.id, dueDate: dueDate.toISOString(), callId: call.id, disposition }
                        }
                    });

                    if (lead.status === 'CONTACTED' || lead.status === 'NEW') {
                        await tx.lead.update({ where: { id: lead.id }, data: { status: 'FOLLOW_UP' } });
                        await tx.leadActivity.create({
                            data: {
                                organizationId,
                                leadId: lead.id,
                                type: 'STATUS_CHANGE',
                                description: `Stage changed from CONTACTED to FOLLOW_UP`,
                                performedById: userId,
                                metadata: { from: 'CONTACTED', to: 'FOLLOW_UP', reason: 'callback scheduled from call outcome' }
                            }
                        });
                    }
                } else if (actionType === 'TASK') {
                    if (!nextAction.title || !String(nextAction.title).trim()) {
                        throw new AppError('title is required to create a task', 400, 'VALIDATION_ERROR');
                    }
                    const dueDate = nextAction.dueDate ? new Date(nextAction.dueDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
                    createdTask = await tx.task.create({
                        data: {
                            organizationId,
                            leadId: lead.id,
                            type: 'OTHER',
                            status: 'PENDING',
                            dueDate,
                            title: String(nextAction.title).trim(),
                            description: nextAction.reason || notes || null,
                            assignedToId: call.userId || userId,
                            createdById: userId,
                            sourceCallId: call.id
                        }
                    });
                    await tx.leadActivity.create({
                        data: {
                            organizationId,
                            leadId: lead.id,
                            type: 'TASK',
                            description: `Task created: ${createdTask.title}`,
                            performedById: userId,
                            metadata: { taskId: createdTask.id, dueDate: dueDate.toISOString(), callId: call.id }
                        }
                    });
                }
                // WHATSAPP / SITE_VISIT / QUOTATION / NONE carry no DB side
                // effects here; the UI proceeds with lead context.
            }

            return {
                call: updatedCall,
                followUp: createdFollowUp,
                task: createdTask,
                leadId: call.leadId
            };
        });
    }

    static async getRecording(id, organizationId, role, userId, { download = false } = {}) {
        const call = await prisma.call.findFirst({ where: { id, organizationId } });
        if (!call) throw new AppError('Call not found', 404, 'NOT_FOUND');
        if (isExecRole(role) && call.userId !== userId) {
            throw new AppError('You do not have access to this call', 403, 'FORBIDDEN');
        }
        if (!call.recordingUrl) {
            throw new AppError('No recording available for this call', 404, 'NO_RECORDING');
        }
        await audit(
            organizationId,
            userId,
            download ? AUDIT_ACTIONS.RECORDING_DOWNLOADED : AUDIT_ACTIONS.RECORDING_ACCESSED,
            'Call',
            call.id,
            { leadId: call.leadId }
        );
        // The provider URL never leaves the server here; the stream endpoint
        // proxies the bytes under this same authorization.
        return { available: true, callId: call.id, hasRecording: true };
    }

    static async getRecordingUrl(id, organizationId, role, userId) {
        const call = await prisma.call.findFirst({ where: { id, organizationId } });
        if (!call) throw new AppError('Call not found', 404, 'NOT_FOUND');
        if (isExecRole(role) && call.userId !== userId) {
            throw new AppError('You do not have access to this call', 403, 'FORBIDDEN');
        }
        if (!call.recordingUrl) {
            throw new AppError('No recording available for this call', 404, 'NO_RECORDING');
        }
        await audit(organizationId, userId, AUDIT_ACTIONS.RECORDING_DOWNLOADED, 'Call', call.id, { leadId: call.leadId });
        return call.recordingUrl;
    }

    /**
     * Provider webhook: authenticated via HMAC signature, idempotent via
     * provider event id stored on CallEvent.metadata.eventId.
     */
    static async processWebhook(providerName, rawBody, signature) {
        const provider = getTelephonyProvider();
        if (!provider.isConfigured() || provider.name !== providerName) {
            throw new AppError('Telephony webhook is not configured', 503, 'WEBHOOK_NOT_CONFIGURED');
        }
        if (!provider.verifyWebhookSignature(rawBody, signature)) {
            throw new AppError('Invalid webhook signature', 401, 'WEBHOOK_SIGNATURE_INVALID');
        }

        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            throw new AppError('Invalid webhook payload', 400, 'VALIDATION_ERROR');
        }

        const { eventId, callId, providerCallId, status, duration, startedAt, endedAt, recordingUrl } = payload;
        if (!status && !recordingUrl) {
            throw new AppError('status is required', 400, 'VALIDATION_ERROR');
        }

        const call = await prisma.call.findFirst({
            where: {
                OR: [
                    ...(callId ? [{ id: callId }] : []),
                    ...(providerCallId ? [{ vendorCallId: providerCallId }] : [])
                ]
            }
        });
        if (!call) {
            // Unknown call: acknowledge without side effects (prevents probing).
            return { ok: true, ignored: true };
        }

        if (eventId) {
            const existing = await prisma.callEvent.findFirst({
                where: { callId: call.id, metadata: { path: ['eventId'], equals: eventId } }
            });
            if (existing) {
                return { ok: true, duplicate: true };
            }
        }

        const mappedStatus = status ? WEBHOOK_STATUS_MAP[String(status).toLowerCase()] : null;

        await prisma.$transaction(async (tx) => {
            if (mappedStatus && mappedStatus !== call.status) {
                await tx.call.update({
                    where: { id: call.id },
                    data: {
                        status: mappedStatus,
                        ...(duration !== undefined && duration !== null ? { duration: parseInt(duration, 10) } : {}),
                        ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
                        ...(endedAt ? { endedAt: new Date(endedAt) } : {}),
                        ...(recordingUrl ? { recordingUrl } : {})
                    }
                });
            } else if (recordingUrl && !call.recordingUrl) {
                await tx.call.update({ where: { id: call.id }, data: { recordingUrl } });
            }
            await tx.callEvent.create({
                data: {
                    callId: call.id,
                    status: mappedStatus || call.status,
                    metadata: { eventId: eventId || null, raw: { duration: duration ?? null } }
                }
            });
        });

        return { ok: true };
    }
}

module.exports = CallService;
