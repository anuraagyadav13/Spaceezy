import apiClient from "./client";

const unwrapAuthPayload = (payload) => {
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "success") && Object.prototype.hasOwnProperty.call(payload, "data")) {
        return payload.data;
    }

    return payload;
};

export const loginAPI = async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password });
    return unwrapAuthPayload(response);
};

export const fetchSessionAPI = async () => {
    const response = await apiClient.get('/auth/me');
    return unwrapAuthPayload(response);
};

export const logoutAPI = async () => {
    const response = await apiClient.post('/auth/logout');
    return unwrapAuthPayload(response);
};
