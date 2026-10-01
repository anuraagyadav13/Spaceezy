"use client";
import { AlertCircle, Clock } from "lucide-react";
import { getFollowups } from "../../../lib/store";

export default function OverdueActivitiesPage() {
    const overdue = getFollowups().filter(f => f.status === "Pending");

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Overdue Activities Escalation Queue</h1>
                <p className="text-sm text-gray-500">Tasks and follow-ups past their scheduled due time.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Activity</th>
                            <th className="p-4">Lead Reference</th>
                            <th className="p-4">Scheduled Due Date</th>
                            <th className="p-4">Escalation Delay</th>
                            <th className="p-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {overdue.map(f => (
                            <tr key={f.id} className="hover:bg-gray-50">
                                <td className="p-4 font-bold text-red-600 flex items-center gap-2">
                                    <AlertCircle size={14} /> {f.type}
                                </td>
                                <td className="p-4 font-bold text-gray-900">{f.refName}</td>
                                <td className="p-4 text-gray-600">{f.dueDate}</td>
                                <td className="p-4"><span className="bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded">2 Days Overdue</span></td>
                                <td className="p-4 text-right">
                                    <button onClick={() => alert("Follow-up executed!")} className="px-3 py-1.5 bg-purple-600 text-white font-bold rounded-lg text-xs hover:bg-purple-700">
                                        Execute Now
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
