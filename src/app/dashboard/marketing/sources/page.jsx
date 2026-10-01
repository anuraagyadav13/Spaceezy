"use client";
import { Megaphone, Globe, Share2 } from "lucide-react";

export default function LeadSourcesPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Lead Sources & Sub-sources Config</h1>
                <p className="text-sm text-gray-500">Configure lead channels, portals, and attribution tags.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Source Category</th>
                            <th className="p-4">Sub-sources</th>
                            <th className="p-4 text-right">Lead Count</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-bold text-gray-900">Website organic</td>
                            <td className="p-4 text-gray-600">Home page form, Property page enquiry</td>
                            <td className="p-4 text-right font-black text-purple-600">42</td>
                        </tr>
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-bold text-gray-900">Google Paid Search</td>
                            <td className="p-4 text-gray-600">Gurugram 3BHK Campaign</td>
                            <td className="p-4 text-right font-black text-purple-600">35</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
