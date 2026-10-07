"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchUsers } from "../../../../lib/api/users";
import { useProductivity } from "../../../../features/communication/hooks/useCommunication";
import { UserCheck, Phone, CalendarCheck } from "lucide-react";

export default function AgentAvailabilityPage() {
    const { data: usersRes, isLoading, error, refetch } = useQuery({
        queryKey: ["users", "availability"],
        queryFn: () => fetchUsers({ limit: 50 }),
        retry: 1
    });

    const { data: stats } = useProductivity();

    const employees = Array.isArray(usersRes) ? usersRes : usersRes?.users || [];
    const statsByUser = {};
    (stats?.employees || []).forEach((emp) => {
        statsByUser[emp.id] = emp;
    });

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Sales Agent Telephony Availability</h1>
                <p className="text-sm text-gray-500">
                    Live agent roster with today&apos;s real call and follow-up activity from the CRM.
                </p>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm flex items-center justify-between gap-3">
                    <span>
                        {error?.status === 403
                            ? "You do not have permission to view the team roster"
                            : error?.status === 401
                                ? "Session expired. Please sign in again."
                                : `Failed to load agents: ${error?.message}`}
                    </span>
                    <button onClick={() => refetch()} className="font-bold underline shrink-0">Retry</button>
                </div>
            )}

            {isLoading ? (
                <p className="text-sm text-gray-400">Loading agents...</p>
            ) : employees.length === 0 ? (
                <p className="text-sm text-gray-400">No employees found.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {employees.map((emp) => {
                        const empStats = statsByUser[emp.id];
                        return (
                            <div key={emp.id} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold shrink-0">
                                            <UserCheck size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-gray-900 text-sm truncate">{emp.name}</h3>
                                            <p className="text-xs text-gray-400 truncate">
                                                {String(emp.role || "").replace(/_/g, " ").toLowerCase()}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="bg-gray-50 text-gray-600 border border-gray-100 text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0">
                                        {String(emp.status || "ACTIVE").toLowerCase()}
                                    </span>
                                </div>
                                <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs font-semibold">
                                    <span className="flex items-center gap-1.5 text-gray-500">
                                        <Phone size={12} className="text-purple-500" /> Calls:
                                        <span className="text-gray-900 font-bold">{empStats ? empStats.connectedCalls : "—"}</span>
                                    </span>
                                    <span className="flex items-center gap-1.5 text-gray-500">
                                        <CalendarCheck size={12} className="text-emerald-500" /> Follow-ups:
                                        <span className="text-gray-900 font-bold">{empStats ? empStats.followupsCompleted : "—"}</span>
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
