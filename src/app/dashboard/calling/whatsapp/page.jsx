"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Send, AlertCircle, RefreshCw, Link2, Search } from "lucide-react";
import { fetchLeads, fetchLeadById } from "../../../../lib/api/leads";
import { fetchPropertyById } from "../../../../lib/api/properties";
import { fetchProjectById } from "../../../../lib/api/projects";
import { showToast } from "../../../../lib/toast";
import { formatCurrency } from "../../../../features/pipeline/helpers";
import { useAuth } from "../../../../features/auth/hooks/useAuth";
import {
    useWhatsAppStatus,
    useConversations,
    useMessages,
    useCreateConversation,
    useSendMessage,
    useWhatsAppTemplates,
    useTemplateLibrary
} from "../../../../features/communication/hooks/useWhatsApp";

// Literal single-pass {{name}} substitution (mirror of the backend preview
// helper). Values are never re-scanned, so a value containing "{{...}}" text
// cannot trigger further substitution. Unresolved variables stay visible.
const renderPreview = (body, values) => {
    const missing = [];
    const text = String(body || "").replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key) => {
        const value = values[key];
        if (value === undefined || value === null || String(value).trim() === "") {
            if (!missing.includes(key)) missing.push(key);
            return `{{${key}}}`;
        }
        return String(value);
    });
    return { text, missing };
};

const initialParam = (name) => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get(name);
};

function WhatsAppCenterPageInner() {
    const { data: status, isLoading: statusLoading } = useWhatsAppStatus();
    // Subscribe to ?leadId= so SPA navigation between leads re-seeds the
    // selection (the mounted page is reused, mount-time initializers go stale).
    const searchParams = useSearchParams();
    const leadIdParam = searchParams.get("leadId");
    const [selectedLeadId, setSelectedLeadId] = useState(leadIdParam);
    const [prevLeadIdParam, setPrevLeadIdParam] = useState(leadIdParam);
    if (leadIdParam !== prevLeadIdParam) {
        setPrevLeadIdParam(leadIdParam);
        setSelectedLeadId(leadIdParam);
    }
    // Prefilled, editable draft (e.g. property share flow) from ?message=
    const [draft, setDraft] = useState(() => initialParam("message") || "");
    // When present, the next sent text is tagged as a property share
    // (tracked on the lead timeline with the public URL).
    const [sharePropertyId, setSharePropertyId] = useState(() => initialParam("shareProperty"));
    const [mode, setMode] = useState("text");
    // Template-mode selection: { kind: "library", entry } | { kind: "custom", row } | null.
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [templateSearch, setTemplateSearch] = useState("");
    // Manual variable overrides keyed by variable name. Anything not
    // overridden falls back to auto-filled record values (see getVar).
    const [varValues, setVarValues] = useState({});
    const { user } = useAuth();

    const { data: leadsData, isLoading: leadsLoading } = useQuery({
        queryKey: ["leads", "whatsapp-picker"],
        queryFn: () => fetchLeads({ limit: 15 }),
        retry: 1
    });

    // Focused lead for ?leadId= opens (fetched directly so it resolves even
    // when outside the first page of the picker list).
    const { data: focusedLead } = useQuery({
        queryKey: ["lead", leadIdParam],
        queryFn: () => fetchLeadById(leadIdParam),
        enabled: Boolean(leadIdParam),
        retry: 1
    });

    const { data: conversations } = useConversations({ limit: 50 });
    const createConversation = useCreateConversation();
    const sendMessage = useSendMessage();
    const { data: templates } = useWhatsAppTemplates();

    const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.leads || []);
    // Focused mode: opened for a particular lead (?leadId=) — show only that
    // lead. Direct opens (no param) show the full picker.
    const leads = leadIdParam
        ? (allLeads.some((l) => l.id === leadIdParam)
            ? allLeads.filter((l) => l.id === leadIdParam)
            : (focusedLead && focusedLead.id ? [focusedLead] : []))
        : allLeads;
    const conversationList = Array.isArray(conversations) ? conversations : [];
    const conversation = conversationList.find((c) => c.leadId === selectedLeadId) || null;
    const { data: thread, isLoading: threadLoading, refetch, isFetching } = useMessages(conversation?.id, {}, { enabled: Boolean(conversation?.id) });

    const selectedLead = leads.find((l) => l.id === selectedLeadId)
        || conversationList.find((c) => c.leadId === selectedLeadId)?.lead
        || null;

    const templateRows = Array.isArray(templates) ? templates.filter((t) => t && t.active !== false) : [];
    const { data: libraryData } = useTemplateLibrary({ enabled: mode === "template" });
    const library = Array.isArray(libraryData) ? libraryData : (libraryData?.templates || []);

    // Property + project context for variable auto-fill. Property resolves
    // from the share flow first, then the lead's linked unit; project follows
    // from either. All lazy and cached; failures leave fields manual.
    const contextPropertyId = sharePropertyId || selectedLead?.propertyId || conversation?.lead?.propertyId || null;
    const { data: contextProperty } = useQuery({
        queryKey: ["property", contextPropertyId],
        queryFn: () => fetchPropertyById(contextPropertyId),
        enabled: mode === "template" && Boolean(contextPropertyId),
        retry: 1
    });
    const contextProjectId = contextProperty?.project?.id
        || contextProperty?.projectId
        || selectedLead?.project?.id
        || selectedLead?.projectId
        || conversation?.lead?.projectId
        || null;
    const { data: contextProject } = useQuery({
        queryKey: ["project", contextProjectId],
        queryFn: () => fetchProjectById(contextProjectId),
        enabled: mode === "template" && Boolean(contextProjectId),
        retry: 1
    });
    const projectData = contextProject?.data || contextProject;

    // Auto-fill only from real records — never invented. Anything unresolvable
    // stays empty for manual completion (see missingVars).
    const priceRange = projectData && projectData.startingPrice != null && projectData.maximumPrice != null
        ? `${formatCurrency(projectData.startingPrice)} – ${formatCurrency(projectData.maximumPrice)}`
        : "";
    const autoVars = {
        customer_name: selectedLead?.name || conversation?.lead?.name || "",
        property_name: contextProperty?.title || selectedLead?.property?.title || "",
        project_name: projectData?.name || selectedLead?.project?.name || contextProperty?.project?.name || "",
        location: [projectData?.locality, projectData?.city].filter(Boolean).join(", "),
        configuration: contextProperty?.configuration || "",
        price_range: priceRange,
        site_address: projectData?.address || "",
        salesperson_name: user?.name || "",
    };
    const getVar = (name) => (varValues[name] !== undefined ? varValues[name] : (autoVars[name] || ""));

    // Unified selectable definitions: library entries + active custom rows.
    // providerTemplateId is intentionally never surfaced here.
    const templateOptions = [
        ...library.map((entry) => ({
            kind: "library",
            key: `library:${entry.name}`,
            name: entry.name,
            group: entry.group || "Custom / Other Templates",
            description: entry.description || "",
            body: entry.body || "",
            variables: Array.isArray(entry.variables) ? entry.variables : [],
        })),
        ...templateRows.map((row) => ({
            kind: "custom",
            key: `custom:${row.id || row.name}`,
            name: row.name,
            group: "Custom / Other Templates",
            description: row.description || `${row.category || "UTILITY"} · ${Array.isArray(row.variables) ? row.variables.length : 0} variable(s)`,
            body: row.body || "",
            variables: Array.isArray(row.variables) ? row.variables : [],
        })),
    ];
    const q = templateSearch.trim().toLowerCase();
    const visibleOptions = q
        ? templateOptions.filter((o) =>
            [o.name, o.description, o.group, ...o.variables].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
        : templateOptions;
    const groupedOptions = [];
    for (const option of visibleOptions) {
        const last = groupedOptions[groupedOptions.length - 1];
        if (last && last.group === option.group) last.items.push(option);
        else groupedOptions.push({ group: option.group, items: [option] });
    }

    const selectedDef = selectedTemplate
        ? (templateOptions.find((o) => o.key === selectedTemplate.key) || null)
        : null;
    const preview = selectedDef && selectedDef.body
        ? renderPreview(selectedDef.body, Object.fromEntries(selectedDef.variables.map((v) => [v, getVar(v)])))
        : { text: "", missing: [] };
    const missingVars = selectedDef
        ? selectedDef.variables.filter((v) => getVar(v).trim() === "")
        : [];

    const selectTemplate = (option) => {
        setSelectedTemplate({ kind: option.kind, key: option.key });
        setVarValues({});
    };

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
                if (!selectedDef) {
                    showToast("Choose a template", "error");
                    return;
                }
                if (missingVars.length > 0) {
                    showToast(`Fill in required values: ${missingVars.join(", ")}`, "error");
                    return;
                }
                await sendMessage.mutateAsync({
                    conversationId: conv.id,
                    templateName: selectedDef.name,
                    variables: selectedDef.variables.map((v) => getVar(v).trim())
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
            setVarValues({});
            showToast("WhatsApp message sent", "success");
            refetch();
        } catch (err) {
            const map = {
                WHATSAPP_NOT_CONFIGURED:
                    "WhatsApp integration is not configured. Ask your administrator to connect the WhatsApp Business API.",
                CONVERSATION_CLOSED: "This conversation is closed.",
                TEMPLATE_INACTIVE: "This template is inactive.",
                TEMPLATE_VARIABLES_MISSING: err?.message || "Fill in all required template values.",
                NOT_FOUND: "Template not found. Refresh the library and retry."
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
                                    <div className="space-y-3">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="text"
                                                value={templateSearch}
                                                onChange={(e) => setTemplateSearch(e.target.value)}
                                                placeholder="Search templates by name, use or variable..."
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-green-500"
                                            />
                                        </div>
                                        {visibleOptions.length === 0 ? (
                                            <p className="text-xs text-gray-400">
                                                {templateOptions.length === 0
                                                    ? "No templates yet. Administrators can add custom templates under templates."
                                                    : "No templates match your search."}
                                            </p>
                                        ) : (
                                            <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
                                                {groupedOptions.map((group) => (
                                                    <div key={group.group}>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">{group.group}</p>
                                                        <div className="space-y-1.5">
                                                            {group.items.map((option) => {
                                                                const isActive = selectedDef?.key === option.key;
                                                                return (
                                                                    <button
                                                                        key={option.key}
                                                                        type="button"
                                                                        onClick={() => selectTemplate(option)}
                                                                        className={`w-full text-left rounded-xl border p-3 transition-all ${isActive ? "border-green-500 bg-green-50/60" : "border-gray-100 hover:border-gray-300 bg-white"}`}
                                                                    >
                                                                        <span className="flex items-center gap-2">
                                                                            <span className="text-sm font-bold text-gray-900">{option.name}</span>
                                                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${option.kind === "library" ? "bg-violet-50 text-violet-700" : "bg-gray-100 text-gray-500"}`}>
                                                                                {option.kind === "library" ? "Library" : "Custom"}
                                                                            </span>
                                                                        </span>
                                                                        {option.description && (
                                                                            <span className="block text-xs text-gray-500 mt-0.5">{option.description}</span>
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {selectedDef && (
                                            <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-xs font-black text-gray-700 uppercase tracking-wider">Preview · {selectedDef.name}</p>
                                                    {status?.simulated && (
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase bg-amber-100 text-amber-700">Simulated</span>
                                                    )}
                                                </div>
                                                {preview.text ? (
                                                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{preview.text}</p>
                                                ) : (
                                                    <p className="text-xs text-gray-400">This template has no preview text — fill in its variables below.</p>
                                                )}
                                                {selectedDef.variables.length > 0 && (
                                                    <div className="space-y-2">
                                                        {selectedDef.variables.map((name) => {
                                                            const autoFilled = varValues[name] === undefined && autoVars[name];
                                                            return (
                                                                <div key={name}>
                                                                    <label className="flex items-center gap-2 text-[11px] font-bold text-gray-600 mb-1">
                                                                        {name.replace(/_/g, " ")}
                                                                        {getVar(name).trim() === "" ? (
                                                                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-50 text-red-600 uppercase">Missing</span>
                                                                        ) : autoFilled ? (
                                                                            <span className="text-[10px] font-semibold text-gray-400">auto-filled</span>
                                                                        ) : null}
                                                                    </label>
                                                                    <input
                                                                        type="text"
                                                                        value={getVar(name)}
                                                                        onChange={(e) => setVarValues((v) => ({ ...v, [name]: e.target.value }))}
                                                                        placeholder={autoFilled ? autoFilled : `Enter ${name.replace(/_/g, " ")}`}
                                                                        className={`w-full bg-white border rounded-xl px-3 py-2 text-sm focus:outline-none ${getVar(name).trim() === "" ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-green-500"}`}
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {missingVars.length > 0 && (
                                                    <p className="text-xs font-bold text-red-600">
                                                        Required before sending: {missingVars.join(", ")}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex justify-end">
                                    <button
                                        onClick={handleSend}
                                        disabled={sendMessage.isPending || createConversation.isPending || (mode === "template" && (!selectedDef || missingVars.length > 0))}
                                        title={mode === "template" && selectedDef && missingVars.length > 0 ? `Fill in: ${missingVars.join(", ")}` : undefined}
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

export default function WhatsAppCenterPage() {
    return (
        <Suspense fallback={<div className="p-8 text-gray-400 font-medium">Loading WhatsApp center…</div>}>
            <WhatsAppCenterPageInner />
        </Suspense>
    );
}
