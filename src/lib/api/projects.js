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
