"use client";
import { useEffect, useState } from "react";
import { MessageSquare, Send, CheckCheck, Sparkles } from "lucide-react";
import { fetchLeads } from "../../../../lib/api/leads";
import { showToast } from "../../../../lib/toast";

export default function WhatsAppCenterPage() {
    const [leads, setLeads] = useState([]);
    const [selectedLead, setSelectedLead] = useState(null);
    const [messageText, setMessageText] = useState("Hi! Here is the detailed proposal for Alpha Residency with 3BHK availability.");
    const [simulatedSent, setSimulatedSent] = useState(false);

    useEffect(() => {
        const loadLeads = async () => {
            try {
                const data = await fetchLeads({ limit: 10 });
                const fetchedLeads = data.leads || data || [];
                setLeads(fetchedLeads);
                if (fetchedLeads.length > 0 && !selectedLead) {
                    setSelectedLead(fetchedLeads[0]);
                }
            } catch (err) {
                showToast(`Failed to load leads: ${err.message}`, "error");
            }
        };
        loadLeads();
    }, []);

    const handleSend = () => {
        setSimulatedSent(true);
        setTimeout(() => setSimulatedSent(false), 2000);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">WhatsApp Messaging Workspace</h1>
                <p className="text-sm text-gray-500">Approved template selection, property placeholders, and message history.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <div className="border-r border-gray-100 pr-6 space-y-3">
                    <h3 className="text-xs font-black text-gray-400 uppercase">Select Recipient Lead</h3>
                    {leads.map(l => (
                        <div 
                            key={l.id}
                            onClick={() => setSelectedLead(l)}
                            className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${selectedLead?.id === l.id ? "border-green-500 bg-green-50/60" : "border-gray-100 hover:border-gray-200"}`}
                        >
                            <p className="font-bold text-gray-900 text-sm">{l.name}</p>
                            <p className="text-xs text-gray-500">{l.phone}</p>
                        </div>
                    ))}
                </div>

                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 rounded-2xl text-xs font-bold flex items-center justify-between">
                        <span>Sending to: {selectedLead?.name} ({selectedLead?.phone})</span>
                        <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">Simulated Sandbox</span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Approved Template Selector</label>
                        <select 
                            onChange={e => setMessageText(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-semibold"
                        >
                            <option value="Hi! Here is the detailed proposal for Alpha Residency with 3BHK availability.">Property Proposal Template</option>
                            <option value="Dear Client, your site visit to Greenwood Complex is confirmed for tomorrow 11 AM.">Site Visit Confirmation Template</option>
                            <option value="Thank you for talking to Spaceezy. Click here to download property brochure.">Brochure Link Template</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Message Preview</label>
                        <textarea 
                            rows="4"
                            value={messageText}
                            onChange={e => setMessageText(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-medium resize-none"
                        />
                    </div>

                    <div className="flex justify-end">
                        <button 
                            onClick={handleSend}
                            className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 shadow-sm"
                        >
                            <Send size={14} /> {simulatedSent ? "Message Sent (Simulated)!" : "Send WhatsApp Message"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
