// Predefined real-estate WhatsApp template library (code-owned catalog).
//
// These entries are LOCAL library definitions only — they are not Meta-approved
// templates. Approval lives exclusively with Meta; this catalog carries no
// approval state, and providerTemplateId stays null on provisioned rows until
// a verified provider response supplies one (Meta phase). `metaCategory` is a
// provisional mapping for future Meta submission, documented per entry.
//
// Bodies contain ONLY {{named}} placeholders — never real prices, addresses,
// URLs, or availability. Values are filled at send time from actual records
// (lead / property / project / sender) or typed manually; anything missing
// stays visible as {{name}} and blocks sending.

const TEMPLATE_GROUPS = [
    'Property Information',
    'Schedule a Site Visit',
    'Floor Plan & Brochure',
    'New Enquiry Follow-up',
    'Site Visit Reminder',
    'Booking & Documentation',
    'Custom / Other Templates'
];

const TEMPLATE_LIBRARY = [
    {
        name: 'Property Snapshot',
        group: 'Property Information',
        description: 'Key details of a property for an interested buyer.',
        // No {{property_name}}: unit titles ARE the apartment numbers
        // (A-101 / A-102) and house numbers never go out in WhatsApp text.
        // The project + configuration identify the offering instead.
        body: 'Hi {{customer_name}}, here is a quick snapshot of {{project_name}}, {{location}}: {{configuration}}, priced at {{price_range}}. Reply here and I will arrange the complete details. - {{salesperson_name}}',
        variables: ['customer_name', 'project_name', 'location', 'configuration', 'price_range', 'salesperson_name'],
        metaCategory: 'UTILITY'
    },
    {
        name: 'Price Details',
        group: 'Property Information',
        description: 'Share the price position of a property on request.',
        body: 'Hi {{customer_name}}, as requested, {{project_name}} is currently priced at {{price_range}}. Happy to walk you through payment options whenever convenient. - {{salesperson_name}}',
        variables: ['customer_name', 'project_name', 'price_range', 'salesperson_name'],
        metaCategory: 'UTILITY'
    },
    {
        name: 'Site Visit Invitation',
        group: 'Schedule a Site Visit',
        description: 'Invite a lead to visit a project on a proposed slot.',
        body: 'Hi {{customer_name}}, would you like to visit {{project_name}} on {{visit_date}} at {{visit_time}}? I will personally walk you through the site. Please confirm, or suggest a time that suits you. - {{salesperson_name}}',
        variables: ['customer_name', 'project_name', 'visit_date', 'visit_time', 'salesperson_name'],
        metaCategory: 'UTILITY'
    },
    {
        name: 'Brochure & Floor Plan',
        group: 'Floor Plan & Brochure',
        description: 'Send the project brochure and floor-plan link.',
        body: 'Hi {{customer_name}}, here is the brochure and floor plan for {{project_name}}: {{brochure_url}}. Let me know which configuration catches your eye. - {{salesperson_name}}',
        variables: ['customer_name', 'project_name', 'brochure_url', 'salesperson_name'],
        metaCategory: 'UTILITY'
    },
    {
        name: 'Property Quotation',
        group: 'Floor Plan & Brochure',
        description: 'Send an itemised price quotation with the payment schedule.',
        body: 'Hi {{customer_name}}, here is the detailed quotation for {{project_name}} with the full cost breakdown and payment schedule: {{quotation_url}}. Happy to walk you through the terms whenever you like. - {{salesperson_name}}',
        variables: ['customer_name', 'project_name', 'quotation_url', 'salesperson_name'],
        metaCategory: 'UTILITY'
    },
    {
        name: 'Enquiry Follow-up',
        group: 'New Enquiry Follow-up',
        description: 'Re-engage a new enquiry that went quiet.',
        body: 'Hi {{customer_name}}, following up on your enquiry with {{project_name}}. Are you still exploring options? I can share current availability and offers whenever you are ready. - {{salesperson_name}}',
        variables: ['customer_name', 'project_name', 'salesperson_name'],
        metaCategory: 'MARKETING'
    },
    {
        name: 'Visit Reminder',
        group: 'Site Visit Reminder',
        description: 'Remind a lead of a scheduled site visit.',
        // {{project_name}}, never {{property_name}} — house numbers stay out
        // of WhatsApp text; {{site_address}} already carries where to go.
        body: 'Hi {{customer_name}}, a friendly reminder of your site visit to {{project_name}} on {{visit_date}} at {{visit_time}}. Site address: {{site_address}}. Reply here if you need to reschedule. - {{salesperson_name}}',
        variables: ['customer_name', 'project_name', 'visit_date', 'visit_time', 'site_address', 'salesperson_name'],
        metaCategory: 'UTILITY'
    },
    {
        name: 'Booking Next Steps',
        group: 'Booking & Documentation',
        description: 'Share documentation steps after a booking decision.',
        body: 'Hi {{customer_name}}, thank you for choosing {{project_name}}. To proceed, please complete the documentation here: {{document_link}}. For any help, contact {{booking_contact}}. - {{salesperson_name}}',
        variables: ['customer_name', 'project_name', 'document_link', 'booking_contact', 'salesperson_name'],
        metaCategory: 'UTILITY'
    }
];

// Render a preview by substituting values literally in a SINGLE pass.
// Values are never re-scanned, so a value containing "{{...}}" text cannot
// trigger further substitution (no template-injection). Unresolved variables
// are left visible as {{name}} and reported in `missing`.
function renderPreview(body, values = {}) {
    const missing = [];
    const seen = new Set();
    const text = String(body || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key) => {
        const value = values[key];
        if (value === undefined || value === null || String(value).trim() === '') {
            if (!seen.has(key)) {
                seen.add(key);
                missing.push(key);
            }
            return `{{${key}}}`;
        }
        return String(value);
    });
    return { text, missing };
}

function listCatalog() {
    return TEMPLATE_LIBRARY.map((entry) => ({ ...entry, variables: [...entry.variables] }));
}

function getCatalogEntry(name) {
    if (!name) return null;
    const exact = TEMPLATE_LIBRARY.find((entry) => entry.name === name);
    if (exact) return exact;
    const lowered = String(name).toLowerCase();
    return TEMPLATE_LIBRARY.find((entry) => entry.name.toLowerCase() === lowered) || null;
}

module.exports = {
    TEMPLATE_GROUPS,
    TEMPLATE_LIBRARY,
    listCatalog,
    getCatalogEntry,
    renderPreview
};
