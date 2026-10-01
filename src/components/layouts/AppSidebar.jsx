"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "../../features/auth/hooks/usePermissions";
import { 
    LogOut, X, LayoutDashboard, Users, Home, ClipboardList, 
    Briefcase, Calendar, FileText, PhoneCall, ListTodo,
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
            { label: "All Leads", href: "/dashboard/leads" },
            { label: "Add New Lead", href: "/dashboard/leads/new" },
            { label: "Re-engaged Leads", href: "/dashboard/leads/re-engaged" },
            { label: "Lead Assignment", href: "/dashboard/leads/assignment" },
            { label: "Import Leads", href: "/dashboard/leads/import" },
            { label: "Duplicate Leads", href: "/dashboard/leads/duplicates" },
            { label: "Follow-ups", href: "/dashboard/leads/follow-ups" },
            { label: "Lead Activities", href: "/dashboard/leads/activities" },
            { label: "Untouched Leads", href: "/dashboard/leads/untouched" }
        ]
    },
    {
        title: "CALLING & COMM",
        icon: PhoneCall,
        items: [
            { label: "Call History", href: "/dashboard/calling/history" },
            { label: "Call Recordings", href: "/dashboard/calling/recordings" },
            { label: "Missed Calls", href: "/dashboard/calling/missed" },
            { label: "Callback Queue", href: "/dashboard/calling/queue" },
            { label: "Browser Softphone", href: "/dashboard/calling/softphone" },
            { label: "Agent Availability", href: "/dashboard/calling/availability" },
            { label: "WhatsApp", href: "/dashboard/calling/whatsapp" },
            { label: "Email/SMS History", href: "/dashboard/calling/messages" }
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
            { label: "Bulk Import", href: "/dashboard/inventory/import" },
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
            { label: "Calendar", href: "/dashboard/site-visits/calendar" },
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
            { label: "Documents", href: "/dashboard/bookings/documents" },
            { label: "Cancellations", href: "/dashboard/bookings/cancellations" }
        ]
    },
    {
        title: "REPORTS & ANALYTICS",
        icon: BarChart3,
        items: [
            { label: "Lead Reports", href: "/dashboard/reports/leads" },
            { label: "Sales Performance", href: "/dashboard/reports/sales" },
            { label: "Site Visit Reports", href: "/dashboard/reports/site-visits" },
            { label: "Inventory Reports", href: "/dashboard/reports/inventory" },
            { label: "Booking Reports", href: "/dashboard/reports/bookings" },
            { label: "Custom Reports", href: "/dashboard/reports/custom" }
        ]
    },
    {
        title: "MARKETING",
        icon: Megaphone,
        items: [
            { label: "Lead Sources", href: "/dashboard/marketing/sources" },
            { label: "Campaigns", href: "/dashboard/marketing/campaigns" },
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
            { label: "Audit Logs", href: "/dashboard/admin/audit" }
        ]
    }
];

// Nested menu item component
function NavGroup({ group, pathname, setIsOpen }) {
    // Check if any child route is active to keep the group open
    const isChildActive = group.items.some(item => 
        item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)
    );
    
    const [userToggled, setUserToggled] = useState(null);
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

export default function AppSidebar({ isOpen, setIsOpen }) {
    const pathname = usePathname();
    const { logout } = useAuth();
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    if (!mounted) return <div className="w-72 border-r border-gray-100 bg-white hidden lg:block" />; 

    return (
        <>
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-100 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
                <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 shrink-0">
                    <Link href="/dashboard" className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600">
                        SpaceEzy CRM
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
