"use client";
import { Activity, Phone, Calendar, MessageSquare } from "lucide-react";
import { getLeads } from "../../../../lib/store";

export default function LeadActivitiesPage() {
    const leads = getLeads();

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Lead Activities Feed</h1>
                <p className="text-sm text-gray-500">Global activity stream across all lead touchpoints, calls, site visits, and emails.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                {leads.map(l => (
                    <div key={l.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                                <Activity size={18} />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900 text-sm">{l.name} — Stage updated to {l.stage}</p>
                                <p className="text-xs text-gray-500">Source: {l.source} • Assigned to {l.assignedTo}</p>
                            </div>
                        </div>
                        <span className="text-xs text-gray-400 font-medium">{l.createdAt}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
