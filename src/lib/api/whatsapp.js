import apiClient from "./client";

export const fetchWhatsAppStatus = async () => (await apiClient.get("/whatsapp/status"));

export const fetchConversations = async (params = {}) => (await apiClient.get("/whatsapp/conversations", { params }));

export const createConversation = async (data) => (await apiClient.post("/whatsapp/conversations", data));

export const fetchMessages = async (conversationId, params = {}) =>
    (await apiClient.get(`/whatsapp/conversations/${conversationId}`, { params }));

export const sendWhatsAppMessage = async ({ conversationId, ...data }) =>
    (await apiClient.post(`/whatsapp/conversations/${conversationId}/messages`, data));

export const fetchWhatsAppTemplates = async (params = {}) => (await apiClient.get("/whatsapp/templates", { params }));

export const createWhatsAppTemplate = async (data) => (await apiClient.post("/whatsapp/templates", data));

export const updateWhatsAppTemplate = async ({ id, ...data }) => (await apiClient.patch(`/whatsapp/templates/${id}`, data));
