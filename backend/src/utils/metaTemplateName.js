'use strict';

// WhatsApp template names accepted by Meta: lowercase a-z, 0-9 and
// underscores only (first character alphanumeric). Local library rows keep
// human names ("Property Quotation"); the provider boundary converts them
// deterministically so the CRM name and the Meta name always agree — the
// exact slug to create in WhatsApp Manager is normalizeMetaTemplateName(name).
function normalizeMetaTemplateName(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

module.exports = { normalizeMetaTemplateName };
