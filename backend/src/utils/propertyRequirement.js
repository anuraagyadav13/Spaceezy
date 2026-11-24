// Canonical property-requirement vocabulary. Single source of truth shared by
// lead requirements, property matching and inventory configuration UIs.
// Keep in sync with the frontend copy in src/lib/propertyRequirement.js.

const PROPERTY_TYPES = ['Residential', 'Commercial'];

const CONFIGURATIONS_BY_TYPE = {
    Residential: ['Studio', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK', 'Villa', 'Plot', 'Other'],
    Commercial: ['Office', 'Retail / Shop', 'Showroom', 'Warehouse', 'Industrial', 'Commercial Plot', 'Other']
};

const configurationsFor = (propertyType) => CONFIGURATIONS_BY_TYPE[propertyType] || [];

const isValidConfiguration = (propertyType, name) =>
    configurationsFor(propertyType).includes(name);

// "2 BHK" -> 2, "1.5 BHK" -> 1.5, anything else -> null
function extractBhk(label) {
    const match = /^(\d+(?:\.\d+)?)\s*bhk$/i.exec(String(label || '').trim());
    return match ? parseFloat(match[1]) : null;
}

// Case/spacing-insensitive label for comparisons ("2bhk" === "2 BHK")
function normalizeConfig(label) {
    return String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Canonical display label for a free-text configuration. Typos, spacing and
// casing variants collapse onto the controlled vocabulary so URLs, metadata
// and filters never fork ("2bhk", "2-BHK" and " 2  bhk " -> "2 BHK").
const CANONICAL_ALIASES = new Map([
    ['studio', 'Studio'],
    ['villa', 'Villa'],
    ['villas', 'Villa'],
    ['plot', 'Plot'],
    ['plots', 'Plot'],
    ['office', 'Office'],
    ['shop', 'Retail / Shop'],
    ['retail', 'Retail / Shop'],
    ['retail shop', 'Retail / Shop'],
    ['showroom', 'Showroom'],
    ['warehouse', 'Warehouse'],
    ['godown', 'Warehouse'],
    ['industrial', 'Industrial'],
    ['commercial plot', 'Commercial Plot'],
    ['other', 'Other']
]);

function canonicalConfigurationLabel(label) {
    const raw = String(label || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    const compact = raw.toLowerCase().replace(/[\s-]+/g, '');
    const bhk = /^(\d+(?:\.\d+)?)bhk$/.exec(compact);
    if (bhk) return `${parseFloat(bhk[1])} BHK`;
    const key = raw.toLowerCase().replace(/[\s-]+/g, ' ').trim();
    return CANONICAL_ALIASES.get(key) || raw;
}

module.exports = {
    PROPERTY_TYPES,
    CONFIGURATIONS_BY_TYPE,
    configurationsFor,
    isValidConfiguration,
    extractBhk,
    normalizeConfig,
    canonicalConfigurationLabel
};
