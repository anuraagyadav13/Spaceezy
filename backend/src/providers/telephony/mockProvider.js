const crypto = require('crypto');
const { AppError } = require('../../utils/errors');

// Explicitly configured simulated provider for development and E2E.
// It is ALWAYS reported as simulated to the UI ("mock (simulated)") so the
// product never pretends a real line is in use. Selection is explicit via
// TELEPHONY_PROVIDER=mock, never a fallback.
class MockTelephonyProvider {
    constructor() {
        this.name = 'mock';
        this.simulated = true;
    }

    isConfigured() {
        return true;
    }

    async initiateCall({ callId }) {
        return {
            providerCallId: `mock_${crypto.randomUUID()}`,
            status: 'RINGING',
            callId
        };
    }

    async hangupCall({ providerCallId }) {
        return { providerCallId, status: 'COMPLETED' };
    }

    async getCallStatus({ providerCallId }) {
        return { providerCallId, status: 'COMPLETED' };
    }

    async getCallDetails({ providerCallId }) {
        return { providerCallId, simulated: true };
    }

    async getRecording() {
        return null; // simulated provider has no recordings
    }

    verifyWebhookSignature(rawBody, signature) {
        return this._verify(rawBody, signature, process.env.TELEPHONY_WEBHOOK_SECRET);
    }

    _verify(rawBody, signature, secret) {
        if (!signature || !secret) return false;
        const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex');
        const a = Buffer.from(String(signature));
        const b = Buffer.from(expected);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
}

module.exports = MockTelephonyProvider;
