// Phase 3+4 — Meta Ads enums/helpers. Guards the contracts the UI depends
// on: the exact disconnected string, money unit conversion (₹ ↔ paise),
// targeting payload shape and enum integrity (creation-valid Meta values
// only, no duplicates, deprecated/read-only values excluded).
import { describe, it, expect } from "vitest";
import {
    META_DISCONNECTED_MESSAGE,
    META_DISCOVERY_BLOCKED_REASONS,
    isMetaDiscoveryEnabled,
    CAMPAIGN_OBJECTIVES,
    BILLING_EVENTS,
    OPTIMIZATION_GOALS,
    SPECIAL_AD_CATEGORIES,
    PUBLISHER_PLATFORMS,
    DEVICE_PLATFORMS,
    FACEBOOK_POSITIONS,
    INSTAGRAM_POSITIONS,
    toMinorUnits,
    fromMinorUnits,
    formatMinor,
    parseCountryCodes,
    buildTargetingPayload,
    statusBadgeClass,
    statusLabel,
} from "./metaAdsEnums";

describe("disconnected-state contract string", () => {
    it("renders the exact Phase 2.5A message — never reworded", () => {
        expect(META_DISCONNECTED_MESSAGE).toBe(
            "Meta account not connected — configure Meta App credentials to enable live integration."
        );
    });
});

describe("money helpers (Meta uses currency subunits)", () => {
    it("converts rupee major units to paise", () => {
        expect(toMinorUnits("5000")).toBe(500000);
        expect(toMinorUnits(5000)).toBe(500000);
        expect(toMinorUnits("5000.50")).toBe(500050);
        expect(toMinorUnits("0.05")).toBe(5);
        expect(toMinorUnits("0.5")).toBe(50);
    });

    it("rejects invalid or empty amounts instead of guessing", () => {
        expect(toMinorUnits("")).toBeNull();
        expect(toMinorUnits(null)).toBeNull();
        expect(toMinorUnits(undefined)).toBeNull();
        expect(toMinorUnits("-5")).toBeNull();
        expect(toMinorUnits("abc")).toBeNull();
        expect(toMinorUnits("1.999")).toBeNull(); // >2 decimals not allowed
    });

    it("converts back and formats for display", () => {
        expect(fromMinorUnits(500000)).toBe(5000);
        expect(fromMinorUnits(null)).toBeNull();
        expect(formatMinor(500000)).toBe("₹5,000.00");
        expect(formatMinor(123456)).toBe("₹1,234.56");
        expect(formatMinor(null)).toBe("—");
    });

    it("round-trips minor → major → minor", () => {
        expect(toMinorUnits(String(fromMinorUnits(49999)))).toBe(49999);
    });
});

describe("country parsing", () => {
    it("uppercases, deduplicates and keeps only valid 2-letter codes", () => {
        expect(parseCountryCodes("in, US in")).toEqual(["IN", "US"]);
        expect(parseCountryCodes("IND")).toEqual([]); // ISO-3 not guessed
        expect(parseCountryCodes("")).toEqual([]);
        expect(parseCountryCodes(null)).toEqual([]);
        expect(parseCountryCodes(["ae", "AE"])).toEqual(["AE"]);
    });
});

describe("targeting payload preview", () => {
    it("maps the form to Meta's targeting spec shape", () => {
        const payload = buildTargetingPayload({
            countries: "IN, AE",
            ageMin: 25,
            ageMax: 45,
            gender: "1",
            customAudiences: [111, "222"],
            excludedCustomAudiences: [333],
            publisherPlatforms: ["facebook"],
            devicePlatforms: ["mobile"],
            facebookPositions: ["feed"],
            instagramPositions: [],
        });
        expect(payload).toEqual({
            geo_locations: { countries: ["IN", "AE"] },
            age_min: 25,
            age_max: 45,
            genders: [1],
            custom_audiences: [{ id: "111" }, { id: "222" }],
            excluded_custom_audiences: [{ id: "333" }],
            publisher_platforms: ["facebook"],
            device_platforms: ["mobile"],
            facebook_positions: ["feed"],
        });
        // Empty sections are omitted, never sent as empty arrays.
        expect(payload).not.toHaveProperty("instagram_positions");
    });

    it("omits absent optional sections", () => {
        const payload = buildTargetingPayload({ countries: "IN" });
        expect(payload).toEqual({ geo_locations: { countries: ["IN"] } });
    });
});

describe("enum integrity (creation-valid Meta values only)", () => {
    const noDupes = (arr) => new Set(arr).size === arr.length;

    it("contains no duplicates", () => {
        for (const list of [
            CAMPAIGN_OBJECTIVES, BILLING_EVENTS, OPTIMIZATION_GOALS,
            SPECIAL_AD_CATEGORIES, PUBLISHER_PLATFORMS, DEVICE_PLATFORMS,
            FACEBOOK_POSITIONS, INSTAGRAM_POSITIONS,
        ]) {
            expect(noDupes(list)).toBe(true);
        }
    });

    it("excludes deprecated / read-only billing events and goals", () => {
        expect(BILLING_EVENTS).not.toContain("CLICKS");   // deprecated
        expect(BILLING_EVENTS).not.toContain("NONE");     // read-only
        expect(OPTIMIZATION_GOALS).not.toContain("NONE"); // read-only
        expect(OPTIMIZATION_GOALS).not.toContain("CLICKS");
    });

    it("keeps the documented objective set (no plain TRAFFIC)", () => {
        expect(CAMPAIGN_OBJECTIVES).not.toContain("TRAFFIC");
        expect(CAMPAIGN_OBJECTIVES).toContain("OUTCOME_TRAFFIC");
        expect(CAMPAIGN_OBJECTIVES).toContain("LEAD_GENERATION");
        expect(CAMPAIGN_OBJECTIVES.length).toBe(21);
    });

    it("always includes NONE as a special ad category", () => {
        expect(SPECIAL_AD_CATEGORIES).toContain("NONE");
    });
});

describe("status presentation", () => {
    it("styles known statuses and falls back neutrally", () => {
        expect(statusBadgeClass("ACTIVE")).toContain("emerald");
        expect(statusBadgeClass("PAUSED")).toContain("amber");
        expect(statusBadgeClass("DELETED")).toContain("red");
        expect(statusBadgeClass("SOMETHING_NEW")).toContain("gray");
        expect(statusBadgeClass(undefined)).toContain("gray");
    });

    it("humanizes labels without inventing content", () => {
        expect(statusLabel("PENDING_REVIEW")).toBe("Pending Review");
        expect(statusLabel("")).toBe("Unknown");
    });
});

describe("discovery gating (no circular ad-account dependency)", () => {
    it("enables discovery WITHOUT an ad-account selection", () => {
        expect(
            isMetaDiscoveryEnabled(
                { connected: true, reason: "NO_AD_ACCOUNT_SELECTED", tokenExpired: false },
                true
            )
        ).toBe(true);
    });

    it("enables discovery while required permissions are still missing", () => {
        expect(
            isMetaDiscoveryEnabled(
                { connected: false, reason: "PERMISSION_DENIED", tokenExpired: false },
                true
            )
        ).toBe(true);
    });

    it("blocks only a missing, expired or rejected token", () => {
        expect(isMetaDiscoveryEnabled(null, true)).toBe(false);
        expect(isMetaDiscoveryEnabled(undefined, true)).toBe(false);
        expect(isMetaDiscoveryEnabled({ reason: "MISSING_CONFIG", tokenExpired: false }, true)).toBe(false);
        expect(isMetaDiscoveryEnabled({ reason: "TOKEN_EXPIRED", tokenExpired: true }, true)).toBe(false);
        expect(isMetaDiscoveryEnabled({ reason: "META_TOKEN_INVALID", tokenExpired: false }, true)).toBe(false);
        expect(isMetaDiscoveryEnabled({ reason: null, tokenExpired: true }, true)).toBe(false);
    });

    it("stays disabled without the view permission", () => {
        expect(isMetaDiscoveryEnabled({ reason: null, tokenExpired: false }, false)).toBe(false);
    });

    it("exports exactly the blocked-reason contract", () => {
        expect(META_DISCOVERY_BLOCKED_REASONS).toEqual([
            "MISSING_CONFIG",
            "TOKEN_EXPIRED",
            "META_TOKEN_INVALID",
        ]);
        // A missing selection must never be treated as "no connection".
        expect(META_DISCOVERY_BLOCKED_REASONS).not.toContain("NO_AD_ACCOUNT_SELECTED");
        expect(META_DISCOVERY_BLOCKED_REASONS).not.toContain("PERMISSION_DENIED");
    });
});
