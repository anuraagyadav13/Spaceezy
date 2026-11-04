'use strict';

// Human-readable, actionable translations for Meta WhatsApp Cloud API error
// codes. Meta returns a JSON `error` object on every rejection; surfacing the
// raw text ("(#132001) Template name does not exist in the translation") is
// accurate but unhelpful, and every one of these failures costs a full
// admin round trip to diagnose.
//
// This is a lookup only: no secrets, no network, no state. Unknown codes fall
// through to Meta's own message so nothing is ever hidden.
const META_ERROR_HINTS = {
    // Auth / app configuration
    10: 'The app is missing a permission for this call. Re-generate the system-user token with whatsapp_business_messaging and whatsapp_business_management.',
    190: 'The saved WhatsApp access token is invalid or expired. Generate a new system-user token in Meta Business Manager and save it in Integrations.',
    200: 'The access token does not have permission for this resource. Add whatsapp_business_messaging and whatsapp_business_management to the system-user token.',
    368: 'The WhatsApp Business Account is temporarily blocked. Resolve the restriction in Meta Business Support Home.',

    // Recipient / sending
    131026: 'The recipient number is not reachable on WhatsApp (not registered, or not a WhatsApp number).',
    131030: 'The recipient is not on the allowed list for a test number. Add it in WhatsApp Manager or use the production number.',
    131031: 'The WhatsApp Business Account is locked. Resolve it in Meta Business Support Home.',
    131042: 'No valid payment method on the WhatsApp Business Account. Add one in WhatsApp Manager → Account tools → Payment method; Meta will not deliver until billing is set up.',
    131045: 'The recipient has not accepted WhatsApp\'s terms of service.',
    131047: 'The 24-hour customer service window is closed. Send an approved template instead of free-form text.',
    131049: 'Meta declined delivery to protect user engagement (marketing frequency limit, or the user has no opt-in).',
    131050: 'The user has opted out of marketing messages from this business.',
    131051: 'This message type is not supported for the recipient.',

    // Template contents / lifecycle
    132000: 'The number of template parameters does not match the approved template. The CRM variable count and the Meta {{n}} placeholder count must be identical.',
    132001: 'The template exists, but not in the language the CRM is sending. Make the template language on the CRM row match the language approved on Meta.',
    132005: 'The template is paused or disabled on Meta. Resolve it in WhatsApp Manager.',
    132007: 'The template was rejected by Meta content policy. Edit it in WhatsApp Manager and resubmit.',
    132012: 'A template parameter has an invalid format (for example a newline, tab or emoji in a text parameter).',
    132015: 'The template is paused because of low quality. Edit the content or wait for Meta to re-review it.',
    132016: 'The template was disabled by Meta and cannot be sent.',

    // Media
    131052: 'Meta could not download the media file. Check that the URL is publicly reachable over HTTPS.',
    131053: 'Media upload failed. Retry, and check the file type and size limits.'
};

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

// Normalizes Meta's `error` object into display-safe fields. Never throws.
function describeMetaError(error) {
    const source = error && typeof error === 'object' ? error : {};
    const code = toNumberOrNull(source.code);
    return {
        code,
        subcode: toNumberOrNull(source.error_subcode),
        type: source.type ? String(source.type) : null,
        title: source.error_user_title ? String(source.error_user_title) : null,
        message: source.message ? String(source.message) : null,
        hint: code !== null && META_ERROR_HINTS[code] ? META_ERROR_HINTS[code] : null
    };
}

// A single-line message suitable for an API response or a UI toast: Meta's
// text, the numeric code, and the actionable hint when we know it.
function formatMetaError(error, fallback = 'HTTP error') {
    const described = describeMetaError(error);
    const base = described.message || fallback;
    const codeText = described.code !== null
        ? ` (Meta code ${described.code}${described.subcode !== null ? `/${described.subcode}` : ''}${described.type ? `, ${described.type}` : ''})`
        : '';
    const hintText = described.hint ? ` — ${described.hint}` : '';
    return {
        ...described,
        message: `WhatsApp API error: ${base}${codeText}${hintText}`
    };
}

module.exports = { META_ERROR_HINTS, describeMetaError, formatMetaError };
