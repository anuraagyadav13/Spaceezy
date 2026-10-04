import apiClient from "./client";

const unwrapList = (payload, listKey) => payload?.[listKey] ?? payload;

export const fetchQuotations = async (params = {}) => {
    const response = await apiClient.get('/quotations', { params });
    return unwrapList(response, 'quotations');
};

export const fetchQuotationById = async (id) => {
    const response = await apiClient.get(`/quotations/${id}`);
    return response;
};

export const createQuotation = async (data) => {
    const response = await apiClient.post('/quotations', data);
    return response;
};

export const updateQuotationStatus = async ({ id, ...data }) => {
    const response = await apiClient.patch(`/quotations/${id}`, data);
    return response;
};
