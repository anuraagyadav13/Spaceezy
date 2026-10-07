// Canonical property-requirement vocabulary. Single source of truth shared by
// lead requirement forms, property matching filters and inventory quick-add.
// Keep in sync with the backend copy in backend/src/utils/propertyRequirement.js.

export const PROPERTY_TYPES = ["Residential", "Commercial"];

export const CONFIGURATIONS_BY_TYPE = {
    Residential: ["Studio", "1 BHK", "2 BHK", "3 BHK", "4 BHK", "5 BHK", "Villa", "Plot", "Other"],
    Commercial: ["Office", "Retail / Shop", "Showroom", "Warehouse", "Industrial", "Commercial Plot", "Other"],
};

export const configurationsFor = (propertyType) => CONFIGURATIONS_BY_TYPE[propertyType] || [];
