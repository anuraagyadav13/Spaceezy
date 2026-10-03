import apiClient from "./client";

const unwrapList = (payload, listKey) => payload?.[listKey] ?? payload;

export const fetchTasks = async (params = {}) => {
    const response = await apiClient.get('/tasks', { params });
    return unwrapList(response, 'tasks');
};

export const fetchTaskById = async (id) => {
    const response = await apiClient.get(`/tasks/${id}`);
    return response;
};

export const createTask = async (data) => {
    const response = await apiClient.post('/tasks', data);
    return response;
};

export const updateTask = async ({ id, ...data }) => {
    const response = await apiClient.patch(`/tasks/${id}`, data);
    return response;
};

export const toggleTaskStatus = async (id) => {
    const response = await apiClient.patch(`/tasks/${id}/toggle`);
    return response;
};

export const deleteTask = async (id) => {
    const response = await apiClient.delete(`/tasks/${id}`);
    return response;
};

export const fetchOverdueTasks = async () => {
    const response = await apiClient.get('/tasks/overdue');
    return response;
};
