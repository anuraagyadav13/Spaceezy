// src/app/owner/reports/page.jsx  (/owner/reports)
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeads, getBookings, getProperties, getEmployees } from "../../../lib/store";

const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "SITE VISIT", "NEGOTIATION", "BOOKING"];
const PAYMENT_STATES = ["Paid", "Partial", "Pending"];
const PAYMENT_COLORS = { Paid: "bg-emerald-500", Partial: "bg-orange-400", Pending: "bg-gray-300" };

export default function OwnerReportsPage() {
    const [leads, setLeads] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [properties, setProperties] = useState([]);
    const [employees, setEmployees] = useState([]);

    useEffect(() => {
        setLeads(getLeads());
        setBookings(getBookings());
        setProperties(getProperties());
        setEmployees(getEmployees());
    }, []);

    const totalLeads = leads.length;
    const bookedLeads = leads.filter((l) => l.stage === "BOOKING").length;
    const conversionRate = totalLeads ? Math.round((bookedLeads / totalLeads) * 100) : 0;

    const totalUnits = properties.reduce((sum, p) => sum + (p.totalUnits || 0), 0);
    const occupiedUnits = properties.reduce((sum, p) => sum + (p.occupiedUnits || 0), 0);
    const occupancyRate = totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    const leaderboard = employees
        .map((emp) => ({ ...emp, leadCount: leads.filter((l) => l.assignedTo === emp.id).length }))
        .sort((a, b) => b.leadCount - a.leadCount);

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <header className="hidden md:flex justify-end items-center px-8 py-5 gap-6 border-b border-gray-100 bg-white sticky top-0 z-20">
                <nav className="flex gap-8 font-medium text-[13px] text-gray-400">
                    <Link href="/owner" className="py-2 hover:text-purple-600 transition-colors">Overview</Link>
                    <Link href="/owner/leads" className="py-2 hover:text-purple-600 transition-colors">Leads</Link>
                    <Link href="/owner/properties" className="py-2 hover:text-purple-600 transition-colors">Properties</Link>
                    <Link href="/owner/team" className="py-2 hover:text-purple-600 transition-colors">Team</Link>
                    <Link href="/owner/site-visits" className="py-2 hover:text-purple-600 transition-colors">Site Visits</Link>
                    <Link href="/owner/bookings" className="py-2 hover:text-purple-600 transition-colors">Bookings</Link>
                    <Link href="/owner/reports" className="bg-purple-600 text-white px-5 py-2 rounded-full shadow-sm shadow-purple-200">Reports</Link>
                </nav>
                <div className="w-10 h-10 rounded-full border-2 border-purple-100 overflow-hidden cursor-pointer hover:border-purple-400 transition-colors">
                    <img src="https://i.pravatar.cc/100?img=33" alt="Profile" className="w-full h-full object-cover" />
                </div>
            </header>

            <div className="px-4 sm:px-8 py-6 pt-16 md:pt-6">
                <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
                <p className="text-sm text-gray-500 mt-1">A live snapshot of the business, computed from your current data.</p>
            </div>

            <div className="px-4 sm:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                    <p className="text-xs text-gray-500 mb-1">Total Leads</p>
                    <h3 className="text-2xl font-normal text-gray-900">{totalLeads}</h3>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                    <p className="text-xs text-gray-500 mb-1">Lead → Booking Rate</p>
                    <h3 className="text-2xl font-normal text-gray-900">{conversionRate}%</h3>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                    <p className="text-xs text-gray-500 mb-1">Total Bookings</p>
                    <h3 className="text-2xl font-normal text-gray-900">{bookings.length}</h3>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                    <p className="text-xs text-gray-500 mb-1">Portfolio Occupancy</p>
                    <h3 className="text-2xl font-normal text-gray-900">{occupancyRate}%</h3>
                </div>
            </div>

            <div className="px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <h3 className="font-medium text-[15px] text-gray-900 mb-6">Lead Pipeline by Stage</h3>
                    <div className="flex flex-col gap-4">
                        {STAGES.map((stage) => {
                            const count = leads.filter((l) => l.stage === stage).length;
                            const pct = totalLeads ? Math.round((count / totalLeads) * 100) : 0;
                            return (
                                <div key={stage}>
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                        <span className="font-medium text-gray-700">{stage}</span>
                                        <span>{count}</span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <h3 className="font-medium text-[15px] text-gray-900 mb-6">Team Leaderboard</h3>
                    <div className="flex flex-col gap-4">
                        {leaderboard.map((emp, idx) => (
                            <Link key={emp.id} href={`/owner/team/${emp.id}`} className="flex items-center gap-3 hover:bg-gray-50 -mx-2 px-2 py-1 rounded-xl transition-colors">
                                <span className="text-xs font-bold text-gray-300 w-4">{idx + 1}</span>
                                <img src={emp.avatar} className="w-8 h-8 rounded-full" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{emp.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{emp.role}</p>
                                </div>
                                <span className="text-sm font-bold text-purple-600 shrink-0">{emp.leadCount} leads</span>
                            </Link>
                        ))}
                        {leaderboard.length === 0 && <p className="text-sm text-gray-400">No team members yet.</p>}
                    </div>
                </div>
            </div>

            <div className="px-4 sm:px-8 pb-8">
                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <h3 className="font-medium text-[15px] text-gray-900 mb-6">Bookings by Payment Status</h3>
                    <div className="flex flex-col gap-4">
                        {PAYMENT_STATES.map((state) => {
                            const count = bookings.filter((b) => b.paymentStatus === state).length;
                            const pct = bookings.length ? Math.round((count / bookings.length) * 100) : 0;
                            return (
                                <div key={state}>
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                        <span className="font-medium text-gray-700">{state}</span>
                                        <span>{count} booking{count === 1 ? "" : "s"}</span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${PAYMENT_COLORS[state]}`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                        {bookings.length === 0 && <p className="text-sm text-gray-400">No bookings yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}