"use client";
import { UserCheck, Clock } from "lucide-react";
import { getEmployees } from "../../../../lib/store";

export default function AgentAvailabilityPage() {
    const employees = getEmployees();

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Sales Agent Telephony Availability</h1>
                <p className="text-sm text-gray-500">Live endpoint availability status for incoming IVR routing vs CRM login.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {employees.map(emp => (
                    <div key={emp.id} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <img src={emp.avatar} alt="" className="w-10 h-10 rounded-full" />
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm">{emp.name}</h3>
                                    <p className="text-xs text-gray-400">{emp.id}</p>
                                </div>
                            </div>
                            <span className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-50"></span>
                        </div>
                        <div className="pt-3 border-t border-gray-100 flex justify-between items-center text-xs font-semibold">
                            <span className="text-gray-500">Softphone Endpoint:</span>
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">READY (Available)</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
