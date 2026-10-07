const { AppError } = require('../../utils/errors');
const MockWhatsAppProvider = require('./mockProvider');

// Generic HTTP WhatsApp Business API gateway.
// Env: WHATSAPP_API_URL, WHATSAPP_API_KEY, WHATSAPP_PHONE_NUMBER_ID,
//      WHATSAPP_WEBHOOK_SECRET. Secrets never leave the server.
class GenericHttpWhatsAppProvider {
    constructor() {
        this.name = 'generic';
        this.simulated = false;
    }

    isConfigured() {
        return Boolean(process.env.WHATSAPP_API_URL);
    }

    async _request(path, body) {
        const base = process.env.WHATSAPP_API_URL;
        if (!base) {
            throw new AppError('WhatsApp integration not configured. Ask your administrator to connect the WhatsApp Business API.', 409, 'WHATSAPP_NOT_CONFIGURED');
        }
        const headers = { 'Content-Type': 'application/json' };
        if (process.env.WHATSAPP_API_KEY) {
            headers.Authorization = `Bearer ${process.env.WHATSAPP_API_KEY}`;
        }
        let res;
        try {
            res = await fetch(`${base}${path}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10000)
            });
        } catch {
            throw new AppError('WhatsApp provider is unreachable', 502, 'WHATSAPP_PROVIDER_ERROR');
        }
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
        if (!res.ok) {
            throw new AppError('WhatsApp provider rejected the message', 502, 'WHATSAPP_PROVIDER_ERROR');
        }
        return data;
    }

    async sendMessage({ to, body }) {
        const data = await this._request('/messages', {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body }
        });
        return {
            providerMessageId: data.messages?.[0]?.id || data.id || null,
            status: 'SENT'
        };
    }

    async sendTemplate({ to, name, language, variables }) {
        const components = variables && variables.length
            ? [{ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: String(v) })) }]
            : undefined;
        const data = await this._request('/messages', {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: { name, language: { code: language || 'en' }, ...(components ? { components } : {}) }
        });
        return {
            providerMessageId: data.messages?.[0]?.id || data.id || null,
            status: 'SENT'
        };
    }

    verifyWebhookSignature(rawBody, signature) {
        return MockWhatsAppProvider.verify(rawBody, signature, process.env.WHATSAPP_WEBHOOK_SECRET);
    }

    parseWebhook(payload) {
        if (!payload || typeof payload !== 'object') return null;
        return payload;
    }
}

module.exports = GenericHttpWhatsAppProvider;
