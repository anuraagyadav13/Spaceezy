"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSiteVisits, updateSiteVisitStatus } from "../../../lib/api/siteVisits";
import { showToast } from "../../../lib/toast";
import { Calendar, Phone, MapPin } from "lucide-react";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";
import { toErrorMessage } from "../../../features/pipeline/hooks/useLeadMutations";

const STATUS_STYLES = {
    SCHEDULED: "bg-purple-100 text-purple-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-gray-100 text-gray-500",
    NO_SHOW: "bg-red-100 text-red-500"
};

const displayDate = (value) => {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
};

export default function DashboardSiteVisitsPage() {
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState("ALL");

    const {
        data: visits,
        isLoading,
        isError,
        error,
        refetch
    } = useQuery({
        queryKey: ["siteVisits", statusFilter],
        queryFn: () => fetchSiteVisits({ limit: 100, ...(statusFilter !== "ALL" ? { status: statusFilter } : {}) }),
        retry: 1
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, status }) => updateSiteVisitStatus(id, status),
        onSuccess: (_data, vars) => {
            showToast(`Visit marked ${vars.status}`);
            ["siteVisits", "leads", "pipeline", "lead", "activities"].forEach((key) =>
                queryClient.invalidateQueries({ queryKey: [key] })
            );
        },
        onError: (err) => showToast(toErrorMessage(err), "error")
    });

    const visitList = Array.isArray(visits) ? visits : [];
    const upcoming = visitList.filter((v) => v.status === "SCHEDULED");
    const past = visitList.filter((v) => v.status !== "SCHEDULED");

    const leadNameOf = (v) => v.lead?.name || v.leadName || "Unknown lead";
    const phoneOf = (v) => v.lead?.phone || v.phone || "";
    const locationOf = (v) =>
        v.property
            ? v.property.unitNumber
                ? `Unit ${v.property.unitNumber}${v.project?.name ? ` · ${v.project.name}` : ""}`
                : v.property.title || ""
            : v.project?.name || v.propertyName || "—";
    const assigneeOf = (v) => v.assignedTo?.name || "Unassigned";

    const renderActions = (v) =>
        v.status !== "SCHEDULED" ? null : (
            <PermissionGate permission="site_visit:update">
                <div className="flex gap-2">
                    <button
                        onClick={() => statusMutation.mutate({ id: v.id, status: "COMPLETED" })}
                        disabled={statusMutation.isPending}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors disabled:opacity-50"
                    >
                        Mark Done
                    </button>
                    <button
                        onClick={() => statusMutation.mutate({ id: v.id, status: "NO_SHOW" })}
                        disabled={statusMutation.isPending}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                    >
                        No Show
                    </button>
                    <button
                        onClick={() => statusMutation.mutate({ id: v.id, status: "CANCELLED" })}
                        disabled={statusMutation.isPending}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                </div>
            </PermissionGate>
        );

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Site Visits</h1>
                    <p className="text-sm text-gray-500 mt-1">Every scheduled and completed site visit across your team.</p>
                </div>
                <PermissionGate permission="site_visit:create">
                    <Link
                        href="/dashboard/site-visits/schedule"
                        className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200"
                    >
                        + Schedule Visit
                    </Link>
                </PermissionGate>
            </div>

            <div className="px-4 sm:px-8 pb-4 flex flex-wrap gap-2">
                {["ALL", "SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"].map((status) => (
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

            <div className="px-4 sm:px-8 pb-8 flex flex-col gap-8">
                {isLoading && <p className="text-sm text-gray-400">Loading site visits...</p>}
                {isError && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
                        <p className="text-sm font-bold text-red-600 mb-2">Failed to load site visits</p>
                        <p className="text-xs text-red-500 mb-3">{error?.message || "Unknown error"}</p>
                        <button onClick={() => refetch()} className="text-xs font-bold text-red-600 underline">
                            Retry
                        </button>
                    </div>
                )}

                {!isLoading && !isError && (
                    <>
                        <div>
                            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Upcoming ({upcoming.length})</h2>
                            <div className="flex flex-col gap-3">
                                {upcoming.map((v) => (
                                    <div key={v.id} className="bg-white rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-4 shadow-sm">
                                        <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                                            <Calendar className="text-purple-600" size={18} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-gray-900">{leadNameOf(v)}</p>
                                            <p className="text-xs text-gray-500 flex items-center gap-1">
                                                <MapPin size={11} className="shrink-0" />
                                                <span className="truncate">{locationOf(v)}</span>
                                                {" · "}{assigneeOf(v)}
                                            </p>
                                        </div>
                                        <div className="text-xs text-gray-500 flex items-center gap-1 md:w-32">
                                            {phoneOf(v) && (<><Phone size={12} /> {phoneOf(v)}</>)}
                                        </div>
                                        <div className="text-sm font-medium text-gray-700 md:w-40">
                                            {displayDate(v.date)} · {v.time}
                                        </div>
                                        <span className={`text-[11px] font-bold px-3 py-1 rounded-full w-fit ${STATUS_STYLES[v.status] || ""}`}>{v.status}</span>
                                        {renderActions(v)}
                                    </div>
                                ))}
                                {upcoming.length === 0 && <p className="text-sm text-gray-400">Nothing scheduled.</p>}
                            </div>
                        </div>

                        <div>
                            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">History</h2>
                            <div className="flex flex-col gap-3">
                                {past.map((v) => (
                                    <div key={v.id} className="bg-white rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-4 shadow-sm opacity-80">
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-700">{leadNameOf(v)}</p>
                                            <p className="text-xs text-gray-500">{locationOf(v)} · {assigneeOf(v)}</p>
                                        </div>
                                        <div className="text-sm text-gray-500 md:w-40">{displayDate(v.date)} · {v.time}</div>
                                        <span className={`text-[11px] font-bold px-3 py-1 rounded-full w-fit ${STATUS_STYLES[v.status] || ""}`}>{v.status}</span>
                                    </div>
                                ))}
                                {past.length === 0 && <p className="text-sm text-gray-400">No history yet.</p>}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
