import apiClient from "./client";

const unwrapList = (payload, listKey) => payload?.[listKey] ?? payload;

export const fetchProjects = async (params = {}) => {
    const response = await apiClient.get('/projects', { params });
    return unwrapList(response, 'projects');
};

export const fetchProjectById = async (id) => {
    const response = await apiClient.get(`/projects/${id}`);
    return response;
};

export const createProject = async (data) => {
    const response = await apiClient.post('/projects', data);
    return response;
};

export const updateProject = async ({ id, ...data }) => {
    const response = await apiClient.patch(`/projects/${id}`, data);
    return response;
};

export const deleteProject = async (id) => {
    const response = await apiClient.delete(`/projects/${id}`);
    return response;
};

// Uploads the project's OPTIONAL brochure PDF (POST /api/v1/projects/:id/
// brochure). Raw bytes are sent so axios does not JSON-encode them; the
// backend validates the %PDF- magic bytes and enforces the 15 MB cap.
// The upload persists immediately — the project save form is not involved.
export const uploadProjectBrochure = async (id, file) => {
    const data = await apiClient.post(`/projects/${id}/brochure`, file, {
        headers: { "Content-Type": "application/pdf" },
        // Send the File as-is instead of the default JSON transform.
        transformRequest: [(body) => body],
        timeout: 120000,
    });
    // Envelope unwrap gives { brochure, documents }.
    return data.brochure;
};

// Removes the brochure entry from the project's documents (the stored file
// itself is cleaned up by bucket lifecycle rules).
export const removeProjectBrochure = async (id) => {
    const data = await apiClient.delete(`/projects/${id}/brochure`);
    return data.documents;
};
