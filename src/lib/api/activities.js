import apiClient from "./client";

export const fetchAgenda = async (params = {}) => (await apiClient.get("/activities/agenda", { params }));

export const fetchProductivity = async (params = {}) => (await apiClient.get("/activities/productivity", { params }));

export const fetchNeedsAttention = async (params = {}) => (await apiClient.get("/activities/needs-attention", { params }));
