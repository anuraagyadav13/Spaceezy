// SpaceEzy transactional email templates (HTML + matching plain text).
//
// Every template returns { subject, html, text } so the caller can hand both
// to SES in one request — clients that block HTML (and some spam filters)
// still get a readable message.
//
// Nothing here logs or stores anything: templates are pure functions of their
// inputs. Values interpolated into HTML are escaped, because `name` comes from
// the database and could contain markup.

const SITE_URL = (process.env.FRONTEND_URL || 'https://spaceezy.com').replace(/\/+$/, '');

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Mail clients strip <head>, so critical CSS is inlined on the elements too.
const shell = ({ preheader, title, bodyHtml }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!-- Hidden preheader: what the inbox preview shows before the subject. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <div style="display:none;max-height:0;overflow:hidden;">&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

        <!-- Brand header -->
        <tr>
          <td style="padding:24px 32px;background-color:#0f172a;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.4px;">SpaceEzy</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px;letter-spacing:0.6px;text-transform:uppercase;">Real Estate CRM</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;" class="px-8">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#64748b;line-height:18px;">
              This is an automated message from SpaceEzy. Please do not reply to this email.
            </p>
            <p style="margin:8px 0 0;font-size:12px;color:#64748b;line-height:18px;">
              &copy; ${new Date().getFullYear()} SpaceEzy &middot; Ghaziabad, Uttar Pradesh
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Password reset — 6-digit code
// ---------------------------------------------------------------------------

const passwordResetOtpEmail = ({ name, otp, expiresMinutes = 5 }) => {
    const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';
    const minutes = Number.isFinite(expiresMinutes) ? expiresMinutes : 5;

    // The code deliberately does NOT appear in the subject or the preheader:
    // those render on a lock screen and in the inbox list, i.e. to anyone who
    // can see the phone but not open the message.
    const html = shell({
        preheader: 'Use the 6-digit code in this email to reset your password. It expires soon.',
        title: 'Your SpaceEzy password reset code',
        bodyHtml: `
            <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:22px;">${greeting}</p>
            <p style="margin:0 0 8px;font-size:15px;color:#334155;line-height:22px;">
              We received a request to reset the password for your SpaceEzy account.
              Enter this code to continue:
            </p>

            <!-- The code: large, spaced and selectable so it reads at a glance
                 and can be tapped to copy on mobile. -->
            <div style="margin:24px 0;padding:20px;background-color:#f1f5f9;border:1px dashed #94a3b8;border-radius:10px;text-align:center;">
              <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:#0f172a;text-align:center;user-select:all;-webkit-user-select:all;">
                ${escapeHtml(otp)}
              </div>
              <div style="margin-top:10px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">
                Expires in ${minutes} minutes
              </div>
            </div>

            <p style="margin:0 0 16px;font-size:13px;color:#64748b;line-height:20px;">
              This code expires in <strong>${minutes} minutes</strong> and can only be used once.
              If the code has expired, request a new one from the sign-in page.
            </p>

            <!-- Security warning -->
            <div style="margin:24px 0 0;padding:16px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#991b1b;line-height:20px;">
                Didn&rsquo;t request this code?
              </p>
              <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:20px;">
                If you did not ask to reset your password, you can safely ignore this email &mdash;
                your password has <strong>not</strong> changed. We recommend changing it anyway if
                you were not expecting this message.
              </p>
            </div>

            <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:20px;">
              Never share this code. The SpaceEzy team will never ask for it.
            </p>
        `,
    });

    const text = [
        'SpaceEzy — Password reset',
        '',
        greeting,
        '',
        'We received a request to reset the password for your SpaceEzy account.',
        'Your verification code is:',
        '',
        `    ${otp}`,
        '',
        `This code expires in ${minutes} minutes and can only be used once.`,
        'If it has expired, request a new one from the sign-in page.',
        '',
        'If you did not ask to reset your password, you can safely ignore this',
        'email — your password has not changed.',
        '',
        'Never share this code. The SpaceEzy team will never ask for it.',
        '',
        '— This is an automated message from SpaceEzy.',
    ].join('\n');

    return {
        subject: 'Your SpaceEzy verification code',
        html,
        text,
    };
};

// ---------------------------------------------------------------------------
// Password-change confirmation (sent AFTER a successful reset)
// ---------------------------------------------------------------------------

const passwordChangedEmail = ({ name, requestedAt = null }) => {
    const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';
    const when = requestedAt
        ? new Date(requestedAt).toUTCString().replace('GMT', 'UTC')
        : null;

    const html = shell({
        preheader: 'Your SpaceEzy password was changed.',
        title: 'Your SpaceEzy password was changed',
        bodyHtml: `
            <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:22px;">${greeting}</p>
            <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:22px;">
              The password for your SpaceEzy account has just been changed
              ${when ? `at <strong>${escapeHtml(when)}</strong>` : ''}.
            </p>
            <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:22px;">
              For your security, all existing sessions were signed out &mdash;
              on every device.
            </p>

            <div style="margin:24px 0 0;padding:16px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#991b1b;line-height:20px;">
                Wasn&rsquo;t you?
              </p>
              <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:20px;">
                If you did not make this change, reset your password immediately and
                contact your organization administrator.
              </p>
            </div>
        `,
    });

    const text = [
        'SpaceEzy — Password changed',
        '',
        greeting,
        '',
        `The password for your SpaceEzy account has just been changed${when ? ` at ${when}` : ''}.`,
        'For your security, all existing sessions were signed out — on every device.',
        '',
        'If you did not make this change, reset your password immediately and',
        'contact your organization administrator.',
        '',
        '— This is an automated message from SpaceEzy.',
    ].join('\n');

    return {
        subject: 'Your SpaceEzy password was changed',
        html,
        text,
    };
};

// ---------------------------------------------------------------------------
// Account security notification — generic "something security-relevant
// happened" mail. Kept separate from passwordChangedEmail so it can be reused
// for other events (suspicious sign-in, role change, forced rotation) without
// duplicating the branded shell.
// ---------------------------------------------------------------------------

const accountSecurityEmail = ({ name, event, detail = null, actionUrl = null }) => {
    const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';
    const headline = String(event || 'Security alert on your SpaceEzy account');

    const html = shell({
        preheader: headline,
        title: headline,
        bodyHtml: `
            <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:22px;">${greeting}</p>
            <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:22px;">
              ${escapeHtml(headline)}
            </p>
            ${detail ? `<p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:22px;">${escapeHtml(detail)}</p>` : ''}
            ${actionUrl ? `
            <div style="margin:24px 0 0;text-align:center;">
              <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 24px;background-color:#7c3aed;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">
                Review your account
              </a>
            </div>` : ''}
            <div style="margin:24px 0 0;padding:16px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#991b1b;line-height:20px;">
                Did not expect this?
              </p>
              <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:20px;">
                Reset your password immediately and contact your organization administrator.
              </p>
            </div>
        `,
    });

    const text = [
        'SpaceEzy — Security notification',
        '',
        greeting,
        '',
        headline,
        detail ? detail : null,
        '',
        'If you did not expect this, reset your password immediately and',
        'contact your organization administrator.',
        '',
        '— This is an automated message from SpaceEzy.',
    ].filter((line) => line !== null).join('\n');

    return {
        subject: headline,
        html,
        text,
    };
};

module.exports = {
    escapeHtml,
    passwordResetOtpEmail,
    passwordChangedEmail,
    accountSecurityEmail,
    SITE_URL,
};
