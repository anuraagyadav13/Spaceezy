// src/app/employee/leads/page.jsx  (/employee/leads)
"use client";
import { useEffect, useState } from "react";
import { getCurrentEmployeeId } from "../../../lib/auth";
import { getLeadsByEmployee, addLead, updateLeadStage } from "../../../lib/store";
import { showToast } from "../../../lib/toast";
import Modal from "../../../components/shared/Modal";

const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "SITE VISIT", "NEGOTIATION", "BOOKING"];

export default function EmployeeLeadsPage() {
    const [employeeId, setEmployeeId] = useState(null);
    const [leads, setLeads] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState({ name: "", phone: "", project: "", budget: "", source: "Website" });

    useEffect(() => {
        const id = getCurrentEmployeeId();
        setEmployeeId(id);
        if (id) setLeads(getLeadsByEmployee(id));
    }, []);

    const refresh = (id) => setLeads(getLeadsByEmployee(id));

    const handleAdd = (e) => {
        e.preventDefault();
        addLead({ ...form, assignedTo: employeeId });
        showToast(`${form.name} added to your pipeline`);
        setForm({ name: "", phone: "", project: "", budget: "", source: "Website" });
        setIsModalOpen(false);
        refresh(employeeId);
    };

    const handleAdvance = (leadId, stage) => {
        const idx = STAGES.indexOf(stage);
        if (idx < STAGES.length - 1) {
            updateLeadStage(leadId, STAGES[idx + 1]);
            showToast(`Moved to ${STAGES[idx + 1]}`);
            refresh(employeeId);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto pt-16 md:pt-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Leads</h1>
                    <p className="text-sm text-gray-500 mt-1">Leads currently assigned to you.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                    + Add Lead
                </button>
            </div>

            <div className="flex-1 px-4 sm:px-8 pb-8 overflow-x-auto">
                <div className="flex gap-6 min-w-max h-full">
                    {STAGES.map((stage) => (
                        <div key={stage} className="w-[280px] flex flex-col bg-white/60 rounded-2xl p-4 border border-gray-200">
                            <div className="flex justify-between items-center mb-4 px-1">
                                <h3 className="font-bold text-gray-800 text-sm">{stage}</h3>
                                <span className="bg-white px-2 py-1 rounded-md text-xs font-black text-purple-600 border border-gray-200">
                                    {leads.filter((l) => l.stage === stage).length}
                                </span>
                            </div>
                            <div className="flex flex-col gap-3">
                                {leads.filter((l) => l.stage === stage).map((lead) => (
                                    <div key={lead.id} className="bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-all group">
                                        <h4 className="font-bold text-gray-900 mb-0.5 text-sm">{lead.name}</h4>
                                        <p className="text-xs text-gray-500 mb-2">{lead.phone}</p>
                                        <div className="flex justify-between text-xs">
                                            <span className="font-medium text-gray-700">{lead.project}</span>
                                            <span className="font-bold text-emerald-600">{lead.budget}</span>
                                        </div>
                                        {stage !== "BOOKING" && (
                                            <button
                                                onClick={() => handleAdvance(lead.id, lead.stage)}
                                                className="w-full mt-3 py-1.5 bg-purple-50 text-purple-700 text-xs font-bold rounded-xl opacity-0 group-hover:opacity-100 hover:bg-purple-600 hover:text-white transition-all"
                                            >
                                                Advance →
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Lead">
                <form onSubmit={handleAdd} className="flex flex-col gap-4">
                    <input required placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-purple-400" />
                    <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-purple-400" />
                    <div className="grid grid-cols-2 gap-4">
                        <input required placeholder="Project" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-purple-400" />
                        <input required placeholder="Budget" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-purple-400" />
                    </div>
                    <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                        <option>Website</option><option>Referral</option><option>Google Ads</option><option>Facebook Ads</option>
                    </select>
                    <button type="submit" className="mt-2 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors">Save Lead</button>
                </form>
            </Modal>
        </div>
    );
}