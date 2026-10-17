const crypto = require('crypto');
const { AppError } = require('../../utils/errors');
const { verifyHmacSha256 } = require('../../utils/hmac');

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
        return verifyHmacSha256(rawBody, signature, secret);
    }
}

module.exports = MockTelephonyProvider;
