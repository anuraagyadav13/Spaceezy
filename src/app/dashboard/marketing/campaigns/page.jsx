"use client";
import { Megaphone, DollarSign } from "lucide-react";

export default function CampaignsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Marketing Campaigns & Ad Spend</h1>
                <p className="text-sm text-gray-500">Track active marketing campaigns and ROI metrics.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Campaign Name</th>
                            <th className="p-4">Platform</th>
                            <th className="p-4">Leads Generated</th>
                            <th className="p-4 text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-bold text-gray-900">Festive Pre-Launch Promo</td>
                            <td className="p-4 text-gray-600">Meta / Instagram Ads</td>
                            <td className="p-4 font-bold text-purple-700">68</td>
                            <td className="p-4 text-right"><span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded">Active</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
