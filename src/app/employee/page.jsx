// src/app/employee/page.jsx  (Overview — /employee)
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentEmployeeId } from "../../lib/auth";
import { getEmployeeById, getLeadsByEmployee, getClientsByEmployee, getFollowupsByEmployee, getSiteVisitsByEmployee } from "../../lib/store";
import { ArrowUpRight } from "lucide-react";

export default function EmployeeOverviewPage() {
    const [employee, setEmployee] = useState(null);
    const [leads, setLeads] = useState([]);
    const [clients, setClients] = useState([]);
    const [followups, setFollowups] = useState([]);
    const [siteVisits, setSiteVisits] = useState([]);

    useEffect(() => {
        const id = getCurrentEmployeeId();
        if (!id) return;
        setEmployee(getEmployeeById(id));
        setLeads(getLeadsByEmployee(id));
        setClients(getClientsByEmployee(id));
        setFollowups(getFollowupsByEmployee(id));
        setSiteVisits(getSiteVisitsByEmployee(id));
    }, []);

    const pendingFollowups = followups.filter((f) => f.status === "Pending");
    const upcomingVisits = siteVisits.filter((v) => v.status === "Scheduled");

    return (
        <div className="flex flex-col h-full text-gray-900 pt-16 md:pt-0">
            <header className="px-8 py-6">
                <h1 className="text-2xl font-bold text-gray-900">
                    {employee ? `Welcome back, ${employee.name.split(" ")[0]}` : "Welcome back"}
                </h1>
                <p className="text-gray-500 text-sm mt-1">Here&apos;s what&apos;s on your plate today.</p>
            </header>

            <div className="px-8 grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                    <p className="text-[13px] text-gray-500 mb-1">My Leads</p>
                    <h2 className="text-[28px] font-normal text-gray-900">{leads.length}</h2>
                </div>
                <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                    <p className="text-[13px] text-gray-500 mb-1">Active Clients</p>
                    <h2 className="text-[28px] font-normal text-gray-900">{clients.length}</h2>
                </div>
                <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                    <p className="text-[13px] text-gray-500 mb-1">Pending Follow-ups</p>
                    <h2 className="text-[28px] font-normal text-gray-900">{pendingFollowups.length}</h2>
                </div>
                <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                    <p className="text-[13px] text-gray-500 mb-1">Upcoming Visits</p>
                    <h2 className="text-[28px] font-normal text-gray-900">{upcomingVisits.length}</h2>
                </div>
            </div>

            <div className="px-8 grid grid-cols-1 xl:grid-cols-2 gap-6 flex-1">
                <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)] h-fit">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-medium text-[15px] text-gray-900">Upcoming Follow-ups</h3>
                        <Link href="/employee/followups" className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800">
                            View all <ArrowUpRight size={14} />
                        </Link>
                    </div>
                    <div className="flex flex-col gap-3">
                        {pendingFollowups.slice(0, 4).map((f) => (
                            <div key={f.id} className="flex items-center justify-between text-[13px] pb-3 border-b border-gray-50 last:border-0">
                                <span className="font-medium w-32 truncate">{f.refName}</span>
                                <span className="text-gray-500 w-24">{f.type}</span>
                                <span className="text-gray-400 text-xs shrink-0">{f.dueDate}</span>
                            </div>
                        ))}
                        {pendingFollowups.length === 0 && <p className="text-sm text-gray-400">No pending follow-ups. Nice work!</p>}
                    </div>
                </div>

                <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)] h-fit">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-medium text-[15px] text-gray-900">Upcoming Site Visits</h3>
                        <Link href="/employee/site-visits" className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800">
                            View all <ArrowUpRight size={14} />
                        </Link>
                    </div>
                    <div className="flex flex-col gap-3">
                        {upcomingVisits.slice(0, 4).map((v) => (
                            <div key={v.id} className="flex items-center justify-between text-[13px] pb-3 border-b border-gray-50 last:border-0">
                                <span className="font-medium w-32 truncate">{v.leadName}</span>
                                <span className="text-gray-500 w-28 truncate">{v.property}</span>
                                <span className="text-gray-400 text-xs shrink-0">{v.date} · {v.time}</span>
                            </div>
                        ))}
                        {upcomingVisits.length === 0 && <p className="text-sm text-gray-400">Nothing scheduled.</p>}
                    </div>
                </div>
            </div>

            <div className="px-8 mt-6 mb-2">
                <Link href="/employee/daily-work" className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                    Log Today&apos;s Work
                </Link>
            </div>
        </div>
    );
}