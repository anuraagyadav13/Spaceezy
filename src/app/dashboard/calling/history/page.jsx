"use client";
import { Phone, PhoneIncoming, PhoneOutgoing, Play } from "lucide-react";

export default function CallHistoryPage() {
    const calls = [
        { id: "1", lead: "Sapphire Holloway", phone: "+91 9000000001", type: "Outbound", status: "Answered", duration: "4m 12s", time: "Today 10:30 AM", recording: true },
        { id: "2", lead: "Jakub Tucker", phone: "+91 9000000002", type: "Inbound", status: "Answered", duration: "2m 45s", time: "Yesterday 04:15 PM", recording: true },
        { id: "3", lead: "Diana Hess", phone: "+91 9000000003", type: "Outbound", status: "Missed", duration: "0s", time: "25 Sep 11:20 AM", recording: false }
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Call History Logs</h1>
                <p className="text-sm text-gray-500">Comprehensive call log history across all human sales executive endpoints.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Type</th>
                            <th className="p-4">Lead Name</th>
                            <th className="p-4">Phone Number</th>
                            <th className="p-4">Duration</th>
                            <th className="p-4">Time</th>
                            <th className="p-4 text-right">Recording</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {calls.map(c => (
                            <tr key={c.id} className="hover:bg-gray-50">
                                <td className="p-4 font-bold flex items-center gap-2">
                                    {c.type === "Outbound" ? <PhoneOutgoing size={14} className="text-purple-600" /> : <PhoneIncoming size={14} className="text-emerald-600" />}
                                    {c.type} ({c.status})
                                </td>
                                <td className="p-4 font-bold text-gray-900">{c.lead}</td>
                                <td className="p-4 text-gray-600">{c.phone}</td>
                                <td className="p-4 font-semibold text-gray-800">{c.duration}</td>
                                <td className="p-4 text-gray-400">{c.time}</td>
                                <td className="p-4 text-right">
                                    {c.recording ? (
                                        <button onClick={() => alert("Simulated audio playback started!")} className="px-3 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg text-xs hover:bg-purple-100 flex items-center gap-1 ml-auto">
                                            <Play size={12} /> Play Recording
                                        </button>
                                    ) : (
                                        <span className="text-gray-400 text-[10px]">N/A</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
