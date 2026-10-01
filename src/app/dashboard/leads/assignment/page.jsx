"use client";
import { useState } from "react";
import { getLeads, getEmployees } from "../../../../lib/store";
import { Users, ArrowRightLeft, CheckCircle2 } from "lucide-react";

export default function LeadAssignmentPage() {
    const [leads, setLeads] = useState(getLeads());
    const employees = getEmployees();
    const [selectedEmployee, setSelectedEmployee] = useState(employees[0]?.id || "");
    const [selectedLeadIds, setSelectedLeadIds] = useState([]);
    const [successMsg, setSuccessMsg] = useState(false);

    const toggleSelect = (id) => {
        setSelectedLeadIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleBulkAssign = () => {
        if (selectedLeadIds.length === 0) return;
        setLeads(prev => prev.map(l => selectedLeadIds.includes(l.id) ? { ...l, assignedTo: selectedEmployee } : l));
        setSuccessMsg(true);
        setTimeout(() => setSuccessMsg(false), 2000);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Lead Assignment & Re-allocation</h1>
                    <p className="text-sm text-gray-500">Bulk reassign leads to available sales executives.</p>
                </div>

                <div className="flex items-center gap-3">
                    <select 
                        value={selectedEmployee} 
                        onChange={e => setSelectedEmployee(e.target.value)}
                        className="bg-white border border-gray-300 rounded-xl px-4 py-2 text-xs font-bold"
                    >
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>Assign to: {emp.name}</option>
                        ))}
                    </select>

                    <button 
                        onClick={handleBulkAssign}
                        className="px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl hover:bg-purple-700 shadow-sm"
                    >
                        {successMsg ? "Assigned!" : `Reassign (${selectedLeadIds.length})`}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4 w-10">Select</th>
                            <th className="p-4">Lead ID</th>
                            <th className="p-4">Lead Name</th>
                            <th className="p-4">Project</th>
                            <th className="p-4">Current Assignee</th>
                            <th className="p-4">Stage</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {leads.map(l => {
                            const emp = employees.find(e => e.id === l.assignedTo);
                            const isSel = selectedLeadIds.includes(l.id);
                            return (
                                <tr key={l.id} className={`hover:bg-gray-50 ${isSel ? "bg-purple-50/50" : ""}`}>
                                    <td className="p-4">
                                        <input 
                                            type="checkbox" 
                                            checked={isSel}
                                            onChange={() => toggleSelect(l.id)}
                                            className="w-4 h-4 accent-purple-600 cursor-pointer"
                                        />
                                    </td>
                                    <td className="p-4 font-black text-purple-600">{l.id}</td>
                                    <td className="p-4 font-bold text-gray-900">{l.name}</td>
                                    <td className="p-4 text-gray-600">{l.project}</td>
                                    <td className="p-4 font-bold text-gray-800">{emp?.name || "Unassigned"}</td>
                                    <td className="p-4"><span className="bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded">{l.stage}</span></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
