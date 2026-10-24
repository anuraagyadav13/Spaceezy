"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../features/auth/hooks/useAuth";
import {
    PhoneCall, CheckSquare, AlertTriangle, MessageSquare,
    CalendarCheck, FileSignature, Home, Users, ArrowRight, Clock,
    CheckCircle2
} from "lucide-react";
import {
    useProductivity,
    useNeedsAttention,
    useAgenda
} from "../../features/communication/hooks/useCommunication";

export default function DashboardOverview() {
    const { user } = useAuth();
    const router = useRouter();
    const normalizedRole = String(user?.role ?? "").toUpperCase();
    const isOwnerRole = normalizedRole === "ADMIN" || normalizedRole === "SUPER_ADMIN";

    const { data: productivity, isLoading, error } = useProductivity({}, { enabled: isOwnerRole });
    const { data: needsAttention } = useNeedsAttention({}, { enabled: isOwnerRole });
    const { data: agenda } = useAgenda({}, { enabled: isOwnerRole });

    useEffect(() => {
        if (user && !isOwnerRole) {
            router.replace("/dashboard/employee");
        }
    }, [user, isOwnerRole, router]);

    if (!isOwnerRole) {
        return null;
    }

    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
                <span className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-purple-600 animate-spin" />
                <p className="text-sm font-medium text-gray-400">Loading owner overview...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-gray-700 font-bold mb-1">
                    {error?.status === 401
                        ? "Session expired. Please sign in again."
                        : "Failed to load dashboard analytics"}
                </p>
                <p className="text-sm text-gray-500">{error?.message}</p>
            </div>
        );
    }

    const stats = productivity || {};
    const employees = stats.employees || [];
    const counts = agenda?.counts || {};

    const cards = [
        { label: "Calls (30d)", value: stats.calls ?? 0, icon: PhoneCall, tone: "text-emerald-600 bg-emerald-50", href: "/dashboard/calling/calls?tab=history" },
        { label: "Connected", value: stats.connectedCalls ?? 0, icon: PhoneCall, tone: "text-blue-600 bg-blue-50", href: "/dashboard/calling/calls?tab=history" },
        { label: "Missed", value: stats.missedCalls ?? 0, icon: AlertTriangle, tone: "text-red-600 bg-red-50", href: "/dashboard/calling/calls?tab=missed", hot: "text-red-600" },
        { label: "WhatsApp Sent", value: stats.whatsappMessages ?? 0, icon: MessageSquare, tone: "text-green-600 bg-green-50", href: "/dashboard/calling/whatsapp" },
        { label: "Follow-ups Done", value: stats.followupsCompleted ?? 0, icon: CalendarCheck, tone: "text-indigo-600 bg-indigo-50", href: "/dashboard/agenda" },
        { label: "Overdue Follow-ups", value: stats.overdueFollowups ?? 0, icon: Clock, tone: "text-amber-600 bg-amber-50", href: "/dashboard/activities/overdue", hot: "text-amber-600" },
        { label: "Tasks Completed", value: stats.tasksCompleted ?? 0, icon: CheckSquare, tone: "text-sky-600 bg-sky-50", href: "/dashboard/activities/tasks" },
        { label: "Site Visits", value: stats.siteVisits ?? 0, icon: CalendarCheck, tone: "text-violet-600 bg-violet-50", href: "/dashboard/site-visits" },
        { label: "Quotations", value: stats.quotations ?? 0, icon: FileSignature, tone: "text-orange-600 bg-orange-50", href: "/dashboard/bookings/quotations" },
        { label: "Bookings", value: stats.bookings ?? 0, icon: Home, tone: "text-emerald-700 bg-emerald-100", href: "/dashboard/bookings" }
    ];

    return (
        <div className="flex h-full overflow-hidden bg-gray-50/50">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar space-y-8">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Owner Overview</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Real aggregates from calls, tasks, follow-ups and communications
                            {stats.range
                                ? ` · ${new Date(stats.range.from).toLocaleDateString()} to ${new Date(stats.range.to).toLocaleDateString()}`
                                : ""}.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                        <Link
                            href="/dashboard/agenda"
                            className={`px-3 py-1.5 rounded-xl border transition-colors ${
                                (counts.dueNow ?? 0) > 0
                                    ? "bg-red-50 text-red-700 border-red-100 hover:bg-red-100"
                                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                            }`}
                        >
                            {counts.dueNow ?? 0} due now
                        </Link>
                        <Link
                            href="/dashboard/activities/overdue"
                            className={`px-3 py-1.5 rounded-xl border transition-colors ${
                                (counts.overdue ?? 0) > 0
                                    ? "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100"
                                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                            }`}
                        >
                            {counts.overdue ?? 0} overdue
                        </Link>
                        <Link
                            href="/dashboard/leads"
                            className={`px-3 py-1.5 rounded-xl border transition-colors ${
                                (stats.needsAttention ?? 0) > 0
                                    ? "bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100"
                                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                            }`}
                        >
                            {stats.needsAttention ?? 0} need attention
                        </Link>
                    </div>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                    {cards.map((card) => {
                        const Icon = card.icon;
                        const valueTone = card.hot && card.value > 0 ? card.hot : "text-gray-900";
                        return (
                            <Link
                                key={card.label}
                                href={card.href}
                                className="block bg-white rounded-2xl border border-gray-200 shadow-sm p-4 transition-all hover:shadow-md hover:border-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.tone}`}>
                                    <Icon size={16} />
                                </div>
                                <p className={`text-2xl font-black mt-3 ${valueTone}`}>{card.value}</p>
                                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{card.label}</p>
                            </Link>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Per-employee breakdown */}
                    <section className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                <Users size={15} /> Team Productivity
                            </h2>
                            <Link href="/dashboard/productivity" className="text-xs font-bold text-purple-600 hover:underline flex items-center gap-1">
                                Details <ArrowRight size={12} />
                            </Link>
                        </div>
                        {employees.length === 0 ? (
                            <p className="px-5 py-6 text-sm text-gray-400">No active employees yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[11px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                            <th className="px-5 py-3">Employee</th>
                                            <th className="px-3 py-3 text-right">Calls</th>
                                            <th className="px-3 py-3 text-right">Connected</th>
                                            <th className="px-3 py-3 text-right">Avg Dur</th>
                                            <th className="px-3 py-3 text-right">Follow-ups</th>
                                            <th className="px-3 py-3 text-right">Overdue</th>
                                            <th className="px-3 py-3 text-right">Visits</th>
                                            <th className="px-3 py-3 text-right">Quotes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {employees.map((emp) => {
                                            const avg =
                                                emp.connectedCalls > 0
                                                    ? `${Math.round((emp.callDurationSeconds || 0) / emp.connectedCalls)}s`
                                                    : "—";
                                            return (
                                                <tr key={emp.id} className="hover:bg-gray-50/60">
                                                    <td className="px-5 py-3">
                                                        <Link
                                                            href={`/dashboard/team/${emp.id}`}
                                                            className="font-bold text-gray-900 hover:text-purple-600 hover:underline"
                                                        >
                                                            {emp.name}
                                                        </Link>
                                                        <p className="text-[11px] text-gray-400">{String(emp.role || "").replace(/_/g, " ").toLowerCase()}</p>
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-medium">{emp.calls}</td>
                                                    <td className="px-3 py-3 text-right font-medium">{emp.connectedCalls}</td>
                                                    <td className="px-3 py-3 text-right text-gray-500">{avg}</td>
                                                    <td className="px-3 py-3 text-right font-medium">{emp.followupsCompleted}</td>
                                                    <td className={`px-3 py-3 text-right font-bold ${emp.overdueFollowups > 0 ? "text-red-600" : "text-gray-500"}`}>
                                                        {emp.overdueFollowups}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-medium">{emp.siteVisits}</td>
                                                    <td className="px-3 py-3 text-right font-medium">{emp.quotations}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    {/* Needs attention */}
                    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                <AlertTriangle size={15} className="text-orange-500" /> Needs Attention
                            </h2>
                            <span className="text-xs font-bold text-gray-400">{needsAttention?.length ?? 0}</span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                            Active leads with no future follow-up, no pending task and no upcoming site visit.
                        </p>
                        {!needsAttention || needsAttention.length === 0 ? (
                            <p className="text-sm text-gray-400 py-3 flex items-center gap-2">
                                <CheckCircle2 size={15} className="text-emerald-500" /> Every active lead is covered.
                            </p>
                        ) : (
                            <ul className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                                {needsAttention.map((lead) => (
                                    <li key={lead.id}>
                                        <Link
                                            href={`/dashboard/leads/${lead.id}`}
                                            className="flex items-center justify-between gap-2 p-3 rounded-xl border border-orange-100 bg-orange-50/40 hover:bg-orange-50 transition-colors"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900 truncate">{lead.name}</p>
                                                <p className="text-[11px] text-gray-500">
                                                    {String(lead.status || "").toLowerCase()} · {lead.assignedTo?.name || "unassigned"}
                                                </p>
                                            </div>
                                            <ArrowRight size={14} className="shrink-0 text-orange-500" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
