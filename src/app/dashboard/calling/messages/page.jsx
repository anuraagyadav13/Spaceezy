"use client";
import { Mail, MessageSquare } from "lucide-react";

export default function EmailSmsHistoryPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Email & SMS History Logs</h1>
                <p className="text-sm text-gray-500">Audit history for transactional SMS and email notifications sent to leads.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Channel</th>
                            <th className="p-4">Recipient</th>
                            <th className="p-4">Subject / Content Summary</th>
                            <th className="p-4">Timestamp</th>
                            <th className="p-4 text-right">Delivery Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-bold flex items-center gap-2 text-blue-600">
                                <Mail size={14} /> Email
                            </td>
                            <td className="p-4 font-bold text-gray-900">Sapphire Holloway</td>
                            <td className="p-4 text-gray-600">Spaceezy — Quotation & Floor Plan for Unit B-1204</td>
                            <td className="p-4 text-gray-400">28 Sep 2026, 11:00 AM</td>
                            <td className="p-4 text-right"><span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded">Delivered (Simulated)</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
