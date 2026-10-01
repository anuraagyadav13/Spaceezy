"use client";
import { Globe, ArrowUpRight } from "lucide-react";

export default function WebsiteEnquiriesPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Website & Portal Inbound Enquiries</h1>
                <p className="text-sm text-gray-500">Live feed of public site enquiry form submissions.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Visitor Name</th>
                            <th className="p-4">Phone / Email</th>
                            <th className="p-4">Property Enquired</th>
                            <th className="p-4 text-right">Processed Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-bold text-gray-900">Vikram Singh</td>
                            <td className="p-4 text-gray-600">+91 98111 22233</td>
                            <td className="p-4 font-bold text-purple-700">Alpha Residency</td>
                            <td className="p-4 text-right"><span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded">Auto-Assigned</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
