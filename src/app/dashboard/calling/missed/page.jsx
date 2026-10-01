"use client";
import { PhoneMissed, PhoneCall } from "lucide-react";
import Link from "next/link";

export default function MissedCallsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Missed Calls Queue</h1>
                <p className="text-sm text-gray-500">Inbound caller attempts that missed live agent availability.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Caller Phone</th>
                            <th className="p-4">Lead Match</th>
                            <th className="p-4">Time Received</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Callback Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-black text-red-600 flex items-center gap-2">
                                <PhoneMissed size={14} /> +91 98765 99999
                            </td>
                            <td className="p-4 font-bold text-gray-900">New Prospect</td>
                            <td className="p-4 text-gray-500">Today, 09:15 AM</td>
                            <td className="p-4"><span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded">Callback Pending</span></td>
                            <td className="p-4 text-right">
                                <Link href="/dashboard/calling/softphone" className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700">
                                    Call Back Now
                                </Link>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
