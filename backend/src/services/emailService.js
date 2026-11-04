// Amazon SES transactional email (AWS SDK v3, SESv2 API).
//
// Configuration is entirely environment-based:
//   AWS_REGION            (falls back to AWS_DEFAULT_REGION, then ap-south-1 —
//                          same convention as storageService)
//   SES_FROM_EMAIL        the verified sender; unset = feature disabled
//   SES_FROM_NAME         display name, defaults to "SpaceEzy"
//   SES_CONFIGURATION_SET optional, for bounce/complaint tracking
//
// Credentials come from the AWS default provider chain — EC2 IAM role in
// production, AWS_* env vars or ~/.aws locally. No key is ever hardcoded,
// read from a config file we control, or logged.
//
// Two invariants this module exists to hold:
//   1. It NEVER reports success when SES rejects a message. Any failure —
//      rejection, throttling, unverified identity, network error — throws an
//      AppError(502) and is logged as a failure.
//   2. It never logs the message body. HTML/text carry OTPs and are passed to
//      SES only; logs get a masked recipient, the SES message id and timing.

const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { AppError } = require('../utils/errors');

const DEFAULT_REGION = 'ap-south-1';

let cachedClient = null;
let cachedRegion = null;

const getConfig = () => {
    const fromEmail = (process.env.SES_FROM_EMAIL || '').trim();
    if (!fromEmail) return null;

    const region = (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || DEFAULT_REGION).trim();
    const fromName = (process.env.SES_FROM_NAME || 'SpaceEzy').trim();
    const configurationSet = (process.env.SES_CONFIGURATION_SET || '').trim();

    return { region, fromEmail, fromName, configurationSet };
};

// Configured? Callers (routes) use this to decide whether outbound email is
// available at all, without ever surfacing the reason to a client.
const isConfigured = () => getConfig() !== null;

// Lazily built and cached per region, so a config change in tests takes effect
// and we never construct a client (which would start resolving credentials)
// just to answer a question.
const getClient = (region) => {
    if (!cachedClient || cachedRegion !== region) {
        cachedClient = new SESv2Client({ region });
        cachedRegion = region;
    }
    return cachedClient;
};

// Test seam: drop the cached client between tests.
const resetClient = () => {
    cachedClient = null;
    cachedRegion = null;
};

// Recipient in logs: local part cut to its first character so operators can
// still correlate deliveries with support tickets, without the address itself
// becoming log PII.
const maskEmail = (email) => {
    const value = String(email || '');
    const at = value.indexOf('@');
    if (at <= 0) return '***';
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    return `${local[0]}***@${domain}`;
};

// The ONLY logging helper in this module. It takes a fixed field list — there
// is deliberately no way to pass the subject/body through it, so an OTP cannot
// be logged by accident.
const logDelivery = (event, fields) => {
    console.info(`[email] ${event}`, fields);
};

/**
 * Send one transactional email through SES.
 *
 * @param {{to:string, subject:string, html:string, text:string}} message
 * @returns {Promise<{messageId:string|null}>} SES's message id on acceptance
 * @throws {AppError} 501 when SES is not configured, 502 when SES rejects or
 *         the send fails for any other reason. Success is never reported for
 *         a message SES did not accept.
 */
const sendEmail = async ({ to, subject, html, text }) => {
    const config = getConfig();
    if (!config) {
        throw new AppError(
            'Email delivery is not configured. Set SES_FROM_EMAIL to enable outbound email.',
            501,
            'EMAIL_NOT_CONFIGURED'
        );
    }

    const recipient = String(to || '').trim();
    if (!recipient) {
        throw new AppError('A recipient address is required.', 400, 'VALIDATION_ERROR');
    }
    if (!subject || (!html && !text)) {
        throw new AppError('An email needs a subject and a body.', 400, 'VALIDATION_ERROR');
    }

    const startedAt = Date.now();
    const base = { to: maskEmail(recipient), provider: 'ses', region: config.region };

    try {
        const input = {
            FromEmailAddress: `${config.fromName} <${config.fromEmail}>`,
            Destination: { ToAddresses: [recipient] },
            Content: {
                Simple: {
                    Subject: { Data: subject, Charset: 'UTF-8' },
                    Body: {
                        ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
                        ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
                    },
                },
            },
            ...(config.configurationSet ? { ConfigurationSetName: config.configurationSet } : {}),
        };

        const response = await getClient(config.region).send(new SendEmailCommand(input));

        logDelivery('sent', {
            ...base,
            messageId: response?.MessageId || null,
            durationMs: Date.now() - startedAt,
        });

        return { messageId: response?.MessageId || null };
    } catch (err) {
        // Log the AWS error CLASS and HTTP status only. err.message and the
        // thrown object can carry the full request (subject/body, i.e. the
        // OTP), so neither is ever written to a log.
        logDelivery('failed', {
            ...base,
            error: err?.name || 'UnknownError',
            status: err?.$metadata?.httpStatusCode ?? null,
            durationMs: Date.now() - startedAt,
        });

        // Map every AWS failure to one operational error. The message is fixed
        // and contains no AWS detail, so nothing about the account, region or
        // credentials is exposed to callers.
        throw new AppError(
            'We could not send the email right now. Please try again later.',
            502,
            'EMAIL_SEND_FAILED'
        );
    }
};

module.exports = {
    sendEmail,
    isConfigured,
    getConfig,
    maskEmail,
    resetClient,
};
