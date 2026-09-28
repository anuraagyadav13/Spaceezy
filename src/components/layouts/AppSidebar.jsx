"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "../../features/auth/hooks/usePermissions";
import { LogOut, Menu, X, LayoutDashboard, Users, Home, ClipboardList, Briefcase, Calendar, FileText, Settings, UserPlus } from "lucide-react";
import { useAuth } from "../../features/auth/hooks/useAuth";

const NAVIGATION_GROUPS = [
    {
        title: "OVERVIEW",
        items: [
            { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard } // Accessible by all
        ]
    },
    {
        title: "CRM",
        items: [
            { label: "Leads", href: "/dashboard/leads", icon: Users, permission: "lead:view" },
            { label: "Customers", href: "/dashboard/customers", icon: UserPlus, permission: "booking:view" }, // Temporary mapping
            { label: "Site Visits", href: "/dashboard/site-visits", icon: Calendar, permission: "lead:view" }
        ]
    },
    {
        title: "INVENTORY",
        items: [
            { label: "Properties", href: "/dashboard/inventory", icon: Home, permission: "inventory:view" }
        ]
    },
    {
        title: "SALES",
        items: [
            { label: "Bookings", href: "/dashboard/bookings", icon: ClipboardList, permission: "booking:view" }
        ]
    },
    {
        title: "MANAGEMENT",
        items: [
            { label: "Team", href: "/dashboard/team", icon: Briefcase, permission: "lead:assign" },
            { label: "Reports", href: "/dashboard/reports", icon: FileText, permission: "lead:assign" }
        ]
    }
];

export default function AppSidebar({ isOpen, setIsOpen }) {
    const pathname = usePathname();
    const { hasPermission } = usePermissions();
    const { logout } = useAuth();
    
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    if (!mounted) return <div className="w-64 border-r border-gray-100 bg-white" />; // SSR placeholder

    // Filter navigation based on permissions
    const filteredGroups = NAVIGATION_GROUPS.map(group => ({
        ...group,
        items: group.items.filter(item => !item.permission || hasPermission(item.permission))
    })).filter(group => group.items.length > 0);

    const isActive = (href) => {
        if (href === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(href);
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
                <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 shrink-0">
                    <Link href="/dashboard" className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600">
                        SpaceEzy
                    </Link>
                    <button onClick={() => setIsOpen(false)} className="lg:hidden p-1 text-gray-500 hover:bg-gray-100 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-4">
                    {filteredGroups.map((group, i) => (
                        <div key={group.title} className={i !== 0 ? "mt-6" : ""}>
                            <h3 className="px-3 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                {group.title}
                            </h3>
                            <nav className="flex flex-col gap-1">
                                {group.items.map(item => (
                                    <Link 
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setIsOpen(false)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${isActive(item.href) ? "bg-purple-50 text-purple-700 shadow-sm shadow-purple-100/50" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
                                    >
                                        <item.icon size={18} className={isActive(item.href) ? "text-purple-600" : "text-gray-400"} />
                                        {item.label}
                                    </Link>
                                ))}
                            </nav>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-gray-100 shrink-0">
                    <button 
                        onClick={logout}
                        className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all"
                    >
                        <LogOut size={18} className="text-gray-400 group-hover:text-red-500" />
                        Sign Out
                    </button>
                </div>
            </aside>
        </>
    );
}
