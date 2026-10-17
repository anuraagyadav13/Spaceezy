"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchLeads } from "../../../../lib/api/leads";
import { showToast } from "../../../../lib/toast";

const STAGE_BADGES = {
    NEW: "bg-blue-50 text-blue-700",
    CONTACTED: "bg-yellow-50 text-yellow-700",
    QUALIFIED: "bg-indigo-50 text-indigo-700",
    "SITE VISIT": "bg-orange-50 text-orange-700",
    NEGOTIATION: "bg-purple-50 text-purple-700",
    BOOKING: "bg-emerald-50 text-emerald-700"
};

export default function WebsiteEnquiriesPage() {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchLeads({ source: "Website", limit: 200 });
                const rows = data.leads || data || [];
                setLeads((Array.isArray(rows) ? rows : []).slice().sort((a, b) =>
                    new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
                ));
            } catch (err) {
                showToast(`Failed to load website enquiries: ${err.message}`, "error");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Website & Portal Inbound Enquiries</h1>
                <p className="text-sm text-gray-500">Live feed of public site enquiry form submissions (leads with source Website).</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                {loading ? (
                    <p className="p-6 text-xs text-gray-400">Loading live data…</p>
                ) : leads.length === 0 ? (
                    <p className="p-6 text-xs text-gray-400">No website enquiries yet.</p>
                ) : (
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                <th className="p-4">Visitor Name</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">Campaign / Landing Page</th>
                                <th className="p-4">Stage</th>
                                <th className="p-4 text-right">Assignment</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {leads.map((lead) => {
                                const badge = STAGE_BADGES[lead.stage] || "bg-gray-100 text-gray-600";
                                return (
                                    <tr key={lead.id} className="hover:bg-gray-50">
                                        <td className="p-4">
                                            <Link href={`/dashboard/leads/${lead.id}`} className="font-bold text-gray-900 hover:text-purple-700">
                                                {lead.name || "—"}
                                            </Link>
                                        </td>
                                        <td className="p-4 text-gray-600">{lead.phone || "—"}</td>
                                        <td className="p-4 text-gray-600">
                                            {[lead.campaign, lead.landingPage].filter(Boolean).join(" · ") || "—"}
                                        </td>
                                        <td className="p-4">
                                            <span className={`font-bold px-2 py-0.5 rounded ${badge}`}>{lead.stage || "NEW"}</span>
                                        </td>
                                        <td className="p-4 text-right">
                                            {lead.assignedTo ? (
                                                <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded">Assigned</span>
                                            ) : (
                                                <span className="bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded">Unassigned</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
