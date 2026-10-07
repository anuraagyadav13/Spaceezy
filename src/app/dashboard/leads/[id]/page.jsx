"use client";
import { useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadById } from "../../../../lib/api/leads";
import {
    ArrowLeft, Phone, Mail, MessageSquare, Calendar as CalendarIcon,
    FileText, Search, User, CalendarCheck, CheckSquare, Pencil, Share2
} from "lucide-react";
import ContactLeadModal from "../../../../features/pipeline/components/modals/ContactLeadModal";
import ScheduleFollowUpModal from "../../../../features/pipeline/components/modals/ScheduleFollowUpModal";
import UnifiedTimeline from "../../../../features/communication/components/UnifiedTimeline";
import CallPanel from "../../../../features/communication/components/CallPanel";
import CallOutcomePopup from "../../../../features/communication/components/CallOutcomePopup";
import CreateTaskModal from "../../../../features/communication/components/CreateTaskModal";
import SharePropertyModal from "../../../../components/shared/SharePropertyModal";
import { useTelephonyStatus, useInitiateCall, useCalls, useLeadTimeline } from "../../../../features/communication/hooks/useCommunication";
import { useCreateConversation, useConversations, useMessages, useWhatsAppStatus } from "../../../../features/communication/hooks/useWhatsApp";
import { usePermissions } from "../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../lib/toast";

const TABS = ["Activity", "Starred", "Notes", "Calls", "WhatsApp", "History", "Follow-ups", "Emails"];

export default function LeadProfile() {
    const params = useParams();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("Activity");
    const [modal, setModal] = useState(null);
    const [activeCall, setActiveCall] = useState(null);
    const [outcomeCall, setOutcomeCall] = useState(null);

    const { hasPermission } = usePermissions();
    const { data: telephony } = useTelephonyStatus();
    const { data: whatsappStatus } = useWhatsAppStatus();
    const initiateCall = useInitiateCall();
    const createConversation = useCreateConversation();

    const {
        data: lead,
        isLoading,
        isError,
        error
    } = useQuery({
        queryKey: ["lead", params.id],
        queryFn: () => fetchLeadById(params.id),
        retry: 1
    });

    const leadId = typeof params.id === "string" ? params.id : "";
    const { data: callsData } = useCalls({ leadId, limit: 50 }, { enabled: Boolean(leadId) });
    const { data: timelineData } = useLeadTimeline(leadId, { enabled: Boolean(leadId) });
    const { data: conversations } = useConversations({ leadId }, { enabled: Boolean(leadId) });
    const conversation = Array.isArray(conversations) ? conversations[0] : null;
    const { data: thread } = useMessages(conversation?.id, {}, { enabled: Boolean(conversation?.id) });

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">Loading Lead 360...</div>;
    }

    if (isError || !lead) {
        const status = error?.status;
        return (
            <div className="p-8 text-center">
                <p className="text-gray-700 font-bold mb-1">
                    {status === 404
                        ? "Lead not found"
                        : status === 403
                            ? "You do not have permission to view this lead"
                            : status === 401
                                ? "Session expired. Please sign in again."
                                : "Failed to load lead profile"}
                </p>
                <p className="text-sm text-gray-500">{error?.message || "Unknown error"}</p>
                <button onClick={() => router.back()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-600 hover:bg-purple-50 rounded-xl">
                    Go back
                </button>
            </div>
        );
    }

    const currentStatus = lead.status || lead.stage || "NEW";
    const projectName =
        typeof lead.project === "string" ? lead.project : lead.project?.name || "";
    const siteVisitCount = lead._count?.siteVisits ?? 0;
    const quotationCount = lead._count?.quotations ?? 0;
    const callsTotal = callsData?.total ?? 0;
    const activitiesTotal = timelineData?.total ?? 0;

    const handleCall = async () => {
        if (!telephony?.configured) {
            showToast(
                "Telephony not configured. Ask your administrator to connect a telephony provider.",
                "error"
            );
            return;
        }
        try {
            const call = await initiateCall.mutateAsync({ leadId: lead.id });
            setActiveCall(call);
        } catch (err) {
            const map = {
                TELEPHONY_NOT_CONFIGURED:
                    "Telephony not configured. Ask your administrator to connect a telephony provider.",
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

    const handleOpenWhatsApp = async () => {
        if (!whatsappStatus?.configured) {
            showToast(
                "WhatsApp integration is not configured. Ask your administrator to connect the WhatsApp Business API.",
                "error"
            );
            return;
        }
        try {
            await createConversation.mutateAsync({ leadId: lead.id });
            router.push(`/dashboard/calling/whatsapp?leadId=${lead.id}`);
        } catch (err) {
            showToast(err?.message || "Failed to open the conversation", "error");
        }
    };

    const renderTimeline = (kinds) => (
        <div className="max-w-3xl">
            <UnifiedTimeline leadId={lead.id} kinds={kinds} />
        </div>
    );

    const messages = thread?.messages || [];

    return (
        <div className="flex h-full overflow-hidden bg-gray-50/50">
            {/* Main Column */}
            <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                {/* Header Section */}
                <div className="bg-white border-b border-gray-100 shrink-0">
                    <div className="px-4 sm:px-8 py-4 flex items-center gap-4">
                        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black text-white bg-gradient-to-r from-purple-500 to-indigo-500 px-2 py-1 rounded uppercase tracking-wider shadow-sm">
                                {lead.id}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100">
                                {currentStatus}
                            </span>
                            <span className="text-xs text-gray-500 font-bold bg-gray-100 px-2.5 py-1 rounded-md border border-gray-200">
                                {lead.source || "Unknown Source"}
                            </span>
                            {lead.piiMasked && (
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 uppercase">
                                    Contact masked
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="px-4 sm:px-8 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                        <div className="flex gap-5 items-center">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-100 to-blue-100 border border-purple-200 flex items-center justify-center shadow-sm shrink-0">
                                <User size={28} className="text-purple-600" />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{lead.name}</h1>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm font-medium text-gray-600">
                                    <p className="flex items-center gap-1.5"><Phone size={14} className="text-gray-400"/> {lead.phone}</p>
                                    {lead.email && <p className="flex items-center gap-1.5"><Mail size={14} className="text-gray-400"/> {lead.email}</p>}
                                </div>
                            </div>
                        </div>

                        {/* Quick Action Toolbar */}
                        <div className="flex flex-wrap items-center gap-2">
                            {hasPermission("lead:update") && (
                                <Link
                                    href={`/dashboard/leads/${lead.id}/edit`}
                                    className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm"
                                >
                                    <Pencil size={16} /> <span className="hidden sm:inline">Edit</span>
                                </Link>
                            )}
                            {hasPermission("lead:update") && (
                                <ActionBtn icon={FileText} label="Note" onClick={() => setModal("note")} />
                            )}
                            {hasPermission("call:create") && (
                                <ActionBtn
                                    icon={Phone}
                                    label="Call"
                                    color="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                    onClick={handleCall}
                                    disabled={initiateCall.isPending}
                                />
                            )}
                            {hasPermission("whatsapp:create") && (
                                <ActionBtn
                                    icon={MessageSquare}
                                    label="WhatsApp"
                                    color="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                    onClick={handleOpenWhatsApp}
                                    disabled={createConversation.isPending}
                                />
                            )}
                            {hasPermission("whatsapp:create") && (
                                <ActionBtn
                                    icon={Share2}
                                    label="Share Property"
                                    color="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                    onClick={() => setModal("share")}
                                />
                            )}
                            {hasPermission("site_visit:create") && (
                                <Link
                                    href={`/dashboard/site-visits/schedule?leadId=${lead.id}`}
                                    className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm"
                                >
                                    <CalendarIcon size={16} /> <span className="hidden sm:inline">Site Visit</span>
                                </Link>
                            )}
                            {hasPermission("task:create") && (
                                <>
                                    <ActionBtn icon={CalendarCheck} label="Follow-up" onClick={() => setModal("followup")} />
                                    <ActionBtn icon={CheckSquare} label="Task" onClick={() => setModal("task")} />
                                </>
                            )}
                            <Link href={`/dashboard/leads/${lead.id}/match`} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                                <Search size={16} /> Property Match
                            </Link>
                        </div>
                    </div>

                    {activeCall && (
                        <div className="px-4 sm:px-8 pb-4">
                            <CallPanel call={activeCall} lead={lead} onEnded={handleCallEnded} />
                        </div>
                    )}
                </div>

                {/* Tabs & Content */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="px-4 sm:px-8 border-b border-gray-200 shrink-0 bg-white flex gap-1 overflow-x-auto hide-scrollbar">
                        {TABS.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? "border-purple-600 text-purple-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar bg-gray-50/50">
                        {activeTab === "Activity" && renderTimeline()}
                        {activeTab === "Notes" && renderTimeline(["NOTE"])}
                        {activeTab === "History" && renderTimeline(["STATUS_CHANGE", "ASSIGNMENT"])}
                        {activeTab === "Follow-ups" && renderTimeline(["FOLLOW_UP", "TASK"])}
                        {activeTab === "Calls" && (
                            <div className="max-w-3xl space-y-3">
                                {(callsData?.calls || []).length === 0 ? (
                                    <EmptyBox text="No calls recorded for this lead yet." />
                                ) : (
                                    callsData.calls.map((call) => (
                                        <div key={call.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900">
                                                    {call.direction === "OUTBOUND" ? "Outbound" : "Inbound"} call
                                                    {call.disposition && (
                                                        <span className="ml-2 text-xs font-black uppercase text-emerald-600">
                                                            {String(call.disposition).replace(/_/g, " ")}
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {new Date(call.createdAt).toLocaleString()}
                                                    {call.duration ? ` · ${call.duration}s` : ""}
                                                    {call.provider === "mock" ? " · simulated" : ""}
                                                </p>
                                                {call.notes && <p className="text-xs text-gray-600 mt-1">{call.notes}</p>}
                                            </div>
                                            <span className={`shrink-0 text-[11px] font-black uppercase px-2 py-1 rounded-md ${call.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : call.status === "MISSED" || call.status === "FAILED" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                                                {call.status}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                        {activeTab === "WhatsApp" && (
                            <div className="max-w-3xl space-y-3">
                                {!whatsappStatus?.configured && (
                                    <EmptyBox text="WhatsApp integration is not configured. Ask your administrator to connect the WhatsApp Business API." />
                                )}
                                {whatsappStatus?.configured && !conversation && (
                                    <EmptyBox text="No WhatsApp conversation with this lead yet.">
                                        <button
                                            onClick={handleOpenWhatsApp}
                                            disabled={createConversation.isPending}
                                            className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                        >
                                            {createConversation.isPending ? "Starting..." : "Start conversation"}
                                        </button>
                                    </EmptyBox>
                                )}
                                {conversation && (
                                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                                            <p className="text-sm font-bold text-gray-900">Conversation</p>
                                            <Link href={`/dashboard/calling/whatsapp?leadId=${lead.id}`} className="text-xs font-bold text-green-700 hover:underline">
                                                Open in WhatsApp Center
                                            </Link>
                                        </div>
                                        <div className="p-4 space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                                            {messages.length === 0 && <p className="text-sm text-gray-500">No messages yet.</p>}
                                            {messages.map((m) => (
                                                <div key={m.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.direction === "OUTBOUND" ? "ml-auto bg-green-50 text-green-900" : "bg-gray-100 text-gray-800"}`}>
                                                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                                    <p className="text-[10px] mt-1 opacity-60">
                                                        {new Date(m.createdAt).toLocaleString()} · {String(m.status || "").toLowerCase()}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {activeTab === "Starred" && <EmptyBox text="No starred activity for this lead." />}
                        {activeTab === "Emails" && <EmptyBox text="No emails logged — the email channel is not configured." />}
                    </div>
                </div>
            </div>

            {/* Right Sidebar: Profile Details */}
            <div className="hidden xl:flex flex-col w-80 border-l border-gray-200 bg-white shrink-0 overflow-y-auto custom-scrollbar">
                <div className="p-6">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Lead Requirements</h3>
                    <div className="space-y-4">
                        <DetailRow label="Interested In" value={projectName || "Any"} />
                        {lead.property && (
                            <DetailRow
                                label="Interested Unit"
                                value={lead.property.unitNumber ? `Unit ${lead.property.unitNumber}` : lead.property.title || "Unit"}
                            />
                        )}
                        <DetailRow label="Budget" value={lead.budget || "Not specified"} className="text-emerald-600 font-black" />
                        <DetailRow label="Location" value={lead.project?.city || "Not specified"} />
                        <DetailRow
                            label="Next Follow-up"
                            value={lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleString() : "None scheduled"}
                        />
                    </div>

                    <hr className="my-6 border-gray-100" />

                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Ownership</h3>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0 border border-white shadow-sm">
                            <Image src={`https://i.pravatar.cc/150?u=${lead.assignedToId || "unassigned"}`} alt="" width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">{lead.assignedTo?.name || "Unassigned"}</p>
                            {lead.assignedTo?.name && <p className="text-xs text-gray-500">Sales</p>}
                        </div>
                    </div>

                    <hr className="my-6 border-gray-100" />

                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Engagement Metrics</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <MetricCard label="Site Visits" value={siteVisitCount} />
                        <MetricCard label="Quotations" value={quotationCount} />
                        <MetricCard label="Calls Logged" value={callsTotal} />
                        <MetricCard label="Timeline Events" value={activitiesTotal} />
                    </div>
                </div>
            </div>

            {/* Communication Modals */}
            <ContactLeadModal lead={lead} advanceToContacted={false} defaultChannel="MANUAL" isOpen={modal === "note"} onClose={() => setModal(null)} />
            <ScheduleFollowUpModal lead={lead} isOpen={modal === "followup"} onClose={() => setModal(null)} />
            <CreateTaskModal lead={lead} isOpen={modal === "task"} onClose={() => setModal(null)} />
            <SharePropertyModal leadId={lead.id} isOpen={modal === "share"} onClose={() => setModal(null)} />
            <CallOutcomePopup
                call={outcomeCall}
                lead={lead}
                isOpen={Boolean(outcomeCall)}
                onClose={() => setOutcomeCall(null)}
            />
        </div>
    );
}

// Helpers
function ActionBtn({ icon: Icon, label, color = "bg-white text-gray-700 border-gray-200 hover:bg-gray-50", onClick, disabled }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${color}`}
        >
            <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

function EmptyBox({ text, children }) {
    return (
        <div className="text-center text-gray-500 p-12 border border-dashed border-gray-200 rounded-2xl bg-white">
            <p>{text}</p>
            {children}
        </div>
    );
}

function DetailRow({ label, value, className = "text-gray-900 font-bold" }) {
    return (
        <div>
            <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
            <p className={`text-sm ${className}`}>{value}</p>
        </div>
    );
}

function MetricCard({ label, value }) {
    return (
        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
            <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
        </div>
    );
}
