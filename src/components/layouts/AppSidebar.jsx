"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
    LogOut, X, LayoutDashboard, Users, Home, ClipboardList, 
    Calendar, PhoneCall, ListTodo,
    BarChart3, Megaphone, Settings, ChevronDown, ChevronRight 
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
            { label: "Workflow Rules", href: "/dashboard/admin/workflows" },
            { label: "Integrations", href: "/dashboard/admin/integrations" },
            { label: "Location Management", href: "/dashboard/admin/locations" },
            { label: "Audit Logs", href: "/dashboard/admin/audit" }
        ]
    }
];

// Nested menu item component
function NavGroup({ group, pathname, setIsOpen }) {
    const [userToggled, setUserToggled] = useState(null);

    if (group.href) {
        const isActive = group.href === "/dashboard" 
            ? pathname === "/dashboard" 
            : pathname === group.href || pathname.startsWith(group.href + "/");
        return (
            <div className="mb-2">
                <Link 
                    href={group.href}
                    onClick={() => setIsOpen(false)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-all ${
                        isActive ? "bg-purple-50 text-purple-700 font-semibold shadow-xs" : "text-gray-700 hover:bg-gray-50"
                    }`}
                >
                    <div className="flex items-center gap-3">
                        <group.icon size={18} className={isActive ? "text-purple-600" : "text-gray-400"} />
                        <span className="text-sm">{group.title}</span>
                    </div>
                </Link>
            </div>
        );
    }

    // Check if any child route is active to keep the group open
    const isChildActive = (group.items || []).some(item => 
        item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)
    );
    
    const isExpanded = userToggled !== null ? userToggled : isChildActive;

    return (
        <div className="mb-2">
            <button 
                onClick={() => setUserToggled(!isExpanded)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-all ${
                    isChildActive && !isExpanded ? "bg-purple-50 text-purple-700" : "text-gray-700 hover:bg-gray-50"
                }`}
            >
                <div className="flex items-center gap-3">
                    <group.icon size={18} className={isChildActive ? "text-purple-600" : "text-gray-400"} />
                    <span className="text-sm">{group.title}</span>
                </div>
                {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            </button>
            
            {isExpanded && (
                <div className="mt-1 ml-4 pl-4 border-l border-gray-100 flex flex-col gap-1">
                    {group.items.map(item => {
                        const isActive = item.href === "/dashboard" ? pathname === "/dashboard" : pathname === item.href;
                        return (
                            <Link 
                                key={item.href}
                                href={item.href}
                                onClick={() => setIsOpen(false)}
                                className={`block px-3 py-2 rounded-lg text-sm transition-all ${
                                    isActive 
                                    ? "bg-purple-50 text-purple-700 font-semibold" 
                                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
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

export default function AppSidebar({ isOpen, setIsOpen, collapsed = false }) {
    const pathname = usePathname();
    const { logout } = useAuth();
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    if (!mounted) return <div className={`w-72 border-r border-gray-100 bg-white ${collapsed ? "hidden" : "hidden lg:block"}`} />; 

    return (
        <>
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-100 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static ${isOpen ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "lg:hidden" : ""}`}>
                <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 shrink-0">
                    <Link href="/dashboard" className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600">
                        Spaceezy CRM
                    </Link>
                    <button onClick={() => setIsOpen(false)} className="lg:hidden p-1 text-gray-500 hover:bg-gray-100 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-4 custom-scrollbar">
                    {NAVIGATION_GROUPS.map(group => (
                        <NavGroup 
                            key={group.title} 
                            group={group} 
                            pathname={pathname} 
                            setIsOpen={setIsOpen} 
                        />
                    ))}
                </div>

                <div className="p-4 border-t border-gray-100 shrink-0 bg-gray-50/50">
                    <button 
                        onClick={logout}
                        className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-gray-700 bg-white border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm"
                    >
                        <LogOut size={18} />
                        Sign Out
                    </button>
                </div>
            </aside>
        </>
    );
}
