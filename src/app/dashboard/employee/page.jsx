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
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name || "Employee"}</h1>
                    <p className="text-sm text-gray-500 mt-1">Your live personal dashboard will appear once assigned work is available in the backend.</p>
                </div>

                <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                        <Users size={22} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">No live employee data available</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        This dashboard intentionally stays blank until real leads, follow-ups, and assignments are loaded from the backend.
                    </p>
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
