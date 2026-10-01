"use client";
import { BarChart3, TrendingUp, Phone, CalendarCheck, Target, Award } from "lucide-react";
import { getEmployees } from "../../lib/store";

export default function ProductivityPage() {
    const employees = getEmployees();

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Productivity & Performance Metrics</h1>
                <p className="text-sm text-gray-500 mt-1">Track employee activity throughput, talk time, and conversion metrics.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase">Total Calls Made</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">142</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase">Avg Talk Time</p>
                    <p className="text-2xl font-black text-purple-700 mt-1">4.2 mins</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase">Site Visits Conducted</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1">18</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase">Overall Conversion</p>
                    <p className="text-2xl font-black text-blue-600 mt-1">16.4%</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">Employee Leaderboard</h2>
                <div className="divide-y divide-gray-100">
                    {employees.map((emp, idx) => (
                        <div key={emp.id} className="py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                                    #{idx + 1}
                                </span>
                                <div>
                                    <p className="font-bold text-gray-900 text-sm">{emp.name}</p>
                                    <p className="text-xs text-gray-500">{emp.role}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 text-xs font-bold">
                                <span>Calls: 48</span>
                                <span>Talk Time: 3h 15m</span>
                                <span className="text-emerald-600">Site Visits: 6</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
