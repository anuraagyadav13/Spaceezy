"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { addSiteVisit, getLeads, getEmployees } from "../../../../lib/store";

export default function ScheduleSiteVisitPage() {
    const router = useRouter();
    const leads = getLeads();
    const employees = getEmployees();

    const [leadName, setLeadName] = useState(leads[0]?.name || "Sapphire Holloway");
    const [property, setProperty] = useState("Alpha Residency");
    const [date, setDate] = useState("2026-09-29");
    const [time, setTime] = useState("11:30 AM");
    const [assignedTo] = useState(employees[0]?.id || "EMP-001");

    const handleSubmit = (e) => {
        e.preventDefault();
        addSiteVisit({ leadName, property, date, time, assignedTo, status: "Scheduled" });
        router.push("/dashboard/site-visits");
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:bg-gray-100 rounded-xl">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Schedule Site Visit</h1>
                    <p className="text-sm text-gray-500">Book customer property visit appointment with sales executive assignment.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="max-w-xl bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Lead Name</label>
                    <input type="text" required value={leadName} onChange={e => setLeadName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Target Property</label>
                    <input type="text" required value={property} onChange={e => setProperty(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date</label>
                        <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Time</label>
                        <input type="text" required value={time} onChange={e => setTime(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold" />
                    </div>
                </div>
                <div className="pt-4 flex justify-end gap-3">
                    <button type="button" onClick={() => router.back()} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-purple-700">Confirm Site Visit</button>
                </div>
            </form>
        </div>
    );
}
