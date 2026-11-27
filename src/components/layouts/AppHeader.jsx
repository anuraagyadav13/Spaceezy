"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, Bell, CheckCheck } from "lucide-react";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useNotifications } from "../../features/notifications/hooks/useNotifications";
import { useMarkNotificationRead, useMarkAllNotificationsRead } from "../../features/notifications/hooks/useMarkNotificationsRead";
import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "../shared/ThemeToggle";

const timeAgo = (iso) => {
    if (!iso) return "";
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
};

export default function AppHeader({ onOpenSidebar }) {
    const { user } = useAuth();
    const router = useRouter();
    const { data } = useNotifications(15);
    const markRead = useMarkNotificationRead();
    const markAllRead = useMarkAllNotificationsRead();
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);

    const notifications = data?.notifications ?? [];
    const unreadCount = data?.unreadCount ?? 0;
    const initials = (user?.name || "User")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();

    // Close the dropdown on any outside click.
    useEffect(() => {
        if (!open) return;
        const onClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [open]);

    const handleOpenItem = (n) => {
        if (!n.read) markRead.mutate(n.id);
        setOpen(false);
        if (n.link) router.push(n.link);
    };

    return (
        <header className="h-16 crm-chrome flex items-center justify-between gap-2 px-4 sm:px-8 shrink-0 sticky top-0 z-30">
            <div className="flex items-center gap-2 sm:gap-3">
                {/* Mobile open hamburger — the brand logo in the sidebar
                    collapses/expands the rail on desktop. */}
                <button
                    onClick={onOpenSidebar}
                    aria-label="Open sidebar"
                    className="lg:hidden p-2 -ml-2 text-gray-500 hover:bg-white rounded-xl shadow-xs"
                >
                    <Menu size={20} />
                </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-5 lg:gap-6">
                {/* Notification bell */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setOpen((v) => !v)}
                        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
                        aria-expanded={open}
                        className="relative p-2 text-gray-500 hover:text-purple-600 hover:bg-white rounded-xl transition-colors"
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#F8F9FD]">
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                        )}
                    </button>

                    {open && (
                        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-[4.25rem] max-sm:mt-0 max-sm:w-auto max-sm:max-w-none">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                                <p className="text-sm font-bold text-gray-900">Notifications</p>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={() => markAllRead.mutate()}
                                        disabled={markAllRead.isPending}
                                        className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-700 disabled:opacity-50"
                                    >
                                        <CheckCheck size={14} />
                                        Mark all read
                                    </button>
                                )}
                            </div>

                            <div className="max-h-96 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <p className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet</p>
                                ) : (
                                    notifications.map((n) => (
                                        <button
                                            key={n.id}
                                            onClick={() => handleOpenItem(n)}
                                            className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${n.read ? "" : "bg-purple-50/50"}`}
                                        >
                                            <div className="flex items-start gap-2">
                                                {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-purple-500 shrink-0" />}
                                                <div className={`min-w-0 ${n.read ? "pl-4" : ""}`}>
                                                    <p className="text-sm font-semibold text-gray-900 truncate">{n.title}</p>
                                                    {n.body && <p className="text-xs text-gray-500 truncate">{n.body}</p>}
                                                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* User info — opens the profile page */}
                <Link
                    href="/dashboard/profile"
                    title="My profile"
                    className="flex items-center gap-2 sm:gap-3 rounded-2xl px-1.5 py-1 hover:bg-gray-50 transition-colors"
                >
                    <div className="hidden sm:block text-right">
                        <p className="text-sm font-bold text-gray-900 leading-tight">{user?.name || "Admin User"}</p>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <p className="text-[10px] font-bold text-gray-500 tracking-wider uppercase">
                                {user?.role?.replace("_", " ") || "ADMIN"}
                            </p>
                        </div>
                    </div>
                    <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-white shadow-sm overflow-hidden bg-purple-100 flex items-center justify-center">
                        {user?.avatar ? (
                            <Image
                                src={user.avatar}
                                alt="Profile"
                                className="w-full h-full object-cover"
                                width={40}
                                height={40}
                            />
                        ) : (
                            <span className="text-sm font-black text-purple-700">{initials || "U"}</span>
                        )}
                    </div>
                </Link>
                <ThemeToggle />
            </div>
        </header>
    );
}
