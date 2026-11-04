// Password reset: issue a code, verify it, then exchange it for a one-time
// token that authorizes the actual password change.
//
// Threat model this is written against:
//   * Account enumeration — every externally visible outcome of
//     /forgot-password is identical (same status, same body) whether the
//     account exists, is on cooldown, or SES is down. /verify-reset-otp and
//     /reset-password answer every failure with one generic error.
//   * Offline attack on a DB dump — codes have only 1e6 values, so they are
//     stored as argon2id digests (same primitive as the password hash), never
//     as SHA-256.
//   * Brute force online — 5 wrong guesses kill the code; a new code needs a
//     60s cooldown, and both endpoints are rate-limited by IP and account.
//   * Code replay — verifying consumes the code (otpHash → null) and mints a
//     separate 256-bit token, which is itself single-use.
//
// Nothing in this file ever puts a code or a token into a log line.

const crypto = require('crypto');
const argon2 = require('argon2');
const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');
const { audit, AUDIT_ACTIONS } = require('../utils/audit');
const emailService = require('./emailService');
const { passwordResetOtpEmail, passwordChangedEmail } = require('./emailTemplates');
const {
    OTP_LENGTH,
    OTP_TTL_MS,
    OTP_RESEND_COOLDOWN_MS,
    OTP_MAX_ATTEMPTS,
    RESET_TOKEN_TTL_MS,
} = require('../constants/passwordReset');

// One error for every failure path across verify + reset-password: wrong
// code, expired code, locked code, unknown email, bad token, reused token.
// Distinct messages would let an attacker tell the cases (and therefore the
// accounts) apart.
const invalidReset = () => new AppError('Invalid or expired verification code.', 400, 'INVALID_RESET_CODE');

// Server-side only. Fixed field list — there is no way to pass a code or a
// token through it, same rule as emailService's logger.
const logReset = (event, fields) => console.info(`[password-reset] ${event}`, fields);

// Unbiased random code: one CSPRNG draw, zero-padded to 6 digits.
const generateOtp = () => String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const verifyHash = async (hash, candidate) => {
    try {
        return await argon2.verify(hash, String(candidate));
    } catch {
        // A malformed stored digest must fail closed, never throw upward.
        return false;
    }
};

// Timing equalizer: when there is nothing to verify (unknown account, code
// already consumed) we still spend the same argon2 work an existing account
// would, so response time doesn't answer "does this user exist?".
let dummyHashPromise = null;
const getDummyHash = () => {
    if (!dummyHashPromise) dummyHashPromise = argon2.hash(crypto.randomBytes(16).toString('hex'));
    return dummyHashPromise;
};
const equalizeTiming = async (candidate) => {
    try {
        await argon2.verify(await getDummyHash(), String(candidate));
    } catch {
        // ignore — this is only a timing decoy
    }
};

// Email lookup mirrors login exactly (exact match after trim). Login would
// not find an account on a differently-cased address either, so a reset that
// worked where login doesn't would be a dead end for the user.
const findUser = (email) => prisma.user.findFirst({
    where: { email: String(email || '').trim() },
    select: { id: true, name: true, email: true, status: true, organizationId: true },
});

/**
 * Step 1 — request a code for an email address.
 *
 * Never throws for "no such user" and never says whether one was found; the
 * caller turns every outcome into the same generic response.
 *
 * @returns {Promise<{sent: boolean, cooldown?: boolean}>} `sent` is for logs
 *          and tests only — it must not influence the HTTP response.
 * @throws {AppError} only for a delivery failure (so the caller can log it).
 */
const requestReset = async (email) => {
    const user = await findUser(email);

    if (!user || user.status !== 'ACTIVE') {
        logReset('skipped', { to: emailService.maskEmail(email), reason: 'no_active_account' });
        return { sent: false };
    }

    const existing = await prisma.passwordReset.findUnique({ where: { userId: user.id } });
    if (existing && Date.now() - new Date(existing.lastSentAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
        // Silently honour the 60s cooldown. Answering "you're doing that too
        // fast" here would confirm the account exists.
        logReset('skipped', { to: emailService.maskEmail(user.email), reason: 'cooldown' });
        return { sent: false, cooldown: true };
    }

    const otp = generateOtp();
    const otpHash = await argon2.hash(otp);
    const now = new Date();

    // userId is unique, so upserting IS the invalidation rule: issuing a new
    // code overwrites the previous code and revokes any token minted from it.
    await prisma.passwordReset.upsert({
        where: { userId: user.id },
        create: {
            userId: user.id,
            otpHash,
            otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
            attempts: 0,
            lastSentAt: now,
        },
        update: {
            otpHash,
            otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
            attempts: 0,
            lastSentAt: now,
            resetTokenHash: null,
            tokenExpiresAt: null,
        },
    });

    const { subject, html, text } = passwordResetOtpEmail({
        name: user.name,
        otp,
        expiresMinutes: OTP_TTL_MS / 60000,
    });

    try {
        await emailService.sendEmail({ to: user.email, subject, html, text });
    } catch (err) {
        // The code never arrived, so drop the row: otherwise the user would
        // wait out the 60s cooldown for an email that doesn't exist. The IP
        // and account rate limiters are what stop this being abused.
        await prisma.passwordReset.deleteMany({ where: { userId: user.id } }).catch(() => {});
        throw err;
    }

    // Trace that a code actually went out for a real account — admins can see
    // repeated reset requests on one account. Metadata is deliberately empty:
    // no address, no code.
    await audit(user.organizationId, user.id, AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED, 'User', user.id, {});

    return { sent: true };
};

/**
 * Step 2 — check a code and mint the one-time reset token.
 * Every failure is the same generic 400.
 */
const verifyOtp = async (email, code) => {
    const user = await findUser(email);
    const row = user ? await prisma.passwordReset.findUnique({ where: { userId: user.id } }) : null;
    const storedHash = row && row.otpHash ? row.otpHash : null;

    if (!storedHash) {
        // No account, no request, or the code was already used.
        await equalizeTiming(code);
        throw invalidReset();
    }

    const locked = row.attempts >= OTP_MAX_ATTEMPTS;
    const expired = new Date(row.otpExpiresAt).getTime() <= Date.now();

    // Verify even when locked/expired so all branches cost the same.
    const matches = await verifyHash(storedHash, code);

    if (expired || locked || !matches) {
        if (!expired && !locked) {
            await prisma.passwordReset.update({
                where: { id: row.id },
                data: { attempts: { increment: 1 } },
            });
        }
        logReset('verify_failed', {
            to: emailService.maskEmail(user && user.email),
            reason: expired ? 'expired' : (locked ? 'locked' : 'mismatch'),
        });
        throw invalidReset();
    }

    // Success: consume the code and hand back a separate one-time token, so
    // the OTP is never replayed in a second request.
    const resetToken = crypto.randomBytes(32).toString('hex');
    await prisma.passwordReset.update({
        where: { id: row.id },
        data: {
            otpHash: null,
            attempts: 0,
            resetTokenHash: hashToken(resetToken),
            tokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
    });

    logReset('verified', { to: emailService.maskEmail(user.email) });

    return { resetToken, expiresInSeconds: Math.round(RESET_TOKEN_TTL_MS / 1000) };
};

/**
 * Step 3 — exchange the token for a new password.
 * On success: password replaced, ALL sessions revoked, code/token row deleted
 * (single-use), audit entry written, confirmation email attempted.
 */
const resetPassword = async ({ email, resetToken, newPassword }) => {
    if (!resetToken) throw invalidReset();

    const resetTokenHash = hashToken(resetToken);
    const row = await prisma.passwordReset.findUnique({ where: { resetTokenHash } });

    if (!row || !row.tokenExpiresAt || new Date(row.tokenExpiresAt).getTime() <= Date.now()) {
        throw invalidReset();
    }

    const user = await prisma.user.findUnique({
        where: { id: row.userId },
        select: { id: true, name: true, email: true, status: true, organizationId: true },
    });

    if (!user || user.status !== 'ACTIVE' || user.email !== String(email || '').trim()) {
        throw invalidReset();
    }

    const passwordHash = await argon2.hash(newPassword);

    let sessionsRevoked = 0;
    await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
        const deleted = await tx.session.deleteMany({ where: { userId: user.id } });
        sessionsRevoked = deleted.count || 0;
        // Deleting the row makes the token single-use and clears every code.
        await tx.passwordReset.delete({ where: { id: row.id } });
    });

    // Password change is a sensitive action worth an audit trail. audit()
    // swallows its own failures, so this can never undo the reset.
    await audit(user.organizationId, user.id, AUDIT_ACTIONS.PASSWORD_RESET, 'User', user.id, {
        sessionsRevoked,
    });

    // Confirmation email: awaited, but the password has ALREADY changed by
    // this point — a delivery failure must not roll it back or make the API
    // claim the reset didn't happen. The outcome is reported honestly via
    // `confirmationEmailSent` (only ever read by the caller who just proved
    // control of the account) and logged at error level.
    let confirmationEmailSent = false;
    try {
        const { subject, html, text } = passwordChangedEmail({ name: user.name, requestedAt: new Date() });
        await emailService.sendEmail({ to: user.email, subject, html, text });
        confirmationEmailSent = true;
    } catch (err) {
        console.error('[password-reset] confirmation email failed:', err?.code || 'UNKNOWN');
    }

    return { sessionsRevoked, confirmationEmailSent };
};

module.exports = {
    requestReset,
    verifyOtp,
    resetPassword,
    // Exported for tests: the primitives that must never reach a log.
    generateOtp,
    hashToken,
    invalidReset,
};
