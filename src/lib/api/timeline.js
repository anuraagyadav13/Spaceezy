import apiClient from "./client";

export const fetchLeadTimeline = async (leadId, params = {}) =>
    (await apiClient.get(`/leads/${leadId}/timeline`, { params }));
