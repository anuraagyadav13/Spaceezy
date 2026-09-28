// src/app/employee/daily-work/page.jsx  (/employee/daily-work)
"use client";
import { useEffect, useState } from "react";
import { getCurrentEmployeeId } from "../../../lib/auth";
import { getDailyWorkByEmployee, addDailyWorkEntry } from "../../../lib/store";
import { showToast } from "../../../lib/toast";

export default function DailyWorkPage() {
    const [employeeId, setEmployeeId] = useState(null);
    const [history, setHistory] = useState([]);
    const [task, setTask] = useState({ title: "", hours: "", summary: "" });

    useEffect(() => {
        const id = getCurrentEmployeeId();
        setEmployeeId(id);
        if (id) setHistory(getDailyWorkByEmployee(id));
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!task.title) return;
        addDailyWorkEntry(employeeId, { title: task.title, hours: Number(task.hours) || 0, summary: task.summary });
        showToast("Task logged for today");
        setTask({ title: "", hours: "", summary: "" });
        setHistory(getDailyWorkByEmployee(employeeId));
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto pt-16 md:pt-0">
            <div className="px-4 sm:px-8 py-6">
                <h1 className="text-2xl font-bold text-gray-900">Daily Work Log</h1>
                <p className="text-sm text-gray-500 mt-1">Log what you worked on today — your owner can see this on their dashboard.</p>
            </div>

            <div className="px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
                <form onSubmit={handleSubmit} className="bg-white rounded-[24px] p-6 shadow-sm flex flex-col gap-4 h-fit">
                    <h3 className="font-medium text-[15px] text-gray-900 mb-2">Add a task for today</h3>
                    <input required placeholder="What did you work on?" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <input type="number" min="0" step="0.5" placeholder="Hours spent" value={task.hours} onChange={(e) => setTask({ ...task, hours: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <textarea placeholder="Any notes for today's summary (optional)" value={task.summary} onChange={(e) => setTask({ ...task, summary: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" rows={3} />
                    <button type="submit" className="py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors">Add Task</button>
                </form>

                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <h3 className="font-medium text-[15px] text-gray-900 mb-4">Your history</h3>
                    <div className="flex flex-col gap-4 max-h-[420px] overflow-y-auto pr-2">
                        {history.map((day) => (
                            <div key={day.id} className="border-b border-gray-50 pb-4 last:border-0">
                                <p className="text-xs font-bold text-gray-400 mb-2">{day.date}</p>
                                <ul className="flex flex-col gap-1.5">
                                    {day.tasks.map((t, i) => (
                                        <li key={i} className="text-sm text-gray-700 flex justify-between">
                                            <span>{t.title}</span>
                                            <span className="text-gray-400">{t.hours}h</span>
                                        </li>
                                    ))}
                                </ul>
                                {day.summary && <p className="text-xs text-gray-500 mt-2 italic">{day.summary}</p>}
                            </div>
                        ))}
                        {history.length === 0 && <p className="text-sm text-gray-400">No entries yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}