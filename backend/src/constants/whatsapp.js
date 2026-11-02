// Single source of truth for the WhatsApp template locale this install sends.
//
// Meta matches the language code EXACTLY, so the value stored on a catalog
// row, the value used when provisioning a row on first use, and the provider's
// fallback must all be this one constant. A library carrying two locales means
// half the template sends are rejected (Meta code 131045 / 133047), and the
// failure only shows up on the first send.
//
// Confirmed against WhatsApp Manager: the approved templates are `en`.
// Do not change this without re-checking the Language column on Meta first,
// and if it ever changes, migrate the existing WhatsAppTemplate rows too.
const TEMPLATE_LANGUAGE = 'en';

module.exports = { TEMPLATE_LANGUAGE };
