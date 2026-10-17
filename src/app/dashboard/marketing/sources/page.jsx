"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchLeads } from "../../../../lib/api/leads";
import { showToast } from "../../../../lib/toast";

export default function LeadSourcesPage() {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchLeads({ limit: 1000 });
                setLeads(data.leads || data || []);
            } catch (err) {
                showToast(`Failed to load lead sources: ${err.message}`, "error");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const rows = useMemo(() => {
        const map = new Map();
        for (const lead of leads) {
            const source = lead.source || "Unknown";
            if (!map.has(source)) map.set(source, { source, campaigns: new Set(), count: 0, converted: 0 });
            const row = map.get(source);
            row.count += 1;
            if (lead.campaign) row.campaigns.add(lead.campaign);
            if (lead.stage === "BOOKING") row.converted += 1;
        }
        return [...map.values()].sort((a, b) => b.count - a.count);
    }, [leads]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Lead Sources & Sub-sources Config</h1>
                <p className="text-sm text-gray-500">Live attribution breakdown computed from your lead data (campaigns shown as sub-sources).</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                {loading ? (
                    <p className="p-6 text-xs text-gray-400">Loading live data…</p>
                ) : rows.length === 0 ? (
                    <p className="p-6 text-xs text-gray-400">No leads yet — sources will appear once enquiries come in.</p>
                ) : (
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                <th className="p-4">Source Category</th>
                                <th className="p-4">Campaigns</th>
                                <th className="p-4 text-right">Lead Count</th>
                                <th className="p-4 text-right">Booked</th>
                                <th className="p-4 text-right">Conversion</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((row) => (
                                <tr key={row.source} className="hover:bg-gray-50">
                                    <td className="p-4 font-bold text-gray-900">{row.source}</td>
                                    <td className="p-4 text-gray-600">
                                        {row.campaigns.size > 0 ? [...row.campaigns].join(", ") : "—"}
                                    </td>
                                    <td className="p-4 text-right font-black text-purple-600">{row.count}</td>
                                    <td className="p-4 text-right font-bold text-emerald-700">{row.converted}</td>
                                    <td className="p-4 text-right font-bold text-gray-700">
                                        {row.count ? Math.round((row.converted / row.count) * 100) : 0}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
