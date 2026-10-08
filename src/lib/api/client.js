import axios from "axios";
import { logout } from "../auth";

const unwrapApiEnvelope = (payload) => {
    if (
        payload &&
        typeof payload === "object" &&
        Object.prototype.hasOwnProperty.call(payload, "success") &&
        Object.prototype.hasOwnProperty.call(payload, "data")
    ) {
        return payload.data;
    }

    return payload;
};

const apiClient = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1",
    timeout: 10000,
    headers: {
        "Content-Type": "application/json",
    },
    withCredentials: true,
});

apiClient.interceptors.request.use(
    (config) => {
        // We'll add JWT token here when backend auth is ready
        // const token = localStorage.getItem("token");
        // if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    },
    (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
    (response) => unwrapApiEnvelope(response.data),
    (error) => {
        if (error.response?.status === 401) {
            logout();
            if (typeof window !== "undefined" && window.location.pathname.startsWith("/dashboard")) {
                window.location.href = window.location.origin + "/login";
            }
        }

        const payload = error.response?.data;
        const apiError = new Error(
            payload?.message || payload?.error || "An unexpected error occurred"
        );
        apiError.status = error.response?.status ?? null;
        apiError.code = payload?.code ?? null;
        apiError.errors = payload?.errors ?? null;
        return Promise.reject(apiError);
    }
);

export default apiClient;
