"use client";
import { useState, useEffect } from "react";
import { 
    Phone, PhoneCall, PhoneOff, Mic, MicOff, Volume2, 
    User, Clock, Play, Pause, AlertCircle, ShieldCheck, CheckCircle2
} from "lucide-react";
import { fetchLeads } from "../../../../lib/api/leads";

export default function BrowserSoftphonePage() {
    const [agentStatus, setAgentStatus] = useState("Available"); // Available, On Call, After Call Work
    const [callState, setCallState] = useState("idle"); // idle, ringing, connected, ended
    const [phoneNumber, setPhoneNumber] = useState("+91 98765 43210");
    const [muted, setMuted] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [selectedOutcome, setSelectedOutcome] = useState("Site Visit Scheduled");

    const [leads, setLeads] = useState([]);
    const [activeLead, setActiveLead] = useState({ name: "Sapphire Holloway", phone: "+91 98765 43210", project: "Alpha Residency" });

    useEffect(() => {
        const loadLeads = async () => {
            try {
                const data = await fetchLeads({ limit: 10 });
                const fetchedLeads = data.leads || data || [];
                setLeads(fetchedLeads);
                if (fetchedLeads.length > 0) {
                    setActiveLead(fetchedLeads[0]);
                }
            } catch (error) {
                console.error("Failed to fetch leads", error);
            }
        };
        loadLeads();
    }, []);

    const handleStartCall = () => {
        setCallState("ringing");
        setTimeout(() => {
            setCallState("connected");
            setAgentStatus("On Call");
        }, 2000);
    };

    const handleEndCall = () => {
        setCallState("ended");
        setAgentStatus("After Call Work");
    };

    const handleSaveWrapup = () => {
        setCallState("idle");
        setAgentStatus("Available");
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 py-5 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Browser Softphone & Agent Control</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Telephony integration interface for human sales executives.</p>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-500">Agent Availability:</span>
                    <select 
                        value={agentStatus}
                        onChange={e => setAgentStatus(e.target.value)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-colors ${
                            agentStatus === "Available" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            agentStatus === "On Call" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                    >
                        <option value="Available">Available (Ready for Inbound/Outbound)</option>
                        <option value="On Call">On Call (Busy)</option>
                        <option value="After Call Work">After Call Work (Wrap-up)</option>
                        <option value="Offline">Offline / Lunch Break</option>
                    </select>
                </div>
            </div>

            {/* Softphone Workspace Layout */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* SOFTPHONE DIALER DIALOG */}
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-xl flex flex-col items-center text-center space-y-6">
                        <div className="w-16 h-16 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shadow-inner">
                            <PhoneCall size={32} />
                        </div>

                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
                                Simulated Telephony Line
                            </span>
                            <h2 className="text-2xl font-black text-gray-900 mt-3">{phoneNumber}</h2>
                            <p className="text-xs text-gray-400 mt-1">Lead: <span className="font-bold text-gray-800">{activeLead.name}</span></p>
                        </div>

                        {/* Call Status Display */}
                        {callState === "ringing" && (
                            <div className="bg-amber-50 text-amber-800 border border-amber-200 px-4 py-2 rounded-xl text-xs font-bold animate-pulse">
                                Ringing lead endpoint...
                            </div>
                        )}

                        {callState === "connected" && (
                            <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span> Live Call Connected (01:42)
                            </div>
                        )}

                        {/* Dialpad Keys */}
                        <div className="grid grid-cols-3 gap-3 w-64 my-4">
                            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(key => (
                                <button 
                                    key={key}
                                    onClick={() => setPhoneNumber(prev => prev + key)}
                                    className="h-12 rounded-2xl bg-gray-50 border border-gray-100 font-bold text-gray-800 text-lg hover:bg-gray-100 active:scale-95 transition-all"
                                >
                                    {key}
                                </button>
                            ))}
                        </div>

                        {/* Call Controls */}
                        <div className="flex items-center gap-4 pt-2">
                            {callState === "idle" ? (
                                <button 
                                    onClick={handleStartCall}
                                    className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-all hover:scale-105"
                                >
                                    <Phone size={28} />
                                </button>
                            ) : (
                                <>
                                    <button 
                                        onClick={() => setMuted(!muted)}
                                        className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all ${muted ? "bg-red-50 text-red-600 border-red-200" : "bg-gray-100 text-gray-700"}`}
                                    >
                                        {muted ? <MicOff size={20} /> : <Mic size={20} />}
                                    </button>
                                    <button 
                                        onClick={handleEndCall}
                                        className="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg hover:bg-red-700 transition-all hover:scale-105"
                                    >
                                        <PhoneOff size={28} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* CALL WRAPUP & LEAD SUMMARY */}
                    <div className="space-y-6">
                        {/* Active Lead Summary */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">Connected Lead Identity</h3>
                            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-lg">
                                    {activeLead.name[0]}
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 text-base">{activeLead.name}</h4>
                                    <p className="text-xs text-gray-500">Interested in {activeLead.project || "Alpha Residency"}</p>
                                </div>
                            </div>
                        </div>

                        {/* After Call Work Form */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">After Call Work (ACW) Outcome</h3>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Call Disposition / Outcome</label>
                                <select 
                                    value={selectedOutcome}
                                    onChange={e => setSelectedOutcome(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-800"
                                >
                                    <option>Site Visit Scheduled</option>
                                    <option>Follow-up Call Requested</option>
                                    <option>Not Interested / Disqualified</option>
                                    <option>Wrong Number / Busy</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Call Summary Notes</label>
                                <textarea 
                                    rows="3"
                                    placeholder="Enter call notes here..."
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-medium resize-none focus:outline-none focus:border-purple-500"
                                />
                            </div>

                            <button 
                                onClick={handleSaveWrapup}
                                className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:opacity-95 shadow-sm"
                            >
                                Submit ACW & Mark Ready
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
