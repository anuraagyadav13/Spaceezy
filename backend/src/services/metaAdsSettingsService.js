const crypto = require('crypto');
const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { encryptSecret, decryptSecret } = require('../utils/whatsappSecrets');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const { graphRequest } = require('./metaGraph');
const { verifyHmacSha256 } = require('../utils/hmac');

// Company-level Meta Ads settings (single-company architecture).
// Follows WhatsappSettings conventions exactly:
//
// Effective-configuration rule (strict):
// - No settings row → legacy META_* environment behavior (unchanged paths).
// - Row present → the row is authoritative. A stored secret that fails to
//   decrypt throws (fail closed); env is NEVER consulted as a fallback.
//
// Secrets are AES-256-GCM envelopes via the shared whatsappSecrets utility,
// but with their OWN key (META_ADS_SETTINGS_KEY) and labels — WhatsApp
// behavior/keys are untouched. Raw tokens never appear in JSON selection
// fields, API responses, logs or OAuth redirects.

const META_ENC = { keyEnv: 'META_ADS_SETTINGS_KEY', label: 'Meta Ads settings' };
const META_DEC = { keyEnv: 'META_ADS_SETTINGS_KEY', label: 'Meta Ads credential' };

// Single source of truth for the permission sets: the settings service owns
// them (connection tests below) and metaAdsService consumes the same arrays
// for status reporting — one list, no drift.
const REQUIRED_PERMISSIONS = ['ads_read'];
const RECOMMENDED_PERMISSIONS = [
    'pages_show_list',       // me/accounts page discovery
    'pages_read_engagement', // Page details + instagram_business_account
    'leads_retrieval',       // leadgen detail fetch (webhook path)
    'instagram_basic',       // connected Instagram accounts
    // Phase 3+4: campaign/ad set/audience WRITES need ads_management.
    // Advisory (not required) so existing read-only connections keep
    // reporting; management endpoints surface Meta's permission-denied
    // error until the account is reconnected with the scope.
    'ads_management',
];

// Secret credential fields (save / rotate / remove). Blank values on save
// retain the stored credential; removal only ever happens through the
// explicit removeSecret action.
const SECRET_FIELDS = {
    accessToken: 'accessTokenEnc',
    appSecret: 'appSecretEnc',
    webhookVerifyToken: 'webhookVerifyTokenEnc',
};

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
// Legacy scope-based authorize flow, used ONLY when no
// META_OAUTH_CONFIG_ID is configured. When a Facebook Login for Business
// configuration id IS set, the configuration supplies the permissions and
// `scope` must not be sent at all (Meta: config_id replaces scope).
// public_profile was removed: it is unsupported for System User tokens
// (N/A in Meta's permission matrix for Business Integration tokens).
const OAUTH_SCOPES = [
    'ads_read',                    // campaign/insight reporting (existing reads)
    'ads_management',              // campaign/ad set/audience writes (Phase 3+4)
    'leads_retrieval',             // leadgen detail fetch (existing webhook path)
    'pages_show_list',             // me/accounts page discovery
    'pages_read_engagement',       // Page details + instagram_business_account
    'instagram_basic',             // connected Instagram accounts
];

const ID_LIST_FIELDS = ['selectedAdAccountIds', 'pageIds', 'instagramAccountIds'];
const ID_PATTERN = /^(act_)?\d{1,32}$/;

// Single source of truth for the OAuth callback path: the route registered
// in routes/metaAds.js and the redirect_uri sent to Meta are both derived
// from this constant, so they cannot drift apart.
const OAUTH_CALLBACK_PATH = '/api/v1/meta-ads/oauth/callback';

// Shown by the admin-only OAuth diagnostics whenever the deployment URLs
// look misconfigured. Explains that Meta's side of the contract is MANUAL
// configuration in the Developer Console — this CRM never edits it.
const OAUTH_TROUBLESHOOTING =
    'Meta\'s "Can\'t load URL — The domain of this URL isn\'t included in the app\'s domains" error is fixed in the ' +
    'Meta Developer Console (developers.facebook.com → your app), not in SpaceEzy: (1) Settings → Basic → ' +
    '"App Domains" must contain the App Domain shown here, and (2) Facebook Login → Settings → ' +
    '"Valid OAuth Redirect URIs" must contain the OAuth Redirect URI shown here exactly (scheme, host and path). ' +
    'SpaceEzy never changes these values automatically — re-check them after any domain, BACKEND_URL or ' +
    'FRONTEND_URL change.';

// ---------------------------------------------------------------------------
// Validation helpers (values only; never log inputs)
// ---------------------------------------------------------------------------

function assertGraphVersion(version) {
    if (version === undefined || version === null || version === '') return;
    if (!/^v\d{1,2}\.\d{1,2}$/.test(String(version))) {
        throw new AppError('graphVersion must look like v22.0', 400, 'VALIDATION_ERROR');
    }
}

// Meta App IDs are numeric; blank clears the stored value (it is public
// metadata, not a secret — same treatment as WhatsappSettings.appId).
function assertAppId(appId) {
    if (appId === undefined || appId === null || appId === '') return;
    if (!/^\d{1,32}$/.test(String(appId).trim())) {
        throw new AppError('metaAppId must be a numeric Meta App ID', 400, 'VALIDATION_ERROR');
    }
}

// Normalizes a selection list: strips an optional act_ prefix, requires
// digit-only Meta IDs, de-duplicates, caps length. Returns a fresh array.
function normalizeIdList(value, field) {
    if (!Array.isArray(value)) {
        throw new AppError(`${field} must be an array of Meta IDs`, 400, 'VALIDATION_ERROR');
    }
    if (value.length > 100) {
        throw new AppError(`${field} accepts at most 100 IDs`, 400, 'VALIDATION_ERROR');
    }
    const out = [];
    for (const raw of value) {
        const digits = String(raw === null || raw === undefined ? '' : raw).trim().replace(/^act_/, '');
        if (!/^\d{1,32}$/.test(digits)) {
            throw new AppError(`${field} entries must be numeric Meta IDs`, 400, 'VALIDATION_ERROR');
        }
        if (!out.includes(digits)) out.push(digits);
    }
    return out;
}

// Defensive read-side normalization for stored JSON (server-written only).
function digitsArray(value) {
    return Array.isArray(value)
        ? value.map((v) => String(v)).filter((s) => /^\d{1,32}$/.test(s))
        : [];
}

function parseExpiresAt(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const ts = Date.parse(String(value));
    if (!Number.isFinite(ts)) {
        throw new AppError('tokenExpiresAt must be a valid ISO date or null', 400, 'VALIDATION_ERROR');
    }
    return new Date(ts);
}

// ---------------------------------------------------------------------------
// OAuth state: stateless, HMAC-signed, short-lived (no new table).
// The signing key is META_ADS_SETTINGS_KEY — the same key required to store
// the exchanged token, so a missing key fails the whole connect flow closed.
// ---------------------------------------------------------------------------

function oauthKey() {
    const hex = process.env.META_ADS_SETTINGS_KEY || '';
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        throw new AppError(
            'Meta Ads encryption is not configured (META_ADS_SETTINGS_KEY must be 64 hex characters)',
            500,
            'SETTINGS_KEY_MISSING'
        );
    }
    return Buffer.from(hex, 'hex');
}

function signOAuthState() {
    const key = oauthKey();
    const exp = Date.now() + OAUTH_STATE_TTL_MS;
    const nonce = crypto.randomBytes(16).toString('base64url');
    const payload = `${exp}.${nonce}`;
    const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    return `v1.${exp}.${nonce}.${sig}`;
}

function verifyOAuthState(state) {
    try {
        const parts = String(state || '').split('.');
        if (parts.length !== 4 || parts[0] !== 'v1') return false;
        const [, expStr, nonce, sig] = parts;
        const exp = Number(expStr);
        if (!Number.isFinite(exp) || exp <= Date.now()) return false; // expired → reject
        const key = oauthKey();
        const expected = crypto.createHmac('sha256', key).update(`${expStr}.${nonce}`).digest('base64url');
        const a = Buffer.from(String(sig));
        const b = Buffer.from(expected);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false; // missing key / malformed state → fail closed
    }
}

function callbackRedirectUrl() {
    return new URL(OAUTH_CALLBACK_PATH, process.env.BACKEND_URL || '').toString();
}

// Facebook Login for Business configuration id — public OAuth metadata (it
// appears in the authorize URL exactly like client_id, so it is never a
// secret). Set via META_OAUTH_CONFIG_ID in the server env; blank/unset
// keeps the legacy scope-based flow. A set-but-malformed value fails
// closed instead of being sent to Meta's dialog.
function oauthConfigId() {
    const raw = String(process.env.META_OAUTH_CONFIG_ID || '').trim();
    if (!raw) return null;
    if (!/^\d{1,32}$/.test(raw)) {
        throw new AppError('META_OAUTH_CONFIG_ID must be a numeric configuration id', 500, 'META_OAUTH_CONFIG_ID_INVALID');
    }
    return raw;
}

// --- OAuth configuration diagnostic (admin-only) --------------------------
// Reports the exact values an administrator must register in the Meta
// Developer Console (App Domains + Valid OAuth Redirect URIs) and whether
// the deployment URLs are internally consistent. Read-only: derives
// everything from BACKEND_URL / FRONTEND_URL, never mutates configuration,
// and never includes the App Secret, access tokens or any other credential
// (URLs and the public app domain only).
function parseOrigin(value) {
    try {
        const url = new URL(String(value));
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.origin;
    } catch {
        return null; // missing / relative / unparsable → flagged as an issue
    }
}

function oauthDiagnostics() {
    const backendUrl = (process.env.BACKEND_URL || '').trim();
    const frontendUrl = (process.env.FRONTEND_URL || '').trim();
    const issues = [];

    const backendOrigin = parseOrigin(backendUrl);
    if (!backendUrl) issues.push('BACKEND_URL is not set — the OAuth redirect URI cannot be constructed.');
    else if (!backendOrigin) issues.push('BACKEND_URL is not an absolute http(s) URL.');

    const frontendOrigin = parseOrigin(frontendUrl);
    if (!frontendUrl) issues.push('FRONTEND_URL is not set — the OAuth callback cannot redirect the browser back to the app.');
    else if (!frontendOrigin) issues.push('FRONTEND_URL is not an absolute http(s) URL.');

    // The redirect URI must be exactly BACKEND_URL origin + the registered
    // callback path — the same value used to initiate AND complete OAuth.
    let oauthRedirectUri = null;
    if (backendOrigin) {
        oauthRedirectUri = `${backendOrigin}${OAUTH_CALLBACK_PATH}`;
        if (oauthRedirectUri !== callbackRedirectUrl()) {
            issues.push('OAuth redirect URI does not match BACKEND_URL + the registered callback route.');
        }
        if (!backendOrigin.startsWith('https://') && !/\/\/localhost(:|$)|\/\/127\.0\.0\.1(:|$)/.test(backendOrigin)) {
            issues.push('BACKEND_URL is not HTTPS — Meta requires an https redirect URI outside localhost.');
        }
    }

    if (backendOrigin && frontendOrigin) {
        const registrable = (origin) => new URL(origin).hostname.replace(/^www\./, '');
        if (registrable(backendOrigin) !== registrable(frontendOrigin)) {
            issues.push('BACKEND_URL and FRONTEND_URL use different domains — verify both are registered in the Meta app.');
        }
    }

    // Public host to register under "App Domains" (registrable domain:
    // leading www. stripped, subdomains reported alongside for clarity).
    const host = backendOrigin ? new URL(backendOrigin).hostname : null;
    const appDomain = host ? host.replace(/^www\./, '') : null;

    // Facebook Login for Business configuration (optional). Diagnostics
    // must never throw, so a malformed META_OAUTH_CONFIG_ID is reported as
    // an issue instead of an error. The config id itself is public OAuth
    // metadata (it appears in the authorize URL) — safe to display.
    let configId = null;
    try {
        configId = oauthConfigId();
    } catch {
        issues.push('META_OAUTH_CONFIG_ID is set but is not a numeric configuration id — clear it or fix it before connecting.');
    }
    const usesConfigId = configId !== null;

    return {
        appDomain,
        oauthRedirectUri,
        frontendUrl: frontendUrl || null,
        backendUrl: backendUrl || null,
        oauthConfigId: configId,
        oauthMode: usesConfigId ? 'config_id' : 'legacy_scopes',
        oauthFlowNote: usesConfigId
            ? 'Facebook Login for Business: the authorize URL sends config_id + override_default_response_type=true with response_type=code and NO scope — permissions come from the saved configuration. A System User token configuration issues non-expiring tokens by default.'
            : 'Legacy scope flow: the authorize URL sends scope (no config_id). Set META_OAUTH_CONFIG_ID in the server env to use a Facebook Login for Business configuration.',
        consistent: issues.length === 0,
        issues,
        troubleshooting: OAUTH_TROUBLESHOOTING,
    };
}

// ---------------------------------------------------------------------------
// Row views / effective configuration
// ---------------------------------------------------------------------------

// Read-only webhook callback URL, derived from the deployment's BACKEND_URL
// (never from client input). Safe to expose — it is a public endpoint.
function webhookCallbackUrl() {
    const backend = (process.env.BACKEND_URL || '').replace(/\/+$/, '');
    return backend ? `${backend}/api/v1/webhooks/meta/leadgen` : null;
}

// Display-safe view. Booleans for secrets only — a decrypted credential or
// its length never appears here (this shape is what GET /settings returns).
// metaAppId is public OAuth metadata (it appears in authorize URLs), shown
// in full so admins can verify it without exposing any secret.
function publicView(row) {
    if (!row) {
        return {
            source: 'env',
            configured: false,
            metaAppId: process.env.META_APP_ID || null,
            hasAccessToken: false,
            hasAppSecret: false,
            hasWebhookVerifyToken: false,
            selectedAdAccountIds: [],
            pageIds: [],
            instagramAccountIds: [],
            graphVersion: process.env.META_GRAPH_VERSION || 'v22.0',
            tokenExpiresAt: null,
            syncedAt: null,
            updatedAt: null,
            webhookCallbackUrl: webhookCallbackUrl(),
        };
    }
    return {
        source: 'db',
        configured: true,
        metaAppId: row.metaAppId || null,
        hasAccessToken: !!row.accessTokenEnc,
        hasAppSecret: !!row.appSecretEnc,
        hasWebhookVerifyToken: !!row.webhookVerifyTokenEnc,
        selectedAdAccountIds: digitsArray(row.selectedAdAccountIds),
        pageIds: digitsArray(row.pageIds),
        instagramAccountIds: digitsArray(row.instagramAccountIds),
        graphVersion: row.graphVersion || 'v22.0',
        tokenExpiresAt: row.tokenExpiresAt || null,
        syncedAt: row.syncedAt || null,
        updatedAt: row.updatedAt || null,
        webhookCallbackUrl: webhookCallbackUrl(),
    };
}

class MetaAdsSettingsService {
    // Single-company convention: the primary Organization (same
    // organization.findFirst() pattern used by public enquiries and WhatsApp).
    static async resolvePrimaryOrganizationId() {
        const primary = await prisma.organization.findFirst({ select: { id: true } });
        return primary ? primary.id : null;
    }

    static async getSettings(organizationId) {
        const row = organizationId
            ? await prisma.metaAdsSettings.findUnique({ where: { organizationId } })
            : null;
        return publicView(row);
    }

    // Saves credentials (encrypted) and/or non-secret asset selections.
    // Blank/undefined secret values preserve any stored credential — a row
    // is created only through this explicit admin action (sync never
    // creates one, so legacy env mode is never silently flipped to DB mode).
    static async saveSettings(organizationId, userId, data = {}) {
        if (data.graphVersion !== undefined) assertGraphVersion(data.graphVersion);
        if (data.metaAppId !== undefined) assertAppId(data.metaAppId);

        const scalar = {};
        const changedFields = [];
        if (data.graphVersion !== undefined) {
            scalar.graphVersion = String(data.graphVersion);
            changedFields.push('graphVersion');
        }
        if (data.metaAppId !== undefined) {
            // Blank clears the plain App ID; any other value is validated.
            scalar.metaAppId = data.metaAppId === '' || data.metaAppId === null
                ? null
                : String(data.metaAppId).trim();
            changedFields.push('metaAppId');
        }
        const expires = parseExpiresAt(data.tokenExpiresAt);
        if (expires !== undefined) {
            scalar.tokenExpiresAt = expires;
            changedFields.push('tokenExpiresAt');
        }
        for (const field of ID_LIST_FIELDS) {
            if (data[field] !== undefined) {
                scalar[field] = normalizeIdList(data[field], field);
                changedFields.push(field);
            }
        }
        const secrets = {};
        for (const [field, column] of Object.entries(SECRET_FIELDS)) {
            const value = data[field];
            // Blank (undefined/null/'') preserves any stored credential.
            // Removal happens only through the explicit remove endpoint.
            if (value === undefined || value === null || value === '') continue;
            secrets[column] = encryptSecret(String(value), META_ENC);
            changedFields.push(field);
        }

        const row = await prisma.metaAdsSettings.upsert({
            where: { organizationId },
            create: { organizationId, ...scalar, ...secrets },
            update: { ...scalar, ...secrets },
        });

        if (changedFields.length > 0) {
            // Field NAMES only — never values.
            await audit(organizationId, userId, AUDIT_ACTIONS.META_SETTINGS_UPDATED,
                'MetaAdsSettings', organizationId, { fields: changedFields });
        }
        return publicView(row);
    }

    // Effective credentials. Row present → authoritative (decrypt failures
    // throw: fail closed, env never consulted). Row absent → env snapshot.
    static async getEffectiveConfig(organizationId) {
        const row = organizationId
            ? await prisma.metaAdsSettings.findUnique({ where: { organizationId } })
            : null;
        if (!row) {
            return {
                source: 'env',
                accessToken: process.env.META_ACCESS_TOKEN || null,
                appSecret: process.env.META_APP_SECRET || null,
                metaAppId: process.env.META_APP_ID || null,
                webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || null,
                adAccountId: (process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '') || null,
                selectedAdAccountIds: [],
                pageIds: process.env.META_PAGE_ID ? [String(process.env.META_PAGE_ID).trim()].filter(Boolean) : [],
                instagramAccountIds: [],
                graphVersion: process.env.META_GRAPH_VERSION || 'v22.0',
                tokenExpiresAt: null,
            };
        }
        const decryptIfPresent = (column) => {
            const stored = row[column];
            if (stored === undefined || stored === null || stored === '') return null;
            return decryptSecret(stored, META_DEC);
        };
        const selectedAdAccountIds = digitsArray(row.selectedAdAccountIds);
        return {
            source: 'db',
            accessToken: decryptIfPresent('accessTokenEnc'),
            appSecret: decryptIfPresent('appSecretEnc'),
            webhookVerifyToken: decryptIfPresent('webhookVerifyTokenEnc'),
            // Row is authoritative: a row without a stored App ID does NOT
            // fall back to META_APP_ID — the admin saves it in settings.
            metaAppId: row.metaAppId || null,
            adAccountId: selectedAdAccountIds[0] || null,
            selectedAdAccountIds,
            pageIds: digitsArray(row.pageIds),
            instagramAccountIds: digitsArray(row.instagramAccountIds),
            graphVersion: row.graphVersion || 'v22.0',
            tokenExpiresAt: row.tokenExpiresAt || null,
        };
    }

    // Records a successful discovery sync. Updates an existing row only —
    // in legacy env mode there is no row and none is created (an empty row
    // would wrongly become authoritative). Returns the persisted timestamp
    // (null when there is no row to persist to).
    static async markSynced(organizationId) {
        if (!organizationId) return null;
        try {
            const updated = await prisma.metaAdsSettings.update({
                where: { organizationId },
                data: { syncedAt: new Date() },
                select: { syncedAt: true },
            });
            return updated ? updated.syncedAt : null;
        } catch (err) {
            if (err && err.code === 'P2025') return null; // no row (env mode)
            throw err;
        }
    }

    // --- Credential management (WhatsApp rotateSecret/removeSecret mirror) --
    // Explicit admin actions only: a value is required to rotate, removal
    // nulls the column, both are audited by FIELD NAME (never the value).

    static async rotateSecret(organizationId, userId, field, value) {
        const column = SECRET_FIELDS[field];
        if (!column) throw new AppError('Unknown secret field', 400, 'VALIDATION_ERROR');
        if (value === undefined || value === null || String(value) === '') {
            throw new AppError('A non-empty value is required to rotate a credential', 400, 'VALIDATION_ERROR');
        }
        const row = await prisma.metaAdsSettings.findUnique({ where: { organizationId } });
        if (!row) throw new AppError('No Meta settings saved for this organization', 404, 'NOT_FOUND');
        await prisma.metaAdsSettings.update({
            where: { organizationId },
            data: { [column]: encryptSecret(String(value), META_ENC) },
        });
        await audit(organizationId, userId, AUDIT_ACTIONS.META_SECRET_ROTATED, 'MetaAdsSettings', organizationId, { field });
        return MetaAdsSettingsService.getSettings(organizationId);
    }

    static async removeSecret(organizationId, userId, field) {
        const column = SECRET_FIELDS[field];
        if (!column) throw new AppError('Unknown secret field', 400, 'VALIDATION_ERROR');
        const row = await prisma.metaAdsSettings.findUnique({ where: { organizationId } });
        if (!row) throw new AppError('No Meta settings saved for this organization', 404, 'NOT_FOUND');
        await prisma.metaAdsSettings.update({
            where: { organizationId },
            data: { [column]: null },
        });
        await audit(organizationId, userId, AUDIT_ACTIONS.META_SECRET_REMOVED, 'MetaAdsSettings', organizationId, { field });
        return MetaAdsSettingsService.getSettings(organizationId);
    }

    // GET webhook-challenge check against the effective verify token
    // (settings row first — authoritative; legacy env only when no row
    // exists). Timing-safe compare, and ANY resolution failure (decrypt
    // error, missing key) fails closed instead of falling back to env.
    static async verifyWebhookToken(token) {
        try {
            const primary = await MetaAdsSettingsService.resolvePrimaryOrganizationId();
            const effective = await MetaAdsSettingsService.getEffectiveConfig(primary);
            const expected = effective.webhookVerifyToken || '';
            if (!token || !expected) return false;
            const a = Buffer.from(String(token));
            const b = Buffer.from(String(expected));
            if (a.length !== b.length) return false;
            return crypto.timingSafeEqual(a, b);
        } catch {
            return false; // fail closed — never consult a fallback secret
        }
    }

    // --- OAuth (Marketing API connect flow) --------------------------------
    // Stateless signed state + server-side code exchange (mirrors the
    // WhatsApp Embedded Signup security posture): the app secret and the
    // exchanged token never leave the server, and the token is stored
    // encrypted before this function returns anything to the client.

    // Async now: the effective App ID comes from the settings row when one
    // exists (row authoritative — no env fallback when the row lacks it);
    // legacy env mode (no row) still reads META_APP_ID.
    static async createAuthorizeUrl() {
        const primary = await MetaAdsSettingsService.resolvePrimaryOrganizationId();
        const row = primary
            ? await prisma.metaAdsSettings.findUnique({
                where: { organizationId: primary },
                select: { metaAppId: true, graphVersion: true },
            })
            : null;
        const appId = row ? (row.metaAppId || '') : (process.env.META_APP_ID || '');
        const backendUrl = process.env.BACKEND_URL || '';
        if (!appId || !backendUrl) {
            throw new AppError(
                row
                    ? 'Meta OAuth is not configured. Save a Meta App ID in settings and set BACKEND_URL.'
                    : 'Meta OAuth is not configured. Set META_APP_ID and BACKEND_URL.',
                409,
                'META_NOT_CONFIGURED'
            );
        }
        const state = signOAuthState(); // throws SETTINGS_KEY_MISSING when no key
        const configId = oauthConfigId(); // throws META_OAUTH_CONFIG_ID_INVALID when malformed
        const url = new URL(`https://www.facebook.com/${resolveDialogVersion(row)}/dialog/oauth`);
        url.searchParams.set('client_id', appId);
        url.searchParams.set('redirect_uri', callbackRedirectUrl());
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('state', state);
        if (configId) {
            // Facebook Login for Business: config_id REPLACES scope (Meta
            // docs: scope "should not be used" with a configuration), and
            // override_default_response_type=true is required for System
            // User token configurations. Permissions come from the config.
            url.searchParams.set('config_id', configId);
            url.searchParams.set('override_default_response_type', 'true');
        } else {
            // Legacy flow (no META_OAUTH_CONFIG_ID): request scopes directly.
            url.searchParams.set('scope', OAUTH_SCOPES.join(','));
        }
        return url.toString();
    }

    static verifyState(state) {
        return verifyOAuthState(state);
    }

    // Admin-only configuration diagnostic (App Domain / OAuth Redirect URI /
    // Frontend URL / Backend URL + internal consistency). Pure env derivation:
    // no DB row, no secrets, no mutation of any configured value.
    static getOauthDiagnostics() {
        return oauthDiagnostics();
    }

    // Exchanges Meta's one-time code server-side and persists the token
    // encrypted. Returns only safe identifiers — never the token.
    static async completeOAuth({ organizationId, userId, state, code }) {
        if (!verifyOAuthState(state)) {
            throw new AppError('Invalid or expired OAuth state. Please start the connection again.', 400, 'OAUTH_STATE_INVALID');
        }
        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);
        // Row authoritative (getEffectiveConfig): a saved row supplies the
        // stored App ID only; env META_APP_ID applies solely in env mode.
        const appId = eff.metaAppId || '';
        const backendUrl = process.env.BACKEND_URL || '';
        const appSecret = eff.appSecret;
        if (!appId || !backendUrl || !appSecret) {
            throw new AppError('Meta OAuth is not configured. Save a Meta App ID and App Secret in settings (or set META_APP_ID) and configure BACKEND_URL.', 409, 'META_NOT_CONFIGURED');
        }

        const exchangeUrl = new URL(`https://graph.facebook.com/${resolveDialogVersion(eff)}/oauth/access_token`);
        exchangeUrl.searchParams.set('client_id', appId);
        exchangeUrl.searchParams.set('client_secret', appSecret);
        exchangeUrl.searchParams.set('redirect_uri', callbackRedirectUrl());
        exchangeUrl.searchParams.set('code', code);

        let exchangeRes;
        try {
            exchangeRes = await fetch(exchangeUrl.toString(), { method: 'GET', signal: AbortSignal.timeout(15000) });
        } catch {
            // Fixed message on purpose: the request URL embeds the app
            // secret and code, so no error detail may propagate.
            throw new AppError('Meta token exchange is unreachable (network error)', 502, 'META_PROVIDER_ERROR');
        }
        let exchangeData = null;
        try {
            exchangeData = await exchangeRes.json();
        } catch {
            throw new AppError('Meta token exchange returned a non-JSON response', 502, 'META_API_ERROR');
        }
        if (!exchangeRes.ok || !exchangeData || !exchangeData.access_token) {
            const metaError = (exchangeData && exchangeData.error) || {};
            throw new AppError(
                `Meta rejected the connection code${metaError.message ? `: ${String(metaError.message)}` : ''}${metaError.code ? ` (Meta code ${metaError.code})` : ''} — codes expire shortly, so retry the flow promptly.`,
                502,
                'META_PROVIDER_ERROR'
            );
        }

        const accessToken = String(exchangeData.access_token);
        const expiresIn = Number(exchangeData.expires_in);
        // Expiry is tracked only when Meta provides it; a token without
        // expires_in is treated as unknown, never assumed permanent.
        const tokenExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0
            ? new Date(Date.now() + expiresIn * 1000)
            : null;

        await MetaAdsSettingsService.saveSettings(organizationId, userId, {
            accessToken,
            tokenExpiresAt,
        });
        await audit(organizationId, userId, AUDIT_ACTIONS.META_OAUTH_CONNECTED, 'MetaAdsSettings',
            organizationId, { tokenExpiresAt: tokenExpiresAt ? tokenExpiresAt.toISOString() : null });
        return { ok: true, tokenExpiresAt };
    }

    // --- Connection testing (Section D) ------------------------------------
    // All provider calls are READ-ONLY Graph calls with the stored token in
    // the Authorization header (never a URL). Failures are returned as
    // HTTP-200 { ok:false, code, message } envelopes so the UI can render
    // meaningful, display-safe errors; nothing here ever logs a token.

    // 1) Test Meta API connection: a cheap authenticated Graph call.
    static async testConnection(organizationId, userId) {
        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);
        if (!eff.accessToken) {
            return { ok: false, code: 'META_NOT_CONFIGURED', message: 'No access token saved. Connect Meta or save an Access Token first.' };
        }
        try {
            const data = await graphRequest({
                path: 'me',
                params: { fields: 'id,name' },
                token: eff.accessToken,
                version: eff.graphVersion,
            });
            await audit(organizationId, userId, AUDIT_ACTIONS.META_CONNECTION_TESTED, 'MetaAdsSettings',
                organizationId, { test: 'connection', ok: true });
            return { ok: true, message: `Connected to Meta as ${data && data.name ? data.name : 'an authorized user'}.` };
        } catch (err) {
            await audit(organizationId, userId, AUDIT_ACTIONS.META_CONNECTION_TESTED, 'MetaAdsSettings',
                organizationId, { test: 'connection', ok: false, code: err.code || 'META_API_ERROR' });
            return { ok: false, code: err.code || 'META_API_ERROR', message: err.message || 'Meta API connection failed.' };
        }
    }

    // 2) Test the stored access token: validates it with an authenticated
    //    header-only Graph call (tokens NEVER appear in URLs) and reports
    //    the tracked expiry from the settings row.
    static async testToken(organizationId, userId) {
        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);
        if (!eff.accessToken) {
            return { ok: false, code: 'META_NOT_CONFIGURED', message: 'No access token saved. Connect Meta or save an Access Token first.' };
        }
        try {
            // `me?fields=id` is the cheapest authenticated call; a bad or
            // expired token fails here with Meta's OAuth error.
            await graphRequest({
                path: 'me',
                params: { fields: 'id' },
                token: eff.accessToken,
                version: eff.graphVersion,
            });
            const expiresAt = eff.tokenExpiresAt ? new Date(eff.tokenExpiresAt).toISOString() : null;
            await audit(organizationId, userId, AUDIT_ACTIONS.META_CONNECTION_TESTED, 'MetaAdsSettings',
                organizationId, { test: 'token', ok: true });
            return {
                ok: true,
                message: expiresAt
                    ? `Token accepted by Meta (tracked expiry: ${expiresAt}).`
                    : 'Token accepted by Meta (no expiry tracked — long-lived or system-user token).',
                expiresAt,
            };
        } catch (err) {
            const invalid = !!err && (err.code === 'META_TOKEN_INVALID' || err.metaCode === 190);
            await audit(organizationId, userId, AUDIT_ACTIONS.META_CONNECTION_TESTED, 'MetaAdsSettings',
                organizationId, { test: 'token', ok: false, code: invalid ? 'META_TOKEN_INVALID' : (err.code || 'META_API_ERROR') });
            return invalid
                ? { ok: false, code: 'META_TOKEN_INVALID', message: 'Meta rejected the saved access token — it is invalid or expired. Reconnect Meta.' }
                : { ok: false, code: (err && err.code) || 'META_API_ERROR', message: (err && err.message) || 'Token test failed.' };
        }
    }

    // 3) Check permissions: /me/permissions with the stored token; reports
    //    which required/recommended permissions are granted and missing.
    static async testPermissions(organizationId, userId) {
        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);
        if (!eff.accessToken) {
            return { ok: false, code: 'META_NOT_CONFIGURED', message: 'No access token saved. Connect Meta or save an Access Token first.' };
        }
        try {
            const data = await graphRequest({
                path: 'me/permissions',
                token: eff.accessToken,
                version: eff.graphVersion,
            });
            const granted = Array.isArray(data && data.data)
                ? data.data.filter((p) => p.status === 'granted').map((p) => p.permission)
                : [];
            const missingRequired = REQUIRED_PERMISSIONS.filter((p) => !granted.includes(p));
            const missingRecommended = RECOMMENDED_PERMISSIONS.filter((p) => !granted.includes(p));
            await audit(organizationId, userId, AUDIT_ACTIONS.META_CONNECTION_TESTED, 'MetaAdsSettings',
                organizationId, { test: 'permissions', ok: missingRequired.length === 0, granted: granted.length });
            return {
                ok: missingRequired.length === 0,
                code: missingRequired.length === 0 ? undefined : 'META_PERMISSIONS_MISSING',
                message: missingRequired.length === 0
                    ? `All required permissions granted (${granted.length} total).`
                    : `Missing required permission(s): ${missingRequired.join(', ')}. Reconnect Meta to grant them.`,
                granted,
                missingRequired,
                missingRecommended,
            };
        } catch (err) {
            await audit(organizationId, userId, AUDIT_ACTIONS.META_CONNECTION_TESTED, 'MetaAdsSettings',
                organizationId, { test: 'permissions', ok: false, code: err.code || 'META_API_ERROR' });
            return { ok: false, code: err.code || 'META_API_ERROR', message: err.message || 'Permission check failed.' };
        }
    }

    // 4) Test webhook configuration: local HMAC self-test with the stored
    //    App Secret (no network) plus a best-effort subscription lookup.
    //    The subscription check needs an app-level token, so when that is
    //    not available the result is reported as "unverifiable" (null +
    //    reason) rather than guessed.
    static async testWebhook(organizationId, userId) {
        const eff = await MetaAdsSettingsService.getEffectiveConfig(organizationId);
        const callbackUrl = webhookCallbackUrl();
        const result = { ok: false, callbackUrl, callbackConfigured: !!callbackUrl, hmac: null, subscription: null };

        if (!callbackUrl) {
            result.code = 'META_NOT_CONFIGURED';
            result.message = 'BACKEND_URL is not configured, so the webhook callback URL cannot be generated.';
            return result;
        }
        if (!eff.webhookVerifyToken) {
            result.code = 'META_NOT_CONFIGURED';
            result.message = 'No Webhook Verify Token saved. Save one in Section B first.';
            return result;
        }
        if (!eff.appSecret) {
            result.code = 'META_NOT_CONFIGURED';
            result.message = 'No App Secret saved — webhook signatures (X-Hub-SHA-256) cannot be verified without it.';
            return result;
        }

        // Local HMAC-SHA256 self-test: sign a probe payload with the stored
        // App Secret and verify it through the same helper the webhook uses.
        const probe = 'spaceezy-meta-webhook-selftest';
        const expected = `sha256=${crypto.createHmac('sha256', eff.appSecret).update(probe).digest('hex')}`;
        const hmacOk = verifyHmacSha256(probe, expected, eff.appSecret);
        result.hmac = { ok: hmacOk };
        if (!hmacOk) {
            result.code = 'META_WEBHOOK_HMAC_FAILED';
            result.message = 'Stored App Secret failed the HMAC-SHA256 signature self-test.';
            return result;
        }

        // Best-effort subscription check. It requires an app-level token
        // (appId|appSecret works for own-app queries); when unavailable,
        // report unverifiable instead of failing the whole test.
        if (eff.metaAppId && eff.appSecret) {
            try {
                const res = await fetch(
                    `https://graph.facebook.com/${resolveDialogVersion(eff)}/${encodeURIComponent(eff.metaAppId)}/subscriptions`,
                    {
                        headers: { Authorization: `Bearer ${eff.metaAppId}|${eff.appSecret}` },
                        signal: AbortSignal.timeout(15000),
                    },
                );
                const body = await res.json().catch(() => null);
                if (res.ok && body && Array.isArray(body.data)) {
                    const leadgen = body.data.find((s) => s.object === 'leadgen');
                    result.subscription = {
                        status: leadgen && leadgen.callback_url === callbackUrl
                            ? (leadgen.active ? 'active' : 'inactive')
                            : 'not_subscribed',
                        fields: leadgen ? leadgen.fields : [],
                    };
                } else {
                    result.subscription = { status: null, reason: 'Meta did not return subscription data (check app permissions).' };
                }
            } catch {
                result.subscription = { status: null, reason: 'Subscription lookup unreachable (network error).' };
            }
        } else {
            result.subscription = { status: null, reason: 'A saved Meta App ID and App Secret are required to query subscriptions.' };
        }

        result.ok = true;
        result.message = 'Webhook verify token and HMAC-SHA256 self-tests passed.'
            + (result.subscription && result.subscription.status === 'active'
                ? ' Meta reports an active leadgen subscription for this callback.'
                : '');
        await audit(organizationId, userId, AUDIT_ACTIONS.META_CONNECTION_TESTED, 'MetaAdsSettings',
            organizationId, { test: 'webhook', ok: true, subscription: result.subscription && result.subscription.status });
        return result;
    }

    // Single source of truth exported for metaAdsService (status reporting)
    // and tests — one list, no drift between connection tests and status.
    static get REQUIRED_PERMISSIONS() { return REQUIRED_PERMISSIONS; }
    static get RECOMMENDED_PERMISSIONS() { return RECOMMENDED_PERMISSIONS; }
}

// Dialog (redirect) version: settings-row version when present, else the
// validated env/default. Kept local to avoid a metaGraph import cycle.
function resolveDialogVersion(eff) {
    const raw = (eff && eff.graphVersion) || process.env.META_GRAPH_VERSION || 'v22.0';
    if (!/^v\d{1,2}\.\d{1,2}$/.test(String(raw))) {
        throw new AppError('Graph API version must look like v22.0', 500, 'META_CONFIG_INVALID');
    }
    return String(raw);
}

module.exports = MetaAdsSettingsService;
