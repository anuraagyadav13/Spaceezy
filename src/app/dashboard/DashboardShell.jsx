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
    // Desktop collapse preference (mobile slide-over is unaffected).
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try {
            return window.localStorage.getItem("spaceezy-sidebar-collapsed") === "1";
        } catch {
            return false;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem("spaceezy-sidebar-collapsed", isCollapsed ? "1" : "0");
        } catch {
            // Private mode etc. — preference simply won't persist.
        }
    }, [isCollapsed]);

    useEffect(() => {
        if (!isLoading && !user) {
            router.replace("/login");
        }
    }, [isLoading, user, router]);

    if (isLoading || !user) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
            <AppSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} collapsed={isCollapsed} />

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <AppHeader
                    onOpenSidebar={() => setIsSidebarOpen(true)}
                    onToggleCollapse={() => setIsCollapsed((v) => !v)}
                    collapsed={isCollapsed}
                />
                <div className="flex-1 overflow-y-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
