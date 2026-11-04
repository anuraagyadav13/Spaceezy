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

const NAVIGATION_GROUPS = [
    {
        title: "DASHBOARD",
        icon: LayoutDashboard,
        items: [
            { label: "Owner Overview", href: "/dashboard" },
            { label: "Employee Dashboard", href: "/dashboard/employee" },
            { label: "Today's Agenda", href: "/dashboard/agenda" },
            { label: "Productivity", href: "/dashboard/productivity" }
        ]
    },
    {
        title: "LEADS",
        icon: Users,
        items: [
            { label: "Leads", href: "/dashboard/leads" }
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
            { label: "WhatsApp", href: "/dashboard/calling/whatsapp" }
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
            { label: "Lead Sources", href: "/dashboard/marketing/sources" },
            { label: "Campaigns", href: "/dashboard/marketing/campaigns" },
            { label: "Meta Ads", href: "/dashboard/marketing/meta-ads" },
            { label: "Website Enquiries", href: "/dashboard/marketing/website" }
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
    const isChildActive = (group.items || []).some(item => 
        item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)
    );
    const [userToggled, setUserToggled] = useState(null);
    const isExpanded = userToggled !== null ? userToggled : (isChildActive || group.title === "DASHBOARD");

    if (isCollapsed) {
        return (
            <div className="mb-2 flex justify-center">
                <Link
                    href={group.items[0]?.href || "/dashboard"}
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
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-bold text-xs tracking-wider transition-colors ${
                    isChildActive ? "text-purple-900" : "text-gray-700 hover:text-purple-700 hover:bg-purple-50/40"
                }`}
            >
                <div className="flex items-center gap-3">
                    <group.icon size={17} className={isChildActive ? "text-purple-600" : "text-purple-400"} />
                    <span>{group.title}</span>
                </div>
                {isExpanded ? (
                    <ChevronDown size={14} className="text-gray-400" />
                ) : (
                    <ChevronRight size={14} className="text-gray-400" />
                )}
            </button>
            
            {isExpanded && (
                <div className="mt-1 ml-4 pl-3 flex flex-col gap-1 border-l-2 border-purple-100">
                    {group.items.map(item => {
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

export default function AppSidebar({ isOpen, setIsOpen, collapsed = false }) {
    const pathname = usePathname();
    const { logout } = useAuth();
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    if (!mounted) {
        return <div className={`${collapsed ? "w-20" : "w-64"} border-r border-purple-50 bg-white hidden lg:block`} />;
    }

    return (
        <>
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-gray-900/30 backdrop-blur-xs z-40 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <aside className={`fixed inset-y-0 left-0 z-50 ${collapsed ? "w-20" : "w-64"} bg-white border-r border-purple-50 flex flex-col transition-all duration-300 lg:translate-x-0 lg:static ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
                {/* Brand Logo Header */}
                <div className={`h-18 flex items-center ${collapsed ? "justify-center px-2" : "justify-between px-5"} shrink-0`}>
                    <Link href="/dashboard" className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                            <Image 
                                src="/images/spaceezy-logo.png" 
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
                    </Link>
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
