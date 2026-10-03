"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { 
    Filter, RefreshCw, ChevronDown, Users, 
    CalendarCheck, FileCheck, IndianRupee, 
    BarChart3, Clock, AlertCircle, PhoneCall 
} from "lucide-react";

export default function DashboardOverview() {
    const { user } = useAuth();
    const router = useRouter();
    const normalizedRole = String(user?.role ?? "").toUpperCase();
    const isOwnerRole = normalizedRole === "ADMIN" || normalizedRole === "SUPER_ADMIN";

    useEffect(() => {
        if (user && !isOwnerRole) {
            router.replace("/dashboard/employee");
        }
    }, [user, isOwnerRole, router]);

    if (!isOwnerRole) {
        return null;
    }

    return (
        <div className="flex h-full overflow-hidden bg-gray-50/50">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Owner Overview</h1>
                    <p className="text-sm text-gray-500 mt-1">Live metrics will appear once the backend reporting endpoints are connected.</p>
                </div>

                <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                        <BarChart3 size={22} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">No live dashboard data available</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        The CRM is intentionally showing an empty state until real analytics data is available from the backend.
                    </p>
                </div>
            </div>
        </div>
    );
}

function BarRow({ label, value, max, color }) {
    const width = Math.round((value / max) * 100);
    return (
        <div className="flex items-center gap-3">
            <div className="w-32 shrink-0 text-sm font-medium text-gray-700 truncate">{label}</div>
            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }}></div>
            </div>
            <div className="w-12 text-right text-sm font-bold text-gray-900">{value}</div>
        </div>
    );
}

function PerfMetric({ label, value }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
            <span className="text-xl font-bold text-gray-900">{value}</span>
        </div>
    );
}

function AgendaItem({ title, subtitle, time, type, urgent }) {
    const icons = {
        call: PhoneCall,
        task: FileCheck,
        visit: CalendarCheck
    };
    const Icon = icons[type];
    
    return (
        <div className={`p-3 rounded-xl border ${urgent ? 'border-red-100 bg-red-50/50' : 'border-gray-100 bg-white shadow-sm'} flex items-start gap-3`}>
            <div className={`mt-0.5 p-1.5 rounded-lg ${urgent ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                    <p className="text-sm font-bold text-gray-900 truncate">{title}</p>
                    <span className={`text-[10px] font-bold shrink-0 ${urgent ? 'text-red-500' : 'text-gray-500'}`}>{time}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
            </div>
        </div>
    );
}

function AgentAvail({ name, state, color }) {
    return (
        <div className="flex items-center justify-between text-sm bg-white border border-gray-100 p-2 rounded-lg">
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${color}`}></div>
                <span className="font-medium text-gray-700">{name}</span>
            </div>
            <span className="text-xs text-gray-500 font-medium">{state}</span>
        </div>
    );
}
