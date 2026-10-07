"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileText, CheckCircle2, Send, XCircle, Clock3, BadgeCheck } from "lucide-react";
import { fetchQuotations } from "../../../../lib/api/quotations";
import { formatCurrency } from "../../../../features/pipeline/helpers";
import { useUpdateQuotationStatus } from "../../../../features/pipeline/hooks/useLeadMutations";
import { PermissionGate } from "../../../../features/auth/components/PermissionGate";

const STATUS_STYLES = {
    DRAFT: "bg-gray-100 text-gray-500",
    SENT: "bg-blue-100 text-blue-700",
    ACCEPTED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-600",
    EXPIRED: "bg-amber-100 text-amber-700"
};

const STATUS_TRANSITIONS = {
    DRAFT: ["SENT", "REJECTED"],
    SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
    ACCEPTED: [],
    REJECTED: [],
    EXPIRED: []
};

const TRANSITION_META = {
    SENT: { label: "Mark Sent", icon: Send, className: "bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white" },
    ACCEPTED: { label: "Accept", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white" },
    REJECTED: { label: "Reject", icon: XCircle, className: "bg-red-50 text-red-600 hover:bg-red-500 hover:text-white" },
    EXPIRED: { label: "Expire", icon: Clock3, className: "bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white" }
};

const displayDate = (value) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
};

export default function QuotationsPage() {
    const [statusFilter, setStatusFilter] = useState("ALL");
    const updateStatus = useUpdateQuotationStatus();

    const { data: quotations, isLoading, isError, error, refetch } = useQuery({
        queryKey: ["quotations", statusFilter],
        queryFn: () => fetchQuotations({ limit: 100, ...(statusFilter !== "ALL" ? { status: statusFilter } : {}) }),
        retry: 1
    });

    const quotationList = Array.isArray(quotations) ? quotations : [];

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Unit Price Quotations</h1>
                    <p className="text-sm text-gray-500">Generated client pricing proposals with agreement breakup.</p>
                </div>
                <Link href="/dashboard/leads" className="px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-purple-700">
                    + New Quotation
                </Link>
            </div>

            <div className="flex flex-wrap gap-2">
                {["ALL", "DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"].map((status) => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                            statusFilter === status
                                ? "bg-purple-600 text-white border-purple-600"
                                : "bg-white text-gray-500 border-gray-200 hover:border-purple-300"
                        }`}
                    >
                        {status}
                    </button>
                ))}
            </div>

            {isLoading && <p className="text-sm text-gray-400">Loading quotations...</p>}

            {isError && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">Failed to load quotations</p>
                    <p className="text-xs text-red-500 mb-3">{error?.message || "Unknown error"}</p>
                    <button onClick={() => refetch()} className="text-xs font-bold text-red-600 underline">Retry</button>
                </div>
            )}

            {!isLoading && !isError && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    {quotationList.length === 0 ? (
                        <div className="p-12 text-center">
                            <FileText size={28} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-sm font-bold text-gray-700">No quotations yet</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Create one from a lead&apos;s pipeline card using the <span className="font-bold">Create quotation</span> action.
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                    <th className="p-4">Ref</th>
                                    <th className="p-4">Lead</th>
                                    <th className="p-4">Project & Unit</th>
                                    <th className="p-4">Agreement Value</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Valid Until</th>
                                    <th className="p-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {quotationList.map((q) => {
                                    const nextStatuses = STATUS_TRANSITIONS[q.status] || [];
                                    return (
                                        <tr key={q.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-black text-purple-600">QT-{q.id.slice(0, 8).toUpperCase()}</td>
                                            <td className="p-4">
                                                <Link href={`/dashboard/leads/${q.leadId}`} className="font-bold text-gray-900 hover:text-purple-600">
                                                    {q.lead?.name || "Unknown lead"}
                                                </Link>
                                            </td>
                                            <td className="p-4 text-gray-600">
                                                {q.property
                                                    ? `${q.project?.name || "—"} (${q.property.unitNumber || q.property.title || "unit"})`
                                                    : q.project?.name || "—"}
                                            </td>
                                            <td className="p-4 font-extrabold text-purple-700">{formatCurrency(q.totalAmount)}</td>
                                            <td className="p-4">
                                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_STYLES[q.status] || ""}`}>
                                                    {q.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-gray-400">{displayDate(q.validUntil)}</td>
                                            <td className="p-4 text-right">
                                                {q.status === "ACCEPTED" ? (
                                                    <PermissionGate permission="booking:create">
                                                        <Link
                                                            href={`/dashboard/bookings/wizard?quotationId=${q.id}`}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 font-bold rounded-lg text-[11px] bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors"
                                                        >
                                                            <BadgeCheck size={11} /> Convert to booking
                                                        </Link>
                                                    </PermissionGate>
                                                ) : nextStatuses.length === 0 ? (
                                                    <span className="text-[11px] font-bold text-gray-400 uppercase">Closed</span>
                                                ) : (
                                                    <PermissionGate permission="quotation:update">
                                                        <div className="flex justify-end gap-2">
                                                            {nextStatuses.map((status) => {
                                                                const meta = TRANSITION_META[status];
                                                                const Icon = meta.icon;
                                                                return (
                                                                    <button
                                                                        key={status}
                                                                        disabled={updateStatus.isPending}
                                                                        onClick={() => updateStatus.mutate({ id: q.id, status })}
                                                                        className={`px-2.5 py-1.5 font-bold rounded-lg text-[11px] transition-colors disabled:opacity-50 flex items-center gap-1 ${meta.className}`}
                                                                    >
                                                                        <Icon size={11} /> {meta.label}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </PermissionGate>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
