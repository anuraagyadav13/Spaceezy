/**
 * Free-text budget parser.
 *
 * Accepts formats commonly typed in Indian real estate:
 *   "1.2 Cr" / "1.2cr" / "₹1.2 crore"  → 12000000
 *   "95 L" / "95L" / "₹95 lakh"        → 9500000
 *   "1,50,00,000" / "15000000"         → 15000000
 *   "1.5 Cr - 2 Cr" (range)            → lower bound (15000000)
 * Unparseable input returns null — callers show a field warning rather than
 * storing a silently wrong number.
 */
function parseBudgetValue(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;

    let text = String(raw).trim();
    if (!text) return null;

    // Strip currency symbols, whitespace
    text = text.replace(/[₹$,\s]/g, '');
    if (!text) return null;

    // Range: "1.5cr-2cr" / "90L to 1Cr" → take lower bound
    const rangeMatch = text.match(/^([\d.]+)(cr|crore|l|lac|lakh|lk|k)?[\s-]*(?:to|-|–)[\s]*[\d.]+/i);
    if (rangeMatch) {
        return parseBudgetValue(rangeMatch[1] + (rangeMatch[2] || ''));
    }

    const unitMatch = text.match(/^([\d.]+)(cr|crore|l|lac|lakh|lk|k)?$/i);
    if (!unitMatch) return null;

    const value = parseFloat(unitMatch[1]);
    if (!Number.isFinite(value) || value < 0) return null;

    const unit = (unitMatch[2] || '').toLowerCase();
    if (unit === 'cr' || unit === 'crore') return Math.round(value * 10000000);
    if (unit === 'l' || unit === 'lac' || unit === 'lakh' || unit === 'lk') return Math.round(value * 100000);
    if (unit === 'k') return Math.round(value * 1000);

    // Bare number — sanity guard: values below 10000 are almost certainly
    // meant as lakhs/crores (e.g. "95" for ₹95L); treat sub-10k as invalid.
    if (value < 10000) return null;
    return Math.round(value);
}

module.exports = { parseBudgetValue };
