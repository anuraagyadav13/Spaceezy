import apiClient from "./client";

const unwrapList = (payload, listKey) => payload?.[listKey] ?? payload;

export const fetchSiteVisits = async (params = {}) => {
    const response = await apiClient.get('/site-visits', { params });
    return unwrapList(response, 'siteVisits');
};

export const fetchSiteVisitById = async (id) => {
    const response = await apiClient.get(`/site-visits/${id}`);
    return response;
};

export const createSiteVisit = async (data) => {
    const response = await apiClient.post('/site-visits', data);
    return response;
};

export const updateSiteVisit = async ({ id, ...data }) => {
    const response = await apiClient.patch(`/site-visits/${id}`, data);
    return response;
};

export const updateSiteVisitStatus = async (id, status) => {
    const response = await apiClient.patch(`/site-visits/${id}/status`, { status });
    return response;
};

export const deleteSiteVisit = async (id) => {
    const response = await apiClient.delete(`/site-visits/${id}`);
    return response;
};
