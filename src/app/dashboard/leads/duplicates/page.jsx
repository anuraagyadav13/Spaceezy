"use client";
import { useState } from "react";
import { Copy, ShieldAlert, CheckCircle2 } from "lucide-react";
import { getLeads } from "../../../../lib/store";

export default function DuplicateLeadsPage() {
    const leads = getLeads();

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Duplicate Leads Review Queue</h1>
                <p className="text-sm text-gray-500">Review matching phone number and email duplicates before safe merging.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs font-medium">
                    <ShieldAlert size={20} className="shrink-0" />
                    <span>Spaceezy duplicate rules strictly require manual confirmation. No records will be silently overwritten.</span>
                </div>

                <div className="divide-y divide-gray-100">
                    <div className="py-4 flex justify-between items-center">
                        <div>
                            <span className="text-[10px] font-bold uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded">Phone Match (+91 9000000001)</span>
                            <h3 className="font-bold text-gray-900 text-base mt-1">Sapphire Holloway (L-1021) vs Sapphire H. (L-1099)</h3>
                            <p className="text-xs text-gray-500">Created 2 days apart via Website and Meta Ads</p>
                        </div>
                        <button 
                            onClick={() => alert("Simulated safe merge opened!")}
                            className="px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl hover:bg-purple-700 shadow-sm"
                        >
                            Compare & Merge
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
