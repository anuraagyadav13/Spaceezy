"use client";
import { AlertCircle } from "lucide-react";

export default function CancellationsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Booking Cancellations & Refunds</h1>
                <p className="text-sm text-gray-500">Track requested booking cancellations and refund workflow approval.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Booking Ref</th>
                            <th className="p-4">Customer</th>
                            <th className="p-4">Property</th>
                            <th className="p-4">Cancellation Reason</th>
                            <th className="p-4 text-right">Refund Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-black text-red-600">BK-902</td>
                            <td className="p-4 font-bold text-gray-900">Rajesh Sharma</td>
                            <td className="p-4 text-gray-600">Alpha Residency</td>
                            <td className="p-4 text-gray-500">Loan rejection by bank</td>
                            <td className="p-4 text-right"><span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded">Refund Pending Approval</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
