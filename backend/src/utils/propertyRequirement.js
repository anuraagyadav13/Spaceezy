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

module.exports = {
    PROPERTY_TYPES,
    CONFIGURATIONS_BY_TYPE,
    configurationsFor,
    isValidConfiguration,
    extractBhk,
    normalizeConfig
};
