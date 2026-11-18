"use client";
import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../features/auth/hooks/useAuth";
import AppSidebar from "../../components/layouts/AppSidebar";
import AppHeader from "../../components/layouts/AppHeader";

export default function DashboardShell({ children }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    // WhatsApp-only "hide the app header while scrolling down" behavior.
    // Stores the pathname the header was hidden on, so navigating to any
    // other page shows it again without a reset effect.
    const isWhatsApp = pathname === "/dashboard/calling/whatsapp"
        || pathname.startsWith("/dashboard/calling/whatsapp/");
    const [headerHiddenFor, setHeaderHiddenFor] = useState(null);
    const headerHiddenRef = useRef(false);
    const lastScrollTopRef = useRef(0);
    const contentRef = useRef(null);
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

    // Hide the app header while the WhatsApp page is scrolled down; reveal it
    // again on any upward scroll or when the page is back at the top. Scoped
    // two ways: only on the WhatsApp route, and only for the page's own
    // scroll container (marked data-scroll-root="whatsapp") — scrolling the
    // message thread must not move the header. Scroll events do not bubble, so
    // the listener runs in the capture phase.
    useEffect(() => {
        if (!isWhatsApp) return undefined;
        lastScrollTopRef.current = 0;
        headerHiddenRef.current = false;
        const onScroll = (event) => {
            const target = event.target;
            if (!target || typeof target.scrollTop !== "number") return;
            // The WhatsApp page scrolls its own root; accept the shell's
            // content scroller too in case the page root ever fits exactly.
            // Any other scroller (e.g. the message thread) is ignored.
            const isPageScroller = target === contentRef.current
                || (target.dataset && target.dataset.scrollRoot === "whatsapp");
            if (!isPageScroller) return;
            const top = target.scrollTop;
            const last = lastScrollTopRef.current;
            const max = target.scrollHeight - target.clientHeight;
            lastScrollTopRef.current = top;
            if (top <= 8) {
                headerHiddenRef.current = false;
                setHeaderHiddenFor(null);
            } else if (top > last + 4 && top > 48) {
                headerHiddenRef.current = true;
                setHeaderHiddenFor(pathname);
            } else if (top < last - 4) {
                // Collapsing the header makes the viewport taller, which can
                // clamp a bottom-of-page scroll position — that decrease is
                // layout, not the user scrolling up, so keep the header hidden.
                if (headerHiddenRef.current && top >= max) return;
                headerHiddenRef.current = false;
                setHeaderHiddenFor(null);
            }
        };
        document.addEventListener("scroll", onScroll, true);
        return () => document.removeEventListener("scroll", onScroll, true);
    }, [isWhatsApp, pathname]);

    const headerHidden = isWhatsApp && headerHiddenFor === pathname;

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
                <div
                    aria-hidden={headerHidden}
                    inert={headerHidden ? true : undefined}
                    className={`shrink-0 transition-[margin-top,opacity] duration-300 ease-out ${
                        headerHidden ? "-mt-16 opacity-0 pointer-events-none" : "mt-0 opacity-100"
                    }`}
                >
                    <AppHeader 
                        onOpenSidebar={() => setIsSidebarOpen(true)} 
                        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
                        collapsed={isCollapsed}
                    />
                </div>
                <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
