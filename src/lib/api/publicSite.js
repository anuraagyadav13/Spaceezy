import apiClient from "./client";

// Public, unauthenticated CRM reads (GET /api/v1/public/*).
// Reuses the shared apiClient — public endpoints never 401, so no cookie
// auth redirect is triggered. Responses use the standard envelope
// ({ success, data }) which the client unwraps automatically.

// --- Projects ---

export const fetchPublicProjects = async (params = {}) => {
    // { items, page, limit, total, totalPages }
    const data = await apiClient.get("/public/projects", { params });
    return data;
};

export const fetchPublicProject = async (slug) => {
    const data = await apiClient.get(`/public/projects/${encodeURIComponent(slug)}`);
    return data;
};

// --- Properties ---

export const fetchPublicProperties = async (params = {}) => {
    // { items, page, limit, total, totalPages }
    const data = await apiClient.get("/public/properties", { params });
    return data;
};

// Public property page — token in, full public DTO out. Throws 404 for
// invalid/unpublished tokens (identical message, no existence oracle).
export const fetchPublicProperty = async (token) => {
    const data = await apiClient.get(`/public/properties/${encodeURIComponent(token)}`);
    return data;
};

// --- Locations (canonical IDs shared with the CRM) ---

export const fetchPublicLocations = async () => {
    const data = await apiClient.get("/public/locations");
    return data;
};

// --- Configurations (distinct active names on published projects) ---

export const fetchPublicConfigurations = async () => {
    const data = await apiClient.get("/public/configurations");
    return data;
};

// --- Enquiry ---

export const submitPublicEnquiry = async (payload) => {
    const data = await apiClient.post("/public/enquiries", payload);
    return data; // { id }
};
