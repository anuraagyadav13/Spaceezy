"use client";
import Link from "next/link";

export default function WorkflowRulesPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Automated Workflow & SLA Rules</h1>
                <p className="text-sm text-gray-500">Round-robin assignment, SLA alerts, and follow-up triggers.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="font-bold text-gray-900 text-sm">Not implemented</p>
                    <p className="text-xs text-gray-500 mt-1">
                        The backend has no workflow/rule engine yet — no round-robin, SLA, or trigger automation exists.
                        This page will stay empty until that feature is built. For now, use manual
                        {" "}<Link href="/dashboard/leads/assignment" className="text-purple-600 font-bold hover:underline">bulk lead assignment</Link>.
                    </p>
                </div>
            </div>
        </div>
    );
}
