"use client";
import { useEffect, useState } from "react";
import { fetchFollowups, toggleFollowupStatus } from "../../../../lib/api/leads";
import { showToast } from "../../../../lib/toast";
import { CalendarCheck, CheckCircle2, Clock } from "lucide-react";

export default function LeadFollowupsPage() {
    const [followups, setFollowups] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFollowups()
            .then(data => setFollowups(Array.isArray(data) ? data : []))
            .catch(err => showToast("Failed to load follow-ups", "error"))
            .finally(() => setLoading(false));
    }, []);

    const handleToggle = async (id) => {
        try {
            await toggleFollowupStatus(id);
            setFollowups(prev => prev.map(f =>
                f.id === id ? { ...f, status: f.status === "Done" ? "Pending" : "Done" } : f
            ));
        } catch (err) {
            showToast("Failed to update follow-up", "error");
        }
    };

    if (loading) return <div className="p-8 text-gray-400 font-medium">Loading follow-ups...</div>;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Lead Follow-ups Queue</h1>
                <p className="text-sm text-gray-500">Track and execute scheduled lead call and site visit follow-ups.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Status</th>
                            <th className="p-4">Lead Name</th>
                            <th className="p-4">Activity Type</th>
                            <th className="p-4">Due Date</th>
                            <th className="p-4">Notes</th>
                            <th className="p-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {followups.length === 0 && (
                            <tr><td colSpan="6" className="p-4 text-center text-gray-400">No follow-ups found.</td></tr>
                        )}
                        {followups.map(f => (
                            <tr key={f.id} className="hover:bg-gray-50">
                                <td className="p-4">
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${f.status === "Done" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                        {f.status}
                                    </span>
                                </td>
                                <td className="p-4 font-bold text-gray-900">{f.refName}</td>
                                <td className="p-4 font-semibold text-purple-700">{f.type}</td>
                                <td className="p-4 text-gray-600 font-medium">{f.dueDate}</td>
                                <td className="p-4 text-gray-500">{f.notes}</td>
                                <td className="p-4 text-right">
                                    <button 
                                        onClick={() => handleToggle(f.id)}
                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-lg text-xs"
                                    >
                                        Mark {f.status === "Done" ? "Pending" : "Complete"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
