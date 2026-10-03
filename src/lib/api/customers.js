import apiClient from "./client";

const unwrapList = (payload, listKey) => payload?.[listKey] ?? payload;

export const fetchCustomers = async (params = {}) => {
    const response = await apiClient.get('/customers', { params });
    return unwrapList(response, 'customers');
};

export const fetchCustomerById = async (id) => {
    const response = await apiClient.get(`/customers/${id}`);
    return response;
};

export const createCustomer = async (data) => {
    const response = await apiClient.post('/customers', data);
    return response;
};

export const updateCustomer = async ({ id, ...data }) => {
    const response = await apiClient.patch(`/customers/${id}`, data);
    return response;
};

export const deleteCustomer = async (id) => {
    const response = await apiClient.delete(`/customers/${id}`);
    return response;
};
