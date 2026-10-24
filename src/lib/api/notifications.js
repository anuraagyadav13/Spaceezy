import apiClient from "./client";

// List is served as the data envelope directly:
// { notifications, total, unreadCount, page, limit }
export const fetchNotifications = async (params = {}) => {
    const response = await apiClient.get('/notifications', { params });
    return response;
};

// Count only, for the bell badge. Cheaper than the full list.
export const fetchUnreadCount = async () => {
    const response = await apiClient.get('/notifications', { params: { limit: 1 } });
    return response?.unreadCount ?? 0;
};

export const markNotificationRead = async (id) => {
    const response = await apiClient.patch(`/notifications/${id}/read`);
    return response;
};

export const markAllNotificationsRead = async () => {
    const response = await apiClient.patch('/notifications/read-all');
    return response;
};
