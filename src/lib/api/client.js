import axios from "axios";
import { logout } from "../auth";

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
    (response) => response.data,
    (error) => {
        if (error.response?.status === 401) {
            logout();
            if (typeof window !== "undefined") {
                window.location.href = window.location.origin + "/login";
            }
        }
        return Promise.reject(
            error.response?.data?.message || "An unexpected error occurred"
        );
    }
);

export default apiClient;
