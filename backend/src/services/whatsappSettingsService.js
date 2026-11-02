const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { encryptSecret, decryptSecret } = require('../utils/whatsappSecrets');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const { getWhatsAppProvider } = require('../providers/whatsapp');
const MetaWhatsAppProvider = require('../providers/whatsapp/metaProvider');
const MockWhatsAppProvider = require('../providers/whatsapp/mockProvider');
const crypto = require('crypto');

// Organization-scoped Meta WhatsApp settings (single dedicated org model;
// existing org authZ is enforced by callers passing req.auth.organizationId).
//
// Effective-configuration rule (strict):
// - No settings row → legacy environment behavior (unchanged code paths).
// - Row present → the row is authoritative. A stored secret that fails to
//   decrypt throws (fail closed); env is NEVER consulted as a fallback.

const SECRET_FIELDS = {
    accessToken: 'accessTokenEnc',
    appSecret: 'appSecretEnc',
    verifyToken: 'verifyTokenEnc',
};

const PROVIDER_MODES = ['mock', 'meta'];

function assertGraphVersion(version) {
    if (version === undefined || version === null || version === '') return;
    const match = /^v(\d+)\.(\d+)$/.exec(String(version));
    if (!match || Number(match[1]) < 21) {
        throw new AppError('graphVersion must be a supported version (v21.0 or newer)', 400, 'VALIDATION_ERROR');
    }
}

function publicView(row) {
    if (!row) {
        return {
            configured: false,
            providerMode: 'mock',
            appId: null,
            wabaId: null,
            phoneNumberId: null,
            graphVersion: 'v21.0',
            notifyEnabled: false,
            notifyRecipients: [],
            notifyTemplateName: null,
            hasAccessToken: false,
            hasAppSecret: false,
            hasVerifyToken: false,
            updatedAt: null,
        };
    }
    return {
        configured: true,
        providerMode: row.providerMode,
        appId: row.appId,
        wabaId: row.wabaId,
        phoneNumberId: row.phoneNumberId,
        graphVersion: row.graphVersion,
        notifyEnabled: !!row.notifyEnabled,
        notifyRecipients: Array.isArray(row.notifyRecipients) ? row.notifyRecipients : [],
        notifyTemplateName: row.notifyTemplateName,
        hasAccessToken: !!row.accessTokenEnc,
        hasAppSecret: !!row.appSecretEnc,
        hasVerifyToken: !!row.verifyTokenEnc,
        updatedAt: row.updatedAt,
    };
}

class WhatsappSettingsService {
    static async getSettings(organizationId) {
        const row = await prisma.whatsappSettings.findUnique({ where: { organizationId } });
        return publicView(row);
    }

    static async saveSettings(organizationId, userId, data = {}) {
        if (data.graphVersion !== undefined) assertGraphVersion(data.graphVersion);
        if (data.providerMode !== undefined && !PROVIDER_MODES.includes(data.providerMode)) {
            throw new AppError('providerMode must be mock or meta', 400, 'VALIDATION_ERROR');
        }

        const scalar = {};
        for (const key of ['appId', 'wabaId', 'phoneNumberId', 'graphVersion', 'providerMode', 'notifyTemplateName']) {
            if (data[key] !== undefined) scalar[key] = data[key] === '' ? null : data[key];
        }
        if (data.notifyEnabled !== undefined) scalar.notifyEnabled = Boolean(data.notifyEnabled);
        if (data.notifyRecipients !== undefined) {
            if (data.notifyRecipients !== null && !Array.isArray(data.notifyRecipients)) {
                throw new AppError('notifyRecipients must be an array', 400, 'VALIDATION_ERROR');
            }
            scalar.notifyRecipients = data.notifyRecipients === null ? null : (data.notifyRecipients || []).map((entry) => ({
                phone: String((entry && entry.phone) || ''),
                label: entry && entry.label ? String(entry.label).slice(0, 100) : null,
                enabled: !entry || entry.enabled !== false,
            }));
        }
        const secrets = {};
        const changedFields = [...Object.keys(scalar)];
        for (const [field, column] of Object.entries(SECRET_FIELDS)) {
            const value = data[field];
            // Blank (undefined/null/'') preserves any stored credential.
            // Removal happens only through the explicit remove endpoint.
            if (value === undefined || value === null || value === '') continue;
            secrets[column] = encryptSecret(String(value));
            changedFields.push(field);
        }

        // Fail loudly on notify misconfiguration instead of silently skipping
        // every future lead (QA P1): enabling notifications requires a
        // template that exists and whose variables the alert resolvers can fill.
        if (data.notifyEnabled === true) {
            let willTemplateName = scalar.notifyTemplateName;
            if (willTemplateName === undefined) {
                const existing = await prisma.whatsappSettings.findUnique({
                    where: { organizationId },
                    select: { notifyTemplateName: true },
                });
                willTemplateName = existing ? existing.notifyTemplateName : null;
            }
            // Lazy require avoids a circular dependency at module load time.
            const WhatsappNotifyService = require('./whatsappNotifyService');
            await WhatsappNotifyService.validateNotifyTemplateConfig(organizationId, willTemplateName);
        }

        try {
            await prisma.whatsappSettings.upsert({
                where: { organizationId },
                create: { organizationId, ...scalar, ...secrets },
                update: { ...scalar, ...secrets },
            });
        } catch (err) {
            if (err.code === 'P2002') {
                throw new AppError('This phone number is already configured for another organization', 409, 'NUMBER_IN_USE');
            }
            throw err;
        }
        await audit(organizationId, userId, AUDIT_ACTIONS.WHATSAPP_SETTINGS_UPDATED, 'WhatsappSettings', organizationId, {
            fields: changedFields,
        });
        return WhatsappSettingsService.getSettings(organizationId);
    }

    static async rotateSecret(organizationId, userId, field, value) {
        const column = SECRET_FIELDS[field];
        if (!column) throw new AppError('Unknown secret field', 400, 'VALIDATION_ERROR');
        if (value === undefined || value === null || String(value) === '') {
            throw new AppError('A non-empty value is required to rotate a credential', 400, 'VALIDATION_ERROR');
        }
        const row = await prisma.whatsappSettings.findUnique({ where: { organizationId } });
        if (!row) throw new AppError('No WhatsApp settings saved for this organization', 404, 'NOT_FOUND');
        await prisma.whatsappSettings.update({
            where: { organizationId },
            data: { [column]: encryptSecret(String(value)) },
        });
        await audit(organizationId, userId, AUDIT_ACTIONS.WHATSAPP_SECRET_ROTATED, 'WhatsappSettings', organizationId, { field });
        return WhatsappSettingsService.getSettings(organizationId);
    }

    static async removeSecret(organizationId, userId, field) {
        const column = SECRET_FIELDS[field];
        if (!column) throw new AppError('Unknown secret field', 400, 'VALIDATION_ERROR');
        const row = await prisma.whatsappSettings.findUnique({ where: { organizationId } });
        if (!row) throw new AppError('No WhatsApp settings saved for this organization', 404, 'NOT_FOUND');
        await prisma.whatsappSettings.update({
            where: { organizationId },
            data: { [column]: null },
        });
        await audit(organizationId, userId, AUDIT_ACTIONS.WHATSAPP_SECRET_REMOVED, 'WhatsappSettings', organizationId, { field });
        return WhatsappSettingsService.getSettings(organizationId);
    }

    // Effective credentials for an org. Row present → authoritative (decrypt
    // failures throw; no env fallback). Row absent → legacy env snapshot.
    static async getEffectiveConfig(organizationId) {
        const row = organizationId
            ? await prisma.whatsappSettings.findUnique({ where: { organizationId } })
            : null;
        if (!row) {
            return {
                source: 'env',
                providerMode: process.env.WHATSAPP_PROVIDER || 'mock',
                appId: null,
                wabaId: process.env.WHATSAPP_WABA_ID || null,
                phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
                graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v21.0',
                accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null,
                appSecret: process.env.WHATSAPP_WEBHOOK_SECRET || null,
                verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || null,
            };
        }
        const decryptIfPresent = (column) => {
            const stored = row[column];
            if (stored === undefined || stored === null || stored === '') return null;
            return decryptSecret(stored);
        };
        return {
            source: 'db',
            providerMode: row.providerMode || 'mock',
            appId: row.appId,
            wabaId: row.wabaId,
            phoneNumberId: row.phoneNumberId,
            graphVersion: row.graphVersion || 'v21.0',
            accessToken: decryptIfPresent('accessTokenEnc'),
            appSecret: decryptIfPresent('appSecretEnc'),
            verifyToken: decryptIfPresent('verifyTokenEnc'),
        };
    }

    // Single source of truth for the outbound send/webhook transport.
    //
    // A saved settings row is authoritative: providerMode 'meta' sends through
    // Meta with the org's stored credentials; providerMode 'mock' ALWAYS sends
    // through the mock provider (simulated), even if the environment also has
    // WHATSAPP_PROVIDER=meta + creds. This closes the split where a DB row
    // saying 'mock' still fell through to an env Meta provider and did real
    // sends. Only when no row exists do we honor the legacy env provider.
    static async resolveTransport(organizationId) {
        const effective = await WhatsappSettingsService.getEffectiveConfig(organizationId);
        if (effective.source === 'env') {
            const provider = getWhatsAppProvider();
            return {
                mode: effective.providerMode,
                source: 'env',
                provider,
                credentials: undefined,
                configured: provider.isConfigured(),
                simulated: Boolean(provider.simulated),
            };
        }
        if (effective.providerMode === 'meta') {
            const credentials = {
                phoneNumberId: effective.phoneNumberId,
                accessToken: effective.accessToken,
                appSecret: effective.appSecret,
                graphVersion: effective.graphVersion,
                wabaId: effective.wabaId,
            };
            return {
                mode: 'meta',
                source: 'db',
                provider: new MetaWhatsAppProvider(),
                credentials,
                configured: Boolean(effective.accessToken && effective.phoneNumberId),
                simulated: false,
            };
        }
        // DB row saved as mock → always simulated, never real.
        const provider = new MockWhatsAppProvider();
        return {
            mode: 'mock',
            source: 'db',
            provider,
            credentials: undefined,
            configured: true,
            simulated: true,
        };
    }

    // Number-routed webhook organization. Callers pass every sender identity
    // found in the batch (Meta envelope); calls with no identifiers (custom
    // envelopes) always fall through to legacy handling. Exactly one matching
    // org wins; zero matches with configured rows reject (unknown sender);
    // several matches reject (ambiguous). Zero settings rows anywhere → null
    // so callers keep the legacy primary-org behavior.
    static async resolveWebhookOrg({ phoneNumberIds = [], wabaIds = [] } = {}) {
        const numbers = [...new Set([...(phoneNumberIds || []), ...(wabaIds || [])].filter(Boolean).map(String))];
        if (numbers.length === 0) return null;
        const rows = await prisma.whatsappSettings.findMany({
            select: { organizationId: true, phoneNumberId: true, wabaId: true },
        });
        if (rows.length === 0) return null;
        const matches = new Set();
        for (const row of rows) {
            if ((row.phoneNumberId && numbers.includes(String(row.phoneNumberId)))
                || (row.wabaId && numbers.includes(String(row.wabaId)))) {
                matches.add(row.organizationId);
            }
        }
        if (matches.size === 0) {
            throw new AppError('Unknown WhatsApp sender number', 400, 'UNKNOWN_SENDER');
        }
        if (matches.size > 1) {
            throw new AppError('Ambiguous WhatsApp sender number', 400, 'AMBIGUOUS_SENDER');
        }
        return [...matches][0];
    }

    // GET webhook-challenge check against the effective verify token
    // (DB row first, legacy env only when no row). Timing-safe compare.
    static async verifyChallengeToken(token) {
        const primary = await prisma.organization.findFirst({ select: { id: true } });
        const effective = await WhatsappSettingsService.getEffectiveConfig(primary ? primary.id : null);
        const expected = effective.verifyToken || '';
        if (!token || !expected) return false;
        const a = Buffer.from(String(token));
        const b = Buffer.from(String(expected));
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    // Safe, read-only connectivity probe: resolves the sender number object.
    // Never sends messages, registers numbers, or changes anything at Meta.
    // Never returns secrets — only display-safe identifiers.
    static async testConnection(organizationId, userId) {
        const effective = await WhatsappSettingsService.getEffectiveConfig(organizationId);
        if (!effective.phoneNumberId || !effective.accessToken) {
            throw new AppError('WhatsApp credentials are incomplete. Save a Phone Number ID and access token first.', 409, 'WHATSAPP_NOT_CONFIGURED');
        }
        const MetaWhatsAppProvider = require('../providers/whatsapp/metaProvider');
        const provider = new MetaWhatsAppProvider();
        const result = await provider.checkConnection({
            phoneNumberId: effective.phoneNumberId,
            accessToken: effective.accessToken,
            graphVersion: effective.graphVersion,
        });
        await audit(organizationId, userId, AUDIT_ACTIONS.WHATSAPP_CONNECTION_TESTED, 'WhatsappSettings', organizationId, {
            ok: true,
        });
        return result;
    }

    // --- Embedded Signup (WhatsApp Business App coexistence) ---------------
    // Server half of Meta's Embedded Signup v4 launch flow (official FB JS
    // SDK on the frontend). The browser posts Meta's exchangeable code
    // (30-second TTL) + the session asset IDs straight here; this method:
    //   1) exchanges the code server-to-server for the permanent business
    //      token (app secret never leaves the server),
    //   2) discovers phone_number_id from the returned WABA with a READ-ONLY
    //      phone_numbers query,
    //   3) persists everything through the existing encrypted settings
    //      service (AES-256-GCM),
    //   4) subscribes the app to the account's webhooks (standard post-flow
    //      step so inbound keeps flowing).
    //
    // Deliberately NEVER called here: register, migrate, deregister,
    // disconnect — a coexistence number is already registered, and number
    // lifecycle changes are out of scope. Nothing in this flow is logged,
    // and no code/token/secret is ever echoed back to the client.
    static async completeEmbeddedSignup(organizationId, userId, { code, wabaId, phoneNumberId: sessionPhoneNumberId }) {
        const effective = await WhatsappSettingsService.getEffectiveConfig(organizationId);
        // The real App Secret only exists in the encrypted settings row — the
        // legacy env snapshot's appSecret is the webhook HMAC secret, so an
        // exchange against it would be meaningless.
        if (effective.source !== 'db' || !effective.appSecret) {
            throw new AppError('Save your Meta App Secret in WhatsApp Settings first — it is required to exchange the Embedded Signup code.', 409, 'WHATSAPP_NOT_CONFIGURED');
        }
        const appId = EMBEDDED_SIGNUP_APP_ID;
        const version = effective.graphVersion || 'v21.0';

        // 1) Exchange the code for the customer's business token.
        const exchangeUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
        exchangeUrl.searchParams.set('client_id', appId);
        exchangeUrl.searchParams.set('client_secret', effective.appSecret);
        exchangeUrl.searchParams.set('code', code);
        let exchangeRes;
        try {
            exchangeRes = await fetch(exchangeUrl.toString(), { method: 'GET', signal: AbortSignal.timeout(15000) });
        } catch {
            // Fixed message on purpose: the request URL embeds the app
            // secret and code, so no error detail may propagate.
            throw new AppError('Meta token exchange is unreachable (network error)', 502, 'WHATSAPP_PROVIDER_ERROR');
        }
        let exchangeData = null;
        try {
            exchangeData = await exchangeRes.json();
        } catch {
            throw new AppError('Meta token exchange returned a non-JSON response', 502, 'WHATSAPP_PROVIDER_ERROR');
        }
        if (!exchangeRes.ok || !exchangeData || !exchangeData.access_token) {
            const metaError = (exchangeData && exchangeData.error) || {};
            throw new AppError(
                `Meta rejected the Embedded Signup code${metaError.message ? `: ${String(metaError.message)}` : ''}${metaError.code ? ` (Meta code ${metaError.code})` : ''} — codes expire 30 seconds after Finish, so retry the flow promptly.`,
                502,
                'WHATSAPP_PROVIDER_ERROR'
            );
        }
        const businessToken = String(exchangeData.access_token);

        // 2) Discover phone_number_id from the WABA (read-only).
        const numbersPayload = await metaGraphGet(`${version}/${encodeURIComponent(String(wabaId))}/phone_numbers`, businessToken);
        const numbers = Array.isArray(numbersPayload && numbersPayload.data) ? numbersPayload.data : [];
        const target = numbers.find((entry) => {
            const digits = String((entry && entry.display_phone_number) || '').replace(/\D/g, '');
            return EMBEDDED_SIGNUP_TARGET_NUMBERS.includes(digits);
        });
        if (!target || !target.id) {
            const seen = numbers
                .map((entry) => String((entry && entry.display_phone_number) || '').trim())
                .filter(Boolean);
            throw new AppError(
                `The ${EMBEDDED_SIGNUP_TARGET_LABEL} number is not in the connected WhatsApp account${seen.length ? ` (found: ${seen.join(', ')})` : ''} — refusing to connect a different number. Nothing was saved.`,
                409,
                'EMBEDDED_SIGNUP_NUMBER_MISMATCH'
            );
        }
        const discoveredPhoneNumberId = String(target.id);
        if (sessionPhoneNumberId && String(sessionPhoneNumberId) !== discoveredPhoneNumberId) {
            throw new AppError('The session phone_number_id does not match the number discovered on the WABA. Nothing was saved.', 409, 'EMBEDDED_SIGNUP_MISMATCH');
        }

        // 3) Persist through the existing encrypted settings service.
        const saved = await WhatsappSettingsService.saveSettings(organizationId, userId, {
            appId,
            wabaId: String(wabaId),
            phoneNumberId: discoveredPhoneNumberId,
            providerMode: 'meta',
            accessToken: businessToken,
        });

        // 4) Best-effort webhook subscription on this Messaging account — a
        //    failure never undoes the saved credentials; it is reported so
        //    the admin can retry (it is NOT a number lifecycle call).
        let webhookSubscribed = false;
        try {
            const sub = await metaGraphPost(`${version}/${encodeURIComponent(String(wabaId))}/subscribed_apps`, businessToken);
            webhookSubscribed = Boolean(sub && sub.success !== false);
        } catch {
            webhookSubscribed = false;
        }

        await audit(organizationId, userId, AUDIT_ACTIONS.WHATSAPP_EMBEDDED_SIGNUP, 'WhatsappSettings', organizationId, {
            wabaId: String(wabaId),
            phoneNumberId: discoveredPhoneNumberId,
            appId,
            displayPhoneNumber: target.display_phone_number || null,
            webhookSubscribed,
        });

        return {
            ...saved,
            displayPhoneNumber: target.display_phone_number || null,
            webhookSubscribed,
        };
    }
}

// Embedded Signup constants: the ONE Meta app this integration lives on and
// the ONLY business number allowed to onboard (no test numbers — discovery
// refuses anything else instead of silently connecting a different line).
const EMBEDDED_SIGNUP_APP_ID = '1536498651554499';
const EMBEDDED_SIGNUP_TARGET_LABEL = '+91 76830 20204';
const EMBEDDED_SIGNUP_TARGET_NUMBERS = ['917683020204', '7683020204'];

// Read-only Graph GET with the token in the Authorization header (never in
// the URL). Meta error messages are safe to surface; tokens never are.
async function metaGraphGet(path, token) {
    let res;
    try {
        res = await fetch(`https://graph.facebook.com/${path}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
    } catch {
        throw new AppError('Meta Graph API is unreachable (network error)', 502, 'WHATSAPP_PROVIDER_ERROR');
    }
    let data = null;
    try {
        data = await res.json();
    } catch {
        throw new AppError('Meta Graph API returned a non-JSON response', 502, 'WHATSAPP_PROVIDER_ERROR');
    }
    if (!res.ok) {
        const metaError = (data && data.error) || {};
        throw new AppError(`Meta Graph API error${metaError.message ? `: ${String(metaError.message)}` : ''}${metaError.code ? ` (code ${metaError.code})` : ''}`, 502, 'WHATSAPP_PROVIDER_ERROR');
    }
    return data;
}

async function metaGraphPost(path, token) {
    let res;
    try {
        res = await fetch(`https://graph.facebook.com/${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
    } catch {
        throw new AppError('Meta Graph API is unreachable (network error)', 502, 'WHATSAPP_PROVIDER_ERROR');
    }
    let data = null;
    try {
        data = await res.json();
    } catch {
        throw new AppError('Meta Graph API returned a non-JSON response', 502, 'WHATSAPP_PROVIDER_ERROR');
    }
    if (!res.ok) {
        const metaError = (data && data.error) || {};
        throw new AppError(`Meta Graph API error${metaError.message ? `: ${String(metaError.message)}` : ''}${metaError.code ? ` (code ${metaError.code})` : ''}`, 502, 'WHATSAPP_PROVIDER_ERROR');
    }
    return data;
}

module.exports = WhatsappSettingsService;
