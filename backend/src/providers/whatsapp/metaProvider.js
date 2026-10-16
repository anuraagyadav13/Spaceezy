const crypto = require('crypto');
const { AppError } = require('../../utils/errors');

// Official WhatsApp Business Platform (Cloud API) transport.
//
// Reads ONLY environment configuration — never a database row, never logs,
// never returns credentials. Expected variables (see backend/.env.example):
//   WHATSAPP_PHONE_NUMBER_ID  sender number id (required)
//   WHATSAPP_ACCESS_TOKEN      Meta system-user / test token (required)
//   WHATSAPP_APP_SECRET        Meta app secret, webhook HMAC only (required for inbound)
//   WHATSAPP_GRAPH_VERSION     e.g. v21.0 (optional, pinned default below)
//   WHATSAPP_WABA_ID           reserved for future account-level calls (optional)
//
// Test numbers can only message Meta-registered test recipients; anything
// else fails server-side at Meta with a 4xx, which surfaces here as a 502
// provider error (never a fake success).

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

const config = (override) => ({
    phoneNumberId: (override && override.phoneNumberId) || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: (override && override.accessToken) || process.env.WHATSAPP_ACCESS_TOKEN || '',
    appSecret: (override && override.appSecret) || process.env.WHATSAPP_APP_SECRET || '',
    graphVersion: (override && override.graphVersion) || process.env.WHATSAPP_GRAPH_VERSION || GRAPH_VERSION,
});

// E.164 digits: strip formatting, require 8-15 digits starting non-zero.
// Invalid recipients fail BEFORE any network call.
function normalizeRecipient(to) {
    const digits = String(to || '').replace(/\D/g, '');
    if (!/^[1-9]\d{7,14}$/.test(digits)) {
        throw new AppError('Recipient phone number is not a valid E.164 number', 400, 'INVALID_RECIPIENT');
    }
    return digits;
}

async function graphRequest(path, payload, credentials) {
    const { phoneNumberId, accessToken, graphVersion } = config(credentials);
    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}${path}`;
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000)
        });
    } catch (err) {
        throw new AppError(`WhatsApp API unreachable: ${err?.message || 'network error'}`, 502, 'WHATSAPP_PROVIDER_ERROR');
    }
    let data = null;
    try {
        data = await res.json();
    } catch {
        throw new AppError('WhatsApp API returned a non-JSON response', 502, 'WHATSAPP_PROVIDER_ERROR');
    }
    if (!res.ok) {
        const metaMessage = data && data.error && data.error.message ? String(data.error.message) : `HTTP ${res.status}`;
        throw new AppError(`WhatsApp API error: ${metaMessage}`, 502, 'WHATSAPP_PROVIDER_ERROR');
    }
    return data;
}

class MetaWhatsAppProvider {
    constructor() {
        this.name = 'meta';
        this.simulated = false;
    }

    isConfigured() {
        const { phoneNumberId, accessToken } = config();
        return Boolean(phoneNumberId && accessToken);
    }

    static verify(rawBody, signature, secret) {
        if (!signature || !secret) return false;
        const normalized = String(signature).startsWith('sha256=') ? String(signature) : `sha256=${signature}`;
        const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex')}`;
        const a = Buffer.from(normalized);
        const b = Buffer.from(expected);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    verifyWebhookSignature(rawBody, signature, credentials) {
        return MetaWhatsAppProvider.verify(rawBody, signature, config(credentials).appSecret);
    }

    // The service funnels every send through sendMessage (template sends carry
    // templateName + variables). Route accordingly so mock/generic/none
    // behavior stays byte-identical — only this provider branches.
    // An explicit `credentials` object ({phoneNumberId, accessToken,
    // appSecret, graphVersion}) overrides env for organization-scoped sends;
    // callers without one keep exact legacy env behavior.
    async sendMessage({ to, body, templateName, variables, language, credentials }) {
        if (templateName && String(templateName).trim()) {
            return await this.sendTemplate({ to, templateName, variables, language, credentials });
        }
        const recipient = normalizeRecipient(to);
        if (!body || !String(body).trim()) {
            throw new AppError('Message body is required', 400, 'VALIDATION_ERROR');
        }
        const data = await graphRequest('/messages', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient,
            type: 'text',
            text: { preview_url: false, body: String(body).trim() }
        }, credentials);
        const wamid = data && data.messages && data.messages[0] && data.messages[0].id;
        if (!wamid) {
            throw new AppError('WhatsApp API accepted the message but returned no message id', 502, 'WHATSAPP_PROVIDER_ERROR');
        }
        return { providerMessageId: wamid, status: 'SENT' };
    }

    async sendTemplate({ to, templateName, variables = [], language = 'en', credentials }) {
        const recipient = normalizeRecipient(to);
        if (!templateName || !String(templateName).trim()) {
            throw new AppError('Template name is required', 400, 'VALIDATION_ERROR');
        }
        const parameters = (Array.isArray(variables) ? variables : []).map((value) => ({
            type: 'text',
            text: String(value ?? '')
        }));
        const template = {
            name: String(templateName).trim(),
            language: { code: language || 'en' }
        };
        if (parameters.length > 0) {
            template.components = [{ type: 'body', parameters }];
        }
        const data = await graphRequest('/messages', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient,
            type: 'template',
            template
        }, credentials);
        const wamid = data && data.messages && data.messages[0] && data.messages[0].id;
        if (!wamid) {
            throw new AppError('WhatsApp API accepted the template but returned no message id', 502, 'WHATSAPP_PROVIDER_ERROR');
        }
        return { providerMessageId: wamid, status: 'SENT' };
    }

    // Authenticated GET helper for read-only Meta queries (approval checks,
    // connection probes). Same error mapping and timeout discipline as sends.
    async graphGet(path, params, credentials) {
        const { phoneNumberId, accessToken, graphVersion } = config(credentials);
        if (!accessToken) {
            throw new AppError('Meta access token is not configured', 409, 'WHATSAPP_NOT_CONFIGURED');
        }
        const cleanPath = String(path || '').replace(/^\/+/, '');
        const url = new URL(`https://graph.facebook.com/${graphVersion || GRAPH_VERSION}/${cleanPath}`);
        for (const [key, value] of Object.entries(params || {})) {
            if (value !== undefined && value !== null && value !== '') url.searchParams.append(key, String(value));
        }
        let res;
        try {
            res = await fetch(url.toString(), {
                method: 'GET',
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(15000),
            });
        } catch (err) {
            throw new AppError(`WhatsApp API unreachable: ${err?.message || 'network error'}`, 502, 'WHATSAPP_PROVIDER_ERROR');
        }
        let data = null;
        try {
            data = await res.json();
        } catch {
            throw new AppError('WhatsApp API returned a non-JSON response', 502, 'WHATSAPP_PROVIDER_ERROR');
        }
        if (!res.ok) {
            const metaMessage = data && data.error && data.error.message ? String(data.error.message) : `HTTP ${res.status}`;
            throw new AppError(`WhatsApp API error: ${metaMessage}`, 502, 'WHATSAPP_PROVIDER_ERROR');
        }
        return data;
    }

    // Safe, read-only connectivity probe for the settings Test Connection
    // action: resolves the sender number object. Never sends messages,
    // registers numbers, or changes Meta state. Returns display-safe fields.
    async checkConnection(credentials) {
        const data = await graphRequest(
            `/${(credentials && credentials.phoneNumberId) || config(credentials).phoneNumberId}?fields=display_phone_number,verified_name`,
            undefined,
            credentials
        );
        return {
            ok: true,
            displayPhoneNumber: (data && data.display_phone_number) || null,
            verifiedName: (data && data.verified_name) || null,
        };
    }
}

module.exports = MetaWhatsAppProvider;
