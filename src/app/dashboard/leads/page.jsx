"use client";
import { useEffect, useState } from "react";
import { getEmployees } from "../../../lib/store";
import { useLeads } from "../../../features/leads/hooks/useLeads";
import { useUpdateLead } from "../../../features/leads/hooks/useUpdateLead";
import LeadForm from "../../../features/leads/components/LeadForm";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";

export default function DashboardLeadsPage() {
    const stages = ["NEW", "CONTACTED", "QUALIFIED", "SITE VISIT", "NEGOTIATION", "BOOKING"];

    const { data: leads = [], isLoading } = useLeads();
    const { mutate: updateLeadStatus } = useUpdateLead();
    
    const [employees, setEmployees] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setEmployees(getEmployees());
        }, 0);
        return () => clearTimeout(timer);
    }, []);

    const moveLead = (leadId, currentStage) => {
        const currentIndex = stages.indexOf(currentStage);
        if (currentIndex < stages.length - 1) {
            updateLeadStatus({ id: leadId, status: stages[currentIndex + 1] });
        }
    };

    const employeeName = (id) => employees.find((e) => e.id === id)?.name || "Unassigned";

    return (
        <div className="flex flex-col h-full overflow-y-auto relative">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 bg-white border-b border-gray-100 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Lead Pipeline</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage and track every lead across your team.</p>
                </div>
                <div className="flex gap-4 items-center w-full sm:w-auto">
                    <PermissionGate permission="lead:create">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200"
                        >
                            + Add Manual Lead
                        </button>
                    </PermissionGate>
                </div>
            </div>

            <div className="flex-1 p-4 sm:p-8 overflow-x-auto">
                <div className="flex gap-6 min-w-max h-full pb-4">
                    {stages.map((stage) => (
                        <div key={stage} className="w-[300px] flex flex-col bg-gray-100/50 rounded-2xl p-4 border border-gray-200">
                            <div className="flex justify-between items-center mb-4 px-2">
                                <h3 className="font-bold text-gray-800 text-sm tracking-wide">{stage}</h3>
                                <span className="bg-white px-2.5 py-1 rounded-md text-xs font-black text-purple-600 border border-gray-200 shadow-sm">
                                    {isLoading ? "..." : leads.filter(l => l.stage === stage).length}
                                </span>
                            </div>
                            <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
                                {leads.filter(lead => lead.stage === stage).map((lead) => (
                                    <div key={lead.id} className="bg-white p-4 rounded-2xl border border-transparent shadow-sm hover:border-purple-300 hover:shadow-md transition-all group cursor-grab">
                                        <div className="flex justify-between items-start mb-3">
                                            <span className="text-[10px] font-black text-white bg-gradient-to-r from-purple-500 to-indigo-500 px-2 py-1 rounded uppercase tracking-wider shadow-sm">
                                                {lead.id}
                                            </span>
                                            <span className="text-[10px] text-gray-500 font-bold bg-gray-100 px-2 py-1 rounded-full border border-gray-200">
                                                {lead.source}
                                            </span>
                                        </div>
                                        <h4 className="font-bold text-gray-900 mb-0.5">{lead.name}</h4>
                                        <p className="text-xs text-gray-500 font-medium mb-3">{lead.phone}</p>
                                        <div className="flex justify-between items-end pt-3 border-t border-gray-100">
                                            <div>
                                                <p className="text-[10px] text-gray-400 font-semibold mb-0.5">INTERESTED IN</p>
                                                <p className="text-xs font-bold text-gray-800">{lead.project}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-400 font-semibold mb-0.5">BUDGET</p>
                                                <p className="text-xs font-black text-emerald-600">{lead.budget}</p>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-2">Owner: {employeeName(lead.assignedTo)}</p>
                                        {stage !== "BOOKING" && (
                                            <PermissionGate permission="lead:update">
                                                <button
                                                    onClick={() => moveLead(lead.id, lead.stage)}
                                                    className="w-full mt-3 py-2 bg-purple-50 text-purple-700 text-xs font-bold rounded-xl opacity-0 group-hover:opacity-100 hover:bg-purple-600 hover:text-white transition-all duration-300 shadow-sm"
                                                >
                                                    Advance to {stages[stages.indexOf(stage) + 1]} →
                                                </button>
                                            </PermissionGate>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-gray-100">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Lead</h2>
                        <LeadForm 
                            employees={employees} 
                            onSuccess={() => setIsModalOpen(false)}
                            onCancel={() => setIsModalOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
