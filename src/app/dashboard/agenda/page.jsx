"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, AlertCircle, CalendarCheck } from "lucide-react";
import { useAgenda } from "../../../features/communication/hooks/useCommunication";
import { fetchSiteVisits } from "../../../lib/api/siteVisits";

export default function AgendaPage() {
    const { data: agenda, isLoading, error } = useAgenda({ view: "today", limit: 100 });

    const { data: visitsRes, isLoading: visitsLoading } = useQuery({
        queryKey: ["siteVisits", "today"],
        queryFn: () => fetchSiteVisits({ limit: 50 }),
        retry: 1
    });

    const items = agenda?.items || [];
    const counts = agenda?.counts || {};

    const todayKey = new Date().toDateString();
    const siteVisits = (Array.isArray(visitsRes) ? visitsRes : visitsRes?.siteVisits || [])
        .filter((v) => v.date && new Date(v.date).toDateString() === todayKey);

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">Loading today&apos;s agenda...</div>;
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-gray-700 font-bold mb-1">
                    {error?.status === 403
                        ? "You do not have permission to view this agenda"
                        : error?.status === 401
                            ? "Session expired. Please sign in again."
                            : "Failed to load the agenda"}
                </p>
                <p className="text-sm text-gray-500">{error?.message}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Today&apos;s Agenda</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Backend-driven schedule — {counts.dueNow ?? 0} due now, {counts.today ?? 0} due today,{" "}
                        {counts.overdue ?? 0} overdue.
                    </p>
                </div>
                <Link
                    href="/dashboard/activities/tasks"
                    className="text-xs font-bold text-purple-600 hover:underline flex items-center gap-1"
                >
                    <CalendarCheck size={13} /> Open full task list
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Clock size={16} className="text-purple-600" /> Follow-ups Due Today
                    </h2>
                    <div className="space-y-3">
                        {items.length === 0 ? (
                            <p className="text-sm text-gray-400">Nothing due today.</p>
                        ) : (
                            items.map((task) => (
                                <div key={task.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex justify-between items-center gap-3">
                                    <div className="min-w-0">
                                        <p className="font-bold text-gray-900 text-sm truncate">{task.title}</p>
                                        <p className="text-xs text-gray-500 truncate">
                                            {task.lead ? (
                                                <Link href={`/dashboard/leads/${task.leadId}`} className="text-purple-600 hover:underline">
                                                    {task.lead.name}
                                                </Link>
                                            ) : (
                                                String(task.type || "task").replace(/_/g, " ").toLowerCase()
                                            )}
                                            {task.assignedTo?.name ? ` · ${task.assignedTo.name}` : ""}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg border ${task.isDueNow ? "bg-red-50 text-red-700 border-red-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>
                                        {new Date(task.dueDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        {task.isDueNow ? " · due now" : ""}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Calendar size={16} className="text-emerald-600" /> Site Visits Today
                    </h2>
                    <div className="space-y-3">
                        {visitsLoading && <p className="text-sm text-gray-400">Loading site visits...</p>}
                        {!visitsLoading && siteVisits.length === 0 && (
                            <p className="text-sm text-gray-400">No site visits scheduled today.</p>
                        )}
                        {siteVisits.map((v) => (
                            <div key={v.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex justify-between items-center gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-gray-900 text-sm truncate">
                                        {v.lead?.name || v.leadName || "Site visit"}
                                        {v.project?.name ? ` — ${v.project.name}` : ""}
                                    </p>
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                        <Clock size={12} /> {v.time || "time TBD"}
                                        {v.assignedTo?.name ? ` · ${v.assignedTo.name}` : ""}
                                    </p>
                                </div>
                                <span className="shrink-0 bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-emerald-100">
                                    {String(v.status || "").toLowerCase()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {(counts.overdue ?? 0) > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                        <AlertCircle size={16} /> {counts.overdue} overdue {counts.overdue === 1 ? "item needs" : "items need"} attention.
                    </span>
                    <Link href="/dashboard/activities/overdue" className="font-bold underline shrink-0">
                        Review now
                    </Link>
                </div>
            )}
        </div>
    );
}
