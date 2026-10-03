import apiClient from "./client";

const unwrapList = (payload, listKey) => payload?.[listKey] ?? payload;

export const fetchBookings = async (params = {}) => {
    const response = await apiClient.get('/bookings', { params });
    return unwrapList(response, 'bookings');
};

export const fetchBookingById = async (id) => {
    const response = await apiClient.get(`/bookings/${id}`);
    return response;
};

export const createBooking = async (data) => {
    const response = await apiClient.post('/bookings', data);
    return response;
};

export const cancelBooking = async (id) => {
    const response = await apiClient.patch(`/bookings/${id}/cancel`);
    return response;
};

export const completeBookingPayment = async (id) => {
    const response = await apiClient.patch(`/bookings/${id}/complete`);
    return response;
};

export const updatePaymentStatus = async (id, paymentStatus) => {
    const response = await apiClient.patch(`/bookings/${id}/payment-status`, { paymentStatus });
    return response;
};
