"use client";
import { BarChart3, TrendingUp, PieChart } from "lucide-react";
import { getLeads } from "../../../../lib/store";

export default function LeadReportsPage() {
    const leads = getLeads();

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
                        {["NEW", "CONTACTED", "SITE VISIT", "NEGOTIATION", "BOOKED"].map((stg, i) => (
                            <div key={stg} className="flex justify-between items-center text-xs font-bold p-2 bg-gray-50 rounded-xl">
                                <span>{stg}</span>
                                <span className="text-purple-700">{(i + 1) * 12} Leads</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">Leads by Source</h2>
                    <div className="space-y-3">
                        {["Website", "Google Ads", "Meta Ads", "Referral", "Walk-in"].map((src, i) => (
                            <div key={src} className="flex justify-between items-center text-xs font-bold p-2 bg-gray-50 rounded-xl">
                                <span>{src}</span>
                                <span className="text-emerald-700">{(5 - i) * 15} Leads</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
