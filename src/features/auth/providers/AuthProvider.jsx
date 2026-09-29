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
                const sessionUser = await fetchSessionAPI();
                setUser(sessionUser);
            } catch {
                // Temporary mock fallback until PostgreSQL is connected tomorrow
                if (typeof window !== "undefined") {
                    const localRole = window.localStorage.getItem("se_role");
                    if (localRole === "owner") {
                        setUser({ id: "admin-1", name: "Mock Owner", role: "SUPER_ADMIN", email: "admin@spaceezy.com" });
                    } else if (localRole === "employee") {
                        const empId = window.localStorage.getItem("se_employee_id") || "emp-1";
                        setUser({ id: empId, name: "Mock Employee", role: "SALES_EXECUTIVE", email: "emp@spaceezy.com" });
                    } else {
                        setUser(null);
                    }
                } else {
                    setUser(null);
                }
            } finally {
                setIsLoading(false);
            }
        };
        loadSession();
    }, []);

    const login = async (email, password) => {
        setIsLoading(true);
        try {
            const user = await loginAPI(email, password);
            setUser(user);
            return user;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await logoutAPI();
            setUser(null);
            // We use standard navigation, but here since it's a context method:
            if (typeof window !== "undefined") {
                window.location.href = window.location.origin + "/login";
            }
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
