const crypto = require('crypto');

const verifyHmacSha256 = (rawBody, signature, secret, options = {}) => {
    if (!signature || !secret) return false;
    const normalizePrefix = Boolean(options && options.normalizePrefix);
    const normalized = normalizePrefix && !String(signature).startsWith('sha256=')
        ? `sha256=${signature}`
        : String(signature);
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex')}`;
    const a = Buffer.from(normalized);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = { verifyHmacSha256 };
