"use client";
import { useState } from "react";
import Link from "next/link";
import {
    Clock, CalendarCheck, AlertTriangle, CheckCircle2, Phone,
    CalendarClock, XCircle, ArrowRight, User
} from "lucide-react";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { useAgenda, useNeedsAttention, useTelephonyStatus, useInitiateCall } from "../../../features/communication/hooks/useCommunication";
import { useUpdateTaskStatus, useRescheduleTask } from "../../../features/communication/hooks/useTaskActions";
import CallPanel from "../../../features/communication/components/CallPanel";
import CallOutcomePopup from "../../../features/communication/components/CallOutcomePopup";
import { showToast } from "../../../lib/toast";

export default function EmployeeDashboard() {
    const { user } = useAuth();
    const { data: agenda, isLoading, error } = useAgenda();
    const { data: needsAttention } = useNeedsAttention();
    const { data: telephony } = useTelephonyStatus();
    const updateStatus = useUpdateTaskStatus();
    const reschedule = useRescheduleTask();
    const initiateCall = useInitiateCall();

    const [activeCall, setActiveCall] = useState(null);
    const [outcomeCall, setOutcomeCall] = useState(null);
    const [rescheduleId, setRescheduleId] = useState(null);
    const [rescheduleValue, setRescheduleValue] = useState("");

    const items = agenda?.items || [];
    const counts = agenda?.counts || {};

    const dueNow = items.filter((t) => t.isDueNow);
    const today = items.filter((t) => t.bucket === "TODAY" && !t.isDueNow);
    const upcoming = items.filter((t) => t.bucket === "UPCOMING");
    const overdue = items.filter((t) => t.bucket === "OVERDUE");

    const handleStatus = async (task, status) => {
        try {
            await updateStatus.mutateAsync({ id: task.id, status });
            showToast(status === "COMPLETED" ? "Task completed" : "Task cancelled", "success");
        } catch (err) {
            const map = {
                INVALID_TASK_TRANSITION: "This task can no longer change to that status.",
                TASK_NOT_PENDING: "This task is no longer pending."
            };
            showToast(map[err?.code] || err?.message || "Failed to update the task", "error");
        }
    };

    const handleReschedule = async (task) => {
        if (!rescheduleValue) return;
        try {
            await reschedule.mutateAsync({
                id: task.id,
                dueDate: new Date(rescheduleValue).toISOString(),
                reason: "Rescheduled from employee dashboard"
            });
            showToast("Task rescheduled — same task, new due time", "success");
            setRescheduleId(null);
            setRescheduleValue("");
        } catch (err) {
            showToast(err?.message || "Failed to reschedule", "error");
        }
    };

    const handleCallNow = async (task) => {
        if (!task.leadId) {
            showToast("This task is not linked to a lead", "error");
            return;
        }
        if (!telephony?.configured) {
            showToast("Telephony not configured. Ask your administrator to configure a provider.", "error");
            return;
        }
        try {
            const call = await initiateCall.mutateAsync({ leadId: task.leadId });
            setActiveCall(call);
        } catch (err) {
            showToast(err?.message || "Failed to start the call", "error");
        }
    };

    const handleCallEnded = (updated) => {
        setActiveCall(null);
        if (updated && (updated.status === "COMPLETED" || updated.status === "MISSED")) {
            setOutcomeCall(updated);
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">Loading your day...</div>;
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-gray-700 font-bold mb-1">
                    {error?.status === 403
                        ? "You do not have permission to view this agenda"
                        : error?.status === 401
                            ? "Session expired. Please sign in again."
                            : "Failed to load your agenda"}
                </p>
                <p className="text-sm text-gray-500">{error?.message}</p>
            </div>
        );
    }

    const sections = [
        { key: "dueNow", label: "Due Now", icon: Clock, color: "text-red-600 bg-red-50", tasks: dueNow },
        { key: "today", label: "Today", icon: CalendarCheck, color: "text-blue-600 bg-blue-50", tasks: today },
        { key: "upcoming", label: "Upcoming", icon: CalendarClock, color: "text-indigo-600 bg-indigo-50", tasks: upcoming },
        { key: "overdue", label: "Overdue", icon: AlertTriangle, color: "text-amber-600 bg-amber-50", tasks: overdue }
    ];

    return (
        <div className="space-y-6 p-4 sm:p-8 custom-scrollbar overflow-y-auto h-full">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <User size={22} className="text-purple-600" /> {user?.name || "My"} Dashboard
                    </h1>
                    <p className="text-sm text-gray-500">Your real follow-ups and tasks, straight from the backend.</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                    <StatPill label="Due now" value={counts.dueNow ?? dueNow.length} tone="red" />
                    <StatPill label="Today" value={counts.today ?? today.length} tone="blue" />
                    <StatPill label="Upcoming" value={counts.upcoming ?? upcoming.length} tone="indigo" />
                    <StatPill label="Overdue" value={counts.overdue ?? overdue.length} tone="amber" />
                </div>
            </div>

            {activeCall && (
                <CallPanel call={activeCall} onEnded={handleCallEnded} />
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                    {sections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <section key={section.key} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${section.color}`}>
                                            <Icon size={14} />
                                        </span>
                                        {section.label}
                                    </h2>
                                    <span className="text-xs font-bold text-gray-400">{section.tasks.length}</span>
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {section.tasks.length === 0 ? (
                                        <p className="px-5 py-6 text-sm text-gray-400">
                                            {section.key === "overdue"
                                                ? "Nothing overdue. Great work."
                                                : "Nothing here right now."}
                                        </p>
                                    ) : (
                                        section.tasks.map((task) => (
                                            <div key={task.id} className="px-5 py-4 space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-gray-900">{task.title}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">
                                                            {task.lead?.name ? (
                                                                <Link href={`/dashboard/leads/${task.leadId}`} className="text-purple-600 font-medium hover:underline">
                                                                    {task.lead.name}
                                                                </Link>
                                                            ) : (
                                                                "No linked lead"
                                                            )}
                                                            {" · due "}
                                                            {new Date(task.dueDate).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                                            {task.bucket === "OVERDUE" && task.overdueByMinutes != null && (
                                                                <span className="text-red-500 font-bold">
                                                                    {" "}({Math.max(1, Math.round(task.overdueByMinutes / 1440))}d overdue)
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                    <span className="shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-md bg-gray-100 text-gray-500">
                                                        {String(task.type || "").toLowerCase()}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    {task.leadId && (
                                                        <button
                                                            onClick={() => handleCallNow(task)}
                                                            disabled={initiateCall.isPending}
                                                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                                        >
                                                            <Phone size={12} /> Call Now
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleStatus(task, "COMPLETED")}
                                                        disabled={updateStatus.isPending}
                                                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                                    >
                                                        <CheckCircle2 size={12} /> Complete
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setRescheduleId(rescheduleId === task.id ? null : task.id);
                                                            setRescheduleValue("");
                                                        }}
                                                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                                                    >
                                                        <CalendarClock size={12} /> Reschedule
                                                    </button>
                                                    <button
                                                        onClick={() => handleStatus(task, "CANCELLED")}
                                                        disabled={updateStatus.isPending}
                                                        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                                                    >
                                                        <XCircle size={12} /> Cancel
                                                    </button>
                                                    {task.leadId && (
                                                        <Link
                                                            href={`/dashboard/leads/${task.leadId}`}
                                                            className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline ml-auto"
                                                        >
                                                            Open lead <ArrowRight size={12} />
                                                        </Link>
                                                    )}
                                                </div>

                                                {rescheduleId === task.id && (
                                                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                                                        <input
                                                            type="datetime-local"
                                                            value={rescheduleValue}
                                                            onChange={(e) => setRescheduleValue(e.target.value)}
                                                            className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs"
                                                        />
                                                        <button
                                                            onClick={() => handleReschedule(task)}
                                                            disabled={!rescheduleValue || reschedule.isPending}
                                                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                                                        >
                                                            {reschedule.isPending ? "Saving..." : "Save"}
                                                        </button>
                                                        <button
                                                            onClick={() => setRescheduleId(null)}
                                                            className="rounded-lg bg-white border border-indigo-200 px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-50"
                                                        >
                                                            Dismiss
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>

                <div className="space-y-6">
                    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                        <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 mb-3">
                            Needs Attention
                        </h2>
                        {!needsAttention || needsAttention.length === 0 ? (
                            <p className="text-sm text-gray-400">
                                Every active lead has a follow-up, pending task, or upcoming visit.
                            </p>
                        ) : (
                            <ul className="space-y-3">
                                {needsAttention.slice(0, 6).map((lead) => (
                                    <li key={lead.id} className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{lead.name}</p>
                                            <p className="text-[11px] text-gray-500">
                                                {String(lead.status || "").toLowerCase()} · no future follow-up
                                            </p>
                                        </div>
                                        <Link
                                            href={`/dashboard/leads/${lead.id}`}
                                            className="shrink-0 text-xs font-bold text-purple-600 hover:underline"
                                        >
                                            Open
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                        <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 mb-3">Quick Links</h2>
                        <div className="space-y-2 text-sm">
                            <Link href="/dashboard/activities/tasks" className="block text-purple-600 font-medium hover:underline">All tasks</Link>
                            <Link href="/dashboard/activities/overdue" className="block text-purple-600 font-medium hover:underline">Overdue activities</Link>
                            <Link href="/dashboard/calling/softphone" className="block text-purple-600 font-medium hover:underline">Softphone</Link>
                            <Link href="/dashboard/calling/whatsapp" className="block text-purple-600 font-medium hover:underline">WhatsApp Center</Link>
                        </div>
                    </section>
                </div>
            </div>

            <CallOutcomePopup
                call={outcomeCall}
                isOpen={Boolean(outcomeCall)}
                onClose={() => setOutcomeCall(null)}
            />
        </div>
    );
}

function StatPill({ label, value, tone }) {
    const tones = {
        red: "bg-red-50 text-red-700 border-red-100",
        blue: "bg-blue-50 text-blue-700 border-blue-100",
        indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
        amber: "bg-amber-50 text-amber-700 border-amber-100"
    };
    return (
        <span className={`px-3 py-1.5 rounded-xl border ${tones[tone]}`}>
            {value} {label}
        </span>
    );
}
