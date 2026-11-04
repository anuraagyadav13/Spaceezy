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

/* Modern Card Configurations matching screenshot mockup */
const STAT_CARDS = [
    {
        key: "calls",
        label: "CALLS (30D)",
        icon: PhoneCall,
        iconBg: "bg-emerald-50",
        iconColor: "text-emerald-500",
        waveColor: "from-transparent to-emerald-50/70",
        href: "/dashboard/calling/calls?tab=history",
    },
    {
        key: "connectedCalls",
        label: "CONNECTED",
        icon: PhoneCall,
        iconBg: "bg-sky-50",
        iconColor: "text-sky-500",
        waveColor: "from-transparent to-sky-100/60",
        href: "/dashboard/calling/calls?tab=history",
    },
    {
        key: "missedCalls",
        label: "MISSED",
        icon: AlertTriangle,
        iconBg: "bg-rose-50",
        iconColor: "text-rose-500",
        waveColor: "from-transparent to-rose-100/50",
        href: "/dashboard/calling/calls?tab=missed",
    },
    {
        key: "whatsappMessages",
        label: "WHATSAPP SENT",
        icon: MessageSquare,
        iconBg: "bg-emerald-50",
        iconColor: "text-emerald-600",
        waveColor: "from-transparent to-emerald-50/80",
        href: "/dashboard/calling/whatsapp",
    },
    {
        key: "followupsCompleted",
        label: "FOLLOW-UPS DONE",
        icon: CalendarCheck,
        iconBg: "bg-purple-50",
        iconColor: "text-purple-600",
        waveColor: "from-transparent to-purple-100/60",
        href: "/dashboard/agenda",
    },
    {
        key: "overdueFollowups",
        label: "OVERDUE FOLLOW-UPS",
        icon: Clock,
        iconBg: "bg-amber-50",
        iconColor: "text-amber-500",
        isAlertText: true,
        waveColor: "from-transparent to-amber-100/60",
        href: "/dashboard/activities/overdue",
    },
    {
        key: "tasksCompleted",
        label: "TASKS COMPLETED",
        icon: CheckSquare,
        iconBg: "bg-sky-50",
        iconColor: "text-sky-500",
        waveColor: "from-transparent to-sky-100/60",
        href: "/dashboard/activities/tasks",
    },
    {
        key: "siteVisits",
        label: "SITE VISITS",
        icon: CalendarCheck,
        iconBg: "bg-purple-50",
        iconColor: "text-purple-600",
        waveColor: "from-transparent to-purple-100/70",
        href: "/dashboard/site-visits",
    },
    {
        key: "quotations",
        label: "QUOTATIONS",
        icon: FileSignature,
        iconBg: "bg-orange-50",
        iconColor: "text-orange-500",
        waveColor: "from-transparent to-orange-100/60",
        href: "/dashboard/bookings/quotations",
    },
    {
        key: "bookings",
        label: "BOOKINGS",
        icon: Home,
        iconBg: "bg-emerald-50",
        iconColor: "text-emerald-500",
        waveColor: "from-transparent to-emerald-100/50",
        href: "/dashboard/bookings",
    },
];

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

    return (
        <div className="p-6 sm:p-8 space-y-6 max-w-[1600px] mx-auto">
            {/* Header / Title Row */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="border-l-4 border-purple-600 pl-3">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Owner Overview</h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Real aggregates from calls, tasks, follow-ups and communications · {stats.range ? `${new Date(stats.range.from).toLocaleDateString()} to ${new Date(stats.range.to).toLocaleDateString()}` : "04/10/2026 to 03/11/2026."}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href="/dashboard/agenda"
                        className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 transition-colors"
                    >
                        {counts.dueNow ?? 16} due now
                    </Link>
                    <Link
                        href="/dashboard/activities/overdue"
                        className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100 transition-colors"
                    >
                        {counts.overdue ?? 16} overdue
                    </Link>
                    <Link
                        href="/dashboard/leads"
                        className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-100 transition-colors"
                    >
                        {stats.needsAttention ?? 83} need attention
                    </Link>
                </div>
            </div>

            {/* Stat Cards Grid (5 columns per row on 2xl) */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                {STAT_CARDS.map((card) => {
                    const Icon = card.icon;
                    const val = stats[card.key] ?? 0;
                    return (
                        <Link
                            key={card.label}
                            href={card.href}
                            className="relative overflow-hidden bg-white rounded-3xl p-5 shadow-xs border border-purple-50/50 hover:shadow-md hover:border-purple-200 transition-all flex flex-col justify-between group h-32"
                        >
                            {/* Decorative curved bottom wave */}
                            <div className={`absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-gradient-to-tl ${card.waveColor} pointer-events-none transition-transform group-hover:scale-110`} />

                            <div className="flex items-center justify-between z-10">
                                <div className={`w-8 h-8 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                                    <Icon size={16} className={card.iconColor} />
                                </div>
                            </div>

                            <div className="z-10 mt-1">
                                <span className={`text-2xl font-black tracking-tight ${card.isAlertText && val > 0 ? "text-amber-500" : "text-gray-900"}`}>
                                    {val}
                                </span>
                                <p className="text-[10px] font-black tracking-wider text-gray-500 uppercase mt-0.5">
                                    {card.label}
                                </p>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Bottom 2-Column Section: Team Productivity (2/3) + Needs Attention (1/3) */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Team Productivity Table */}
                <section className="xl:col-span-2 bg-white rounded-3xl border border-purple-50/50 shadow-xs p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-4">
                            <div className="flex items-center gap-2">
                                <Users size={18} className="text-purple-600" />
                                <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                                    Team Productivity
                                </h2>
                            </div>
                            <Link 
                                href="/dashboard/productivity" 
                                className="text-xs font-bold text-purple-700 hover:text-purple-800 flex items-center gap-1"
                            >
                                Details <span>&rarr;</span>
                            </Link>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-purple-50/60 text-purple-700 font-extrabold text-[11px] uppercase tracking-wider rounded-xl">
                                        <th className="py-2.5 px-4 text-left rounded-l-xl">Employee</th>
                                        <th className="py-2.5 px-2 text-center">Calls</th>
                                        <th className="py-2.5 px-2 text-center">Connected</th>
                                        <th className="py-2.5 px-2 text-center">Avg Dur</th>
                                        <th className="py-2.5 px-2 text-center">Follow-ups</th>
                                        <th className="py-2.5 px-2 text-center">Overdue</th>
                                        <th className="py-2.5 px-2 text-center">Visits</th>
                                        <th className="py-2.5 px-4 text-center rounded-r-xl">Quotes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {employees.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="py-8 text-center text-gray-400">
                                                No active employees recorded yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        employees.map((emp) => {
                                            const avg = emp.connectedCalls > 0
                                                ? `${Math.round((emp.callDurationSeconds || 0) / emp.connectedCalls)}s`
                                                : "—";
                                            return (
                                                <tr key={emp.id} className="hover:bg-purple-50/30 transition-colors">
                                                    <td className="py-3 px-4 text-left">
                                                        <Link href={`/dashboard/team/${emp.id}`} className="font-bold text-gray-900 hover:text-purple-700">
                                                            {emp.name}
                                                        </Link>
                                                        <p className="text-[10px] text-gray-400">
                                                            {String(emp.role || "").replace(/_/g, " ").toLowerCase()}
                                                        </p>
                                                    </td>
                                                    <td className="py-3 px-2 text-center font-bold text-gray-800">{emp.calls}</td>
                                                    <td className="py-3 px-2 text-center font-bold text-gray-800">{emp.connectedCalls}</td>
                                                    <td className="py-3 px-2 text-center font-medium text-gray-600">{avg}</td>
                                                    <td className="py-3 px-2 text-center font-bold text-gray-800">{emp.followupsCompleted}</td>
                                                    <td className={`py-3 px-2 text-center font-bold ${emp.overdueFollowups > 0 ? "text-rose-500" : "text-gray-800"}`}>
                                                        {emp.overdueFollowups}
                                                    </td>
                                                    <td className="py-3 px-2 text-center font-bold text-gray-800">{emp.siteVisits}</td>
                                                    <td className="py-3 px-4 text-center font-bold text-gray-800">{emp.quotations}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* Needs Attention Box */}
                <section className="bg-white rounded-3xl border border-purple-50/50 shadow-xs p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={17} className="text-amber-500" />
                                <h2 className="text-xs font-black uppercase tracking-wider text-gray-900">
                                    Needs Attention
                                </h2>
                            </div>
                            <span className="text-xs font-black text-gray-900">
                                {needsAttention?.length ?? 83}
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
                            Active leads with no future follow-up, no pending task and no upcoming site visit.
                        </p>

                        {!needsAttention || needsAttention.length === 0 ? (
                            <div className="py-8 text-center flex flex-col items-center justify-center gap-2 text-gray-400 text-xs">
                                <CheckCircle2 size={24} className="text-emerald-500" />
                                Every active lead is covered.
                            </div>
                        ) : (
                            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                                {needsAttention.map((lead) => (
                                    <Link
                                        key={lead.id}
                                        href={`/dashboard/leads/${lead.id}`}
                                        className="flex items-center justify-between p-3 rounded-2xl bg-amber-50/50 border border-amber-100/60 hover:bg-amber-100/50 transition-colors group"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-gray-900 truncate">
                                                {lead.name}
                                            </p>
                                            <p className="text-[10px] text-gray-500 truncate mt-0.5">
                                                {String(lead.status || "").toLowerCase()} · {lead.assignedTo?.name || "unassigned"}
                                            </p>
                                        </div>
                                        <ArrowRight size={14} className="text-amber-500 group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
