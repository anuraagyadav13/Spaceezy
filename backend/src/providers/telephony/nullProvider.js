const { AppError } = require('../../utils/errors');

// Provider-neutral telephony interface. No provider configured -> calls are
// rejected with TELEPHONY_NOT_CONFIGURED; we never fake successful calls.
class NullTelephonyProvider {
    constructor() {
        this.name = 'none';
        this.simulated = false;
    }

    isConfigured() {
        return false;
    }

    _reject() {
        throw new AppError('Telephony not configured. Ask your administrator to configure a telephony provider.', 409, 'TELEPHONY_NOT_CONFIGURED');
    }

    async initiateCall() { this._reject(); }
    async hangupCall() { this._reject(); }
    async getCallStatus() { this._reject(); }
    async getCallDetails() { this._reject(); }
    async getRecording() { this._reject(); }
    verifyWebhookSignature() { return false; }
}

module.exports = NullTelephonyProvider;
