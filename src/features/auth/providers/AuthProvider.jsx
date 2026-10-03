"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { fetchSessionAPI, loginAPI, logoutAPI } from "../../../lib/api/auth";
import { clearAuthCache } from "../../../lib/auth";

const AuthContext = createContext({
    user: null,
    isLoading: true,
    login: async () => {},
    logout: async () => {},
});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadSession = async () => {
            try {
                const currentUser = await fetchSessionAPI();
                setUser(currentUser || null);
            } catch {
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        loadSession();
    }, []);

    const login = async (email, password) => {
        setIsLoading(true);
        try {
            clearAuthCache();
            const authenticatedUser = await loginAPI(email, password);
            setUser(authenticatedUser || null);
            return authenticatedUser;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await logoutAPI();
        } finally {
            clearAuthCache();
            setUser(null);
            setIsLoading(false);
            if (typeof window !== "undefined") {
                window.location.href = window.location.origin + "/login";
            }
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => useContext(AuthContext);
