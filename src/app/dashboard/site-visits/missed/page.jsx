"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { fetchSiteVisits } from "../../../../lib/api/siteVisits";
import { toErrorMessage } from "../../../../features/pipeline/hooks/useLeadMutations";

const displayDate = (value) => {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

export default function MissedVisitsPage() {
    const { data: visits, isLoading, isError, error, refetch } = useQuery({
        queryKey: ["siteVisits", "NO_SHOW"],
        queryFn: () => fetchSiteVisits({ status: "NO_SHOW", limit: 100 }),
        retry: 1
    });

    const visitList = Array.isArray(visits) ? visits : [];

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Missed Site Visits Queue</h1>
                <p className="text-sm text-gray-500">Scheduled site visits where client or executive was no-show.</p>
            </div>

            {isLoading && <p className="text-sm text-gray-400">Loading missed visits...</p>}

            {isError && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">Failed to load missed visits</p>
                    <p className="text-xs text-red-500 mb-3">{toErrorMessage(error)}</p>
                    <button onClick={() => refetch()} className="text-xs font-bold text-red-600 underline">Retry</button>
                </div>
            )}

            {!isLoading && !isError && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    {visitList.length === 0 ? (
                        <div className="p-12 text-center">
                            <AlertTriangle size={28} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-sm font-bold text-gray-700">No missed visits</p>
                            <p className="text-xs text-gray-500 mt-1">Everything scheduled so far was attended or handled.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                    <th className="p-4">Lead Name</th>
                                    <th className="p-4">Project / Unit</th>
                                    <th className="p-4">Scheduled Date</th>
                                    <th className="p-4">Assignee</th>
                                    <th className="p-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {visitList.map((v) => (
                                    <tr key={v.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-bold text-gray-900">{v.lead?.name || v.leadName || "Unknown lead"}</td>
                                        <td className="p-4 text-gray-600">
                                            {v.property
                                                ? v.property.unitNumber
                                                    ? `Unit ${v.property.unitNumber}${v.project?.name ? ` · ${v.project.name}` : ""}`
                                                    : v.property.title || "—"
                                                : v.project?.name || v.propertyName || "—"}
                                        </td>
                                        <td className="p-4 text-gray-400">{displayDate(v.date)} · {v.time}</td>
                                        <td className="p-4 text-gray-600">{v.assignedTo?.name || "Unassigned"}</td>
                                        <td className="p-4 text-right">
                                            <Link
                                                href={v.leadId ? `/dashboard/site-visits/schedule?leadId=${v.leadId}` : "/dashboard/site-visits/schedule"}
                                                className="inline-block px-3 py-1.5 bg-purple-600 text-white font-bold rounded-lg text-xs hover:bg-purple-700"
                                            >
                                                Reschedule
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
