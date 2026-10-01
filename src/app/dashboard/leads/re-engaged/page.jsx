"use client";
import { useState } from "react";
import Link from "next/link";
import { getLeads } from "../../../../lib/store";
import { RotateCcw, Search, Filter } from "lucide-react";

export default function ReEngagedLeadsPage() {
    const leads = getLeads();

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Re-engaged Leads Queue</h1>
                    <p className="text-sm text-gray-500">Leads that became active again after an inactive period or new campaign touchpoint.</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Lead ID</th>
                            <th className="p-4">Name</th>
                            <th className="p-4">Re-engagement Trigger</th>
                            <th className="p-4">Previous Stage</th>
                            <th className="p-4">Current Stage</th>
                            <th className="p-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {leads.map(l => (
                            <tr key={l.id} className="hover:bg-gray-50">
                                <td className="p-4 font-black text-purple-600">{l.id}</td>
                                <td className="p-4 font-bold text-gray-900">{l.name}</td>
                                <td className="p-4 text-gray-600">Re-visited property page</td>
                                <td className="p-4 text-gray-400">UNTOUCHED</td>
                                <td className="p-4"><span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded">{l.stage}</span></td>
                                <td className="p-4 text-right">
                                    <Link href={`/dashboard/leads/${l.id}`} className="text-purple-600 font-bold hover:underline">View 360</Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
