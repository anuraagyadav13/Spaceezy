import apiClient from "./client";

const unwrapAuthPayload = (payload) => {
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "success") && Object.prototype.hasOwnProperty.call(payload, "data")) {
        return payload.data;
    }

    return payload;
};

export const loginAPI = async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password });
    return unwrapAuthPayload(response);
};

export const fetchSessionAPI = async () => {
    const response = await apiClient.get('/auth/me');
    return unwrapAuthPayload(response);
};

export const logoutAPI = async () => {
    const response = await apiClient.post('/auth/logout');
    return unwrapAuthPayload(response);
};

// --- Password reset -------------------------------------------------------
// The backend answers /forgot-password with the SAME generic 200 whether or
// not the account exists (anti-enumeration), so callers must never branch on
// "email not found" — there is no such signal to branch on.

export const forgotPasswordAPI = async (email) => {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return unwrapAuthPayload(response);
};

// Returns { resetToken, expiresInSeconds }. Wrong/expired/locked codes all
// arrive as a single generic 400 with code INVALID_RESET_CODE.
export const verifyResetOtpAPI = async (email, otp) => {
    const response = await apiClient.post('/auth/verify-reset-otp', { email, otp });
    return unwrapAuthPayload(response);
};

// Returns { sessionsRevoked, confirmationEmailSent }.
export const resetPasswordAPI = async (email, resetToken, newPassword) => {
    const response = await apiClient.post('/auth/reset-password', { email, resetToken, newPassword });
    return unwrapAuthPayload(response);
};
