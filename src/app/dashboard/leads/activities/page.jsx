"use client";
import { useEffect, useState } from "react";
import { Activity, Phone, Calendar, MessageSquare } from "lucide-react";
import { fetchLeadActivities } from "../../../../lib/api/leads";
import { showToast } from "../../../../lib/toast";

export default function LeadActivitiesPage() {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeadActivities()
            .then(data => setActivities(Array.isArray(data) ? data : []))
            .catch(err => showToast("Failed to load activities", "error"))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-8 text-gray-400 font-medium">Loading activities...</div>;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Lead Activities Feed</h1>
                <p className="text-sm text-gray-500">Global activity stream across all lead touchpoints, calls, site visits, and emails.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                {activities.length === 0 && <p className="text-sm text-gray-400">No activities found.</p>}
                {activities.map(a => (
                    <div key={a.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                                <Activity size={18} />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900 text-sm">{a.lead?.name || "Unknown"} — {a.description || `Stage updated to ${a.type}`}</p>
                                <p className="text-xs text-gray-500">Source: {a.lead?.source || "N/A"} • Assigned to {a.lead?.assignedTo?.name || "Unassigned"}</p>
                            </div>
                        </div>
                        <span className="text-xs text-gray-400 font-medium">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
