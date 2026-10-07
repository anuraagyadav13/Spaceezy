"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Send, AlertCircle, RefreshCw, Link2 } from "lucide-react";
import { fetchLeads } from "../../../../lib/api/leads";
import { showToast } from "../../../../lib/toast";
import {
    useWhatsAppStatus,
    useConversations,
    useMessages,
    useCreateConversation,
    useSendMessage,
    useWhatsAppTemplates
} from "../../../../features/communication/hooks/useWhatsApp";

const initialParam = (name) => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get(name);
};

const initialLeadId = () => initialParam("leadId");

export default function WhatsAppCenterPage() {
    const { data: status, isLoading: statusLoading } = useWhatsAppStatus();
    const [selectedLeadId, setSelectedLeadId] = useState(initialLeadId);
    // Prefilled, editable draft (e.g. property share flow) from ?message=
    const [draft, setDraft] = useState(() => initialParam("message") || "");
    // When present, the next sent text is tagged as a property share
    // (tracked on the lead timeline with the public URL).
    const [sharePropertyId, setSharePropertyId] = useState(() => initialParam("shareProperty"));
    const [mode, setMode] = useState("text");
    const [templateName, setTemplateName] = useState("");
    const [variableValues, setVariableValues] = useState("");

    const { data: leadsData, isLoading: leadsLoading } = useQuery({
        queryKey: ["leads", "whatsapp-picker"],
        queryFn: () => fetchLeads({ limit: 15 }),
        retry: 1
    });

    const { data: conversations } = useConversations({ limit: 50 });
    const createConversation = useCreateConversation();
    const sendMessage = useSendMessage();
    const { data: templates } = useWhatsAppTemplates();

    const leads = leadsData?.leads || [];
    const conversationList = Array.isArray(conversations) ? conversations : [];
    const conversation = conversationList.find((c) => c.leadId === selectedLeadId) || null;
    const { data: thread, isLoading: threadLoading, refetch, isFetching } = useMessages(conversation?.id, {}, { enabled: Boolean(conversation?.id) });

    const selectedLead = leads.find((l) => l.id === selectedLeadId)
        || conversationList.find((c) => c.leadId === selectedLeadId)?.lead
        || null;

    const templateList = Array.isArray(templates) ? templates.filter((t) => t.active) : [];
    const activeTemplate = templateList.find((t) => t.name === templateName) || null;

    const pickLead = (leadId) => setSelectedLeadId(leadId);

    const handleSend = async () => {
        if (!selectedLeadId) {
            showToast("Select a lead first", "error");
            return;
        }
        if (!status?.configured) {
            showToast(
                "WhatsApp integration is not configured. Ask your administrator to connect the WhatsApp Business API.",
                "error"
            );
            return;
        }

        try {
            let conv = conversation;
            if (!conv) {
                conv = await createConversation.mutateAsync({ leadId: selectedLeadId });
            }

            if (mode === "template") {
                if (!activeTemplate) {
                    showToast("Choose an approved template", "error");
                    return;
                }
                const values = variableValues.split(",").map((v) => v.trim()).filter(Boolean);
                const required = Array.isArray(activeTemplate.variables) ? activeTemplate.variables.length : 0;
                if (values.length < required) {
                    showToast(`This template needs ${required} value(s): ${activeTemplate.variables.join(", ")}`, "error");
                    return;
                }
                await sendMessage.mutateAsync({
                    conversationId: conv.id,
                    templateName: activeTemplate.name,
                    variables: values
                });
            } else {
                if (!draft.trim()) {
                    showToast("Write a message first", "error");
                    return;
                }
                await sendMessage.mutateAsync({
                    conversationId: conv.id,
                    body: draft.trim(),
                    ...(sharePropertyId ? { share: { propertyId: sharePropertyId } } : {})
                });
                setSharePropertyId(null);
            }

            setDraft("");
            setVariableValues("");
            showToast("WhatsApp message sent", "success");
            refetch();
        } catch (err) {
            const map = {
                WHATSAPP_NOT_CONFIGURED:
                    "WhatsApp integration is not configured. Ask your administrator to connect the WhatsApp Business API.",
                CONVERSATION_CLOSED: "This conversation is closed.",
                TEMPLATE_INACTIVE: "This template is inactive."
            };
            showToast(map[err?.code] || err?.message || "Failed to send the message", "error");
        }
    };

    const messages = thread?.messages || [];

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">WhatsApp Center</h1>
                    <p className="text-sm text-gray-500">
                        Real conversations through the WhatsApp Business API with approved templates and signed inbound webhooks.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {statusLoading ? (
                        <span className="text-xs text-gray-400">Checking status...</span>
                    ) : status?.configured ? (
                        <span className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-full border ${status.simulated ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                            {status.provider} {status.simulated ? "· simulated" : "· live"}
                        </span>
                    ) : (
                        <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full border bg-red-50 text-red-700 border-red-200">
                            Not configured
                        </span>
                    )}
                </div>
            </div>

            {!statusLoading && !status?.configured && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm flex items-start gap-3">
                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                    <div>
                        <p className="font-bold">WhatsApp integration is not configured.</p>
                        <p className="mt-0.5">
                            Messaging is disabled until an administrator connects the WhatsApp Business API. The CRM
                            will not simulate deliveries.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm min-h-[420px]">
                {/* Leads & conversations */}
                <div className="border-r border-gray-100 lg:pr-6 space-y-3">
                    <h3 className="text-xs font-black text-gray-400 uppercase">Leads</h3>
                    {leadsLoading && <p className="text-sm text-gray-400">Loading leads...</p>}
                    {leads.map((l) => {
                        const conv = conversationList.find((c) => c.leadId === l.id);
                        return (
                            <button
                                key={l.id}
                                onClick={() => pickLead(l.id)}
                                className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                                    selectedLeadId === l.id
                                        ? "border-green-500 bg-green-50/60"
                                        : "border-gray-100 hover:border-gray-200"
                                }`}
                            >
                                <p className="font-bold text-gray-900 text-sm flex items-center justify-between">
                                    {l.name}
                                    {conv && <MessageSquare size={13} className="text-green-600" />}
                                </p>
                                <p className="text-xs text-gray-500">{l.phone}</p>
                            </button>
                        );
                    })}
                    {!leadsLoading && leads.length === 0 && <p className="text-sm text-gray-500">No leads found.</p>}
                </div>

                {/* Thread */}
                <div className="lg:col-span-2 flex flex-col space-y-4 min-h-0">
                    {!selectedLeadId ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl p-8 text-center">
                            Select a lead to view or start a conversation.
                        </div>
                    ) : !conversation ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-2xl p-8 text-center gap-3">
                            <span>No conversation with {selectedLead?.name || "this lead"} yet.</span>
                            <button
                                onClick={async () => {
                                    if (!status?.configured) {
                                        showToast("WhatsApp integration is not configured.", "error");
                                        return;
                                    }
                                    try {
                                        await createConversation.mutateAsync({ leadId: selectedLeadId });
                                        showToast("Conversation ready", "success");
                                    } catch (err) {
                                        showToast(err?.message || "Failed to start the conversation", "error");
                                    }
                                }}
                                disabled={createConversation.isPending}
                                className="rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                                {createConversation.isPending ? "Starting..." : "Start conversation"}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="bg-green-50 text-green-800 border border-green-200 p-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-3">
                                <span className="truncate">
                                    {selectedLead?.name || conversation.lead?.name} ({selectedLead?.phone || conversation.lead?.phone})
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => refetch()}
                                        className="text-green-700 hover:text-green-900"
                                        aria-label="Refresh messages"
                                    >
                                        <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
                                    </button>
                                    {status?.simulated && (
                                        <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">
                                            Simulated
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 space-y-2 max-h-96 overflow-y-auto custom-scrollbar p-1">
                                {threadLoading && <p className="text-sm text-gray-400">Loading messages...</p>}
                                {messages.length === 0 && !threadLoading && (
                                    <p className="text-sm text-gray-500">No messages yet. Send the first one.</p>
                                )}
                                {messages.map((m) => (
                                    <div
                                        key={m.id}
                                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                                            m.direction === "OUTBOUND"
                                                ? "ml-auto bg-green-100 text-green-900"
                                                : "bg-gray-100 text-gray-800"
                                        }`}
                                    >
                                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                        <p className="text-[10px] mt-1 opacity-60">
                                            {new Date(m.createdAt).toLocaleString()} · {String(m.status || "").toLowerCase()}
                                            {m.sentBy?.name ? ` · ${m.sentBy.name}` : ""}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Composer */}
                            <div className="border-t border-gray-100 pt-4 space-y-3">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setMode("text")}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${mode === "text" ? "bg-green-50 border-green-400 text-green-700" : "bg-white border-gray-200 text-gray-500"}`}
                                    >
                                        Text
                                    </button>
                                    <button
                                        onClick={() => setMode("template")}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${mode === "template" ? "bg-green-50 border-green-400 text-green-700" : "bg-white border-gray-200 text-gray-500"}`}
                                    >
                                        Approved Template
                                    </button>
                                </div>

                                {mode === "text" ? (
                                    <>
                                        {sharePropertyId && (
                                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 w-fit">
                                                <Link2 size={12} />
                                                Property link share — will be tracked on the lead timeline
                                            </div>
                                        )}
                                        <textarea
                                            rows={3}
                                            value={draft}
                                            onChange={(e) => setDraft(e.target.value)}
                                            placeholder="Type a message..."
                                            maxLength={4000}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-green-500"
                                        />
                                    </>
                                ) : (
                                    <div className="space-y-2">
                                        <select
                                            value={templateName}
                                            onChange={(e) => setTemplateName(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm"
                                        >
                                            <option value="">Choose a template...</option>
                                            {templateList.map((t) => (
                                                <option key={t.id || t.name} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                        {activeTemplate?.variables?.length > 0 && (
                                            <input
                                                type="text"
                                                value={variableValues}
                                                onChange={(e) => setVariableValues(e.target.value)}
                                                placeholder={`Values for ${activeTemplate.variables.join(", ")} (comma separated)`}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm"
                                            />
                                        )}
                                        {templateList.length === 0 && (
                                            <p className="text-xs text-gray-400">
                                                No approved templates yet. Administrators can add them under templates.
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="flex justify-end">
                                    <button
                                        onClick={handleSend}
                                        disabled={sendMessage.isPending || createConversation.isPending}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 shadow-sm disabled:opacity-50"
                                    >
                                        <Send size={14} />
                                        {sendMessage.isPending ? "Sending..." : "Send WhatsApp Message"}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="text-xs text-gray-400">
                Templates and messaging follow the official WhatsApp Business API model ·{" "}
                <Link href="/dashboard/calling/history" className="underline hover:text-gray-600">
                    call history
                </Link>
            </div>
        </div>
    );
}
