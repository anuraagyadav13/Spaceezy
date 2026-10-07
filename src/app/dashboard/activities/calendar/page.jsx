"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarCheck, MapPin } from "lucide-react";
import { useAgenda } from "../../../../features/communication/hooks/useCommunication";
import { fetchSiteVisits } from "../../../../lib/api/siteVisits";

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function CalendarPage() {
    const [monthOffset, setMonthOffset] = useState(0);

    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
    const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 1);

    const { data: agenda, isLoading: agendaLoading, error } = useAgenda({
        from: monthStart.toISOString(),
        to: monthEnd.toISOString(),
        limit: 300
    });

    const { data: visitsRes, isLoading: visitsLoading } = useQuery({
        queryKey: ["siteVisits", "calendar", monthStart.toISOString()],
        queryFn: () => fetchSiteVisits({ limit: 200 }),
        retry: 1
    });

    const tasks = agenda?.items || [];
    const siteVisits = Array.isArray(visitsRes) ? visitsRes : visitsRes?.siteVisits || [];

    const eventsByDay = {};
    const addEvent = (key, event) => {
        if (!eventsByDay[key]) eventsByDay[key] = [];
        eventsByDay[key].push(event);
    };

    tasks.forEach((t) => {
        const d = new Date(t.dueDate);
        addEvent(dayKey(d), {
            id: t.id,
            kind: t.type === "SITE_VISIT" ? "visit" : "task",
            label: t.title,
            tone: t.status === "COMPLETED" ? "bg-gray-100 text-gray-500 line-through" : t.bucket === "OVERDUE" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800",
            href: t.leadId ? `/dashboard/leads/${t.leadId}` : null
        });
    });

    siteVisits.forEach((v) => {
        if (!v.date) return;
        const d = new Date(v.date);
        if (Number.isNaN(d.getTime())) return;
        addEvent(dayKey(d), {
            id: v.id,
            kind: "visit",
            label: v.lead?.name || v.leadName ? `Visit: ${v.lead?.name || v.leadName}` : "Site visit",
            tone: "bg-emerald-100 text-emerald-800",
            href: v.leadId ? `/dashboard/leads/${v.leadId}` : null
        });
    });

    // Build the visible grid (Mon-first) covering whole weeks.
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(base.getFullYear(), base.getMonth(), day));

    const isLoading = agendaLoading || visitsLoading;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex justify-between items-center gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Unified Calendar View</h1>
                    <p className="text-sm text-gray-500">
                        Real tasks, follow-ups and site visits on a month grid.
                    </p>
                </div>
                <div className="flex items-center gap-2 bg-white border border-gray-200 p-1.5 rounded-2xl shadow-sm text-xs font-bold">
                    <button
                        onClick={() => setMonthOffset((m) => m - 1)}
                        className="p-1 hover:bg-gray-100 rounded-lg"
                        aria-label="Previous month"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="px-3">
                        {base.toLocaleDateString([], { month: "long", year: "numeric" })}
                    </span>
                    <button
                        onClick={() => setMonthOffset((m) => m + 1)}
                        className="p-1 hover:bg-gray-100 rounded-lg"
                        aria-label="Next month"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
                    Failed to load the calendar: {error?.message}
                </div>
            )}

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-black text-gray-400 uppercase py-2 border-b">
                    <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                </div>
                {isLoading ? (
                    <p className="text-sm text-gray-400 text-center py-8">Loading schedule...</p>
                ) : (
                    <div className="grid grid-cols-7 gap-2 text-xs">
                        {cells.map((date, idx) => {
                            if (!date) return <div key={`empty-${idx}`} />;
                            const key = dayKey(date);
                            const events = eventsByDay[key] || [];
                            const isToday = key === dayKey(now);
                            return (
                                <div
                                    key={key}
                                    className={`min-h-[90px] p-2 rounded-2xl border space-y-1 ${isToday ? "border-purple-300 bg-purple-50/40" : "border-gray-100 bg-gray-50"}`}
                                >
                                    <span className={`font-bold text-[10px] ${isToday ? "text-purple-700" : "text-gray-400"}`}>
                                        {date.getDate()}
                                        {isToday && " · today"}
                                    </span>
                                    {events.slice(0, 3).map((event) => {
                                        const inner = (
                                            <div className={`p-1 rounded-lg text-[10px] font-bold truncate ${event.tone}`}>
                                                {event.kind === "visit" && <MapPin size={9} className="inline mr-0.5" />}
                                                {event.label}
                                            </div>
                                        );
                                        return event.href ? (
                                            <Link key={event.id} href={event.href} className="block">
                                                {inner}
                                            </Link>
                                        ) : (
                                            <div key={event.id}>{inner}</div>
                                        );
                                    })}
                                    {events.length > 3 && (
                                        <span className="text-[10px] text-gray-400 font-bold">+{events.length - 3} more</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                {!isLoading && (
                    <div className="flex items-center gap-4 text-[11px] text-gray-500 pt-2 border-t border-gray-100">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-300 inline-block" /> Task / follow-up</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-400 inline-block" /> Site visit</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-400 inline-block" /> Overdue</span>
                        <Link href="/dashboard/activities/tasks" className="ml-auto font-bold text-purple-600 hover:underline flex items-center gap-1">
                            <CalendarCheck size={12} /> Open task list
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
