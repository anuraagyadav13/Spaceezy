const crypto = require('crypto');
const { AppError } = require('../../utils/errors');

// Generic HTTP telephony gateway. Credentials and webhook secrets stay
// server-side (env only) and are never sent to the frontend.
// Env: TELEPHONY_API_URL, TELEPHONY_API_KEY, TELEPHONY_BUSINESS_NUMBER,
//      TELEPHONY_WEBHOOK_SECRET.
class GenericHttpTelephonyProvider {
    constructor() {
        this.name = 'generic';
        this.simulated = false;
    }

    isConfigured() {
        return Boolean(process.env.TELEPHONY_API_URL);
    }

    async _request(path, body, method = 'POST') {
        const base = process.env.TELEPHONY_API_URL;
        if (!base) {
            throw new AppError('Telephony not configured. Ask your administrator to configure a telephony provider.', 409, 'TELEPHONY_NOT_CONFIGURED');
        }
        const headers = { 'Content-Type': 'application/json' };
        if (process.env.TELEPHONY_API_KEY) {
            headers.Authorization = `Bearer ${process.env.TELEPHONY_API_KEY}`;
        }
        let res;
        try {
            res = await fetch(`${base}${path}`, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(10000)
            });
        } catch (err) {
            throw new AppError('Telephony provider is unreachable', 502, 'TELEPHONY_PROVIDER_ERROR');
        }
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
        if (!res.ok) {
            throw new AppError('Telephony provider rejected the request', 502, 'TELEPHONY_PROVIDER_ERROR');
        }
        return data;
    }

    async initiateCall({ callId, toNumber, fromNumber, direction, leadId, webhookUrl }) {
        const data = await this._request('/calls', {
            callId,
            to: toNumber,
            from: fromNumber || process.env.TELEPHONY_BUSINESS_NUMBER,
            direction,
            leadId,
            webhookUrl
        });
        return {
            providerCallId: data.providerCallId || data.id || null,
            status: data.status || 'RINGING'
        };
    }

    async hangupCall({ providerCallId }) {
        const data = await this._request(`/calls/${encodeURIComponent(providerCallId)}/hangup`, {}, 'POST');
        return { providerCallId, status: data.status || 'COMPLETED' };
    }

    async getCallStatus({ providerCallId }) {
        const data = await this._request(`/calls/${encodeURIComponent(providerCallId)}`, undefined, 'GET');
        return { providerCallId, status: data.status || null };
    }

    async getCallDetails({ providerCallId }) {
        return await this._request(`/calls/${encodeURIComponent(providerCallId)}`, undefined, 'GET');
    }

    async getRecording({ providerCallId }) {
        try {
            return await this._request(`/calls/${encodeURIComponent(providerCallId)}/recording`, undefined, 'GET');
        } catch {
            return null;
        }
    }

    verifyWebhookSignature(rawBody, signature) {
        const secret = process.env.TELEPHONY_WEBHOOK_SECRET;
        if (!signature || !secret) return false;
        const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex');
        const a = Buffer.from(String(signature));
        const b = Buffer.from(expected);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
}

module.exports = GenericHttpTelephonyProvider;
