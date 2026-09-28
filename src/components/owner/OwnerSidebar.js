// src/components/owner/OwnerSidebar.js
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Home, Users, Building, Calendar, FileText, BarChart2, UserCog, Menu, X, LogOut } from "lucide-react";
import { logout } from "../../lib/auth";
import { getLeads, getProperties, getEmployees } from "../../lib/store";
import QuickSearch from "../shared/QuickSearch";

export default function OwnerSidebar() {
    const [isOpen, setIsOpen] = useState(false);
    const [searchIndex, setSearchIndex] = useState([]);
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        const leads = getLeads().map((l) => ({ label: l.name, sublabel: `${l.project} · ${l.stage}`, type: "Lead", href: "/owner/leads" }));
        const properties = getProperties().map((p) => ({ label: p.name, sublabel: p.address, type: "Property", href: "/owner/properties" }));
        const employees = getEmployees().map((e) => ({ label: e.name, sublabel: e.role, type: "Team", href: `/owner/team/${e.id}` }));
        setSearchIndex([...leads, ...properties, ...employees]);
    }, []);

    const navItems = [
        { icon: Home, label: "Overview", href: "/owner" },
        { icon: Users, label: "Lead Pipeline", href: "/owner/leads" },
        { icon: Building, label: "Properties", href: "/owner/properties" },
        { icon: UserCog, label: "Team", href: "/owner/team" },
        { icon: Calendar, label: "Site Visits", href: "/owner/site-visits" },
        { icon: FileText, label: "Bookings", href: "/owner/bookings" },
        { icon: BarChart2, label: "Reports", href: "/owner/reports" },
    ];

    const handleLogout = () => {
        logout();
        router.push("/login");
    };

    return (
        <>
            <div className="md:hidden flex justify-between items-center bg-[#F3F5F9] p-4 absolute top-0 w-full z-50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center"><div className="w-3 h-3 bg-white rounded-full"></div></div>
                    <span className="font-bold text-xl text-gray-900">SpaceEzy</span>
                </div>
                <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-gray-600">
                    {isOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            <aside className={`${isOpen ? "flex" : "hidden"} md:flex w-full md:w-[260px] bg-[#F3F5F9] p-8 flex-col h-full shrink-0 z-40 absolute md:relative`}>
                <div className="hidden md:flex items-center gap-3 mb-12">
                    <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center"><div className="w-3 h-3 bg-white rounded-full"></div></div>
                    <span className="font-bold text-xl text-gray-900 tracking-tight">SpaceEzy</span>
                </div>

                <nav className="flex flex-col gap-1 mb-10">
                    {navItems.map((item, idx) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={idx}
                                href={item.href}
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-medium transition-all ${isActive
                                    ? "bg-white text-gray-900 shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
                                    : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
                                    }`}
                            >
                                <item.icon className="w-[18px] h-[18px]" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto flex flex-col gap-4">
                    <QuickSearch items={searchIndex} placeholder="Search leads, properties, team..." />

                    <button onClick={handleLogout} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-white hover:text-gray-900 transition-colors">
                        <LogOut size={16} /> Log out
                    </button>
                </div>
            </aside>
        </>
    );
}