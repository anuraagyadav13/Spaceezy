"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PhoneMissed, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { fetchCalls } from "../../../../lib/api/calls";

export default function MissedCallsPage() {
    const [page, setPage] = useState(1);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["calls", "missed", page],
        queryFn: () => fetchCalls({ status: "MISSED", page, limit: 20 }),
        retry: 1
    });

    const calls = data?.calls || [];
    const pages = data?.pages ?? 1;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Missed Calls Queue</h1>
                <p className="text-sm text-gray-500">
                    Inbound and unanswered calls with status MISSED — {data?.total ?? 0} total.
                </p>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm flex items-center justify-between gap-3">
                    <span>
                        {error?.status === 403
                            ? "You do not have permission to view calls"
                            : error?.status === 401
                                ? "Session expired. Please sign in again."
                                : `Failed to load missed calls: ${error?.message}`}
                    </span>
                    <button onClick={() => refetch()} className="font-bold underline shrink-0">Retry</button>
                </div>
            )}

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                {isLoading ? (
                    <p className="p-8 text-center text-sm text-gray-400">Loading missed calls...</p>
                ) : calls.length === 0 ? (
                    <p className="p-8 text-center text-sm text-gray-400">No missed calls. Nothing in the queue.</p>
                ) : (
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                <th className="p-4">Caller Number</th>
                                <th className="p-4">Lead Match</th>
                                <th className="p-4">Direction</th>
                                <th className="p-4">Time Received</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Callback Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {calls.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50">
                                    <td className="p-4 font-black text-red-600 flex items-center gap-2 font-mono">
                                        <PhoneMissed size={14} className="shrink-0" />
                                        {c.toNumber || c.fromNumber || "—"}
                                        {c.piiMasked && (
                                            <span className="text-[9px] font-sans font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1 py-0.5 rounded">
                                                masked
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 font-bold text-gray-900">
                                        {c.lead ? (
                                            <Link href={`/dashboard/leads/${c.leadId}`} className="text-purple-700 hover:underline">
                                                {c.lead.name}
                                            </Link>
                                        ) : (
                                            <span className="text-gray-400 font-medium">No lead match</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-gray-600">{c.direction === "OUTBOUND" ? "Outbound" : "Inbound"}</td>
                                    <td className="p-4 text-gray-500">
                                        {new Date(c.createdAt).toLocaleString([], {
                                            day: "numeric", month: "short",
                                            hour: "2-digit", minute: "2-digit"
                                        })}
                                    </td>
                                    <td className="p-4">
                                        <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded">Callback Pending</span>
                                    </td>
                                    <td className="p-4 text-right">
                                        {c.leadId ? (
                                            <Link
                                                href={`/dashboard/leads/${c.leadId}`}
                                                className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700 inline-block"
                                            >
                                                Call Back Now
                                            </Link>
                                        ) : (
                                            <span className="text-gray-400 text-[10px]">Unmatched caller</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {pages > 1 && (
                <div className="flex items-center justify-center gap-3 text-xs font-bold">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <span className="text-gray-500">Page {page} of {pages}</span>
                    <button
                        onClick={() => setPage((p) => Math.min(pages, p + 1))}
                        disabled={page >= pages}
                        className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                        aria-label="Next page"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}
