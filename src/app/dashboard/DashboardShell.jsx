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
    const [isMobile, setIsMobile] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try {
            return window.localStorage.getItem("Spaceezy-sidebar-collapsed") === "1";
        } catch {
            return false;
        }
    });

    // The collapsed (icon-only) rail is a desktop affordance. On phones the
    // sidebar is a drawer, so it always opens full width with labels.
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 1023px)");
        const sync = () => setIsMobile(mq.matches);
        sync();
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
    }, []);

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
            <div className="flex h-dvh items-center justify-center crm-canvas">
                <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="crm-shell flex h-dvh crm-canvas overflow-hidden font-sans">
            <AppSidebar 
                isOpen={isSidebarOpen} 
                setIsOpen={setIsSidebarOpen} 
                collapsed={isCollapsed && !isMobile}
            />

            <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative">
                <AppHeader 
                    onOpenSidebar={() => setIsSidebarOpen(true)} 
                    onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
                    collapsed={isCollapsed}
                />
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
