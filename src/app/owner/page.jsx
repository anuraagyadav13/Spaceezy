// src/app/owner/page.jsx  (Overview — /owner)
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import RightPanel from "../../components/owner/RightPanel";
import { getLeads, getDailyWork, getEmployees, getBookings } from "../../lib/store";

export default function OwnerOverviewPage() {
    const [activity, setActivity] = useState([]);

    useEffect(() => {
        const employees = getEmployees();
        const employeeName = (id) => employees.find((e) => e.id === id)?.name || "Someone";

        const leadEvents = getLeads().map((l) => ({
            date: l.createdAt,
            text: `${employeeName(l.assignedTo)} added a new lead — ${l.name}`,
        }));

        const workEvents = getDailyWork().flatMap((day) =>
            day.tasks.map((t) => ({
                date: day.date,
                text: `${employeeName(day.employeeId)} logged: ${t.title}`,
            }))
        );

        const bookingEvents = getBookings().map((b) => ({
            date: b.bookingDate,
            text: `${employeeName(b.assignedTo)} closed a booking — ${b.clientName} · ${b.property}`,
        }));

        const combined = [...leadEvents, ...workEvents, ...bookingEvents]
            .filter((e) => e.date)
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .slice(0, 6);

        setActivity(combined);
    }, []);

    return (
        <div className="flex flex-col h-full text-gray-900 pt-16 md:pt-0">
            {/* Top Navigation */}
            <header className="flex justify-end items-center px-8 py-6 gap-6">
                <nav className="hidden md:flex gap-6 bg-white px-2 py-1.5 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.03)] text-[13px] font-medium text-gray-500">
                    <Link href="/owner" className="bg-gray-900 text-white px-6 py-2 rounded-full">Overview</Link>
                    <Link href="/owner/leads" className="px-4 py-2 hover:text-gray-900">Leads</Link>
                    <Link href="/owner/properties" className="px-4 py-2 hover:text-gray-900">Properties</Link>
                    <Link href="/owner/team" className="px-4 py-2 hover:text-gray-900">Team</Link>
                    <Link href="/owner/finance" className="px-4 py-2 hover:text-gray-900">Finance</Link>
                </nav>
                <img src="https://i.pravatar.cc/100?img=33" className="w-10 h-10 rounded-full border border-gray-200 shadow-sm" />
            </header>

            <div className="flex flex-col xl:flex-row px-8 gap-8 flex-1">
                <div className="flex-1 flex flex-col gap-6">

                    {/* Row 1: Metrics */}
                    <div className="bg-white rounded-[24px] p-6 flex flex-wrap justify-between shadow-[0_2px_15px_rgba(0,0,0,0.02)] gap-6">
                        <div>
                            <p className="text-[13px] text-gray-500 mb-1">Pipeline Revenue</p>
                            <h2 className="text-[28px] font-normal tracking-tight text-gray-900">₹8.5 Cr</h2>
                            <p className="text-[11px] text-gray-400 mt-1">Expected this quarter</p>
                        </div>
                        <div>
                            <p className="text-[13px] text-gray-500 mb-1">Collected</p>
                            <h2 className="text-[28px] font-normal tracking-tight text-gray-900">₹1.2 Cr</h2>
                            <p className="text-[11px] text-gray-400 mt-1">This month</p>
                        </div>
                        <div>
                            <p className="text-[13px] text-gray-500 mb-1">New Bookings</p>
                            <h2 className="text-[28px] font-normal tracking-tight text-gray-900">12</h2>
                            <p className="text-[11px] text-gray-400 mt-1">Total pending</p>
                        </div>
                        <div>
                            <p className="text-[13px] text-gray-500 mb-1">Overdue Payments</p>
                            <h2 className="text-[28px] font-normal tracking-tight text-gray-900 flex items-center gap-2">
                                <span className="text-orange-500 border border-orange-200 bg-orange-50 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">!</span>
                                ₹18 L
                            </h2>
                            <p className="text-[11px] text-gray-400 mt-1">Action required</p>
                        </div>
                    </div>

                    {/* Row 2: Tasks & Follow-ups */}
                    <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-medium text-[15px] text-gray-900">Today's Tasks & Follow-ups</h3>
                            <button className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100">↗</button>
                        </div>
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between text-[13px] pb-4 border-b border-gray-50">
                                <span className="text-gray-500 w-20">LEAD-1021</span>
                                <span className="w-32 font-medium">Alpha Residency</span>
                                <span className="w-32 text-gray-500">Site Visit</span>
                                <div className="flex items-center gap-2 w-40">
                                    <img src="https://i.pravatar.cc/100?img=5" className="w-6 h-6 rounded-full" />
                                    <span className="font-medium">Addie Bradford</span>
                                </div>
                                <span className="text-gray-500 w-24 text-right">11:30 AM</span>
                                <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-lg text-[11px] font-bold w-20 text-center">Scheduled</span>
                            </div>
                            <div className="flex items-center justify-between text-[13px] pb-2">
                                <span className="text-gray-500 w-20">LEAD-1089</span>
                                <span className="w-32 font-medium">Downtown Office</span>
                                <span className="w-32 text-gray-500">Call Follow-up</span>
                                <div className="flex items-center gap-2 w-40">
                                    <img src="https://i.pravatar.cc/100?img=9" className="w-6 h-6 rounded-full" />
                                    <span className="font-medium">Cora Williams</span>
                                </div>
                                <span className="text-gray-500 w-24 text-right">SLA Breached</span>
                                <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-lg text-[11px] font-bold w-20 text-center">Urgent</span>
                            </div>
                        </div>
                    </div>

                    {/* Row 3: Hot Leads */}
                    <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-medium text-[15px] text-gray-900">Hot Leads</h3>
                            <button className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100">↗</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-4 rounded-2xl bg-[#F8F9FB]">
                                <div className="flex gap-3 items-center mb-3">
                                    <img src="https://i.pravatar.cc/100?img=20" className="w-8 h-8 rounded-full" />
                                    <div><p className="text-[13px] font-medium text-gray-900">Sapphire Holloway</p><p className="text-[11px] text-gray-500">Budget: ₹1.5 Cr</p></div>
                                </div>
                                <p className="text-[12px] text-gray-500 leading-relaxed">Looking for a 3BHK ready-to-move apartment in South Delhi.</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#F8F9FB]">
                                <div className="flex gap-3 items-center mb-3">
                                    <img src="https://i.pravatar.cc/100?img=15" className="w-8 h-8 rounded-full" />
                                    <div><p className="text-[13px] font-medium text-gray-900">Jakub Tucker</p><p className="text-[11px] text-gray-500">Budget: ₹80 L</p></div>
                                </div>
                                <p className="text-[12px] text-gray-500 leading-relaxed">Interested in commercial spaces. Requested a site visit tomorrow.</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#F8F9FB]">
                                <div className="flex gap-3 items-center mb-3">
                                    <img src="https://i.pravatar.cc/100?img=12" className="w-8 h-8 rounded-full" />
                                    <div><p className="text-[13px] font-medium text-gray-900">Diana Hess</p><p className="text-[11px] text-gray-500">Budget: ₹2.2 Cr</p></div>
                                </div>
                                <p className="text-[12px] text-gray-500 leading-relaxed">Negotiating final price for Greenwood Villas. Pre-approved loan.</p>
                            </div>
                        </div>
                    </div>

                    {/* Row 4: Team Activity — new: rolls up leads, daily work and bookings from every employee */}
                    <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-medium text-[15px] text-gray-900">Team Activity</h3>
                            <Link href="/owner/team" className="text-xs font-medium text-purple-600 hover:text-purple-800">View team</Link>
                        </div>
                        <div className="flex flex-col gap-3">
                            {activity.map((a, i) => (
                                <div key={i} className="flex items-center justify-between text-[13px] pb-3 border-b border-gray-50 last:border-0">
                                    <span className="text-gray-700">{a.text}</span>
                                    <span className="text-gray-400 text-xs shrink-0 ml-4">{a.date}</span>
                                </div>
                            ))}
                            {activity.length === 0 && <p className="text-sm text-gray-400">No activity yet.</p>}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <RightPanel />
            </div>
        </div>
    );
}