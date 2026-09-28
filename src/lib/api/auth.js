// src/lib/api/auth.js
// PENDING BACKEND INTEGRATION: These functions currently simulate an API call
// but will eventually communicate with the real backend using apiClient.
// Real auth will rely on HTTP-only cookies, not localStorage.

export const loginAPI = async (email, password) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    // Simulate successful login response
    return {
        user: { id: "1", name: "Admin User", role: "SUPER_ADMIN", email: "admin@spaceezy.com" }
    };
};

export const fetchSessionAPI = async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    // Simulate session fetching (would normally check HTTP-only cookie)
    // For now, we'll return null to simulate not logged in by default,
    // or return a mock user if we want to simulate logged in.
    return null; 
};

export const logoutAPI = async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return true;
};
