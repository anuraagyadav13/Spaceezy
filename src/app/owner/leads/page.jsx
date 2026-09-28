// src/app/owner/leads/page.jsx  (/owner/leads)
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeads, addLead, updateLeadStage, getEmployees } from "../../../lib/store";
import { showToast } from "../../../lib/toast";

export default function OwnerLeadsPage() {
    const stages = ["NEW", "CONTACTED", "QUALIFIED", "SITE VISIT", "NEGOTIATION", "BOOKING"];

    const [leads, setLeads] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: "", phone: "", project: "", budget: "", source: "Website", assignedTo: "" });

    useEffect(() => {
        setLeads(getLeads());
        const emps = getEmployees();
        setEmployees(emps);
        if (emps.length) setFormData((f) => ({ ...f, assignedTo: emps[0].id }));
    }, []);

    const moveLead = (leadId, currentStage) => {
        const currentIndex = stages.indexOf(currentStage);
        if (currentIndex < stages.length - 1) {
            updateLeadStage(leadId, stages[currentIndex + 1]);
            showToast(`Moved to ${stages[currentIndex + 1]}`);
            setLeads(getLeads());
        }
    };

    const handleAddLead = (e) => {
        e.preventDefault();
        addLead({ ...formData });
        showToast(`${formData.name} added to the pipeline`);
        setIsModalOpen(false);
        setLeads(getLeads());
        setFormData({ name: "", phone: "", project: "", budget: "", source: "Website", assignedTo: employees[0]?.id || "" });
    };

    const employeeName = (id) => employees.find((e) => e.id === id)?.name || "Unassigned";

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 relative">

            <header className="hidden md:flex justify-end items-center px-8 py-5 gap-6 border-b border-gray-100 bg-white sticky top-0 z-20">
                <nav className="flex gap-8 font-medium text-[13px] text-gray-400">
                    <Link href="/owner" className="py-2 hover:text-purple-600 transition-colors">Overview</Link>
                    <Link href="/owner/leads" className="bg-purple-600 text-white px-5 py-2 rounded-full shadow-sm shadow-purple-200">Leads</Link>
                    <Link href="/owner/properties" className="py-2 hover:text-purple-600 transition-colors">Properties</Link>
                    <Link href="/owner/team" className="py-2 hover:text-purple-600 transition-colors">Team</Link>
                    <Link href="/owner/finance" className="py-2 hover:text-purple-600 transition-colors">Finance</Link>
                </nav>
                <div className="w-10 h-10 rounded-full border-2 border-purple-100 overflow-hidden cursor-pointer hover:border-purple-400 transition-colors">
                    <img src="https://i.pravatar.cc/100?img=33" alt="Profile" className="w-full h-full object-cover" />
                </div>
            </header>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 bg-white border-b border-gray-100 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Lead Pipeline</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage and track every lead across your team.</p>
                </div>
                <div className="flex gap-4 items-center w-full sm:w-auto">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200"
                    >
                        + Add Manual Lead
                    </button>
                </div>
            </div>

            <div className="flex-1 p-4 sm:p-8 overflow-x-auto">
                <div className="flex gap-6 min-w-max h-full pb-4">
                    {stages.map((stage) => (
                        <div key={stage} className="w-[300px] flex flex-col bg-gray-100/50 rounded-2xl p-4 border border-gray-200">
                            <div className="flex justify-between items-center mb-4 px-2">
                                <h3 className="font-bold text-gray-800 text-sm tracking-wide">{stage}</h3>
                                <span className="bg-white px-2.5 py-1 rounded-md text-xs font-black text-purple-600 border border-gray-200 shadow-sm">
                                    {leads.filter(l => l.stage === stage).length}
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
                                            <button
                                                onClick={() => moveLead(lead.id, lead.stage)}
                                                className="w-full mt-3 py-2 bg-purple-50 text-purple-700 text-xs font-bold rounded-xl opacity-0 group-hover:opacity-100 hover:bg-purple-600 hover:text-white transition-all duration-300 shadow-sm"
                                            >
                                                Advance to {stages[stages.indexOf(stage) + 1]} →
                                            </button>
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

                        <form onSubmit={handleAddLead} className="flex flex-col gap-5">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Full Name</label>
                                <input required type="text" placeholder="e.g., John Doe" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all" />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Phone Number</label>
                                <input required type="text" placeholder="+91 9876543210" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Project</label>
                                    <input required type="text" placeholder="e.g., Sky City" value={formData.project} onChange={(e) => setFormData({ ...formData, project: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Budget</label>
                                    <input required type="text" placeholder="e.g., ₹1.5 Cr" value={formData.budget} onChange={(e) => setFormData({ ...formData, budget: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Lead Source</label>
                                <select value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all cursor-pointer">
                                    <option>Website</option>
                                    <option>Referral</option>
                                    <option>Google Ads</option>
                                    <option>Facebook Ads</option>
                                    <option>Direct Call</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Assign To</label>
                                <select value={formData.assignedTo} onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all cursor-pointer">
                                    {employees.map((emp) => (
                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-3 mt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200">
                                    Save Lead
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}