import apiClient from "./client";

export const fetchWhatsAppStatus = async () => (await apiClient.get("/whatsapp/status"));

export const fetchConversations = async (params = {}) => (await apiClient.get("/whatsapp/conversations", { params }));

export const createConversation = async (data) => (await apiClient.post("/whatsapp/conversations", data));

export const fetchMessages = async (conversationId, params = {}) =>
    (await apiClient.get(`/whatsapp/conversations/${conversationId}`, { params }));

export const sendWhatsAppMessage = async ({ conversationId, ...data }) =>
    (await apiClient.post(`/whatsapp/conversations/${conversationId}/messages`, data));

export const fetchWhatsAppTemplates = async (params = {}) => (await apiClient.get("/whatsapp/templates", { params }));

export const fetchTemplateLibrary = async () => (await apiClient.get("/whatsapp/templates/library"));

export const createWhatsAppTemplate = async (data) => (await apiClient.post("/whatsapp/templates", data));

export const updateWhatsAppTemplate = async ({ id, ...data }) => (await apiClient.patch(`/whatsapp/templates/${id}`, data));

export const fetchWhatsappSettings = async () => (await apiClient.get("/whatsapp/settings"));

export const saveWhatsappSettings = async (data) => (await apiClient.put("/whatsapp/settings", data));

export const rotateWhatsappSecret = async (data) => (await apiClient.post("/whatsapp/settings/rotate", data));

export const removeWhatsappSecret = async (field) => (await apiClient.delete(`/whatsapp/settings/secrets/${field}`));

export const testWhatsappConnection = async () => (await apiClient.post("/whatsapp/settings/test-connection", {}));

export const fetchLatestNotification = async () => (await apiClient.get("/whatsapp/settings/notifications/latest"));

export const sendTestNotification = async (data = {}) => (await apiClient.post("/whatsapp/settings/notify-test", data));
