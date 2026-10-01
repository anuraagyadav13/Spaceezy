"use client";
import { Play, Mic, FileText } from "lucide-react";

export default function CallRecordingsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Call Recordings Audit Vault</h1>
                <p className="text-sm text-gray-500">Secure playback and QA auditing for simulated audio recordings.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                            <Mic size={18} />
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 text-sm">Sapphire Holloway (L-1021) — 4m 12s</p>
                            <p className="text-xs text-gray-500">Agent: Rahul Sharma • 28 Sep 2026, 10:30 AM</p>
                        </div>
                    </div>
                    <button onClick={() => alert("Simulated audio playback launched!")} className="px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl hover:bg-purple-700 flex items-center gap-1.5">
                        <Play size={14} /> Listen Audio
                    </button>
                </div>
            </div>
        </div>
    );
}
