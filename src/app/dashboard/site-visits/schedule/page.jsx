"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSiteVisit } from "../../../../lib/api/siteVisits";
import { fetchLeads } from "../../../../lib/api/leads";
import { fetchUsers } from "../../../../lib/api/users";
import { showToast } from "../../../../lib/toast";

export default function ScheduleSiteVisitPage() {
    const router = useRouter();
    const [leads, setLeads] = useState([]);
    const [employees, setEmployees] = useState([]);
    
    const [leadName, setLeadName] = useState("");
    const [property, setProperty] = useState("");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [assignedTo, setAssignedTo] = useState("");

    useEffect(() => {
        Promise.all([
            fetchLeads({ limit: 100 }),
            fetchUsers({ limit: 100 })
        ]).then(([leadsData, usersData]) => {
            const leadsList = Array.isArray(leadsData) ? leadsData : (leadsData?.leads || []);
            const usersList = Array.isArray(usersData) ? usersData : (usersData?.users || []);
            
            setLeads(leadsList);
            setEmployees(usersList);
            
            if (leadsList.length > 0) setLeadName(leadsList[0].name);
            if (usersList.length > 0) setAssignedTo(usersList[0].id);
        }).catch(err => {
            showToast("Failed to load reference data", "error");
        });
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await createSiteVisit({
                leadName,
                property,
                date,
                time,
                assignedToId: assignedTo,
                status: "Scheduled"
            });
            showToast("Site visit scheduled successfully", "success");
            router.push("/dashboard/site-visits");
        } catch (error) {
            showToast("Failed to schedule site visit", "error");
        }
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
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Assign To</label>
                    <select 
                        value={assignedTo} 
                        onChange={e => setAssignedTo(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                    >
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                    </select>
                </div>
                <div className="pt-4 flex justify-end gap-3">
                    <button type="button" onClick={() => router.back()} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-purple-700">Confirm Site Visit</button>
                </div>
            </form>
        </div>
    );
}
