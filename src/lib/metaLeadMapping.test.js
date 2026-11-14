// Field-mapping vocabulary mirror — the labels/mandatory flags shown in the
// mapping dropdown must match the backend's validation list exactly, so the
// last suite reads backend/src/constants/metaLeadMapping.js and diffs it.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
    CRM_FIELDS,
    CRM_FIELD_VALUES,
    UNMAPPED_OPTION,
    SYNC_SOURCES,
    RUN_STATUSES,
    EVENT_STATUSES,
    SYNC_SOURCE_LABELS,
    RUN_STATUS_STYLES,
    labelForField,
    isMappableField,
    missingMandatoryFields,
} from "./metaLeadMapping";

const require = createRequire(import.meta.url);

describe("CRM field vocabulary", () => {
    it("exposes the eleven standard CRM fields with unique values", () => {
        expect(CRM_FIELDS).toHaveLength(11);
        expect(new Set(CRM_FIELD_VALUES).size).toBe(CRM_FIELDS.length);
        expect(CRM_FIELD_VALUES).toEqual(
            expect.arrayContaining([
                "fullName",
                "mobile",
                "email",
                "project",
                "property",
                "propertyType",
                "configuration",
                "budget",
                "preferredLocation",
                "siteVisitDate",
                "additionalRequirements",
            ])
        );
    });

    it("marks exactly Full Name and Mobile Number as mandatory", () => {
        const mandatory = CRM_FIELDS.filter((f) => f.mandatory).map((f) => f.value);
        expect(mandatory).toEqual(["fullName", "mobile"]);
    });

    it("every field has a non-empty display label", () => {
        for (const field of CRM_FIELDS) {
            expect(field.label.trim().length).toBeGreaterThan(0);
        }
    });
});

describe("helpers", () => {
    it("labelForField resolves known fields and returns null for unknown ones", () => {
        expect(labelForField("budget")).toBe("Budget");
        expect(labelForField("favoriteColor")).toBeNull();
        expect(labelForField(undefined)).toBeNull();
    });

    it("isMappableField accepts only the standard vocabulary", () => {
        expect(isMappableField("mobile")).toBe(true);
        expect(isMappableField("message")).toBe(false);
        expect(isMappableField("")).toBe(false);
    });

    it("the unmapped option is distinct from every CRM field value", () => {
        expect(UNMAPPED_OPTION.value).toBe("");
        expect(CRM_FIELD_VALUES).not.toContain(UNMAPPED_OPTION.value);
    });

    it("missingMandatoryFields lists only unmapped mandatory fields", () => {
        expect(missingMandatoryFields([])).toEqual(["Full Name", "Mobile Number"]);
        expect(missingMandatoryFields([{ questionKey: "name", crmField: "fullName" }])).toEqual([
            "Mobile Number",
        ]);
        expect(
            missingMandatoryFields([
                { questionKey: "name", crmField: "fullName" },
                { questionKey: "phone", crmField: "mobile" },
            ])
        ).toEqual([]);
        // Empty-string crmField (UI "Do not map") does not satisfy mandatory.
        expect(missingMandatoryFields([{ questionKey: "name", crmField: "" }])).toEqual([
            "Full Name",
            "Mobile Number",
        ]);
    });
});

describe("sync vocabulary", () => {
    it("source/status lists match what the backend emits", () => {
        expect(SYNC_SOURCES).toEqual(["WEBHOOK", "BACKFILL", "RETRY"]);
        expect(RUN_STATUSES).toEqual(["RUNNING", "COMPLETED", "PARTIAL", "FAILED"]);
        expect(EVENT_STATUSES).toEqual(["IMPORTED", "DUPLICATE", "IGNORED", "FAILED"]);
    });

    it("has a label for every source and a badge style for every run status", () => {
        for (const source of SYNC_SOURCES) expect(SYNC_SOURCE_LABELS[source]).toBeTruthy();
        for (const status of RUN_STATUSES) expect(RUN_STATUS_STYLES[status]).toBeTruthy();
    });
});

describe("backend sync", () => {
    it("CRM field values, labels and mandatory flags match backend/src/constants/metaLeadMapping.js", () => {
        const backend = require("../../backend/src/constants/metaLeadMapping.js");
        expect(CRM_FIELDS).toEqual(backend.CRM_FIELDS);
        expect(CRM_FIELD_VALUES).toEqual(backend.CRM_FIELD_VALUES);
        expect(SYNC_SOURCES).toEqual(backend.SYNC_SOURCES);
        expect(RUN_STATUSES).toEqual(backend.RUN_STATUSES);
        expect(EVENT_STATUSES).toEqual(backend.EVENT_STATUSES);
    });
});
