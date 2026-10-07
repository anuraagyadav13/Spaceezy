"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PhoneCall, Search, ExternalLink, PhoneOff, AlertCircle } from "lucide-react";
import { fetchLeads } from "../../../../lib/api/leads";
import { useTelephonyStatus, useInitiateCall, useCalls } from "../../../../features/communication/hooks/useCommunication";
import CallPanel from "../../../../features/communication/components/CallPanel";
import CallOutcomePopup from "../../../../features/communication/components/CallOutcomePopup";
import { showToast } from "../../../../lib/toast";

export default function BrowserSoftphonePage() {
    const { data: status, isLoading: statusLoading } = useTelephonyStatus();
    const initiateCall = useInitiateCall();
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [selectedLeadId, setSelectedLeadId] = useState(null);
    const [activeCall, setActiveCall] = useState(null);
    const [outcomeCall, setOutcomeCall] = useState(null);

    const { data: leadsData, isLoading: leadsLoading } = useQuery({
        queryKey: ["leads", "softphone", search],
        queryFn: () => fetchLeads({ limit: 10, ...(search ? { search } : {}) }),
        retry: 1
    });

    const { data: recentCalls } = useCalls({ limit: 10 });

    const leads = leadsData?.leads || [];
    const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;

    const handleSearch = (event) => {
        event.preventDefault();
        setSearch(searchInput.trim());
    };

    const handleStartCall = async () => {
        if (!selectedLead) {
            showToast("Select a lead to call first", "error");
            return;
        }
        if (!status?.configured) {
            showToast(
                "Telephony not configured. Ask your administrator to configure a telephony provider.",
                "error"
            );
            return;
        }
        try {
            const call = await initiateCall.mutateAsync({ leadId: selectedLead.id });
            setActiveCall(call);
        } catch (err) {
            const map = {
                TELEPHONY_NOT_CONFIGURED:
                    "Telephony not configured. Ask your administrator to configure a telephony provider.",
                TELEPHONY_PROVIDER_ERROR: "The telephony provider is unreachable. Please try again."
            };
            showToast(map[err?.code] || err?.message || "Failed to start the call", "error");
        }
    };

    const handleCallEnded = (updated) => {
        setActiveCall(null);
        if (updated && (updated.status === "COMPLETED" || updated.status === "MISSED")) {
            setOutcomeCall(updated);
        } else if (updated?.status === "FAILED") {
            showToast("The call failed before connecting", "error");
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 py-5 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Browser Softphone</h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Calls are placed through the business telephony provider — never from a personal number.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {statusLoading ? (
                        <span className="text-xs text-gray-400">Checking telephony...</span>
                    ) : status?.configured ? (
                        <span className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-full border ${status.simulated ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                            {status.provider} {status.simulated ? "· simulated line" : "· live"}
                            {status.businessNumber ? ` · ${status.businessNumber}` : ""}
                        </span>
                    ) : (
                        <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full border bg-red-50 text-red-700 border-red-200">
                            Telephony not configured
                        </span>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Dialer / lead picker */}
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-xl flex flex-col space-y-5">
                        {!status?.configured ? (
                            <div className="text-center py-8">
                                <span className="mx-auto w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
                                    <AlertCircle size={26} />
                                </span>
                                <h2 className="text-lg font-bold text-gray-900 mt-4">Telephony not configured</h2>
                                <p className="text-sm text-gray-500 mt-2">
                                    Calls cannot be placed until a telephony provider is connected. The CRM will not
                                    simulate calls or fake call status.
                                </p>
                            </div>
                        ) : (
                            <>
                                <form onSubmit={handleSearch} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                        placeholder="Search leads by name or phone"
                                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                                    />
                                    <button
                                        type="submit"
                                        className="px-3 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                        aria-label="Search leads"
                                    >
                                        <Search size={16} />
                                    </button>
                                </form>

                                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                                    {leadsLoading && <p className="text-sm text-gray-400">Loading leads...</p>}
                                    {!leadsLoading && leads.length === 0 && (
                                        <p className="text-sm text-gray-500">No leads found.</p>
                                    )}
                                    {leads.map((lead) => (
                                        <button
                                            key={lead.id}
                                            onClick={() => setSelectedLeadId(lead.id)}
                                            className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                                                selectedLead?.id === lead.id
                                                    ? "border-emerald-400 bg-emerald-50"
                                                    : "border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
                                        >
                                            <p className="text-sm font-bold text-gray-900">{lead.name}</p>
                                            <p className="text-xs text-gray-500">
                                                {lead.phone}
                                                {lead.status ? ` · ${String(lead.status).toLowerCase()}` : ""}
                                                {lead.piiMasked ? " · masked" : ""}
                                            </p>
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Calling as</p>
                                        <p className="text-sm font-bold text-gray-900">
                                            {selectedLead ? selectedLead.name : "No lead selected"}
                                        </p>
                                        <p className="text-xs text-gray-500">{selectedLead?.phone || "—"}</p>
                                    </div>
                                    <button
                                        onClick={handleStartCall}
                                        disabled={!selectedLead || initiateCall.isPending}
                                        className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg hover:bg-emerald-700 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="Start call"
                                    >
                                        <PhoneCall size={26} />
                                    </button>
                                </div>

                                {activeCall && (
                                    <CallPanel call={activeCall} lead={selectedLead} onEnded={handleCallEnded} />
                                )}
                            </>
                        )}
                    </div>

                    {/* Recent calls + lead link */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">Recent Calls</h3>
                                <Link href="/dashboard/calling/history" className="text-xs font-bold text-purple-600 hover:underline flex items-center gap-1">
                                    Full history <ExternalLink size={12} />
                                </Link>
                            </div>
                            {(recentCalls?.calls || []).length === 0 ? (
                                <p className="text-sm text-gray-500">No calls yet.</p>
                            ) : (
                                <ul className="space-y-3">
                                    {recentCalls.calls.map((call) => (
                                        <li key={call.id} className="flex items-center justify-between gap-3 text-sm">
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-900 truncate">
                                                    {call.lead?.name || "Unknown lead"}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(call.createdAt).toLocaleString()}
                                                    {call.duration ? ` · ${call.duration}s` : ""}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-md ${call.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : call.status === "FAILED" || call.status === "MISSED" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                                                {call.disposition ? String(call.disposition).replace(/_/g, " ") : call.status}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm text-xs text-gray-500 space-y-2">
                            <p className="flex items-center gap-2 font-bold text-gray-700 text-xs uppercase tracking-wider">
                                <PhoneOff size={14} /> How calls work
                            </p>
                            <p>
                                The CRM asks the connected telephony provider to place the call from the business
                                number. Phone numbers are masked for roles without PII access, call events stream back
                                through signed webhooks, and every outcome is recorded on the lead timeline.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <CallOutcomePopup
                call={outcomeCall}
                lead={outcomeCall?.leadId === selectedLead?.id ? selectedLead : null}
                isOpen={Boolean(outcomeCall)}
                onClose={() => setOutcomeCall(null)}
            />
        </div>
    );
}
