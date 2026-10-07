"use client";
import Link from "next/link";
import { useProductivity } from "../../../features/communication/hooks/useCommunication";
import { ArrowRight } from "lucide-react";

export default function ProductivityPage() {
    const { data: stats, isLoading, error } = useProductivity();

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">Loading productivity metrics...</div>;
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-gray-700 font-bold mb-1">
                    {error?.status === 403
                        ? "You do not have permission to view productivity metrics"
                        : error?.status === 401
                            ? "Session expired. Please sign in again."
                            : "Failed to load productivity metrics"}
                </p>
                <p className="text-sm text-gray-500">{error?.message}</p>
            </div>
        );
    }

    const employees = stats?.employees || [];
    const avgTalk = stats && stats.connectedCalls > 0
        ? Math.round((stats.callDurationSeconds || 0) / stats.connectedCalls)
        : 0;

    const ownCards = stats ? [
        { label: "Calls (period)", value: stats.calls ?? 0, tone: "text-gray-900" },
        { label: "Avg Talk Time", value: avgTalk ? `${avgTalk}s` : "—", tone: "text-purple-700" },
        { label: "Follow-ups Completed", value: stats.followupsCompleted ?? 0, tone: "text-emerald-600" },
        { label: "Overdue Follow-ups", value: stats.overdueFollowups ?? 0, tone: "text-red-600" },
        { label: "Tasks Completed", value: stats.tasksCompleted ?? 0, tone: "text-blue-600" },
        { label: "WhatsApp Sent", value: stats.whatsappMessages ?? 0, tone: "text-green-600" },
        { label: "Site Visits", value: stats.siteVisits ?? 0, tone: "text-indigo-600" },
        { label: "Quotations", value: stats.quotations ?? 0, tone: "text-orange-600" }
    ] : [];

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Productivity &amp; Performance Metrics</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Real aggregates from the backend — no fabricated numbers.
                        {stats?.range ? ` Period: ${new Date(stats.range.from).toLocaleDateString()} – ${new Date(stats.range.to).toLocaleDateString()}` : ""}
                    </p>
                </div>
                <Link href="/dashboard" className="text-xs font-bold text-purple-600 hover:underline flex items-center gap-1">
                    Owner overview <ArrowRight size={12} />
                </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {ownCards.map((card) => (
                    <div key={card.label} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                        <p className="text-xs font-bold text-gray-400 uppercase">{card.label}</p>
                        <p className={`text-2xl font-black mt-1 ${card.tone}`}>{card.value}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">
                        {employees.length > 0 ? "Employee Leaderboard" : "Your Performance"}
                    </h2>
                    {stats?.needsAttention != null && (
                        <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-lg">
                            {stats.needsAttention} leads need attention
                        </span>
                    )}
                </div>

                {employees.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                        {employees.map((emp, idx) => (
                            <div key={emp.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                                        #{idx + 1}
                                    </span>
                                    <div>
                                        <p className="font-bold text-gray-900 text-sm">{emp.name}</p>
                                        <p className="text-xs text-gray-500">{String(emp.role || "").replace(/_/g, " ").toLowerCase()}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-4 text-xs font-bold">
                                    <span>Calls: {emp.calls}</span>
                                    <span>Connected: {emp.connectedCalls}</span>
                                    <span className="text-emerald-600">Follow-ups: {emp.followupsCompleted}</span>
                                    <span className={emp.overdueFollowups > 0 ? "text-red-600" : "text-gray-500"}>
                                        Overdue: {emp.overdueFollowups}
                                    </span>
                                    <span>Visits: {emp.siteVisits}</span>
                                    <span>Quotes: {emp.quotations}</span>
                                    <span>Bookings: {emp.bookings}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {ownCards.slice(0, 6).map((card) => (
                            <div key={card.label} className="py-3 flex items-center justify-between text-sm">
                                <span className="text-gray-600">{card.label}</span>
                                <span className={`font-black ${card.tone}`}>{card.value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
