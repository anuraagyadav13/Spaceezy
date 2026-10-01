"use client";
import { AlertTriangle } from "lucide-react";

export default function MissedVisitsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Missed Site Visits Queue</h1>
                <p className="text-sm text-gray-500">Scheduled site visits where client or executive was no-show.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Lead Name</th>
                            <th className="p-4">Property</th>
                            <th className="p-4">Scheduled Date</th>
                            <th className="p-4">No-show Reason</th>
                            <th className="p-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-bold text-gray-900">Amit Kumar</td>
                            <td className="p-4 text-gray-600">Greenwood Villas</td>
                            <td className="p-4 text-gray-400">24 Sep 2026, 04:00 PM</td>
                            <td className="p-4"><span className="bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded">Client Cancelled Last Minute</span></td>
                            <td className="p-4 text-right">
                                <button onClick={() => alert("Rescheduled!")} className="px-3 py-1.5 bg-purple-600 text-white font-bold rounded-lg text-xs hover:bg-purple-700">
                                    Reschedule
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
