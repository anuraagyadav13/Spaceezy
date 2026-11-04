// Password-reset policy in one place, so the API, the email copy and the
// tests all quote exactly the same numbers.
//
// These are read at require time by the routes/service; keep them primitives
// so nothing can mutate policy at runtime.

module.exports = {
    // 6-digit numeric code, delivered by email.
    OTP_LENGTH: 6,

    // A code is valid for 5 minutes from the moment it was sent.
    OTP_TTL_MS: 5 * 60 * 1000,

    // A second code cannot be requested within 60 seconds of the last one.
    OTP_RESEND_COOLDOWN_MS: 60 * 1000,

    // Wrong-code attempts allowed before the current code is locked. The
    // response is identical to a wrong code, so this never confirms that an
    // account exists.
    OTP_MAX_ATTEMPTS: 5,

    // Once the code is verified it is consumed and replaced by a one-time
    // reset token, valid for 10 minutes (long enough to type a new password).
    RESET_TOKEN_TTL_MS: 10 * 60 * 1000,

    // Same bar as user creation (validators/user.js), with an upper bound so a
    // huge password can't be used to burn CPU through argon2.
    MIN_PASSWORD_LENGTH: 10,
    MAX_PASSWORD_LENGTH: 100,
};
