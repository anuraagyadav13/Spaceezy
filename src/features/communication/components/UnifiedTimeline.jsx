"use client";

import {
    Phone,
    MessageSquare,
    CalendarCheck,
    CheckSquare,
    History,
    FileText,
    CalendarDays,
    FileSignature,
    Home,
    UserPlus,
    Mail
} from "lucide-react";
import { useLeadTimeline } from "../hooks/useCommunication";

const KIND_META = {
    CALL: { icon: Phone, tone: "bg-emerald-50 text-emerald-600", label: "Call" },
    WHATSAPP: { icon: MessageSquare, tone: "bg-green-50 text-green-600", label: "WhatsApp" },
    FOLLOW_UP: { icon: CalendarCheck, tone: "bg-amber-50 text-amber-600", label: "Follow-up" },
    TASK: { icon: CheckSquare, tone: "bg-sky-50 text-sky-600", label: "Task" },
    STATUS_CHANGE: { icon: History, tone: "bg-violet-50 text-violet-600", label: "Stage" },
    NOTE: { icon: FileText, tone: "bg-slate-100 text-slate-600", label: "Note" },
    SITE_VISIT: { icon: CalendarDays, tone: "bg-indigo-50 text-indigo-600", label: "Site Visit" },
    QUOTATION: { icon: FileSignature, tone: "bg-orange-50 text-orange-600", label: "Quotation" },
    BOOKING: { icon: Home, tone: "bg-emerald-50 text-emerald-700", label: "Booking" },
    ASSIGNMENT: { icon: UserPlus, tone: "bg-pink-50 text-pink-600", label: "Assignment" },
    EMAIL: { icon: Mail, tone: "bg-cyan-50 text-cyan-600", label: "Email" }
};

const DEFAULT_META = { icon: FileText, tone: "bg-slate-100 text-slate-600", label: "Activity" };

const formatWhen = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return `Today ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
    return `${d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} ${time}`;
};

export default function UnifiedTimeline({ leadId, kinds, limit = 100 }) {
    const { data, isLoading, error, refetch, isFetching } = useLeadTimeline(leadId, { enabled: Boolean(leadId) });

    if (isLoading) {
        return (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                Loading timeline...
            </div>
        );
    }

    if (error) {
        const status = error?.status;
        const message =
            status === 404
                ? "Lead not found"
                : status === 403
                  ? "You do not have permission to view this timeline"
                  : status === 401
                    ? "Session expired. Please sign in again."
                    : error?.message || "Failed to load the timeline";
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                <p>{message}</p>
                <button
                    onClick={() => refetch()}
                    className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-100"
                >
                    {isFetching ? "Retrying..." : "Retry"}
                </button>
            </div>
        );
    }

    const allItems = Array.isArray(data?.items) ? data.items : [];
    const items = kinds?.length ? allItems.filter((i) => kinds.includes(i.kind)) : allItems;

    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                No activity exists yet for this lead.
            </div>
        );
    }

    const visible = items.slice(0, limit);

    return (
        <ol className="relative space-y-4 border-l border-slate-200 pl-5">
            {visible.map((item) => {
                const meta = KIND_META[item.kind] || { ...DEFAULT_META, label: item.kind };
                const Icon = meta.icon;
                return (
                    <li key={`${item.kind}-${item.id}`} className="relative">
                        <span
                            className={`absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${meta.tone}`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                                    {item.description && (
                                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</p>
                                    )}
                                </div>
                                <span className="shrink-0 text-[11px] text-slate-400">{formatWhen(item.at)}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-[11px]">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                                    {meta.label}
                                </span>
                                {item.actor?.name && (
                                    <span className="text-slate-400">by {item.actor.name}</span>
                                )}
                                {item.meta?.status && (
                                    <span className="text-slate-400">{String(item.meta.status).toLowerCase()}</span>
                                )}
                                {item.meta?.disposition && (
                                    <span className="font-medium text-emerald-600">
                                        {String(item.meta.disposition).replace(/_/g, " ").toLowerCase()}
                                    </span>
                                )}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
