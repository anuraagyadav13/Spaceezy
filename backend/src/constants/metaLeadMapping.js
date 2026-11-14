// Phase 2 — standard CRM field vocabulary for Meta Instant Form question
// mapping. Single source of truth for the backend (validator + import
// service); the frontend keeps a mirrored copy in src/lib/metaLeadMapping.js
// (label/mandatory lists must stay in sync with this file).
//
// Unmapped questions are legitimate: an answer with crmField null is still
// preserved on the lead in Lead.metaAnswers — never silently discarded.

const CRM_FIELDS = [
    { value: 'fullName', label: 'Full Name', mandatory: true },
    { value: 'mobile', label: 'Mobile Number', mandatory: true },
    { value: 'email', label: 'Email', mandatory: false },
    { value: 'project', label: 'Project', mandatory: false },
    { value: 'property', label: 'Property', mandatory: false },
    { value: 'propertyType', label: 'Property Type', mandatory: false },
    { value: 'configuration', label: 'Configuration / BHK', mandatory: false },
    { value: 'budget', label: 'Budget', mandatory: false },
    { value: 'preferredLocation', label: 'Preferred Location', mandatory: false },
    { value: 'siteVisitDate', label: 'Site Visit Date', mandatory: false },
    { value: 'additionalRequirements', label: 'Additional Requirements', mandatory: false },
];

const CRM_FIELD_VALUES = CRM_FIELDS.map((f) => f.value);

// Sync event / run source + status vocabulary (mirrored in schema comments).
const SYNC_SOURCES = ['WEBHOOK', 'BACKFILL', 'RETRY'];
const RUN_STATUSES = ['RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'];
const EVENT_STATUSES = ['IMPORTED', 'DUPLICATE', 'IGNORED', 'FAILED'];

// Every value a stored mapping may contain — the only CRM fields the import
// service will ever write to from a Meta answer.
const MAPPABLE_FIELDS = new Set(CRM_FIELD_VALUES);

module.exports = {
    CRM_FIELDS,
    CRM_FIELD_VALUES,
    SYNC_SOURCES,
    RUN_STATUSES,
    EVENT_STATUSES,
    MAPPABLE_FIELDS,
};
