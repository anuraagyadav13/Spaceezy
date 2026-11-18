"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJunkLeads, restoreLead } from "../../../../lib/api/leads";
import { usePermissions } from "../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../lib/toast";
import Link from "next/link";
import { RotateCcw, ArrowLeft } from "lucide-react";

export default function JunkLeadsPage() {
    const { hasPermission } = usePermissions();
    const queryClient = useQueryClient();
    const [page] = useState(1);

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ["junk-leads", page],
        queryFn: () => fetchJunkLeads({ page, limit: 20 }),
        enabled: hasPermission("lead:view"),
    });

    const restoreMutation = useMutation({
        mutationFn: (id) => restoreLead(id),
        onSuccess: () => {
            showToast("Lead restored");
            queryClient.invalidateQueries({ queryKey: ["junk-leads"] });
            queryClient.invalidateQueries({ queryKey: ["lead"] });
        },
        onError: (e) => showToast(e?.message || "Failed to restore lead", "error"),
    });

    const leads = data?.leads || data || [];
    const list = Array.isArray(leads) ? leads : [];

    return (
        <div className="p-6 sm:p-8 max-w-[1600px] mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600">
                    <ArrowLeft size={16} /> Back to leads
                </Link>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Junk / Discarded Leads</h1>
            </div>
            <p className="text-sm text-gray-500 mb-4">
                Leads explicitly marked Not Interested. Restorable within 7 days of discard.
            </p>

            {isLoading && <p className="text-gray-400">Loading...</p>}
            {isError && <p className="text-red-500">{error?.message || "Failed to load"}</p>}

            {!isLoading && list.length === 0 && (
                <p className="text-gray-400">No discarded leads.</p>
            )}

            {list.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                            <tr>
                                <th className="text-left px-4 py-3">Name</th>
                                <th className="text-left px-4 py-3">Phone</th>
                                <th className="text-left px-4 py-3">Discarded</th>
                                <th className="text-left px-4 py-3">Reason</th>
                                <th className="text-left px-4 py-3">Purge after</th>
                                <th className="text-left px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map((lead) => (
                                <tr key={lead.id} className="border-t border-gray-100">
                                    <td className="px-4 py-3 font-medium">{lead.name}</td>
                                    <td className="px-4 py-3">{lead.phone}</td>
                                    <td className="px-4 py-3">{lead.junkedAt ? new Date(lead.junkedAt).toLocaleString() : "—"}</td>
                                    <td className="px-4 py-3">{lead.junkReason || "—"}</td>
                                    <td className="px-4 py-3">{lead.purgeAfter ? new Date(lead.purgeAfter).toLocaleString() : "—"}</td>
                                    <td className="px-4 py-3">
                                        {hasPermission("lead:update") && (
                                            <button
                                                onClick={() => restoreMutation.mutate(lead.id)}
                                                disabled={restoreMutation.isPending}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 disabled:opacity-60"
                                            >
                                                <RotateCcw size={14} /> Restore
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
