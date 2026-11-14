const { AppError } = require('../utils/errors');

// Minimal Meta Graph API transport for the SpaceEzy-owned integration
// (Marketing API reads; single-tenant system-user token from env).
//
// Security rules enforced here:
// - Token travels ONLY in the Authorization header, never in URLs, messages,
//   or logs. No logging happens in this module at all.
// - Every failure surfaces an operational AppError; raw provider payloads are
//   never passed through (they can carry account metadata).
// - No retries: a retry could double-spend or duplicate side effects.
//   Callers surface rate limits honestly (429) instead.

const DEFAULT_TIMEOUT_MS = 15000;

// Marketing API version. META_GRAPH_VERSION stays the single source of
// configuration (never silently replaced) but its FORMAT is now validated:
// a typo'd version would otherwise surface as confusing downstream 404s.
function graphVersion() {
    const raw = process.env.META_GRAPH_VERSION || 'v22.0';
    if (!/^v\d{1,2}\.\d{1,2}$/.test(String(raw))) {
        throw new AppError('META_GRAPH_VERSION must look like v22.0', 500, 'META_CONFIG_INVALID');
    }
    return String(raw);
}

// Explicit caller version (settings row) is validated the same way; the
// env default is used when none is supplied.
function resolveVersion(versionOverride) {
    if (versionOverride === undefined || versionOverride === null || versionOverride === '') {
        return graphVersion();
    }
    if (!/^v\d{1,2}\.\d{1,2}$/.test(String(versionOverride))) {
        throw new AppError('Graph API version must look like v22.0', 500, 'META_CONFIG_INVALID');
    }
    return String(versionOverride);
}

// Optional per-call credential overrides so a stored settings row can be
// authoritative (Phase 1) without changing any caller that still relies on
// the legacy environment defaults. Omitted values behave exactly as before.

// Meta rate-limit signals: HTTP 429 or platform throttling codes.
function isRateLimit(status, code) {
    if (status === 429) return true;
    return [4, 17, 32, 80000, 80001, 80004, 80005, 80006, 80014].includes(Number(code));
}

function mapMetaError(status, data) {
    const err = (data && data.error) || {};
    const code = Number(err.code);
    const message = err.message ? String(err.message) : `HTTP ${status}`;
    const attach = (appError) => withMetaCode(appError, code);
    if (isRateLimit(status, code)) {
        return attach(new AppError('Meta API rate limit reached. Retry shortly.', 429, 'META_RATE_LIMITED'));
    }
    if (status === 401 || code === 190 || code === 102) {
        return attach(new AppError('Meta access token is invalid or expired. Reconnect the Meta account.', 502, 'META_TOKEN_INVALID'));
    }
    if (status === 403 || [10, 200, 298, 299].includes(code)) {
        return attach(new AppError(`Meta permission denied: ${message}`, 403, 'META_PERMISSION_DENIED'));
    }
    return attach(new AppError(`Meta API error: ${message}`, 502, 'META_API_ERROR'));
}

// Precedence: explicit caller token (settings row) → legacy env token.
// Same security rules apply to either source: header only, never logged,
// never echoed in errors or URLs.
function resolveToken(tokenOverride) {
    const token = tokenOverride !== undefined && tokenOverride !== null
        ? String(tokenOverride)
        : (process.env.META_ACCESS_TOKEN || '');
    if (!token) {
        throw new AppError('Meta integration is not configured. Set META_ACCESS_TOKEN.', 409, 'META_NOT_CONFIGURED');
    }
    return token;
}

// Shared response handling for every Graph transport in this module: parse
// the JSON body (non-JSON = provider failure) and map errors to operational
// AppErrors. Raw provider payloads never pass through to callers.
async function readGraphResponse(res) {
    let data = null;
    try {
        data = await res.json();
    } catch {
        throw new AppError('Meta API returned a non-JSON response', 502, 'META_API_ERROR');
    }
    if (!res.ok) throw mapMetaError(res.status, data);
    return data;
}

// Shared network-failure mapping (timeouts vs unreachable).
function rethrowNetworkError(err) {
    const timedOut = err && (err.name === 'TimeoutError' || String(err.message || '').toLowerCase().includes('timed out'));
    throw new AppError(
        timedOut ? 'Meta API request timed out.' : `Meta API unreachable: ${err?.message || 'network error'}`,
        timedOut ? 504 : 502,
        timedOut ? 'META_TIMEOUT' : 'META_PROVIDER_ERROR'
    );
}

async function graphRequest({ path, method = 'GET', params = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS, token: tokenOverride, version: versionOverride }) {
    const token = resolveToken(tokenOverride);
    const apiVersion = resolveVersion(versionOverride);
    const cleanPath = String(path || '').replace(/^\/+/, '');
    const url = new URL(`https://graph.facebook.com/${apiVersion}/${cleanPath}`);
    // Query params ride on EVERY method (GET keeps its historical behavior;
    // Meta documents query parameters on writes too — e.g.
    // DELETE act_{id}/adimages?hash=…). Additive: existing POST/DELETE
    // callers never passed params, so their URLs are unchanged.
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.append(key, String(value));
    }
    let res;
    try {
        // The live token travels only in this request's Authorization header.
        // It is never logged, never embedded in URLs, and never copied into
        // error messages (see mapMetaError).
        res = await fetch(url.toString(), {
            method,
            headers: {
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                Authorization: `Bearer ${token}`,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (err) {
        rethrowNetworkError(err);
    }
    return readGraphResponse(res);
}

// Multipart (form-data) transport for endpoints that document file uploads
// as form data — Meta ad videos (`source` = file, plus `name`/`description`).
// Identical security rules to graphRequest: the token travels only in the
// Authorization header, never in the URL or logs; fetch sets the multipart
// Content-Type boundary itself. No retries (a retry could duplicate an
// upload side effect) — callers surface failures honestly.
async function graphFormRequest({ path, method = 'POST', form, timeoutMs = DEFAULT_TIMEOUT_MS, token: tokenOverride, version: versionOverride }) {
    const token = resolveToken(tokenOverride);
    const apiVersion = resolveVersion(versionOverride);
    const cleanPath = String(path || '').replace(/^\/+/, '');
    const url = `https://graph.facebook.com/${apiVersion}/${cleanPath}`;
    let res;
    try {
        res = await fetch(url, {
            method,
            headers: { Authorization: `Bearer ${token}` },
            body: form,
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (err) {
        rethrowNetworkError(err);
    }
    return readGraphResponse(res);
}

function withMetaCode(appError, code) {
    if (appError && typeof appError === 'object') {
        appError.metaCode = Number(code);
    }
    return appError;
}

module.exports = { graphRequest, graphFormRequest, mapMetaError, graphVersion };
