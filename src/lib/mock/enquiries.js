import apiClient from "../api/client";

export async function submitEnquiry(data) {
    const response = await apiClient.post('/public/enquiries', data);
    return { success: true, id: response?.id || response?.data?.id || null };
}

export function getEnquiries() {
    return [];
}
