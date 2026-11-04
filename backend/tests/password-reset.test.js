// Amazon SES password-reset flow — forgot-password → verify OTP → reset.
//
// SES is MOCKED at the SDK boundary (@aws-sdk/client-sesv2), so no test ever
// puts a message on the wire: the assertions run against the exact
// SendEmailCommand payload the real client would send. Prisma is mocked too,
// so nothing here needs a database.
//
// What this pins down:
//   * delivery success / AWS rejection / not-configured behaviour
//   * the generic, enumeration-safe responses (identical bodies per outcome)
//   * OTP expiry, wrong code, 5-attempt lockout, 60s resend cooldown
//   * session revocation + confirmation mail after a successful reset
//   * that neither an OTP, a reset token, a raw address nor AWS credentials
//     ever reach a log line.

process.env.AWS_REGION = 'ap-south-1';
process.env.SES_FROM_EMAIL = 'no-reply@spaceezy.com';
process.env.SES_FROM_NAME = 'SpaceEzy';
delete process.env.SES_CONFIGURATION_SET;
// Generous by default so the rate-limit cases can lower them selectively.
process.env.RESET_RATE_LIMIT_IP_MAX = '1000';
process.env.RESET_RATE_LIMIT_VERIFY_IP_MAX = '1000';
process.env.RESET_RATE_LIMIT_RESET_IP_MAX = '1000';
process.env.RESET_RATE_LIMIT_ACCOUNT_MAX = '1000';

const request = require('supertest');
const crypto = require('crypto');
const argon2 = require('argon2');

const app = require('../src/app');
const prisma = require('../src/db/prisma');
const emailService = require('../src/services/emailService');
const { passwordResetOtpEmail, passwordChangedEmail, accountSecurityEmail } = require('../src/services/emailTemplates');
const { __sendMock: sesSend } = require('@aws-sdk/client-sesv2');

jest.mock('@aws-sdk/client-sesv2', () => {
  const sendMock = jest.fn();
  class SendEmailCommand {
    constructor(input) { this.input = input; }
  }
  class SESv2Client {
    constructor(config) { this.config = config; }
    send(...args) { return sendMock(...args); }
  }
  return { SendEmailCommand, SESv2Client, __sendMock: sendMock };
});

jest.mock('../src/db/prisma', () => {
  const mock = {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    passwordReset: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    session: { deleteMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  // Interactive transaction: hand the same mock in as the client, so the
  // assertions inside the callback see exactly what the service wrote.
  mock.$transaction = jest.fn(async (fn) => fn(mock));
  return mock;
});

// ---------------------------------------------------------------------------
// Log capture — everything console.* produced during the suite.
// ---------------------------------------------------------------------------
const logLines = [];
const seenSecrets = []; // OTPs and reset tokens that must never appear in logs
const consoleSpies = [];

const stringifyArg = (arg) => {
  if (typeof arg === 'string') return arg;
  try { return JSON.stringify(arg); } catch { return String(arg); }
};

beforeAll(() => {
  for (const method of ['log', 'info', 'warn', 'error']) {
    consoleSpies.push(
      jest.spyOn(console, method).mockImplementation((...args) => {
        logLines.push(args.map(stringifyArg).join(' '));
      })
    );
  }
});

afterAll(() => {
  consoleSpies.forEach((spy) => spy.mockRestore());
});

afterEach(() => {
  emailService.resetClient();
});

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------
const ORG = 'org-1';
const USER_ID = 'user-1';
const EMAIL = 'kamal@spaceezy.com';

const activeUser = (overrides = {}) => ({
  id: USER_ID,
  name: 'Kamal Rao',
  email: EMAIL,
  status: 'ACTIVE',
  organizationId: ORG,
  ...overrides,
});

let ipCounter = 0;
// Distinct client IP per request: the in-memory rate-limit buckets are
// process-wide, so isolation is cheaper than resetting them.
const fromIp = (ip = `203.0.113.${(ipCounter++ % 250) + 1}`) => ({ 'X-Forwarded-For': ip });

const lastSendCommand = () => {
  const calls = sesSend.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0];
};

// Pull the code back out of the message that would have been emailed. This is
// the only way a test can know it, exactly like a real recipient.
const codeFromMessage = (cmd) => {
  const text = cmd.input.Content.Simple.Body.Text.Data;
  const match = text.match(/verification code is:\s*\n+\s*(\d{6})/);
  if (!match) throw new Error('No 6-digit code found in the text body');
  return match[1];
};

const seedActiveRow = async ({ code, expiresAt, attempts = 0, lastSentAt = new Date() }) => ({
  id: 'pr-1',
  userId: USER_ID,
  otpHash: code === null ? null : await argon2.hash(code),
  otpExpiresAt: expiresAt,
  attempts,
  lastSentAt,
  resetTokenHash: null,
  tokenExpiresAt: null,
});

beforeEach(() => {
  jest.clearAllMocks();

  prisma.user.findFirst.mockResolvedValue(null);
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.user.update.mockResolvedValue({});
  prisma.passwordReset.findUnique.mockResolvedValue(null);
  prisma.passwordReset.upsert.mockResolvedValue({});
  prisma.passwordReset.update.mockResolvedValue({});
  prisma.passwordReset.delete.mockResolvedValue({});
  prisma.passwordReset.deleteMany.mockResolvedValue({ count: 1 });
  prisma.session.deleteMany.mockResolvedValue({ count: 0 });
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

  sesSend.mockReset();
  sesSend.mockResolvedValue({ MessageId: '0100018f-example-message-id' });

  process.env.AWS_REGION = 'ap-south-1';
  process.env.SES_FROM_EMAIL = 'no-reply@spaceezy.com';
  process.env.SES_FROM_NAME = 'SpaceEzy';
  process.env.RESET_RATE_LIMIT_IP_MAX = '1000';
  process.env.RESET_RATE_LIMIT_VERIFY_IP_MAX = '1000';
  process.env.RESET_RATE_LIMIT_RESET_IP_MAX = '1000';
  process.env.RESET_RATE_LIMIT_ACCOUNT_MAX = '1000';
});

// ===========================================================================
// 1. POST /auth/forgot-password
// ===========================================================================
describe('POST /auth/forgot-password', () => {
  test('delivers a code for an existing account and stores only an argon2 digest', async () => {
    prisma.user.findFirst.mockResolvedValue(activeUser());
    prisma.passwordReset.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set(fromIp())
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({});

    // Exactly one SES call, from the configured identity, to the account.
    expect(sesSend).toHaveBeenCalledTimes(1);
    const cmd = lastSendCommand();
    expect(cmd.input.FromEmailAddress).toBe('SpaceEzy <no-reply@spaceezy.com>');
    expect(cmd.input.Destination.ToAddresses).toEqual([EMAIL]);
    expect(cmd.input.Content.Simple.Body.Html.Data).toBeTruthy();
    expect(cmd.input.Content.Simple.Body.Text.Data).toBeTruthy();

    const otp = codeFromMessage(cmd);
    seenSecrets.push(otp);

    // The code went to the recipient but the database got a digest, not the
    // code: verify the stored value matches and is not plaintext.
    expect(prisma.passwordReset.upsert).toHaveBeenCalledTimes(1);
    const { create } = prisma.passwordReset.upsert.mock.calls[0][0];
    expect(create.userId).toBe(USER_ID);
    expect(create.attempts).toBe(0);
    expect(create.otpHash).not.toBe(otp);
    expect(create.otpHash.startsWith('$argon2')).toBe(true);
    await expect(argon2.verify(create.otpHash, otp)).resolves.toBe(true);
    await expect(argon2.verify(create.otpHash, '000000')).resolves.toBe(false);

    // TTL is 5 minutes from now.
    const ttl = new Date(create.otpExpiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(4.5 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(5 * 60 * 1000);

    // The code is in the body, never in the subject or the hidden preheader
    // (those render on a lock screen and in the inbox list).
    expect(cmd.input.Content.Simple.Subject.Data).not.toContain(otp);
    const html = cmd.input.Content.Simple.Body.Html.Data;
    const preheader = (html.match(/preheader: what the inbox preview shows before the subject\. -->\s*<div[^>]*>([^<]*)</) || [])[1] || '';
    expect(preheader).not.toContain(otp);
    expect(html).toContain(otp);
    expect(html).toContain('SpaceEzy');
    expect(html).toContain('5 minutes');
    expect(html).toContain('Didn');
    expect(html).toContain('your password has');
    expect(html).toContain('name="viewport"');
  });

  test('returns the identical generic response for an unknown account (no enumeration, no send)', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set(fromIp())
      .send({ email: 'nobody@spaceezy.com' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {},
      message: 'If an account exists for that email, a password reset code has been sent.',
    });
    expect(sesSend).not.toHaveBeenCalled();
    expect(prisma.passwordReset.upsert).not.toHaveBeenCalled();
    expect(prisma.passwordReset.findUnique).not.toHaveBeenCalled();
  });

  test('an SES rejection is never reported as success, and does not change the API response', async () => {
    prisma.user.findFirst.mockResolvedValue(activeUser());
    prisma.passwordReset.findUnique.mockResolvedValue(null);
    sesSend.mockRejectedValue(Object.assign(new Error('Message rejected'), {
      name: 'MessageRejected',
      $metadata: { httpStatusCode: 400 },
    }));

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set(fromIp())
      .send({ email: EMAIL });

    // Same 200 + same body as the unknown-account case: surfacing the SES
    // failure here would be an existence oracle. The failure is logged
    // instead (asserted below).
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {},
      message: 'If an account exists for that email, a password reset code has been sent.',
    });

    // The code never landed, so the row is rolled back rather than parking
    // the user behind a cooldown for a mail that does not exist.
    expect(prisma.passwordReset.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });

    // ...and the failure was recorded, with the AWS error class only.
    const failureLines = logLines.filter((line) => line.includes('[email] failed'));
    expect(failureLines).toHaveLength(1);
    expect(failureLines[0]).toContain('MessageRejected');
    expect(failureLines[0]).toContain('"to":"k***@spaceezy.com"');
    expect(failureLines.join('\n')).not.toContain(EMAIL);
  });

  test('the email service itself throws 502 when SES rejects (no false success)', async () => {
    sesSend.mockRejectedValue(Object.assign(new Error('Throttling'), {
      name: 'AccountSendingQuotaExceeded',
      $metadata: { httpStatusCode: 429 },
    }));

    await expect(emailService.sendEmail({
      to: 'someone@spaceezy.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
    })).rejects.toMatchObject({ statusCode: 502, code: 'EMAIL_SEND_FAILED' });

    // The AWS message must not leak into the error the caller sees.
    await expect(emailService.sendEmail({
      to: 'someone@spaceezy.com', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi',
    })).rejects.toThrow(/could not send the email/i);
  });

  test('a missing SES configuration fails closed with 501', async () => {
    delete process.env.SES_FROM_EMAIL;

    await expect(emailService.sendEmail({
      to: 'someone@spaceezy.com', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi',
    })).rejects.toMatchObject({ statusCode: 501, code: 'EMAIL_NOT_CONFIGURED' });
    expect(sesSend).not.toHaveBeenCalled();

    // The endpoint still answers generically rather than 501 (existence leak).
    prisma.user.findFirst.mockResolvedValue(activeUser());
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set(fromIp())
      .send({ email: EMAIL });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('resend cooldown: a second request inside 60s sends nothing, yet answers the same', async () => {
    prisma.user.findFirst.mockResolvedValue(activeUser());

    // Inside the window → silently skipped.
    prisma.passwordReset.findUnique.mockResolvedValue({ ...await seedActiveRow({ code: null, expiresAt: new Date(Date.now() + 300000) }), lastSentAt: new Date() });
    const first = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set(fromIp())
      .send({ email: EMAIL });

    expect(first.status).toBe(200);
    expect(sesSend).not.toHaveBeenCalled();
    expect(prisma.passwordReset.upsert).not.toHaveBeenCalled();

    // Past the window → sent again.
    prisma.passwordReset.findUnique.mockResolvedValue({
      ...await seedActiveRow({ code: null, expiresAt: new Date(Date.now() - 1000) }),
      lastSentAt: new Date(Date.now() - 61 * 1000),
    });
    const second = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set(fromIp())
      .send({ email: EMAIL });

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(sesSend).toHaveBeenCalledTimes(1);
    expect(prisma.passwordReset.upsert).toHaveBeenCalledTimes(1);
  });

  test('a deactivated account is treated exactly like an unknown one', async () => {
    prisma.user.findFirst.mockResolvedValue(activeUser({ status: 'INACTIVE' }));

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set(fromIp())
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(sesSend).not.toHaveBeenCalled();
    expect(prisma.passwordReset.upsert).not.toHaveBeenCalled();
  });

  test('rejects a malformed address before it reaches the service', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set(fromIp())
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. POST /auth/verify-reset-otp
// ===========================================================================
describe('POST /auth/verify-reset-otp', () => {
  const validCode = '424242';

  beforeEach(() => {
    prisma.user.findFirst.mockResolvedValue(activeUser());
  });

  test('accepts the correct code, consumes it, and returns a one-time token', async () => {
    prisma.passwordReset.findUnique.mockResolvedValue(
      await seedActiveRow({ code: validCode, expiresAt: new Date(Date.now() + 4 * 60 * 1000) })
    );

    const res = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .set(fromIp())
      .send({ email: EMAIL, otp: validCode });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.expiresInSeconds).toBe(600);
    const token = res.body.data.resetToken;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    seenSecrets.push(token);

    // The code is now unusable and the token is stored as a SHA-256 digest.
    expect(prisma.passwordReset.update).toHaveBeenCalledTimes(1);
    const { data } = prisma.passwordReset.update.mock.calls[0][0];
    expect(data.otpHash).toBeNull();
    expect(data.attempts).toBe(0);
    expect(data.resetTokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(data.resetTokenHash).not.toContain(token);
    expect(new Date(data.tokenExpiresAt).getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);

    // Verifying twice cannot work: the second lookup sees otpHash === null.
    prisma.passwordReset.findUnique.mockResolvedValue({
      ...(await seedActiveRow({ code: null, expiresAt: new Date(Date.now() + 60000) })),
      otpHash: null,
    });
    const replay = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .set(fromIp())
      .send({ email: EMAIL, otp: validCode });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('INVALID_RESET_CODE');
  });

  test('a wrong code is rejected and counts toward the 5-attempt budget', async () => {
    prisma.passwordReset.findUnique.mockResolvedValue(
      await seedActiveRow({ code: validCode, expiresAt: new Date(Date.now() + 4 * 60 * 1000), attempts: 2 })
    );

    const res = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .set(fromIp())
      .send({ email: EMAIL, otp: '999999' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_CODE');
    expect(prisma.passwordReset.update).toHaveBeenCalledWith({
      where: { id: 'pr-1' },
      data: { attempts: { increment: 1 } },
    });
  });

  test('an expired code fails with the same body as a wrong code', async () => {
    prisma.passwordReset.findUnique.mockResolvedValue(
      await seedActiveRow({ code: validCode, expiresAt: new Date(Date.now() - 1000) })
    );

    const res = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .set(fromIp())
      .send({ email: EMAIL, otp: validCode });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_CODE');
    // An expired code is already dead — no need to spend the attempt budget.
    expect(prisma.passwordReset.update).not.toHaveBeenCalled();
  });

  test('after 5 wrong attempts even the correct code is refused (lockout)', async () => {
    prisma.passwordReset.findUnique.mockResolvedValue(
      await seedActiveRow({ code: validCode, expiresAt: new Date(Date.now() + 4 * 60 * 1000), attempts: 5 })
    );

    const res = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .set(fromIp())
      .send({ email: EMAIL, otp: validCode });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_CODE');
    // Locked: no further attempts recorded, no token minted.
    expect(prisma.passwordReset.update).not.toHaveBeenCalled();
  });

  test('unknown account and wrong code are byte-identical responses', async () => {
    const wrong = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .set(fromIp())
      .send({ email: EMAIL, otp: '999999' });

    prisma.user.findFirst.mockResolvedValue(null);
    const unknown = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .set(fromIp())
      .send({ email: 'ghost@spaceezy.com', otp: '999999' });

    expect(wrong.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body).toEqual({
      success: false,
      message: 'Invalid or expired verification code.',
      code: 'INVALID_RESET_CODE',
    });
  });

  test('rejects a non-numeric or wrong-length code at validation', async () => {
    for (const otp of ['12345', '1234567', 'abcdef']) {
      const res = await request(app)
        .post('/api/v1/auth/verify-reset-otp')
        .set(fromIp())
        .send({ email: EMAIL, otp });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(prisma.passwordReset.findUnique).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3. POST /auth/reset-password
// ===========================================================================
describe('POST /auth/reset-password', () => {
  const TOKEN = crypto.randomBytes(32).toString('hex');
  const NEW_PASSWORD = 'a-brand-new-passw0rd';

  const seedTokenRow = (overrides = {}) => ({
    id: 'pr-1',
    userId: USER_ID,
    otpHash: null,
    otpExpiresAt: new Date(Date.now() + 60000),
    attempts: 0,
    lastSentAt: new Date(),
    resetTokenHash: crypto.createHash('sha256').update(TOKEN).digest('hex'),
    tokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    ...overrides,
  });

  // findUnique serves both callers: by userId (verify) and by resetTokenHash
  // (reset), so dispatch on the lookup key.
  const seedLookups = ({ row = null, user = null } = {}) => {
    prisma.passwordReset.findUnique.mockImplementation(async ({ where }) => {
      if (where.resetTokenHash) return row;
      return null;
    });
    prisma.user.findUnique.mockResolvedValue(user);
  };

  beforeEach(() => {
    prisma.session.deleteMany.mockResolvedValue({ count: 2 });
  });

  test('replaces the password, revokes every session and sends the confirmation email', async () => {
    seedLookups({ row: seedTokenRow(), user: activeUser() });

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .set(fromIp())
      .send({ email: EMAIL, resetToken: TOKEN, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionsRevoked).toBe(2);
    expect(res.body.data.confirmationEmailSent).toBe(true);
    // The browser is logged out too — the session it may hold is gone.
    const cookies = [].concat(res.headers['set-cookie'] || []);
    expect(cookies.join('\n')).toContain('spaceezy_session=');

    // Password written as argon2, never plaintext.
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const { data } = prisma.user.update.mock.calls[0][0];
    expect(data.passwordHash.startsWith('$argon2')).toBe(true);
    expect(data.passwordHash).not.toBe(NEW_PASSWORD);
    await expect(argon2.verify(data.passwordHash, NEW_PASSWORD)).resolves.toBe(true);

    // Sessions revoked for this user only, and the reset row consumed.
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(prisma.passwordReset.delete).toHaveBeenCalledWith({ where: { id: 'pr-1' } });

    // Audit trail for the sensitive action.
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auth.password_reset', entityId: USER_ID }),
      })
    );

    // Confirmation email went out, and it does not carry a code.
    expect(sesSend).toHaveBeenCalledTimes(1);
    const cmd = lastSendCommand();
    expect(cmd.input.Content.Simple.Subject.Data).toBe('Your SpaceEzy password was changed');
    expect(cmd.input.Destination.ToAddresses).toEqual([EMAIL]);
    expect(cmd.input.Content.Simple.Body.Text.Data).not.toMatch(/\b\d{6}\b/);
    seenSecrets.push(TOKEN);
  });

  test('an expired or unknown token is refused with the generic code', async () => {
    seedLookups({ row: null, user: activeUser() });
    const unknown = await request(app)
      .post('/api/v1/auth/reset-password')
      .set(fromIp())
      .send({ email: EMAIL, resetToken: TOKEN, newPassword: NEW_PASSWORD });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('INVALID_RESET_CODE');

    seedLookups({
      row: seedTokenRow({ tokenExpiresAt: new Date(Date.now() - 1000) }),
      user: activeUser(),
    });
    const expired = await request(app)
      .post('/api/v1/auth/reset-password')
      .set(fromIp())
      .send({ email: EMAIL, resetToken: TOKEN, newPassword: NEW_PASSWORD });
    expect(expired.status).toBe(400);
    expect(expired.body).toEqual(unknown.body);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('a token presented with a different email address is refused', async () => {
    seedLookups({ row: seedTokenRow(), user: activeUser({ email: 'other@spaceezy.com' }) });

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .set(fromIp())
      .send({ email: EMAIL, resetToken: TOKEN, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_CODE');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('the password must meet the policy', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .set(fromIp())
      .send({ email: EMAIL, resetToken: TOKEN, newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('a failed confirmation email is reported honestly without undoing the reset', async () => {
    seedLookups({ row: seedTokenRow(), user: activeUser() });
    sesSend.mockRejectedValue(Object.assign(new Error('Rejected'), {
      name: 'MessageRejected',
      $metadata: { httpStatusCode: 400 },
    }));

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .set(fromIp())
      .send({ email: EMAIL, resetToken: TOKEN, newPassword: NEW_PASSWORD });

    // The password DID change and the token is spent — the API says so
    // plainly instead of pretending the mail went out.
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ sessionsRevoked: 2, confirmationEmailSent: false });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.passwordReset.delete).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 4. Rate limiting (IP + account)
// ===========================================================================
describe('rate limiting', () => {
  afterEach(() => {
    process.env.RESET_RATE_LIMIT_IP_MAX = '1000';
    process.env.RESET_RATE_LIMIT_ACCOUNT_MAX = '1000';
    process.env.RESET_RATE_LIMIT_VERIFY_IP_MAX = '1000';
  });

  test('one IP is cut off after the configured number of forgot-password calls', async () => {
    process.env.RESET_RATE_LIMIT_IP_MAX = '3';

    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set(fromIp('198.51.100.7'))
        // Different addresses each time: only the IP budget should bite.
        .send({ email: `probe-${i}@spaceezy.com` });
      statuses.push(res.status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(3);
  });

  test('one account is cut off regardless of how many IPs it comes from', async () => {
    process.env.RESET_RATE_LIMIT_ACCOUNT_MAX = '3';
    // Rate-limit buckets live in memory for the whole file, so this case
    // needs an address no earlier test has already spent budget against.
    const targeted = `targeted-${Date.now()}@spaceezy.com`;
    prisma.user.findFirst.mockResolvedValue(activeUser({ email: targeted }));

    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        // Fresh IP every time → the per-IP budget never fills.
        .set(fromIp())
        .send({ email: targeted });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(sesSend).toHaveBeenCalledTimes(3);
  });

  test('an unknown account hits the same per-account limit (429 does not reveal existence)', async () => {
    process.env.RESET_RATE_LIMIT_ACCOUNT_MAX = '3';
    const ghost = `ghost-${Date.now()}@spaceezy.com`;
    prisma.user.findFirst.mockResolvedValue(null);

    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set(fromIp())
        .send({ email: ghost });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(sesSend).not.toHaveBeenCalled();
  });

  test('verify-reset-otp is rate-limited per IP', async () => {
    process.env.RESET_RATE_LIMIT_VERIFY_IP_MAX = '3';

    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/v1/auth/verify-reset-otp')
        .set(fromIp('198.51.100.9'))
        .send({ email: 'kamal@spaceezy.com', otp: '123456' });
      statuses.push(res.status);
    }
    // The first three reach the service (400: nothing to verify in this test),
    // the fourth is refused by the limiter before any DB work.
    expect(statuses.slice(0, 3)).toEqual([400, 400, 400]);
    expect(statuses[3]).toBe(429);
  });
});

// ===========================================================================
// 5. Templates
// ===========================================================================
describe('email templates', () => {
  test('the reset mail is branded, responsive and carries the code + expiry + warning', () => {
    const { subject, html, text } = passwordResetOtpEmail({ name: 'Kamal Rao', otp: '654321' });

    expect(subject).toBe('Your SpaceEzy verification code');
    expect(html).toContain('SpaceEzy');
    expect(html).toContain('654321');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('max-width:520px');
    expect(html).toContain('Expires in 5 minutes');
    expect(html).toContain('Didn&rsquo;t request this code?');
    expect(html).toContain('your password has <strong>not</strong> changed');
    expect(text).toContain('654321');
    expect(text).toContain('5 minutes');
    // A name containing markup must be escaped, not rendered.
    const hostile = passwordResetOtpEmail({ name: '<img src=x onerror=alert(1)>', otp: '111111' });
    expect(hostile.html).not.toContain('<img src=x');
    expect(hostile.html).toContain('&lt;img');
  });

  test('the confirmation mail has no code and warns when the change was not made by the owner', () => {
    const { subject, html, text } = passwordChangedEmail({ name: 'Kamal Rao', requestedAt: new Date('2026-11-03T10:00:00Z') });

    expect(subject).toBe('Your SpaceEzy password was changed');
    expect(html).toContain('has just been changed');
    expect(html).toContain('all existing sessions were signed out');
    expect(html).toContain('Wasn&rsquo;t you?');
    // No code anywhere: strip CSS hex colours (#334155 etc.), which are the
    // only 6-digit runs a well-formed template should contain.
    expect(html.replace(/#[0-9a-f]{6}\b/gi, '')).not.toMatch(/\b\d{6}\b/);
    expect(text).not.toMatch(/\b\d{6}\b/);
  });

  test('the account security notification renders headline, detail, action URL and warning', () => {
    const { subject, html, text } = accountSecurityEmail({
      name: 'Kamal Rao',
      event: 'Suspicious sign-in detected',
      detail: 'A new sign-in was observed from a new device.',
      actionUrl: 'https://spaceezy.com/dashboard/security',
    });

    expect(subject).toBe('Suspicious sign-in detected');
    expect(html).toContain('Hi Kamal Rao,');
    expect(html).toContain('Suspicious sign-in detected');
    expect(html).toContain('A new sign-in was observed from a new device.');
    expect(html).toContain('Review your account');
    expect(html).toContain('https://spaceezy.com/dashboard/security');
    expect(html).toContain('Did not expect this?');
    expect(text).toContain('Suspicious sign-in detected');
    expect(text).toContain('A new sign-in was observed from a new device.');
  });

  test('maskEmail keeps the local part out of logs', () => {
    expect(emailService.maskEmail('kamal@spaceezy.com')).toBe('k***@spaceezy.com');
    expect(emailService.maskEmail('ab@x.io')).toBe('a***@x.io');
    expect(emailService.maskEmail('')).toBe('***');
  });
});

// ===========================================================================
// 6. Logging hygiene — the whole suite at once
// ===========================================================================
describe('logging hygiene', () => {
  test('no OTP, reset token, raw address or AWS credential appears in any log line', () => {
    expect(logLines.length).toBeGreaterThan(0);
    const all = logLines.join('\n');

    // Codes and tokens minted during the suite.
    expect(seenSecrets.length).toBeGreaterThan(0);
    for (const secret of seenSecrets) {
      expect(all).not.toContain(secret);
    }

    // Recipients are masked, never logged whole.
    expect(all).not.toContain('kamal@spaceezy.com');
    expect(all).toContain('k***@spaceezy.com');

    // AWS credential material of any shape.
    expect(all).not.toMatch(/\bAKIA[0-9A-Z]{16}\b/);
    expect(all).not.toMatch(/aws_secret_access_key/i);
    expect(all).not.toMatch(/SecretAccessKey/);
    expect(all).not.toMatch(/AWS_ACCESS_KEY_ID/);
    expect(all).not.toMatch(/session_token/i);

    // The HTML/Text bodies (which contain the code) are never logged.
    expect(all).not.toContain('<!DOCTYPE html>');
    expect(all).not.toContain('verification code is:');
  });

  test('delivery attempts are logged with an outcome', () => {
    // Both a successful send and a failure were recorded during the suite.
    expect(logLines.some((line) => line.includes('[email] sent'))).toBe(true);
    expect(logLines.some((line) => line.includes('[email] failed'))).toBe(true);
    // Failure lines carry the AWS error class for alerting...
    const failed = logLines.filter((line) => line.includes('[email] failed')).join('\n');
    expect(failed).toMatch(/MessageRejected|AccountSendingQuotaExceeded/);
    // ...and a duration.
    expect(failed).toContain('durationMs');
  });
});
