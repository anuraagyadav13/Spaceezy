"use client";
import { GitFork, Zap } from "lucide-react";

export default function WorkflowRulesPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Automated Workflow & SLA Rules</h1>
                <p className="text-sm text-gray-500">Configure round-robin lead assignment, SLA alerts, and follow-up triggers.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="font-bold text-gray-900 text-sm">Round-Robin Lead Assignment Rule</p>
                        <p className="text-xs text-gray-500">Automatically distribute website leads evenly to available sales executives.</p>
                    </div>
                    <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">Active</span>
                </div>
            </div>
        </div>
    );
}
