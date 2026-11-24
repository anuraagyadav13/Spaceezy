"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
    LogOut, X, LayoutDashboard, Users, Home, ClipboardList,
    Calendar, PhoneCall, ListTodo,
    BarChart3, Megaphone, ChevronDown, ChevronRight, Settings
} from "lucide-react";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { usePermissions } from "../../features/auth/hooks/usePermissions";

const NAVIGATION_GROUPS = [
    {
        title: "DASHBOARD",
        icon: LayoutDashboard,
        items: [
            // Owner Overview is owner-only — employees never see this link
            // (the page itself also redirects non-owner roles).
            { label: "Owner Overview", href: "/dashboard", ownerOnly: true },
            { label: "Employee Dashboard", href: "/dashboard/employee" },
            { label: "Today's Agenda", href: "/dashboard/agenda" },
            { label: "Productivity", href: "/dashboard/productivity" }
        ]
    },
    {
        title: "LEADS",
        icon: Users,
        items: [
            { label: "Leads", href: "/dashboard/leads" },
            { label: "Junk / Discarded", href: "/dashboard/leads/junk", permission: "lead:view" }
        ]
    },
    {
        title: "CALLING & COMM",
        icon: PhoneCall,
        items: [
            { label: "Calls", href: "/dashboard/calling/calls" },
            { label: "Callback Queue", href: "/dashboard/calling/queue" },
            { label: "Browser Softphone", href: "/dashboard/calling/softphone" },
            { label: "Agent Availability", href: "/dashboard/calling/availability" },
            { label: "Spaceezy Chat", href: "/dashboard/calling/whatsapp" }
        ]
    },
    {
        title: "ACTIVITIES",
        icon: ListTodo,
        items: [
            { label: "Tasks", href: "/dashboard/activities/tasks" },
            { label: "Calendar", href: "/dashboard/activities/calendar" },
            { label: "Overdue Activities", href: "/dashboard/activities/overdue" }
        ]
    },
    {
        title: "PROJECTS & INVENTORY",
        icon: Home,
        items: [
            { label: "All Projects", href: "/dashboard/inventory" },
            { label: "Add Project", href: "/dashboard/inventory/projects/new" },
            { label: "Quick Add Unit", href: "/dashboard/inventory/units/quick-add" },
            { label: "Inventory Grid", href: "/dashboard/inventory/grid" },
            { label: "Availability & Holds", href: "/dashboard/inventory/availability" },
            { label: "Pricing", href: "/dashboard/inventory/pricing" }
        ]
    },
    {
        title: "SITE VISITS",
        icon: Calendar,
        items: [
            { label: "All Site Visits", href: "/dashboard/site-visits" },
            { label: "Schedule Site Visit", href: "/dashboard/site-visits/schedule" },
            { label: "Missed Visits", href: "/dashboard/site-visits/missed" }
        ]
    },
    {
        title: "BOOKINGS & CUSTOMERS",
        icon: ClipboardList,
        items: [
            { label: "Confirmed Bookings", href: "/dashboard/bookings" },
            { label: "Booking Wizard", href: "/dashboard/bookings/wizard" },
            { label: "Quotations", href: "/dashboard/bookings/quotations" },
            { label: "Customers", href: "/dashboard/customers" },
            { label: "Documents", href: "/dashboard/bookings/documents" }
        ]
    },
    {
        title: "REPORTS & ANALYTICS",
        icon: BarChart3,
        items: [
            { label: "Reports", href: "/dashboard/reports" }
        ]
    },
    {
        title: "MARKETING",
        icon: Megaphone,
        items: [
            // Campaigns + Website Enquiries are marketing pages: owners have
            // them by default, employees need an owner-granted marketing:view.
            { label: "Campaigns", href: "/dashboard/marketing/campaigns", permission: "marketing:view" },
            { label: "Website Enquiries", href: "/dashboard/marketing/website", permission: "marketing:view" },
            // --- Meta Ads (visible with marketing:view) ---
            { label: "Ads Overview", href: "/dashboard/marketing/meta-ads", permission: "marketing:view" },
            { label: "Ad Campaigns", href: "/dashboard/marketing/meta-ads/campaigns", permission: "marketing:view" },
            { label: "Creative Studio", href: "/dashboard/marketing/meta-ads/creatives", permission: "marketing:view" },
            { label: "Advertisements", href: "/dashboard/marketing/meta-ads/ads", permission: "marketing:view" },
            { label: "Audiences", href: "/dashboard/marketing/meta-ads/audiences", permission: "marketing:view" },
            { label: "Lead Forms & Sync", href: "/dashboard/marketing/meta-ads/lead-sync", permission: "marketing:view" },
            { label: "Performance", href: "/dashboard/marketing/meta-ads/analytics", permission: "marketing:view" },
            // --- Technical configuration: administrators only ---
            { label: "Meta Connection", href: "/dashboard/marketing/meta-ads/settings", permission: "marketing:view", adminOnly: true }
        ]
    },
    {
        title: "ADMINISTRATION",
        icon: Settings,
        items: [
            { label: "Employees & Teams", href: "/dashboard/team" },
            { label: "Roles & Permissions", href: "/dashboard/admin/roles" },
            { label: "Integrations", href: "/dashboard/admin/integrations" },
            { label: "Location Management", href: "/dashboard/admin/locations" },
            { label: "Audit Logs", href: "/dashboard/admin/audit" }
        ]
    }
];

function NavGroup({ group, pathname, setIsOpen, isCollapsed }) {
    const { hasPermission, hasRole } = usePermissions();

    // Client/admin separation: items marked with `permission` only appear when
    // the user holds it; `adminOnly` items are hidden from non-administrators
    // (they still exist — admins keep full access).
    const visibleItems = (group.items || []).filter((item) => {
        if (item.permission && !hasPermission(item.permission)) return false;
        if (item.adminOnly && !hasRole(["SUPER_ADMIN", "ADMIN"])) return false;
        if (item.ownerOnly && !hasRole(["SUPER_ADMIN", "ADMIN"])) return false;
        return true;
    });

    const isChildActive = visibleItems.some(item => 
        item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)
    );
    const [userToggled, setUserToggled] = useState(null);
    const isExpanded = userToggled !== null ? userToggled : (isChildActive || group.title === "DASHBOARD");

    if (visibleItems.length === 0) {
        return null;
    }

    // Sidebar flattening: any group with exactly one visible item renders as a
    // single direct link (no chevron/children). Applies to LEADS and
    // REPORTS & ANALYTICS.
    if (visibleItems.length === 1) {
        const item = visibleItems[0];

        // Collapsed rail: icon only — rendering the label here made LEADS and
        // REPORTS & ANALYTICS overflow past the w-20 sidebar.
        if (isCollapsed) {
            return (
                <div className="mb-2 flex justify-center">
                    <Link
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        title={group.title}
                        className={`p-2.5 rounded-xl transition-all ${
                            isChildActive
                                ? "bg-purple-100 text-purple-700 shadow-2xs"
                                : "text-gray-500 hover:text-purple-700 hover:bg-purple-50"
                        }`}
                    >
                        <group.icon size={20} />
                    </Link>
                </div>
            );
        }

        return (
            <div className="mb-1">
                <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    title={group.title}
                    className={`w-full flex items-center justify-start gap-3 px-3.5 py-2.5 rounded-2xl font-bold text-xs tracking-wider transition-colors ${
                        isChildActive
                            ? "bg-purple-50/70 text-purple-900"
                            : "text-gray-700 hover:text-purple-700 hover:bg-purple-50/40"
                    }`}
                >
                    <group.icon size={17} className={`shrink-0 ${isChildActive ? "text-purple-600" : "text-purple-400"}`} />
                    <span className="text-left leading-tight whitespace-nowrap">{group.title}</span>
                </Link>
            </div>
        );
    }

    if (isCollapsed) {
        return (
            <div className="mb-2 flex justify-center">
                <Link
                    href={visibleItems[0]?.href || "/dashboard"}
                    title={group.title}
                    className={`p-2.5 rounded-xl transition-all ${
                        isChildActive
                            ? "bg-purple-100 text-purple-700 shadow-2xs"
                            : "text-gray-500 hover:text-purple-700 hover:bg-purple-50"
                    }`}
                >
                    <group.icon size={20} />
                </Link>
            </div>
        );
    }

    return (
        <div className="mb-1">
            <button 
                onClick={() => setUserToggled(!isExpanded)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-bold text-xs tracking-wider transition-colors text-left ${
                    isChildActive ? "text-purple-900" : "text-gray-700 hover:text-purple-700 hover:bg-purple-50/40"
                }`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <group.icon size={17} className={`shrink-0 ${isChildActive ? "text-purple-600" : "text-purple-400"}`} />
                    <span className="whitespace-nowrap">{group.title}</span>
                </div>
                {isExpanded ? (
                    <ChevronDown size={14} className="text-gray-400 shrink-0" />
                ) : (
                    <ChevronRight size={14} className="text-gray-400 shrink-0" />
                )}
            </button>
            
            {isExpanded && (
                <div className="mt-1 ml-4 pl-3 flex flex-col gap-1 border-l-2 border-purple-100">
                    {visibleItems.map(item => {
                        const isActive = item.href === "/dashboard" ? pathname === "/dashboard" : pathname === item.href;
                        return (
                            <Link 
                                key={item.href}
                                href={item.href}
                                onClick={() => setIsOpen(false)}
                                className={`block px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                                    isActive 
                                    ? "bg-purple-100/70 text-purple-700 shadow-2xs" 
                                    : "text-gray-600 hover:text-purple-700 hover:bg-purple-50/50"
                                }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const emptySubscribe = () => () => {};

export default function AppSidebar({ isOpen, setIsOpen, collapsed = false, onBrandClick }) {
    const pathname = usePathname();
    const { logout } = useAuth();
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    if (!mounted) {
        return <div className={`${collapsed ? "w-20" : "w-70"} border-r border-purple-50 crm-chrome hidden lg:block`} />;
    }

    return (
        <>
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-gray-900/30 backdrop-blur-xs z-40 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <aside className={`fixed inset-y-0 left-0 z-50 ${collapsed ? "w-20" : "w-70"} crm-chrome border-r border-purple-50 flex flex-col transition-all duration-300 lg:translate-x-0 lg:static ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
                {/* Brand Logo Header */}
                <div className={`h-18 flex items-center ${collapsed ? "justify-center px-2" : "justify-between px-5"} shrink-0`}>
                    <button
                        type="button"
                        onClick={onBrandClick}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className="flex items-center gap-3 text-left"
                    >
                        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                            <Image 
                                src="/images/spaceezy-logo.webp" 
                                alt="Spaceezy" 
                                width={40} 
                                height={40} 
                                className="w-full h-full object-contain"
                            />
                        </div>
                        {!collapsed && (
                            <span className="text-lg font-black text-purple-700 tracking-tight whitespace-nowrap">
                                Spaceezy CRM
                            </span>
                        )}
                    </button>
                    <button onClick={() => setIsOpen(false)} className="lg:hidden p-1 text-gray-500 hover:bg-gray-100 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                {/* Nav Links */}
                <div className="flex-1 overflow-y-auto py-2 px-3 custom-scrollbar">
                    {NAVIGATION_GROUPS.map(group => (
                        <NavGroup 
                            key={group.title} 
                            group={group} 
                            pathname={pathname} 
                            setIsOpen={setIsOpen} 
                            isCollapsed={collapsed}
                        />
                    ))}
                </div>

                {/* Sign Out bottom card */}
                <div className="p-4 shrink-0">
                    <button 
                        onClick={logout}
                        title="Sign Out"
                        className={`w-full flex items-center justify-center gap-2 ${collapsed ? "p-2.5" : "px-4 py-2.5"} rounded-2xl font-bold text-xs text-purple-700 bg-purple-50/80 border border-purple-100 hover:bg-purple-100 transition-all shadow-2xs`}
                    >
                        <LogOut size={15} className="rotate-180 shrink-0" />
                        {!collapsed && <span>Sign Out</span>}
                    </button>
                </div>
            </aside>
        </>
    );
}
