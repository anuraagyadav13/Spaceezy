"use client";
import { useEffect, useState } from "react";
import { Calendar, CheckCircle2, Clock, MapPin, User, AlertCircle } from "lucide-react";
import { fetchTasks } from "../../../lib/api/tasks";
import { fetchSiteVisits } from "../../../lib/api/siteVisits";
import { showToast } from "../../../lib/toast";

export default function AgendaPage() {
    const [followups, setFollowups] = useState([]);
    const [siteVisits, setSiteVisits] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [tasksRes, visitsRes] = await Promise.all([
                    fetchTasks({ type: 'FOLLOW_UP', limit: 10 }), // Mocking for today
                    fetchSiteVisits({ limit: 10 }) // Mocking for today
                ]);
                setFollowups(tasksRes.tasks || tasksRes || []);
                setSiteVisits(visitsRes.siteVisits || visitsRes || []);
            } catch (err) {
                showToast(`Failed to load agenda: ${err.message}`, "error");
            }
        };
        loadData();
    }, []);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Today&apos;s Agenda</h1>
                <p className="text-sm text-gray-500 mt-1">Consolidated schedule of tasks, follow-ups, and scheduled site visits for today.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Clock size={16} className="text-purple-600" /> Follow-ups Due Today
                    </h2>
                    <div className="space-y-3">
                        {followups.map(f => (
                            <div key={f.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-gray-900 text-sm">{f.refName}</p>
                                    <p className="text-xs text-gray-500">{f.notes || "Follow-up scheduled"}</p>
                                </div>
                                <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-amber-100">
                                    {f.dueDate}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Calendar size={16} className="text-emerald-600" /> Site Visits Today
                    </h2>
                    <div className="space-y-3">
                        {siteVisits.map(v => (
                            <div key={v.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-gray-900 text-sm">{v.leadName} — {v.property}</p>
                                    <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12}/> {v.time} ({v.date})</p>
                                </div>
                                <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-emerald-100">
                                    {v.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
