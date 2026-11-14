// Phase 2 — frontend mirror of backend/src/constants/metaLeadMapping.js.
// The CRM field vocabulary (value / label / mandatory) MUST stay in sync
// with the backend file: the server validates saved mappings against this
// exact list, and these labels are what the mapping dropdown shows.
//
// Unmapped questions are legitimate — an answer with crmField null is still
// preserved on the lead in `metaAnswers`, never discarded.

export const CRM_FIELDS = [
    { value: "fullName", label: "Full Name", mandatory: true },
    { value: "mobile", label: "Mobile Number", mandatory: true },
    { value: "email", label: "Email", mandatory: false },
    { value: "project", label: "Project", mandatory: false },
    { value: "property", label: "Property", mandatory: false },
    { value: "propertyType", label: "Property Type", mandatory: false },
    { value: "configuration", label: "Configuration / BHK", mandatory: false },
    { value: "budget", label: "Budget", mandatory: false },
    { value: "preferredLocation", label: "Preferred Location", mandatory: false },
    { value: "siteVisitDate", label: "Site Visit Date", mandatory: false },
    { value: "additionalRequirements", label: "Additional Requirements", mandatory: false },
];

export const CRM_FIELD_VALUES = CRM_FIELDS.map((field) => field.value);

// Dropdown option for "this question is intentionally not mapped" (the
// answer is still preserved in metaAnswers on the lead).
export const UNMAPPED_OPTION = { value: "", label: "Do not map (keep in answers)" };

export const SYNC_SOURCES = ["WEBHOOK", "BACKFILL", "RETRY"];
export const RUN_STATUSES = ["RUNNING", "COMPLETED", "PARTIAL", "FAILED"];
export const EVENT_STATUSES = ["IMPORTED", "DUPLICATE", "IGNORED", "FAILED"];

export const SYNC_SOURCE_LABELS = {
    WEBHOOK: "Webhook",
    BACKFILL: "Backfill",
    RETRY: "Retry",
};

export const RUN_STATUS_STYLES = {
    RUNNING: "bg-blue-50 text-blue-600 border-blue-200",
    COMPLETED: "bg-emerald-50 text-emerald-600 border-emerald-200",
    PARTIAL: "bg-amber-50 text-amber-600 border-amber-200",
    FAILED: "bg-red-50 text-red-600 border-red-200",
};

export const labelForField = (value) =>
    CRM_FIELDS.find((field) => field.value === value)?.label ?? null;

export const isMappableField = (value) => CRM_FIELD_VALUES.includes(value);

// True when the mapping covers both mandatory CRM fields (Full Name and
// Mobile Number). Used to surface a non-blocking hint on the mapping tab —
// the server does NOT enforce it (a form may legitimately collect the
// phone under a different key that maps to `mobile` later).
export const missingMandatoryFields = (mappings = []) => {
    const mapped = new Set(
        (mappings || [])
            .map((row) => row?.crmField)
            .filter((value) => typeof value === "string" && value.length > 0)
    );
    return CRM_FIELDS.filter((field) => field.mandatory && !mapped.has(field.value)).map(
        (field) => field.label
    );
};
