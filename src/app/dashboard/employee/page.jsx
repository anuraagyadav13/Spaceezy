"use client";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { 
    Users, Clock, CalendarCheck, FileCheck, PhoneCall,
    CheckSquare, AlertCircle, ArrowRight
} from "lucide-react";
import Link from "next/link";

export default function EmployeeDashboard() {
    const { user } = useAuth();

    return (
        <div className="flex h-full overflow-hidden bg-gray-50/50">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
                
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Good Morning, {user?.name || "Employee"}</h1>
                    <p className="text-sm text-gray-500 mt-1">Here is your daily agenda and sales pipeline.</p>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <StatCard label="My New Leads" value="12" icon={Users} color="text-blue-600 bg-blue-50" />
                    <StatCard label="Today's Follow-ups" value="8" icon={Clock} color="text-amber-600 bg-amber-50" />
                    <StatCard label="Site Visits Today" value="3" icon={CalendarCheck} color="text-purple-600 bg-purple-50" />
                    <StatCard label="Overdue Tasks" value="2" icon={AlertCircle} color="text-red-600 bg-red-50" />
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    
                    {/* Leads Section */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800">My Leads</h3>
                            <Link href="/dashboard/leads" className="text-sm font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1">
                                View All <ArrowRight size={14} />
                            </Link>
                        </div>
                        <div className="flex-1 flex flex-col gap-3">
                            <LeadItem name="Sapphire Holloway" stage="NEW" time="2h ago" />
                            <LeadItem name="Jakub Tucker" stage="CONTACTED" time="5h ago" />
                            <LeadItem name="Diana Hess" stage="NEGOTIATION" time="1d ago" />
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                            <button className="flex-1 py-2 text-sm font-bold bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors">Re-engaged (1)</button>
                            <button className="flex-1 py-2 text-sm font-bold bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors">Untouched (4)</button>
                        </div>
                    </div>

                    {/* Today's Agenda */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800">Today's Agenda</h3>
                        </div>
                        <div className="flex-1 flex flex-col gap-3">
                            <AgendaItem title="Call Rahul Sharma" subtitle="Follow-up on pricing" time="10:30 AM" type="call" />
                            <AgendaItem title="Site Visit: Alpha Res." subtitle="Vikram M." time="11:30 AM" type="visit" />
                            <AgendaItem title="Send Quotation" subtitle="Sneha Gupta" time="02:00 PM" type="task" />
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <button className="w-full py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-sm">
                                Start Calling Queue
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon: Icon, color }) {
    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <div className={`w-8 h-8 rounded-lg mb-3 flex items-center justify-center ${color}`}>
                <Icon size={16} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">{label}</p>
        </div>
    );
}

function LeadItem({ name, stage, time }) {
    return (
        <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
            <div>
                <p className="font-bold text-gray-900 text-sm">{name}</p>
                <p className="text-[10px] text-gray-500 font-bold uppercase">{time}</p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 px-2 py-1 rounded">
                {stage}
            </span>
        </div>
    );
}

function AgendaItem({ title, subtitle, time, type }) {
    const icons = { call: PhoneCall, task: CheckSquare, visit: CalendarCheck };
    const Icon = icons[type];
    
    return (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-white">
            <div className="mt-0.5 p-1.5 rounded-lg bg-gray-100 text-gray-600">
                <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                    <p className="text-sm font-bold text-gray-900 truncate">{title}</p>
                    <span className="text-[10px] font-bold text-gray-500 shrink-0">{time}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
            </div>
        </div>
    );
}
