"use client";
import { ListOrdered, PhoneCall } from "lucide-react";
import Link from "next/link";

export default function CallbackQueuePage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Priority Callback Queue</h1>
                <p className="text-sm text-gray-500">Automated outbound callback queue prioritized by lead score and age.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Priority</th>
                            <th className="p-4">Lead Name</th>
                            <th className="p-4">Requested Time</th>
                            <th className="p-4">Assigned Agent</th>
                            <th className="p-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-black text-purple-600">#1 High</td>
                            <td className="p-4 font-bold text-gray-900">Jakub Tucker</td>
                            <td className="p-4 text-gray-500">Today, 11:30 AM</td>
                            <td className="p-4 font-semibold text-gray-800">Priya Singh</td>
                            <td className="p-4 text-right">
                                <Link href="/dashboard/calling/softphone" className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700">
                                    Initiate Call
                                </Link>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
