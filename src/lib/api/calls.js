import apiClient from "./client";

export const fetchTelephonyStatus = async () => (await apiClient.get("/calls/status"));

export const initiateCall = async (data) => (await apiClient.post("/calls", data));

export const hangupCall = async (id) => (await apiClient.post(`/calls/${id}/hangup`, {}));

export const recordCallOutcome = async ({ id, ...data }) => (await apiClient.post(`/calls/${id}/outcome`, data));

export const fetchCalls = async (params = {}) => (await apiClient.get("/calls", { params }));

export const fetchCallById = async (id) => (await apiClient.get(`/calls/${id}`));

export const fetchCallRecording = async (id) => (await apiClient.get(`/calls/${id}/recording`));
