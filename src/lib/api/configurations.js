import apiClient from "./client";

export const fetchConfigurations = async (projectId) => {
    const response = await apiClient.get(`/projects/${projectId}/configurations`);
    return Array.isArray(response) ? response : response?.configurations ?? [];
};

export const fetchConfigurationById = async (projectId, configId) => {
    const response = await apiClient.get(`/projects/${projectId}/configurations/${configId}`);
    return response;
};

export const createConfiguration = async (projectId, data = {}) => {
    const response = await apiClient.post(`/projects/${projectId}/configurations`, data);
    return response;
};

export const updateConfiguration = async (projectId, configId, data = {}) => {
    const response = await apiClient.patch(`/projects/${projectId}/configurations/${configId}`, data);
    return response;
};

export const deleteConfiguration = async (projectId, configId) => {
    const response = await apiClient.delete(`/projects/${projectId}/configurations/${configId}`);
    return response;
};
