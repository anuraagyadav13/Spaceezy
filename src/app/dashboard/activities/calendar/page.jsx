"use client";
import { useEffect, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchTasks } from "../../../../lib/api/tasks";
import { fetchSiteVisits } from "../../../../lib/api/siteVisits";
import { showToast } from "../../../../lib/toast";

export default function CalendarPage() {
    const [visits, setVisits] = useState([]);
    const [followups, setFollowups] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [tasksRes, visitsRes] = await Promise.all([
                    fetchTasks({ limit: 50 }),
                    fetchSiteVisits({ limit: 50 })
                ]);
                setFollowups(tasksRes.tasks || tasksRes || []);
                setVisits(visitsRes.siteVisits || visitsRes || []);
            } catch (err) {
                showToast(`Failed to load calendar: ${err.message}`, "error");
            }
        };
        loadData();
    }, []);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Unified Calendar View</h1>
                    <p className="text-sm text-gray-500">Visual schedule of site visits, tasks, and team appointments.</p>
                </div>
                <div className="flex items-center gap-2 bg-white border border-gray-200 p-1.5 rounded-2xl shadow-sm text-xs font-bold">
                    <button className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={16} /></button>
                    <span className="px-3">September 2026</span>
                    <button className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={16} /></button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-black text-gray-400 uppercase py-2 border-b">
                    <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                </div>
                <div className="grid grid-cols-7 gap-2 text-xs">
                    {Array.from({ length: 30 }).map((_, i) => (
                        <div key={i} className="min-h-[90px] p-2 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                            <span className="font-bold text-gray-400 text-[10px]">{i + 1}</span>
                            {i === 27 && (
                                <div className="bg-purple-100 text-purple-700 p-1 rounded-lg text-[10px] font-bold">
                                    Visit: Sapphire Holloway
                                </div>
                            )}
                            {i === 25 && (
                                <div className="bg-amber-100 text-amber-800 p-1 rounded-lg text-[10px] font-bold">
                                    Follow-up: Jakub Tucker
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
