"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../features/auth/hooks/useAuth";
import AppSidebar from "../../components/layouts/AppSidebar";
import AppHeader from "../../components/layouts/AppHeader";

export default function DashboardShell({ children }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try {
            return window.localStorage.getItem("Spaceezy-sidebar-collapsed") === "1";
        } catch {
            return false;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem("Spaceezy-sidebar-collapsed", isCollapsed ? "1" : "0");
        } catch {
            // ignore
        }
    }, [isCollapsed]);

    useEffect(() => {
        if (!isLoading && !user) {
            router.replace("/login");
        }
    }, [isLoading, user, router]);

    if (isLoading || !user) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#F8F9FD]">
                <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#F8F9FD] overflow-hidden font-sans">
            <AppSidebar 
                isOpen={isSidebarOpen} 
                setIsOpen={setIsSidebarOpen} 
                collapsed={isCollapsed}
            />

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <AppHeader 
                    onOpenSidebar={() => setIsSidebarOpen(true)} 
                    onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
                    collapsed={isCollapsed}
                />
                <div className="flex-1 overflow-y-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
