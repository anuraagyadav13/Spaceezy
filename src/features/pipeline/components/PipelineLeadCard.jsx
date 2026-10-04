"use client";
import { useState } from "react";
import Link from "next/link";
import { Loader2, CalendarClock, Activity, User2, MoreHorizontal, Phone, Clock3, MapPin, FileText, BadgeCheck, UserPlus } from "lucide-react";
import { formatCurrency, formatRelativeTime, formatDateTime } from "../helpers";

export default function PipelineLeadCard({
    lead,
    draggable,
    isDragging,
    isPending,
    actions = [],
    onAction,
    onDragStart,
    onDragEnd
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const nextFollowUp = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null;

    const handleAction = (type) => {
        setMenuOpen(false);
        onAction?.(type, lead);
    };

    return (
        <div
            draggable={draggable && !isPending}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            aria-busy={isPending || undefined}
            className={`relative bg-white rounded-2xl border border-gray-200 shadow-sm select-none transition-all ${
                isPending
                    ? "opacity-60 pointer-events-none"
                    : "hover:border-purple-300 hover:shadow-md"
            } ${isDragging ? "opacity-40" : ""}`}
        >
            <Link
                href={`/dashboard/leads/${lead.id}`}
                className={`block p-3 pb-1 ${isPending || menuOpen ? "pointer-events-none" : ""}`}
            >
                <div className="flex items-start justify-between gap-2 pr-6">
                    <p className="text-sm font-bold text-gray-900 leading-tight min-w-0 truncate">{lead.name}</p>
                    {isPending ? (
                        <Loader2 size={14} className="text-purple-600 animate-spin shrink-0" />
                    ) : (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 shrink-0">
                            {lead.status}
                        </span>
                    )}
                </div>

                {(lead.project || lead.configuration) && (
                    <p className="text-xs text-gray-600 mt-1.5 truncate">
                        {lead.project}
                        {lead.project && lead.configuration ? " • " : ""}
                        {lead.configuration}
                    </p>
                )}

                <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-black text-gray-900">{formatCurrency(lead.budget)}</span>
                    {lead.assignedTo && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 min-w-0">
                            <User2 size={11} className="shrink-0" />
                            <span className="truncate max-w-[80px]">{lead.assignedTo}</span>
                        </span>
                    )}
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
                    <span className="inline-flex items-center gap-1" title="Last activity">
                        <Activity size={10} />
                        {formatRelativeTime(lead.updatedAt)}
                    </span>
                    {nextFollowUp && (
                        <span
                            className="inline-flex items-center gap-1 font-bold text-cyan-600"
                            title={`Next follow-up: ${formatDateTime(lead.nextFollowUpAt)}`}
                        >
                            <CalendarClock size={10} />
                            {formatRelativeTime(lead.nextFollowUpAt)}
                        </span>
                    )}
                </div>
            </Link>

            {actions.length > 0 && (
                <button
                    type="button"
                    draggable={false}
                    onClick={() => setMenuOpen((open) => !open)}
                    aria-label={`Actions for ${lead.name}`}
                    className="absolute top-2 right-2 p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                    <MoreHorizontal size={15} />
                </button>
            )}

            {menuOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute top-8 right-2 z-20 w-48 bg-white rounded-xl border border-gray-200 shadow-lg py-1 overflow-hidden">
                        {actions.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => handleAction(key)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors text-left"
                            >
                                <Icon size={13} className="shrink-0" /> {label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export const CARD_ACTIONS = [
    { key: "contact", label: "Log contact", icon: Phone, permission: "lead:update" },
    { key: "assign", label: "Assign", icon: UserPlus, permission: "lead:update" },
    { key: "followUp", label: "Schedule follow-up", icon: Clock3, permission: "task:create" },
    { key: "siteVisit", label: "Schedule site visit", icon: MapPin, permission: "lead:update" },
    { key: "quotation", label: "Create quotation", icon: FileText, permission: "quotation:create" },
    { key: "booking", label: "Convert to booking", icon: BadgeCheck, permission: "booking:create" }
];
