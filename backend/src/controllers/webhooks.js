const { asyncHandler } = require('../utils/errors');
const CallService = require('../services/callService');
const WhatsAppService = require('../services/whatsappService');

// Public webhook endpoints (authenticated by provider HMAC signature, not
// by session). Bodies are verified against req.rawBody captured in app.js.

const telephonyWebhook = asyncHandler(async (req, res) => {
    const signature = req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'] || '';
    const result = await CallService.processWebhook(req.params.provider, req.rawBody || '', signature);
    res.status(200).json({ success: true, data: result });
});

const whatsappWebhook = asyncHandler(async (req, res) => {
    const signature = req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'] || '';
    const result = await WhatsAppService.processWebhook(req.params.provider, req.rawBody || '', signature);
    res.status(200).json({ success: true, data: result });
});

// WhatsApp-style verification handshake.
const whatsappWebhookVerify = asyncHandler(async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        res.status(200).send(String(challenge || ''));
        return;
    }
    res.status(403).json({ success: false, code: 'WEBHOOK_VERIFY_FAILED', message: 'Verification failed' });
});

module.exports = { telephonyWebhook, whatsappWebhook, whatsappWebhookVerify };
