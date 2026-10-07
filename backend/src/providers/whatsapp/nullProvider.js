const { AppError } = require('../../utils/errors');

// No WhatsApp provider configured -> sending is rejected honestly.
class NullWhatsAppProvider {
    constructor() {
        this.name = 'none';
        this.simulated = false;
    }

    isConfigured() {
        return false;
    }

    _reject() {
        throw new AppError('WhatsApp integration not configured. Ask your administrator to connect the WhatsApp Business API.', 409, 'WHATSAPP_NOT_CONFIGURED');
    }

    async sendMessage() { this._reject(); }
    async sendTemplate() { this._reject(); }
    verifyWebhookSignature() { return false; }
    parseWebhook() { return null; }
}

module.exports = NullWhatsAppProvider;
