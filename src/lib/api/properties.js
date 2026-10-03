import apiClient from "./client";

const parseCurrencyValue = (value) => {
    if (value === null || value === undefined || value === '') return 0;

    const input = String(value).replace(/,/g, '').trim();
    const normalized = input.toLowerCase();

    if (!Number.isNaN(Number(input))) {
        return Number(input);
    }

    if (normalized.includes('cr')) {
        return (Number(input.replace(/[^0-9.]/g, '')) || 0) * 10000000;
    }

    if (normalized.includes('l')) {
        return (Number(input.replace(/[^0-9.]/g, '')) || 0) * 100000;
    }

    if (normalized.includes('k')) {
        return (Number(input.replace(/[^0-9.]/g, '')) || 0) * 1000;
    }

    return Number(input.replace(/[^0-9.-]/g, '')) || 0;
};

const unwrapList = (payload, listKey) => payload?.[listKey] ?? payload;

export const fetchProperties = async (projectId = null, params = {}) => {
    // If projectId is provided, fetch properties for that project
    if (projectId) {
        const response = await apiClient.get(`/projects/${projectId}/properties`, { params });
        return unwrapList(response, 'properties');
    }
    // Fetch all properties
    const response = await apiClient.get('/properties', { params });
    return unwrapList(response, 'properties');
};

export const fetchPropertyById = async (id) => {
    const response = await apiClient.get(`/properties/${id}`);
    return response;
};

export const createProperty = async (data = {}) => {
    const payload = { ...data };

    if (!payload.title && payload.name) {
        payload.title = payload.name;
    }

    if (!payload.projectId && payload.project) {
        payload.projectId = payload.project;
    }

    if (payload.price !== undefined && payload.price !== null) {
        payload.price = parseCurrencyValue(payload.price);
    }

    if (payload.status) {
        payload.status = payload.status.toUpperCase();
    }

    delete payload.name;
    delete payload.address;
    delete payload.project;
    delete payload.type;
    delete payload.category;

    const response = await apiClient.post('/properties', payload);
    return response;
};

export const updateProperty = async ({ id, ...data }) => {
    const response = await apiClient.patch(`/properties/${id}`, data);
    return response;
};

export const deleteProperty = async (id) => {
    const response = await apiClient.delete(`/properties/${id}`);
    return response;
};
