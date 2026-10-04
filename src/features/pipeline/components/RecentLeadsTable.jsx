"use client";
import Link from "next/link";
import { formatShortDate, formatCurrency } from "../helpers";

export default function RecentLeadsTable({ leads }) {
    const items = leads || [];

    return (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden h-full">
            <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Recent Leads</h3>
                <p className="text-xs text-gray-500 mt-0.5">Newest leads in your pipeline</p>
            </div>
            {items.length === 0 ? (
                <div className="px-5 py-10 text-center text-gray-400">
                    <p className="text-sm font-semibold">No leads yet</p>
                    <p className="text-xs mt-1">New leads will show up here</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[560px]">
                        <thead className="bg-gray-50/60">
                            <tr>
                                <th className="px-5 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-wider">Lead</th>
                                <th className="px-3 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-wider">Project</th>
                                <th className="px-3 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-wider">Assigned</th>
                                <th className="px-3 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-wider">Budget</th>
                                <th className="px-3 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-wider">Stage</th>
                                <th className="px-5 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-wider">Added</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((lead) => (
                                <tr key={lead.id} className="hover:bg-purple-50/30 transition-colors">
                                    <td className="px-5 py-3">
                                        <Link href={`/dashboard/leads/${lead.id}`} className="block group">
                                            <p className="text-sm font-bold text-gray-900 group-hover:text-purple-600 transition-colors truncate max-w-[160px]">
                                                {lead.name}
                                            </p>
                                            <p className="text-[11px] text-gray-500">{lead.phone}</p>
                                        </Link>
                                    </td>
                                    <td className="px-3 py-3 text-xs font-semibold text-gray-600 truncate max-w-[130px]">
                                        {lead.project?.name || "—"}
                                    </td>
                                    <td className="px-3 py-3 text-xs text-gray-600 truncate max-w-[110px]">
                                        {lead.assignedTo?.name || "Unassigned"}
                                    </td>
                                    <td className="px-3 py-3 text-xs font-semibold text-gray-700 whitespace-nowrap">
                                        {formatCurrency(lead.budget)}
                                    </td>
                                    <td className="px-3 py-3">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100">
                                            {lead.status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{formatShortDate(lead.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
