const crypto = require('crypto');
const { AppError } = require('../../utils/errors');

// Explicitly configured simulated provider (WHATSAPP_PROVIDER=mock) for
// development/E2E. Always reported to the UI as simulated.
class MockWhatsAppProvider {
    constructor() {
        this.name = 'mock';
        this.simulated = true;
    }

    isConfigured() {
        return true;
    }

    async sendMessage({ body }) {
        if (!body || !String(body).trim()) {
            throw new AppError('Message body is required', 400, 'VALIDATION_ERROR');
        }
        return { providerMessageId: `mockwa_${crypto.randomUUID()}`, status: 'SENT' };
    }

    async sendTemplate({ name }) {
        if (!name) {
            throw new AppError('Template name is required', 400, 'VALIDATION_ERROR');
        }
        return { providerMessageId: `mockwa_${crypto.randomUUID()}`, status: 'SENT' };
    }

    verifyWebhookSignature(rawBody, signature) {
        return MockWhatsAppProvider.verify(rawBody, signature, process.env.WHATSAPP_WEBHOOK_SECRET);
    }

    static verify(rawBody, signature, secret) {
        if (!signature || !secret) return false;
        const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex');
        const a = Buffer.from(String(signature));
        const b = Buffer.from(expected);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    parseWebhook(payload) {
        if (!payload || typeof payload !== 'object') return null;
        // Generic normalized envelope:
        // { eventId, type: 'message'|'status', ... }
        return payload;
    }
}

module.exports = MockWhatsAppProvider;
