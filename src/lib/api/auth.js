import apiClient from "./client";

export const loginAPI = async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data; // Expected { success: true, data: user }
};

export const fetchSessionAPI = async () => {
    const response = await apiClient.get('/auth/me');
    return response.data; // Expected { success: true, data: user }
};

export const logoutAPI = async () => {
    const response = await apiClient.post('/auth/logout');
    return response.data;
};
