"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import apiClient from "../../../../lib/api/client";
import { showToast } from "../../../../lib/toast";

export default function AuditLogsPage() {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [actionFilter, setActionFilter] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const data = await apiClient.get("/audit-logs", {
                    params: { page, limit: 50, ...(actionFilter ? { action: actionFilter } : {}) }
                });
                if (!active) return;
                setItems(data.items || []);
                setTotal(data.total || 0);
                setTotalPages(data.totalPages || 1);
            } catch (err) {
                if (active) showToast(`Failed to load audit logs: ${err.message}`, "error");
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [page, actionFilter]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Security Audit Logs</h1>
                    <p className="text-sm text-gray-500">Immutable trail of sensitive actions — {total} entr{total === 1 ? "y" : "ies"} recorded.</p>
                </div>
                <input
                    type="text"
                    value={actionFilter}
                    onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                    placeholder="Filter by action…"
                    className="text-xs font-bold border border-gray-200 rounded-xl px-4 py-2.5 bg-white w-56"
                />
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                {loading ? (
                    <p className="p-6 text-xs text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
                ) : items.length === 0 ? (
                    <p className="p-6 text-xs text-gray-400">No audit entries match the current filter.</p>
                ) : (
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                <th className="p-4">Action</th>
                                <th className="p-4">Performed By</th>
                                <th className="p-4">Target Entity</th>
                                <th className="p-4 text-right">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((row) => (
                                <tr key={row.id} className="hover:bg-gray-50">
                                    <td className="p-4 font-bold text-purple-700">{row.action}</td>
                                    <td className="p-4 text-gray-900 font-bold">
                                        {row.actor ? `${row.actor.name}${row.actor.email ? ` (${row.actor.email})` : ""}` : "System"}
                                    </td>
                                    <td className="p-4 text-gray-600">
                                        {row.entityType ? `${row.entityType}${row.entityId ? ` · ${row.entityId}` : ""}` : "—"}
                                    </td>
                                    <td className="p-4 text-right text-gray-400">
                                        {row.createdAt ? new Date(row.createdAt).toLocaleString("en-IN") : "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg disabled:opacity-40"
                    >
                        Previous
                    </button>
                    <span>Page {page} of {totalPages}</span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg disabled:opacity-40"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
