"use client";
import { ShieldCheck, User } from "lucide-react";

export default function AuditLogsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Security Audit Logs</h1>
                <p className="text-sm text-gray-500">Immutable activity logs of lead reassignments, pricing updates, and booking creations.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Action</th>
                            <th className="p-4">Performed By</th>
                            <th className="p-4">Target Entity</th>
                            <th className="p-4 text-right">Timestamp</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                            <td className="p-4 font-bold text-purple-700">Lead Stage Changed to SITE VISIT</td>
                            <td className="p-4 text-gray-900 font-bold">Rahul Sharma (EMP-001)</td>
                            <td className="p-4 text-gray-600">Sapphire Holloway (L-1021)</td>
                            <td className="p-4 text-right text-gray-400">Today, 10:45 AM</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
