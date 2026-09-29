let mockEnquiries = [];

import apiClient from "../api/client";

export async function submitEnquiry(data) {
    try {
        const response = await apiClient.post('/public/enquiries', data);
        return { success: true, id: response.data.id };
    } catch (error) {
        console.error("Enquiry submission failed:", error);
        throw error;
    }
}

export function getEnquiries() {
    return mockEnquiries;
}
