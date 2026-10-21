"use client";
import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
    MessageSquare, MessageCircle, Send, AlertCircle, RefreshCw, Link2, Search,
    Check, CheckCheck, Clock, Phone, Video, MoreVertical, Paperclip, Plus,
    List, Settings, Signal, ExternalLink, CalendarPlus, FileText, KeyRound
} from "lucide-react";
import { fetchLeads, fetchLeadById } from "../../../../lib/api/leads";
import { fetchPropertyById } from "../../../../lib/api/properties";
import { fetchProjectById } from "../../../../lib/api/projects";
import { showToast } from "../../../../lib/toast";
import { formatCurrency } from "../../../../features/pipeline/helpers";
import { useAuth } from "../../../../features/auth/hooks/useAuth";
import UnifiedTimeline from "../../../../features/communication/components/UnifiedTimeline";
import {
    useWhatsAppStatus,
    useConversations,
    useMessages,
    useCreateConversation,
    useSendMessage,
    useWhatsAppTemplates,
    useTemplateLibrary,
    useTestWhatsappConnection
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

// Deterministic soft avatar palette (leads have no photos stored).
const AVATAR_TONES = [
    "bg-violet-100 text-violet-700",
    "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-indigo-100 text-indigo-700",
];
const avatarTone = (name) => {
    const s = String(name || "?");
    let hash = 0;
    for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) % 997;
    return AVATAR_TONES[hash % AVATAR_TONES.length];
};
const initialsOf = (name) => {
    const parts = String(name || "?").trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
const Avatar = ({ name, size = "md", ring = false }) => {
    const sizes = {
        sm: "w-8 h-8 text-[11px]",
        md: "w-11 h-11 text-sm",
        lg: "w-14 h-14 text-lg",
    };
    return (
        <span
            aria-hidden
            className={`shrink-0 rounded-full flex items-center justify-center font-black ${sizes[size] || sizes.md} ${avatarTone(name)} ${ring ? "ring-2 ring-green-500 ring-offset-1" : ""}`}
        >
            {initialsOf(name)}
        </span>
    );
};

const formatConvTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

function WhatsAppCenterPageInner() {
    const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useWhatsAppStatus();
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
    const [convFilter, setConvFilter] = useState("all");
    const [convSearch, setConvSearch] = useState("");
    const [rightTab, setRightTab] = useState("details");
    const [mobileListOpen, setMobileListOpen] = useState(false);
    const { user } = useAuth();

    const { data: leadsData } = useQuery({
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

    const { data: conversations, refetch: refetchConvs, isFetching: convsFetching } = useConversations({ limit: 50 });
    const createConversation = useCreateConversation();
    const sendMessage = useSendMessage();
    const testConnection = useTestWhatsappConnection();
    const { data: templates } = useWhatsAppTemplates();

    const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.leads || []);
    // Focused mode: opened for a particular lead (?leadId=) — show only that
    // lead. Direct opens (no param) show the full picker.
    const leads = leadIdParam
        ? (allLeads.some((l) => l.id === leadIdParam)
            ? allLeads.filter((l) => l.id === leadIdParam)
            : (focusedLead && focusedLead.id ? [focusedLead] : []))
        : allLeads;
    const conversationList = (Array.isArray(conversations) ? conversations : [])
        .slice()
        .sort((a, b) => new Date(b.lastMessageAt || b.createdAt || 0) - new Date(a.lastMessageAt || a.createdAt || 0));
    const conversation = conversationList.find((c) => c.leadId === selectedLeadId) || null;
    const { data: thread, isLoading: threadLoading, refetch, isFetching } = useMessages(conversation?.id, {}, { enabled: Boolean(conversation?.id) });

    const selectedLead = leads.find((l) => l.id === selectedLeadId)
        || conversationList.find((c) => c.leadId === selectedLeadId)?.lead
        || null;

    // Full lead record for the details panel (source, project, assignee…).
    const { data: leadDetail } = useQuery({
        queryKey: ["lead", selectedLeadId, "detail"],
        queryFn: () => fetchLeadById(selectedLeadId),
        enabled: Boolean(selectedLeadId),
        retry: 1
    });
    const detailLead = (leadDetail && typeof leadDetail === "object" && !Array.isArray(leadDetail))
        ? (leadDetail.data || leadDetail)
        : null;

    const templateRows = Array.isArray(templates) ? templates.filter((t) => t && t.active !== false) : [];
    const { data: libraryData } = useTemplateLibrary();
    const library = Array.isArray(libraryData) ? libraryData : (libraryData?.templates || []);

    // Property + project context for variable auto-fill. Property resolves
    // from the share flow first, then the lead's linked unit; project follows
    // from either. All lazy and cached; failures leave fields manual.
    const contextPropertyId = sharePropertyId || selectedLead?.propertyId || conversation?.lead?.propertyId || null;
    const { data: contextProperty } = useQuery({
        queryKey: ["property", contextPropertyId],
        queryFn: () => fetchPropertyById(contextPropertyId),
        enabled: Boolean(contextPropertyId),
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
        enabled: Boolean(contextProjectId),
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
    const selectTemplateByName = (name) => {
        const option = templateOptions.find((o) => o.name === name)
            || templateOptions.find((o) => o.name.toLowerCase() === String(name).toLowerCase());
        if (!option) {
            showToast(`Template "${name}" is not available yet — pick one from the Templates tab`, "error");
            return;
        }
        selectTemplate(option);
        setMode("template");
        setRightTab("templates");
        showToast(`Template "${option.name}" selected — review variables and send`, "success");
    };

    const pickLead = (leadId) => {
        setSelectedLeadId(leadId);
        setMobileListOpen(false);
    };

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
            // Freshness comes from the send mutation's targeted query
            // invalidation (see useSendMessage) — no manual refetch here,
            // which would hit a stale or not-yet-mounted thread query.
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

    const handleRefresh = () => {
        refetchConvs();
        refetchStatus();
        if (conversation?.id) refetch();
    };

    const handleTestConnection = async () => {
        if (status?.simulated) {
            showToast(`Mock provider active — messages are simulated inside the CRM and never leave it (${status?.provider || "mock"})`, "success");
            return;
        }
        try {
            const result = await testConnection.mutateAsync();
            showToast(`Connected${result?.verifiedName ? ` — ${result.verifiedName}` : ""}${result?.displayPhoneNumber ? ` (${result.displayPhoneNumber})` : ""}`, "success");
        } catch (err) {
            showToast(err?.message || "Connection test failed", "error");
        }
    };

    const handleAttach = () => {
        showToast("File attachments aren't supported yet — send text, a template, or share a property link from inventory", "error");
    };
    const handleVideo = () => {
        showToast("WhatsApp voice and video calls aren't available in the CRM yet", "error");
    };

    const messages = thread?.messages || [];
    // Backend returns newest-first; the chat view reads oldest-first.
    const orderedMessages = [...messages].reverse();

    const dayLabel = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        if (date.toDateString() === today.toDateString()) return "Today";
        if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
        return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    };

    const statusMeta = (status) => {
        switch (String(status || "").toUpperCase()) {
            case "READ":
                return { label: "Read", Icon: CheckCheck };
            case "DELIVERED":
                return { label: "Delivered", Icon: CheckCheck };
            case "FAILED":
                return { label: "Failed", Icon: AlertCircle };
            case "QUEUED":
                return { label: "Sending", Icon: Clock };
            case "SENT":
            default:
                return { label: "Sent", Icon: Check };
        }
    };

    // Scroll to the latest message when the thread loads or grows — but
    // never yank the view while the user is reading older messages.
    const threadScrollRef = useRef(null);
    const nearBottomRef = useRef(true);
    const handleThreadScroll = () => {
        const el = threadScrollRef.current;
        if (!el) return;
        nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    useEffect(() => {
        const el = threadScrollRef.current;
        if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
    }, [orderedMessages.length, conversation?.id]);

    // Conversation list: search + All / Unread / My Leads, newest first.
    const searchQ = convSearch.trim().toLowerCase();
    const searchedConvs = searchQ
        ? conversationList.filter((c) => [c.lead?.name, c.lead?.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(searchQ)))
        : conversationList;
    const filteredConvs = convFilter === "unread"
        ? searchedConvs.filter((c) => (c.unreadCount || 0) > 0)
        : convFilter === "mine"
            ? searchedConvs.filter((c) => c.lead?.assignedToId && user?.id && c.lead.assignedToId === user.id)
            : searchedConvs;
    const unreadTotal = conversationList.filter((c) => (c.unreadCount || 0) > 0).length;
    const mineTotal = conversationList.filter((c) => c.lead?.assignedToId && user?.id && c.lead.assignedToId === user.id).length;

    const snippetOf = (conv) => {
        const first = Array.isArray(conv.messages) && conv.messages.length > 0 ? conv.messages[0] : null;
        if (!first?.body) return "No messages yet";
        return String(first.body);
    };

    const leadName = selectedLead?.name || conversation?.lead?.name || "";
    const leadPhone = selectedLead?.phone || conversation?.lead?.phone || "";
    const leadStatusLabel = detailLead?.status || selectedLead?.status || conversation?.lead?.status || "";
    const detailProject = detailLead?.project?.name || autoVars.project_name || "";
    const detailConfig = detailLead?.configuration || detailLead?.property?.configuration || contextProperty?.configuration || autoVars.configuration || "";
    const detailBudget = [detailLead?.budgetMin, detailLead?.budgetMax].some((v) => v !== undefined && v !== null && v !== "")
        ? [detailLead?.budgetMin, detailLead?.budgetMax].filter((v) => v !== undefined && v !== null && v !== "").map((v) => formatCurrency(v)).join(" – ")
        : (detailLead?.budget || "");
    const detailAssignee = detailLead?.assignedTo?.name || "";
    const detailSource = detailLead?.source || "";
    const headerContext = [detailProject, detailConfig, autoVars.price_range].filter(Boolean).join(" · ");

    const convListBody = (
        <>
            {filteredConvs.length === 0 && (
                <p className="text-sm text-gray-500 px-1 py-4 text-center">
                    {conversationList.length === 0 ? "No conversations yet — pick a lead to start one." : "No conversations match."}
                </p>
            )}
            {filteredConvs.map((c) => {
                const active = c.leadId === selectedLeadId;
                const unread = c.unreadCount || 0;
                return (
                    <button
                        key={c.id}
                        onClick={() => pickLead(c.leadId)}
                        className={`w-full min-w-0 text-left flex items-center gap-3 p-3 rounded-2xl border transition-all ${active ? "border-violet-400 bg-violet-50/60" : "border-transparent hover:bg-gray-50"}`}
                    >
                        <span className="relative shrink-0">
                            <Avatar name={c.lead?.name} size="md" ring={active} />
                            {unread > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-violet-600 text-white text-[10px] font-black flex items-center justify-center">
                                    {unread > 9 ? "9+" : unread}
                                </span>
                            )}
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="flex items-baseline justify-between gap-2">
                                <span className="text-sm font-bold text-gray-900 truncate min-w-0">{c.lead?.name || "Unknown lead"}</span>
                                <span className="shrink-0 text-[11px] text-gray-400">{formatConvTime(c.lastMessageAt || c.createdAt)}</span>
                            </span>
                            <span className="block text-xs text-gray-500 truncate mt-0.5">{snippetOf(c)}</span>
                        </span>
                    </button>
                );
            })}
        </>
    );

    const templateBrowser = (
        <div className="space-y-3 min-w-0" id="wa-template-browser">
            <div className="relative min-w-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search templates by name, use or variable..."
                    aria-label="Search templates"
                    className="w-full min-w-0 bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-green-500"
                />
            </div>
            {visibleOptions.length === 0 ? (
                <p className="text-xs text-gray-400">
                    {templateOptions.length === 0
                        ? "No templates yet. Administrators can add custom templates under templates."
                        : "No templates match your search."}
                </p>
            ) : (
                <div className="space-y-4 max-h-72 overflow-y-auto custom-scrollbar pr-1 min-w-0">
                    {groupedOptions.map((group) => (
                        <div key={group.group} className="min-w-0">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 truncate">{group.group}</p>
                            <div className="space-y-1.5">
                                {group.items.map((option) => {
                                    const isActive = selectedDef?.key === option.key;
                                    return (
                                        <button
                                            key={option.key}
                                            type="button"
                                            onClick={() => selectTemplate(option)}
                                            className={`w-full min-w-0 text-left rounded-xl border p-3 transition-all ${isActive ? "border-green-500 bg-green-50/60" : "border-gray-100 hover:border-gray-300 bg-white"}`}
                                        >
                                            <span className="flex items-center gap-2 min-w-0">
                                                <span className="text-sm font-bold text-gray-900 truncate min-w-0">{option.name}</span>
                                                <span className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${option.kind === "library" ? "bg-violet-50 text-violet-700" : "bg-gray-100 text-gray-500"}`}>
                                                    {option.kind === "library" ? "Library" : "Custom"}
                                                </span>
                                            </span>
                                            {option.description && (
                                                <span className="block text-xs text-gray-500 mt-0.5 break-words [overflow-wrap:anywhere]">{option.description}</span>
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
                <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 space-y-3 min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                        <p className="text-xs font-black text-gray-700 uppercase tracking-wider truncate min-w-0">Preview · {selectedDef.name}</p>
                        {status?.simulated && (
                            <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded uppercase bg-amber-100 text-amber-700">Simulated</span>
                        )}
                    </div>
                    {preview.text ? (
                        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">{preview.text}</p>
                    ) : (
                        <p className="text-xs text-gray-400">This template has no preview text — fill in its variables below.</p>
                    )}
                    {selectedDef.variables.length > 0 && (
                        <div className="space-y-2">
                            {selectedDef.variables.map((name) => {
                                const autoFilled = varValues[name] === undefined && autoVars[name];
                                return (
                                    <div key={name} className="min-w-0">
                                        <label className="flex items-center gap-2 text-[11px] font-bold text-gray-600 mb-1 min-w-0">
                                            <span className="truncate">{name.replace(/_/g, " ")}</span>
                                            {getVar(name).trim() === "" ? (
                                                <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded bg-red-50 text-red-600 uppercase">Missing</span>
                                            ) : autoFilled ? (
                                                <span className="shrink-0 text-[10px] font-semibold text-gray-400">auto-filled</span>
                                            ) : null}
                                        </label>
                                        <input
                                            type="text"
                                            value={getVar(name)}
                                            onChange={(e) => setVarValues((v) => ({ ...v, [name]: e.target.value }))}
                                            placeholder={autoFilled ? autoFilled : `Enter ${name.replace(/_/g, " ")}`}
                                            aria-label={`Value for ${name}`}
                                            className={`w-full min-w-0 bg-white border rounded-xl px-3 py-2 text-sm focus:outline-none ${getVar(name).trim() === "" ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-green-500"}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {missingVars.length > 0 && (
                        <p className="text-xs font-bold text-red-600 break-words">
                            Required before sending: {missingVars.join(", ")}
                        </p>
                    )}
                </div>
            )}
        </div>
    );

    const leadDetailsPanel = (
        <div className="space-y-4 min-w-0">
            {selectedLeadId ? (
                <>
                    <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={leadName} size="lg" />
                        <div className="min-w-0">
                            <p className="font-bold text-gray-900 truncate">{leadName || "Lead"}</p>
                            <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                                <MessageSquare size={11} className="text-green-600 shrink-0" />
                                <span className="truncate">{leadPhone || "No phone"}</span>
                            </p>
                        </div>
                        {leadStatusLabel ? (
                            <span className="ml-auto shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 uppercase">
                                {String(leadStatusLabel).replace(/_/g, " ")}
                            </span>
                        ) : null}
                    </div>
                    <dl className="space-y-2">
                        {[
                            ["Source", detailSource],
                            ["Interested Project", detailProject],
                            ["Configuration", detailConfig],
                            ["Budget Range", detailBudget],
                            ["Assigned To", detailAssignee],
                            ["Status", leadStatusLabel ? String(leadStatusLabel).replace(/_/g, " ") : ""],
                        ].map(([label, value]) => (
                            <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 min-w-0">
                                <dt className="text-[11px] font-bold text-gray-500">{label}</dt>
                                <dd className="text-sm font-semibold text-gray-900 truncate">{value || "—"}</dd>
                            </div>
                        ))}
                    </dl>
                    <Link
                        href={`/dashboard/leads/${selectedLeadId}`}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border-2 border-violet-500 text-violet-700 text-sm font-bold hover:bg-violet-50 transition-colors"
                    >
                        <ExternalLink size={14} /> View Full Lead
                    </Link>
                    <div>
                        <p className="text-sm font-black text-gray-900 mb-2">Quick Actions</p>
                        <div className="grid grid-cols-2 gap-2">
                            <Link
                                href={`/dashboard/site-visits/schedule?leadId=${selectedLeadId}`}
                                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-sky-50 text-sky-700 text-xs font-bold hover:bg-sky-100 transition-colors min-w-0"
                            >
                                <CalendarPlus size={14} className="shrink-0" />
                                <span className="truncate">Schedule Site Visit</span>
                            </Link>
                            <button
                                onClick={() => selectTemplateByName("Brochure & Floor Plan")}
                                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-colors min-w-0 text-left"
                            >
                                <FileText size={14} className="shrink-0" />
                                <span className="truncate">Share Brochure</span>
                            </button>
                            <Link
                                href="/dashboard/bookings/wizard"
                                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition-colors min-w-0"
                            >
                                <KeyRound size={14} className="shrink-0" />
                                <span className="truncate">Create Booking</span>
                            </Link>
                        </div>
                    </div>
                </>
            ) : (
                <p className="text-sm text-gray-500 text-center py-6">Select a conversation to see lead details.</p>
            )}
        </div>
    );

    const threadBody = (
        <>
            {!selectedLeadId ? (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl p-8 text-center min-h-[200px]">
                    Select a lead to view or start a conversation.
                </div>
            ) : !conversation ? (
                <div className="flex-1 flex flex-col items-center justify-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-2xl p-8 text-center gap-3 min-h-[200px]">
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
                    <div className="shrink-0 bg-white border-b border-gray-100 px-3 sm:px-4 py-2.5 flex items-center gap-3 min-w-0">
                        <Avatar name={leadName} size="md" />
                        <div className="flex-1 min-w-0">
                            <p className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-gray-900 text-sm truncate">{leadName}</span>
                                {leadStatusLabel ? (
                                    <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                                        {String(leadStatusLabel).replace(/_/g, " ")}
                                    </span>
                                ) : null}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{leadPhone}{headerContext ? ` · ${headerContext}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                            <Link
                                href="/dashboard/calling/softphone"
                                className="p-2 rounded-full text-gray-600 hover:bg-gray-100"
                                aria-label="Open softphone to call"
                                title="Open softphone"
                            >
                                <Phone size={17} />
                            </Link>
                            <button onClick={handleVideo} className="p-2 rounded-full text-gray-600 hover:bg-gray-100" aria-label="Video call (not available)" title="Video calls aren't available yet">
                                <Video size={17} />
                            </button>
                            <button onClick={() => showToast("Conversation options aren't available yet", "error")} className="p-2 rounded-full text-gray-600 hover:bg-gray-100" aria-label="More conversation options" title="More options">
                                <MoreVertical size={17} />
                            </button>
                        </div>
                    </div>

                    <div
                        ref={threadScrollRef}
                        onScroll={handleThreadScroll}
                        role="log"
                        aria-label="Conversation messages"
                        aria-live="polite"
                        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 sm:px-6 py-4 space-y-1 bg-[#efe7dd]"
                    >
                        {threadLoading && <p className="text-sm text-gray-500">Loading messages...</p>}
                        {orderedMessages.length === 0 && !threadLoading && (
                            <p className="text-sm text-gray-600 bg-white/70 rounded-xl px-4 py-3 text-center">No messages yet. Send the first one below.</p>
                        )}
                        {orderedMessages.map((m, index) => {
                            const outbound = m.direction === "OUTBOUND";
                            const prev = orderedMessages[index - 1];
                            const showDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                            const { label: statusLabel, Icon: StatusIcon } = statusMeta(m.status);
                            const failed = String(m.status || "").toUpperCase() === "FAILED";
                            return (
                                <div key={m.id}>
                                    {showDay && (
                                        <p className="text-center py-2">
                                            <span className="inline-block text-[10px] font-bold text-gray-600 bg-white rounded-lg px-3 py-1 shadow-sm">
                                                {dayLabel(m.createdAt)}
                                            </span>
                                        </p>
                                    )}
                                    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                                        <div
                                            className={`max-w-[85%] sm:max-w-[70%] min-w-0 px-3 py-2 text-sm shadow-sm break-words [overflow-wrap:anywhere] ${
                                                outbound
                                                    ? "bg-[#d9fdd3] text-gray-900 rounded-lg rounded-br-none"
                                                    : "bg-white text-gray-900 rounded-lg rounded-bl-none"
                                            }`}
                                        >
                                            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">{m.body}</p>
                                            <p className={`text-[10px] mt-1 flex items-center gap-1 ${outbound ? "justify-end text-gray-500" : "text-gray-400"}`}>
                                                <span>
                                                    {Number.isNaN(new Date(m.createdAt).getTime())
                                                        ? ""
                                                        : new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                                                </span>
                                                {m.sentBy?.name ? <span className="truncate max-w-[110px]">· {m.sentBy.name}</span> : null}
                                                {outbound && (
                                                    <span
                                                        className={`inline-flex items-center gap-0.5 shrink-0 ${failed ? "text-red-500 font-bold" : statusLabel === "Read" ? "text-sky-500" : "text-gray-400"}`}
                                                        title={failed ? "Failed to send — your text is kept in the composer, edit and retry" : statusLabel}
                                                    >
                                                        <StatusIcon size={13} aria-label={statusLabel} />
                                                        {failed ? <span>Failed</span> : null}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="shrink-0 bg-white border-t border-gray-100 px-3 sm:px-4 pt-2 pb-3 space-y-2">
                        <div className="flex items-center gap-1">
                            <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-bold">
                                <button
                                    onClick={() => setMode("text")}
                                    className={`px-3 py-1.5 rounded-md ${mode === "text" ? "bg-white text-violet-700 shadow-sm" : "text-gray-500"}`}
                                >
                                    Text
                                </button>
                                <button
                                    onClick={() => setMode("template")}
                                    className={`px-3 py-1.5 rounded-md ${mode === "template" ? "bg-white text-violet-700 shadow-sm" : "text-gray-500"}`}
                                >
                                    Approved Template
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    // The browser only mounts when its tab is active, so a plain
                                    // #hash anchor had no target to scroll to. Switch the tab first.
                                    setMode("template");
                                    setRightTab("templates");
                                    requestAnimationFrame(() => {
                                        document.getElementById("wa-template-browser")
                                            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                                    });
                                }}
                                aria-haspopup="true"
                                className="ml-auto hidden sm:flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700"
                            >
                                <List size={13} /> Templates
                            </button>
                        </div>
                        {sharePropertyId && mode === "text" && (
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 w-fit max-w-full">
                                <Link2 size={12} className="shrink-0" />
                                <span className="truncate">Property link share — will be tracked on the lead timeline</span>
                            </div>
                        )}
                        {mode === "template" && (
                            <div className="rounded-xl bg-violet-50/60 border border-violet-100 px-3 py-2 text-xs text-gray-600 flex items-center justify-between gap-2 min-w-0">
                                {selectedDef ? (
                                    <span className="truncate min-w-0">
                                        <span className="font-bold text-gray-800">{selectedDef.name}</span>
                                        {missingVars.length > 0 ? (
                                            <span className="text-red-600 font-bold"> · fill: {missingVars.join(", ")}</span>
                                        ) : (
                                            <span className="text-green-700 font-bold"> · ready to send</span>
                                        )}
                                    </span>
                                ) : (
                                    <span>Pick a template from the Templates tab to compose it here.</span>
                                )}
                                {status?.simulated && (
                                    <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded uppercase bg-amber-100 text-amber-700">Simulated</span>
                                )}
                            </div>
                        )}
                        <div className="flex items-center gap-2 min-w-0">
                            <button onClick={handleAttach} className="shrink-0 w-10 h-10 sm:hidden flex items-center justify-center rounded-full bg-gray-100 text-gray-600" aria-label="Attach a file (not supported yet)" title="Attachments aren't supported yet">
                                <Plus size={18} />
                            </button>
                            <button onClick={handleAttach} className="shrink-0 w-10 h-10 hidden sm:flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Attach a file (not supported yet)" title="Attachments aren't supported yet">
                                <Paperclip size={18} />
                            </button>
                            {mode === "text" ? (
                                <input
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    placeholder="Type a message..."
                                    maxLength={4000}
                                    aria-label="Type a WhatsApp message"
                                    className="flex-1 min-w-0 bg-gray-100 border border-transparent rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 focus:bg-white"
                                />
                            ) : (
                                <div className="flex-1 min-w-0 bg-gray-100 rounded-full px-4 py-2.5 text-sm text-gray-500 truncate">
                                    {selectedDef ? `Template: ${selectedDef.name}` : "Choose a template first"}
                                </div>
                            )}
                            <button
                                onClick={handleSend}
                                disabled={sendMessage.isPending || createConversation.isPending || (mode === "template" && (!selectedDef || missingVars.length > 0))}
                                title={mode === "template" && selectedDef && missingVars.length > 0 ? `Fill in: ${missingVars.join(", ")}` : "Send WhatsApp message"}
                                aria-label="Send WhatsApp message"
                                className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-violet-600 text-white hidden sm:flex items-center justify-center hover:bg-violet-700 shadow-sm disabled:opacity-50"
                            >
                                <Send size={17} />
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={sendMessage.isPending || createConversation.isPending || (mode === "template" && (!selectedDef || missingVars.length > 0))}
                                aria-label="Send WhatsApp message"
                                className="shrink-0 w-10 h-10 rounded-full bg-green-600 text-white flex sm:hidden items-center justify-center hover:bg-green-700 shadow-sm disabled:opacity-50"
                            >
                                <Send size={17} />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-3 sm:p-6 lg:p-8 space-y-4 custom-scrollbar overflow-y-auto overflow-x-hidden">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0 flex items-start gap-3 flex-1">
                    <span className="hidden sm:flex w-11 h-11 rounded-2xl bg-green-500 text-white items-center justify-center shrink-0">
                        <MessageCircle size={22} />
                    </span>
                    <span className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">WhatsApp Center</h1>
                        <p className="text-sm text-gray-500 break-words">
                            Manage conversations with your leads through WhatsApp Business API
                        </p>
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {status?.simulated && (
                        <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
                            Mock · Simulated
                        </span>
                    )}
                    <button
                        onClick={handleTestConnection}
                        disabled={testConnection.isPending}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Signal size={14} /> Test Connection
                    </button>
                    <Link
                        href="/dashboard/admin/integrations"
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50"
                    >
                        <Settings size={14} /> Settings
                    </Link>
                    <button
                        onClick={handleRefresh}
                        aria-label="Refresh conversations"
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50"
                    >
                        <RefreshCw size={14} className={isFetching || convsFetching ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </div>

            {!statusLoading && !status?.configured && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm flex items-start gap-3">
                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                        <p className="font-bold">WhatsApp integration is not configured.</p>
                        <p className="mt-0.5">
                            Messaging is disabled until an administrator connects the WhatsApp Business API. The CRM
                            will not simulate deliveries.
                        </p>
                    </div>
                </div>
            )}

            {/* Mobile: search + avatar strip */}
            <div className="lg:hidden space-y-3 min-w-0">
                <div className="relative min-w-0">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={convSearch}
                        onChange={(e) => setConvSearch(e.target.value)}
                        placeholder="Search leads or phone numbers..."
                        aria-label="Search conversations"
                        className="w-full min-w-0 bg-white border border-gray-200 rounded-full pl-10 pr-4 py-2.5 text-sm shadow-sm focus:outline-none focus:border-green-500"
                    />
                </div>
                <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-1 px-0.5 min-w-0">
                    {filteredConvs.map((c) => {
                        const active = c.leadId === selectedLeadId;
                        const unread = c.unreadCount || 0;
                        return (
                            <button key={c.id} onClick={() => pickLead(c.leadId)} className="flex flex-col items-center gap-1 shrink-0 w-14">
                                <span className={`relative rounded-full ${active ? "ring-2 ring-green-500 ring-offset-2" : ""}`}>
                                    <Avatar name={c.lead?.name} size="md" />
                                    {unread > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[10px] font-black flex items-center justify-center">
                                            {unread > 9 ? "9+" : unread}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[11px] font-semibold text-gray-700 max-w-full truncate">{(c.lead?.name || "?").split(" ")[0]}</span>
                            </button>
                        );
                    })}
                    <button onClick={() => setMobileListOpen((v) => !v)} className="flex flex-col items-center gap-1 shrink-0 w-14" aria-label="Show all conversations">
                        <span className="w-11 h-11 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-black">
                            {mobileListOpen ? "Less" : "More"}
                        </span>
                        <span className="text-[11px] font-semibold text-gray-500">{mobileListOpen ? "Less" : "More"}</span>
                    </button>
                </div>
                {mobileListOpen && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
                        {convListBody}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_300px] xl:grid-cols-[320px_minmax(0,1fr)_320px] gap-4 items-start min-w-0">
                {/* Conversations (desktop) */}
                <div className="hidden lg:flex flex-col min-w-0 bg-white rounded-3xl border border-gray-200 shadow-sm p-3 max-h-[720px]">
                    <div className="relative min-w-0 mb-2">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={convSearch}
                            onChange={(e) => setConvSearch(e.target.value)}
                            placeholder="Search conversations..."
                            aria-label="Search conversations"
                            className="w-full min-w-0 bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-violet-400"
                        />
                    </div>
                    <div className="flex gap-1 text-xs font-bold mb-2" role="tablist" aria-label="Conversation filters">
                        {[
                            ["all", `All (${conversationList.length})`],
                            ["unread", `Unread (${unreadTotal})`],
                            ["mine", `My Leads (${mineTotal})`],
                        ].map(([key, label]) => (
                            <button
                                key={key}
                                role="tab"
                                aria-selected={convFilter === key}
                                onClick={() => setConvFilter(key)}
                                className={`flex-1 min-w-0 px-2 py-1.5 rounded-lg truncate ${convFilter === key ? "bg-violet-50 text-violet-700" : "text-gray-500 hover:bg-gray-50"}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1 pr-0.5">
                        {convsFetching && conversationList.length === 0 && (
                            <p className="text-sm text-gray-400 px-1 py-4 text-center">Loading conversations...</p>
                        )}
                        {convListBody}
                    </div>
                </div>

                {/* Thread */}
                <div className="min-w-0 flex flex-col min-h-0 h-[76dvh] max-h-[760px] lg:h-[680px] bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    {threadBody}
                </div>

                {/* Details / Templates / Notes */}
                <div className="min-w-0 bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-5 lg:max-h-[720px] lg:overflow-y-auto custom-scrollbar">
                    <div className="flex gap-1 text-xs font-bold mb-4 bg-gray-100 rounded-xl p-1" role="tablist" aria-label="Lead panels">
                        {[
                            ["details", "Lead Details"],
                            ["templates", "Templates"],
                            ["notes", "Notes"],
                        ].map(([key, label]) => (
                            <button
                                key={key}
                                role="tab"
                                aria-selected={rightTab === key}
                                onClick={() => setRightTab(key)}
                                className={`flex-1 min-w-0 px-2 py-1.5 rounded-lg truncate ${rightTab === key ? "bg-white text-violet-700 shadow-sm" : "text-gray-500"}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {rightTab === "details" && leadDetailsPanel}
                    {rightTab === "templates" && templateBrowser}
                    {rightTab === "notes" && (
                        selectedLeadId
                            ? <UnifiedTimeline leadId={selectedLeadId} limit={20} />
                            : <p className="text-sm text-gray-500 text-center py-6">Select a conversation to see notes.</p>
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
