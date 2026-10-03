import apiClient from "./client";

const unwrapList = (payload, listKey) => payload?.[listKey] ?? payload;

export const fetchUsers = async (params = {}) => {
    const response = await apiClient.get('/users', { params });
    return unwrapList(response, 'users');
};

export const fetchUserById = async (id) => {
    const response = await apiClient.get(`/users/${id}`);
    return response;
};

export const createUser = async (data) => {
    const response = await apiClient.post('/users', data);
    return response;
};

export const updateUser = async ({ id, ...data }) => {
    const response = await apiClient.patch(`/users/${id}`, data);
    return response;
};

export const deleteUser = async (id) => {
    const response = await apiClient.delete(`/users/${id}`);
    return response;
};

export const fetchUserProfile = async (id) => {
    const response = await apiClient.get(`/users/${id}/profile`);
    return response;
};
