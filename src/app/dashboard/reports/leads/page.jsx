"use client";
import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, PieChart } from "lucide-react";
import { fetchLeads } from "../../../../lib/api/leads";
import { showToast } from "../../../../lib/toast";

export default function LeadReportsPage() {
    const [leads, setLeads] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchLeads({ limit: 500 });
                setLeads(data.leads || data || []);
            } catch (err) {
                showToast(`Failed to load lead reports: ${err.message}`, "error");
            }
        };
        loadData();
    }, []);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Lead Acquisition Reports</h1>
                <p className="text-sm text-gray-500">Funnel distribution by stage, source, sub-source, and project.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">Leads by Stage</h2>
                    <div className="space-y-3">
                        {["NEW", "CONTACTED", "SITE VISIT", "NEGOTIATION", "BOOKED"].map((stg, i) => {
                            const count = leads.filter(l => l.stage === stg).length;
                            return (
                            <div key={stg} className="flex justify-between items-center text-xs font-bold p-2 bg-gray-50 rounded-xl">
                                <span>{stg}</span>
                                <span className="text-purple-700">{count} Leads</span>
                            </div>
                        )})}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">Leads by Source</h2>
                    <div className="space-y-3">
                        {["Website", "Google Ads", "Meta Ads", "Referral", "Walk-in"].map((src, i) => {
                            const count = leads.filter(l => l.source === src).length;
                            return (
                            <div key={src} className="flex justify-between items-center text-xs font-bold p-2 bg-gray-50 rounded-xl">
                                <span>{src}</span>
                                <span className="text-emerald-700">{count} Leads</span>
                            </div>
                        )})}
                    </div>
                </div>
            </div>
        </div>
    );
}
