const crypto = require('crypto');
const { AppError } = require('./errors');

// AES-256-GCM envelope for WhatsApp integration secrets.
//
// Format: `v1.<ivB64u>.<ciphertextB64u>.<tagB64u>` with a fresh random
// 12-byte nonce per encryption. The 32-byte key arrives ONLY via the
// WHATSAPP_SETTINGS_KEY environment variable (64 hex characters), which
// lives in the server env file — never in Git and never in the database.
//
// Security properties:
// - Wrong key, tampered envelope, or malformed input fails closed with a
//   generic error (no key material, ciphertext, or plaintext in messages).
// - Nothing is ever logged here (no console usage in this module).
// - There is deliberately no plaintext fallback: callers must fail closed
//   on decryption errors instead of consulting other secret sources.
//
// KMS migration path (production hardening, not implemented here): store the
// 32-byte key in AWS Secrets Manager (or use KMS Encrypt/Decrypt directly)
// and inject it as WHATSAPP_SETTINGS_KEY at container start. The IAM role
// needs ONLY kms:Decrypt (+kms:Encrypt if the app encrypts via KMS) on the
// single key ARN — never kms:* and never administrative permissions.

const PREFIX = 'v1';
const KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

function getKey() {
    const hex = process.env.WHATSAPP_SETTINGS_KEY || '';
    if (!KEY_PATTERN.test(hex)) {
        throw new AppError(
            'WhatsApp settings encryption is not configured (WHATSAPP_SETTINGS_KEY must be 64 hex characters)',
            500,
            'SETTINGS_KEY_MISSING'
        );
    }
    return Buffer.from(hex, 'hex');
}

function encryptSecret(plaintext) {
    const key = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const b64u = (buffer) => buffer.toString('base64url');
    return `${PREFIX}.${b64u(iv)}.${b64u(ciphertext)}.${b64u(tag)}`;
}

function decryptSecret(envelope) {
    const fail = () => {
        throw new AppError('Stored WhatsApp credential cannot be decrypted', 500, 'SETTINGS_DECRYPT_FAILED');
    };
    if (typeof envelope !== 'string') fail();
    const parts = envelope.split('.');
    if (parts.length !== 4 || parts[0] !== PREFIX) fail();
    let iv;
    let ciphertext;
    let tag;
    try {
        iv = Buffer.from(parts[1], 'base64url');
        ciphertext = Buffer.from(parts[2], 'base64url');
        tag = Buffer.from(parts[3], 'base64url');
    } catch {
        fail();
    }
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) fail();
    try {
        const key = getKey();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
        fail();
    }
    fail();
}

module.exports = { encryptSecret, decryptSecret };
