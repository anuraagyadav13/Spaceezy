"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { fetchSessionAPI, loginAPI, logoutAPI } from "../../../lib/api/auth";

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
                // PENDING BACKEND: When real auth is ready, this will fetch the current user
                // For the prototype, we fall back to localStorage just to keep the UI working
                // DO NOT USE LOCALSTORAGE FOR PRODUCTION AUTH.
                const storedRole = window.localStorage.getItem("se_role");
                if (storedRole) {
                    setUser({
                        id: "mock-id",
                        name: storedRole === "owner" ? "Owner User" : "Employee User",
                        role: storedRole === "owner" ? "SUPER_ADMIN" : "SALES_EXECUTIVE"
                    });
                } else {
                    const sessionUser = await fetchSessionAPI();
                    setUser(sessionUser);
                }
            } catch (error) {
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
            const data = await loginAPI(email, password);
            setUser(data.user);
            // Temporary backward compatibility for existing pages:
            window.localStorage.setItem("se_role", data.user.role === "SUPER_ADMIN" ? "owner" : "employee");
            return data.user;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await logoutAPI();
            setUser(null);
            // Temporary backward compatibility
            window.localStorage.removeItem("se_role");
            window.localStorage.removeItem("se_employee_id");
            window.location.href = "/login";
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => useContext(AuthContext);
