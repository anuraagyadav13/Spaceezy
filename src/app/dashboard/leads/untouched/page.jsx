"use client";
import { AlertTriangle, PhoneCall } from "lucide-react";
import { getLeads } from "../../../../lib/store";
import Link from "next/link";

export default function UntouchedLeadsPage() {
    const leads = getLeads().filter(l => l.stage === "NEW");

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Untouched Leads SLA Queue</h1>
                <p className="text-sm text-gray-500">Newly assigned leads that haven&apos;t received a first contact call within SLA limits.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Lead ID</th>
                            <th className="p-4">Name</th>
                            <th className="p-4">Creation Date</th>
                            <th className="p-4">Time Elapsed</th>
                            <th className="p-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {leads.map(l => (
                            <tr key={l.id} className="hover:bg-gray-50">
                                <td className="p-4 font-black text-purple-600">{l.id}</td>
                                <td className="p-4 font-bold text-gray-900">{l.name}</td>
                                <td className="p-4 text-gray-600">{l.createdAt}</td>
                                <td className="p-4"><span className="bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded">4h 15m (Overdue SLA)</span></td>
                                <td className="p-4 text-right">
                                    <Link href="/dashboard/calling/softphone" className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700">
                                        Call Now
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
