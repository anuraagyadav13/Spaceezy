/**
 * The ONE place that turns raw public-API records into the facts every page
 * renders: price range, configurations, BHK set and availability.
 *
 * The public API returns two shapes for the same project:
 *   - list DTO:    configurations: string[], startingPrice, maximumPrice
 *   - detail DTO:  configurations: object[], availability, unitTypes
 * Both are normalised here so a card, a hub, a project page, its metadata and
 * its JSON-LD can never disagree about the price or the configurations.
 */

import { sortNumbers, toNumber, toText } from "./text";

export function configurationNames(configurations) {
    const names = (configurations || [])
        .map((config) => (typeof config === "string" ? config : config && config.name))
        .map((name) => toText(name))
        .filter(Boolean);
    return Array.from(new Set(names));
}

export function parseBhk(label) {
    const match = /^(\d+(?:\.\d+)?)\s*bhk\b/i.exec(toText(label));
    return match ? Number(match[1]) : null;
}

export function isVillaConfiguration(name) {
    return /\bvillas?\b/i.test(toText(name));
}

/**
 * Project facts from either DTO. Unit-derived values win over stored project
 * columns; stored columns are the fallback for the light list payload.
 */
export function projectFacts(project) {
    const record = project || {};
    const configurations = configurationNames(record.configurations);
    const configObjects = (record.configurations || []).filter(
        (config) => config && typeof config === "object"
    );

    const unitPrices = configObjects.flatMap((config) => [toNumber(config.priceMin), toNumber(config.priceMax)]);
    const bhk = sortNumbers([
        ...configObjects.map((config) => toNumber(config.bhk)),
        ...configurations.map(parseBhk),
    ]);

    const priceMin = toNumber(record.startingPrice) ?? firstPositive(unitPrices);
    const priceMax = toNumber(record.maximumPrice) ?? lastPositive(unitPrices);

    const availability = record.availability || null;
    const totalUnits = toNumber(availability?.totalUnits) ?? toNumber(record.totalUnits);
    const availableUnits = toNumber(availability?.availableUnits) ?? toNumber(record.availableUnits);
    const reservedUnits = toNumber(availability?.reservedUnits);
    const soldUnits = toNumber(availability?.soldUnits);

    return {
        slug: record.slug || null,
        name: toText(record.name),
        projectType: record.projectType || null,
        status: record.status || null,
        developer: toText(record.developer) || "",
        location: record.location || null,
        locationLabel: toText(record.locationLabel) || "",
        address: toText(record.address) || "",
        configurations,
        bhk,
        priceMin,
        priceMax,
        pricePerSqFt: toNumber(record.pricePerSqFt),
        possessionDate: record.possessionDate || null,
        reraNumber: toText(record.rera?.number) || toText(record.reraNumber) || "",
        totalUnits,
        availableUnits,
        reservedUnits,
        soldUnits,
        updatedAt: record.updatedAt || null,
        availabilityLabel: availabilityLabel({ availableUnits, totalUnits, soldUnits, status: record.status }),
        unitTypes: Array.isArray(record.unitTypes) ? record.unitTypes : [],
    };
}

/** Unit facts from either DTO. */
export function unitFacts(property) {
    const record = property || {};
    return {
        token: record.token || null,
        title: toText(record.title),
        configuration: toText(record.configuration),
        bhk: toNumber(record.bhk),
        type: record.type || null,
        purpose: record.purpose || null,
        area: toNumber(record.area),
        price: toNumber(record.price),
        availability: record.availability || null,
        isSold: String(record.availability || "").toLowerCase() === "sold",
        projectName: toText(record.project?.name),
        projectSlug: record.project?.slug || null,
        location: record.location || null,
        updatedAt: record.updatedAt || null,
    };
}

function firstPositive(values) {
    const positive = values.filter((n) => n !== null && n > 0).sort((a, b) => a - b);
    return positive.length ? positive[0] : null;
}

function lastPositive(values) {
    const positive = values.filter((n) => n !== null && n > 0).sort((a, b) => a - b);
    return positive.length ? positive[positive.length - 1] : null;
}

export function availabilityLabel({ availableUnits, totalUnits, soldUnits, status }) {
    if (status === "SOLD_OUT") return "Sold out";
    if (status === "INACTIVE") return "Unavailable";
    if (availableUnits !== null && availableUnits !== undefined) {
        if (availableUnits === 0) return "Sold out";
        if (totalUnits) return `${availableUnits} of ${totalUnits} available`;
        return `${availableUnits} available`;
    }
    if (soldUnits !== null && soldUnits !== undefined && totalUnits) return `${soldUnits} of ${totalUnits} sold`;
    return "";
}
