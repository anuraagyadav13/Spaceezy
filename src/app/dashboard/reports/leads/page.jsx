"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchLeads } from "../../../../lib/api/leads";
import { showToast } from "../../../../lib/toast";

export default function LeadReportsPage() {
    const [leads, setLeads] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchLeads({ limit: 1000 });
                setLeads(data.leads || data || []);
            } catch (err) {
                showToast(`Failed to load lead reports: ${err.message}`, "error");
            }
        };
        loadData();
    }, []);

    const { stages, sources } = useMemo(() => {
        const countBy = (keyFn) => {
            const map = new Map();
            for (const lead of leads) {
                const key = keyFn(lead) || "Unknown";
                map.set(key, (map.get(key) || 0) + 1);
            }
            return [...map.entries()].sort((a, b) => b[1] - a[1]);
        };
        return {
            stages: countBy((l) => l.stage),
            sources: countBy((l) => l.source)
        };
    }, [leads]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Lead Acquisition Reports</h1>
                <p className="text-sm text-gray-500">Funnel distribution by stage and source — derived from your live lead data.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">Leads by Stage</h2>
                    <div className="space-y-3">
                        {stages.length === 0 && <p className="text-xs text-gray-400">No leads yet.</p>}
                        {stages.map(([stage, count]) => (
                            <div key={stage} className="flex justify-between items-center text-xs font-bold p-2 bg-gray-50 rounded-xl">
                                <span>{stage}</span>
                                <span className="text-purple-700">{count} Leads</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">Leads by Source</h2>
                    <div className="space-y-3">
                        {sources.length === 0 && <p className="text-xs text-gray-400">No leads yet.</p>}
                        {sources.map(([source, count]) => (
                            <div key={source} className="flex justify-between items-center text-xs font-bold p-2 bg-gray-50 rounded-xl">
                                <span>{source}</span>
                                <span className="text-emerald-700">{count} Leads</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
