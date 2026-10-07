const { hasPermission } = require('../middleware/auth');

// Server-side PII masking. The backend decides what each user can see;
// full contact details require the pii:view permission (owner/admin only).
// Call permission never implies full PII visibility.

const canSeePII = (role) => hasPermission(role, 'pii:view');

const maskPhone = (phone) => {
    if (!phone) return phone;
    const value = String(phone).trim();
    if (value.length <= 4) return '*'.repeat(value.length);
    // Keep leading +CC (if present) and the last 4 digits: +91******1234
    const last4 = value.slice(-4);
    let prefix = '';
    let rest = value.slice(0, -4);
    if (rest.startsWith('+')) {
        const m = rest.match(/^\+\d{0,3}/);
        prefix = m ? m[0] : '+';
        rest = rest.slice(prefix.length);
    }
    return prefix + '*'.repeat(Math.max(rest.length, 1)) + last4;
};

const maskEmail = (email) => {
    if (!email) return email;
    const value = String(email);
    const at = value.indexOf('@');
    if (at <= 0) return '*'.repeat(value.length);
    return value[0] + '***' + value.slice(at);
};

// Masks the standard contact fields of an object according to role.
const maskContact = (obj, role, fields = ['phone', 'email']) => {
    if (!obj || canSeePII(role)) return obj;
    const out = { ...obj };
    for (const f of fields) {
        if (out[f]) {
            out[f] = f === 'email' ? maskEmail(out[f]) : maskPhone(out[f]);
        }
    }
    out.piiMasked = true;
    return out;
};

module.exports = { canSeePII, maskPhone, maskEmail, maskContact };
