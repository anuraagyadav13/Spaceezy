import apiClient from "./client";

export const fetchLeads = async (params = {}) => {
    const response = await apiClient.get('/leads', { params });
    return response.data.leads || response.data;
};

// No need for separate employee leads endpoint since the backend scopes based on the role
export const fetchEmployeeLeads = async () => {
    const response = await apiClient.get('/leads');
    return response.data.leads || response.data;
};

export const createLead = async (data) => {
    const response = await apiClient.post('/leads', data);
    return response.data;
};

export const updateLeadStatus = async ({ id, status, ...data }) => {
    const response = await apiClient.patch(`/leads/${id}`, { status, ...data });
    return response.data;
};

export const deleteLead = async (id) => {
    const response = await apiClient.delete(`/leads/${id}`);
    return response.data;
};
