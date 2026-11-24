/**
 * Text helpers shared by every metadata/schema generator.
 *
 * All length limiting happens on word boundaries so a title or description
 * never ends mid-word. No ellipsis is appended: meta tags are truncated by
 * search engines anyway, and a dangling "..." costs characters.
 */

export function toText(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\s+/g, " ").trim();
}

/**
 * Hard-cap `text` at `max` characters without cutting a word.
 * Returns "" for empty input.
 */
export function truncateAtWord(text, max) {
    const clean = toText(text);
    if (!clean) return "";
    if (clean.length <= max) return clean;

    const slice = clean.slice(0, max + 1);
    const cut = slice.lastIndexOf(" ");
    const trimmed = (cut > 0 ? slice.slice(0, cut) : clean.slice(0, max)).trim();
    return trimmed.replace(/[\s,;:.\-–—|/]+$/u, "");
}

/** URL-safe slug from a database label ("Some Place" -> "some-place"). */
export function slugify(value) {
    return toText(value)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

const INR = "\u20B9";

/** Compact price for meta text: 12,500,000 -> "₹1.25 Cr". */
export function compactPrice(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return "";
    if (value >= 10000000) {
        const cr = value / 10000000;
        return `${INR}${Number(cr.toFixed(cr >= 10 ? 1 : 2))} Cr`;
    }
    if (value >= 100000) {
        const lakh = value / 100000;
        return `${INR}${Number(lakh.toFixed(lakh >= 10 ? 1 : 2))} L`;
    }
    return `${INR}${value.toLocaleString("en-IN")}`;
}

/** "₹58 L – ₹1.2 Cr" or a single price, or "" when unknown. */
export function priceRangeLabel(min, max) {
    const low = compactPrice(min);
    const high = compactPrice(max);
    if (low && high && low !== high) return `${low} - ${high}`;
    return low || high || "";
}

export function joinList(items, conjunction = "and") {
    const list = (items || []).filter(Boolean);
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} ${conjunction} ${list[1]}`;
    return `${list.slice(0, -1).join(", ")} ${conjunction} ${list[list.length - 1]}`;
}

export function pluralize(count, singular, plural) {
    return Number(count) === 1 ? singular : plural || `${singular}s`;
}

/** Numbers from API JSON may arrive as Decimal strings. */
export function toNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export const sortNumbers = (values) =>
    Array.from(new Set(values.map(toNumber).filter((n) => n !== null))).sort((a, b) => a - b);

/**
 * Compose a meta description and hold it inside [min, max] characters while
 * only adding factual filler sentences the caller supplies.
 */
export function composeDescription({ parts = [], min = 120, max = 155, filler = "" }) {
    const sentences = parts.map(toText).filter(Boolean);
    let description = truncateAtWord(sentences.join(" "), max);

    if (description.length < min && filler) {
        const fillerText = toText(filler);
        description = truncateAtWord(`${description} ${fillerText}`, max);
    }
    return description;
}

export function capitalizeFirst(text) {
    const value = toText(text);
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
