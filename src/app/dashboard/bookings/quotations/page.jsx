"use client";
import { FileText, Download } from "lucide-react";
import Link from "next/link";

export default function QuotationsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Unit Price Quotations</h1>
                    <p className="text-sm text-gray-500">Generated client pricing proposals with agreement breakup.</p>
                </div>
                <Link href="/dashboard/bookings/wizard" className="px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-purple-700">
                    + New Quotation
                </Link>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Quotation Ref</th>
                            <th className="p-4">Client Name</th>
                            <th className="p-4">Property & Unit</th>
                            <th className="p-4">Agreement Value</th>
                            <th className="p-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-black text-purple-600">QT-8801</td>
                            <td className="p-4 font-bold text-gray-900">Sneha Gupta</td>
                            <td className="p-4 text-gray-600">Alpha Residency (B-1204)</td>
                            <td className="p-4 font-extrabold text-purple-700">₹1,50,00,000</td>
                            <td className="p-4 text-right">
                                <button onClick={() => alert("PDF Quotation downloaded!")} className="px-3 py-1.5 bg-gray-100 font-bold text-gray-800 rounded-lg text-xs hover:bg-gray-200 flex items-center gap-1 ml-auto">
                                    <Download size={12} /> PDF Flyer
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
