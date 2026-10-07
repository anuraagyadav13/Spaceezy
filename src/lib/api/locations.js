import apiClient from "./client";

// Canonical State -> District -> Region master (system-wide, read-only).
// The envelope interceptor unwraps { success, data } to the inner data.

export const fetchStates = async () => {
    const response = await apiClient.get("/locations/states");
    return response;
};

export const fetchDistricts = async (stateId) => {
    const response = await apiClient.get(`/locations/states/${stateId}/districts`);
    return response;
};

export const fetchRegions = async (districtId) => {
    const response = await apiClient.get(`/locations/districts/${districtId}/regions`);
    return response;
};

// Region management (admin only; states/districts are read-only).
export const createRegion = async ({ districtId, name }) => {
    const response = await apiClient.post("/locations/regions", { districtId, name });
    return response;
};

export const updateRegion = async ({ regionId, name }) => {
    const response = await apiClient.patch(`/locations/regions/${regionId}`, { name });
    return response;
};

export const deleteRegion = async ({ regionId }) => {
    const response = await apiClient.delete(`/locations/regions/${regionId}`);
    return response;
};
