"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";

export default function AddProjectPage() {
    const router = useRouter();

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:bg-gray-100 rounded-xl">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Add New Real-Estate Project</h1>
                    <p className="text-sm text-gray-500">Configure project towers, developer details, location, and amenities.</p>
                </div>
            </div>

            <form onSubmit={e => { e.preventDefault(); router.push("/dashboard/inventory"); }} className="max-w-2xl bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Project Name</label>
                    <input type="text" required placeholder="e.g. Spaceezy Grand Residency" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Developer</label>
                        <input type="text" placeholder="e.g. Spaceezy Infra" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Location / City</label>
                        <input type="text" placeholder="e.g. Sector 45, Gurugram" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold" />
                    </div>
                </div>
                <div className="pt-4 flex justify-end gap-3">
                    <button type="button" onClick={() => router.back()} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-purple-700">Save Project</button>
                </div>
            </form>
        </div>
    );
}
