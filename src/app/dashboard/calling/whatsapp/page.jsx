"use client";
import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    MessageSquare, MessageCircle, Send, AlertCircle, RefreshCw, Link2, Search,
    Check, CheckCheck, Clock, Phone, Video, MoreVertical, Paperclip, Plus, X,
    List, Settings, Signal, ExternalLink, CalendarPlus, FileText, KeyRound, Receipt,
    Maximize2, Minimize2
} from "lucide-react";
import { fetchLeads, fetchLeadById } from "../../../../lib/api/leads";
import { fetchPropertyById, fetchProperties } from "../../../../lib/api/properties";
import { fetchProjects, fetchProjectById, uploadProjectBrochure, removeProjectBrochure } from "../../../../lib/api/projects";
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

// Variables that describe the project being offered. Selecting a template that
// uses any of these opens the project picker in the composer, so a template can
// be sent for any project — not only the one linked to the lead.
const PROJECT_TEMPLATE_VARS = [
    "brochure_url", "quotation_url", "project_name", "location", "price_range", "site_address",
    "property_name", "configuration"
];

// The editable quotation sheet's defaults — the same commercial terms the
// backend derives when nothing is edited, so an untouched send keeps its
// short link and the exact same PDF. Ratios/prices are strings so the inputs
// can be cleared while typing.
const DEFAULT_BROKER_PCT = "1";
const DEFAULT_GST_PCT = "18";
const DEFAULT_PAYOUTS = [
    { label: "On Token Booking / Expression of Interest (Received)", ratio: "20" },
    { label: "On Execution of Agreement to Sell / Sale Deed (Within 30 Days)", ratio: "50" },
    { label: "On Final Registry & Handover / Full Dues Clearance", ratio: "30" },
];

// API origin for direct asset links (the quotation PDF preview below). Same
// fallback chain as every other page that builds its own API URLs.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// Stored file references can be site-relative (/media/uploads/…), full URLs,
// or dev-only artifacts (blob:). Turn one into a link a WhatsApp recipient can
// actually open: relative paths are pinned to the running site, real http(s)
// URLs pass through unchanged, and anything dead — blob:, or a localhost URL
// while the live site is serving the page — returns "" so the caller falls
// back to the project's public page instead of sending a link that won't open.
const toLiveLink = (raw) => {
    const value = String(raw || "").trim();
    if (!value) return "";
    const isDevHost = /^https?:\/\/(localhost|127\.0\.0\.1)([/:?]|$)/i.test(value);
    const pageIsDev = typeof window !== "undefined"
        && /^https?:\/\/(localhost|127\.0\.0\.1)([/:?]|$)/i.test(window.location.href);
    if (/^https?:\/\//i.test(value)) {
        return isDevHost && !pageIsDev ? "" : value;
    }
    if (typeof window !== "undefined" && /^\/[^/]/.test(value)) {
        return `${window.location.origin}${value}`;
    }
    return "";
};

const initialParam = (name) => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get(name);
};

// Deterministic soft avatar palette (leads have no photos stored).
const MAX_BROCHURE_MB = 15;

// Same /brochure/i rule the backend applies when reading the project's
// documents JSON (kept in sync with the project page's isBrochureDoc).
const isBrochureDoc = (d) => Boolean(
    d && typeof d === "object" && (d.url || d.key)
    && /brochure/i.test(String(d.name || d.label || d.type || ""))
);

// KB/MB display for a stored file — 6 KB, never "0.0 MB".
const formatFileSize = (bytes) => {
    const size = Number(bytes) || 0;
    if (size <= 0) return "";
    return size < 1024 * 1024
        ? `${Math.max(1, Math.round(size / 1024))} KB`
        : `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

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
    // Project chosen in the composer's picker. When set it outranks the
    // lead's own project for every project-derived variable (project name,
    // brochure link, price range…), letting one template be sent for any
    // project in the portfolio.
    const [pickedProjectId, setPickedProjectId] = useState(null);
    // Unit (property) chosen in the same picker. A picked unit outranks the
    // lead's linked unit for property-derived variables (property name,
    // configuration, unit price) so every template can target a specific unit.
    const [pickedPropertyId, setPickedPropertyId] = useState(null);
    // Companion media is opt-in per send — the employee ticks what actually
    // goes out (brochure PDF / PDF quotation / property photos); nothing
    // attaches by itself. Brochure and quotation are independent options
    // (see the exclusivity note at the send payload).
    const [attachPdf, setAttachPdf] = useState(false);
    const [attachBrochure, setAttachBrochure] = useState(false);
    const [attachImages, setAttachImages] = useState(false);
    // The EDITABLE quotation sheet: cost rows (name / basis / amount), the
    // brokerage % of the net base value, the GST % on that brokerage and the
    // payout-schedule ratios — exactly what the PDF prints. Prefilled from
    // the picked project/unit's stored charges (see the prefill effect) so
    // the employee only adjusts what differs; raising the brokerage % moves
    // the fee, its GST and every instalment live. The sheet travels with the
    // send as `attachment.quote` — nothing is persisted.
    const [quoteRows, setQuoteRows] = useState([]);
    const [quoteBrokerPct, setQuoteBrokerPct] = useState(DEFAULT_BROKER_PCT);
    const [quoteGstPct, setQuoteGstPct] = useState(DEFAULT_GST_PCT);
    const [quotePayouts, setQuotePayouts] = useState(DEFAULT_PAYOUTS);
    // Brokerage & GST is removable per deal — builder-direct flats carry no
    // commission. Unticking it drops the fee, its GST and the payout
    // schedule from the sheet (the summary line goes to "no brokerage");
    // the PDF then prints "not applicable" instead of zeros. The last
    // percentages/payouts are kept so re-ticking restores them.
    const [quoteBrokerageOn, setQuoteBrokerageOn] = useState(true);
    // Once the employee edits the sheet, a background refetch (which re-runs
    // the prefill effect) must never silently rewrite their numbers — only
    // picking a different project/unit resets the sheet.
    const [quoteSheetTouched, setQuoteSheetTouched] = useState(false);
    // Collapsed by default: the composer stays a message box, the sheet opens
    // on demand. Its live totals show either way.
    const [quoteSheetOpen, setQuoteSheetOpen] = useState(false);
    // The right panel (Lead details / Templates / Notes) pops up as an
    // overlay on EVERY screen size — small screens get it from the floating
    // button, big screens from the ⛶ button on the side column — and pops
    // down ONLY when the employee asks (close button, backdrop). It stays
    // open through template / project / variable selection. `sidePanelMax`
    // is the maximize/minimize toggle inside the popup: full-bleed vs. a
    // large windowed card.
    const [sidePanelOpen, setSidePanelOpen] = useState(false);
    const [sidePanelMax, setSidePanelMax] = useState(false);
    const openSidePanel = () => {
        setSidePanelMax(false);
        setSidePanelOpen(true);
    };
    const closeSidePanel = () => {
        setSidePanelMax(false);
        setSidePanelOpen(false);
    };
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

    // All projects for the composer's picker — a template is often sent for a
    // project other than the one linked to the lead.
    const { data: projectsData } = useQuery({
        queryKey: ["projects", "wa-template-picker"],
        queryFn: () => fetchProjects({ limit: 100 }),
        retry: 1
    });
    const projectOptions = Array.isArray(projectsData) ? projectsData : (projectsData?.projects || []);

    // Every unit in the portfolio, grouped under its project in the picker —
    // an employee picks one project (or one of its units) and sends.
    const { data: propertiesData } = useQuery({
        queryKey: ["properties", "wa-template-picker"],
        queryFn: () => fetchProperties(null, { limit: 500 }),
        retry: 1
    });
    const allProperties = Array.isArray(propertiesData) ? propertiesData : [];
    const propertiesByProject = {};
    for (const property of allProperties) {
        if (!property?.projectId) continue;
        (propertiesByProject[property.projectId] = propertiesByProject[property.projectId] || []).push(property);
    }

    // Switching leads re-anchors the project context on the new lead via the
    // fallback below (projectData falls back to the new lead's own project
    // when nothing is picked). The employee's explicit composer choices —
    // the picked project/unit, the attachment ticks and the edited
    // quotation sheet — are deliberate work and MUST survive a lead switch:
    // wiping them here silently dropped the PDF-quotation tick and
    // re-prefilled the sheet, so a send went out with default values and
    // without the quotation ("it does not send real value — I still have to
    // redo it in the smaller panel"). The picked project stays visible in
    // the composer, so the target is never a surprise.

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
    // A project chosen in the composer's picker takes priority over the lead's
    // own project for every project-derived variable below.
    const activeProjectId = pickedProjectId || contextProjectId;
    // A unit picked in the same picker outranks the lead's linked unit.
    // Picking a project other than the lead's also hides the lead's own unit,
    // so a template never mixes a unit from one project with another project's
    // name — the employee then picks one of the new project's units instead.
    const pickedProperty = pickedPropertyId
        ? allProperties.find((property) => property.id === pickedPropertyId) || null
        : null;
    const activeProperty = pickedProperty
        || (!pickedProjectId || pickedProjectId === contextProjectId ? contextProperty : null)
        || null;
    const { data: contextProject } = useQuery({
        queryKey: ["project", activeProjectId],
        queryFn: () => fetchProjectById(activeProjectId),
        enabled: Boolean(activeProjectId),
        retry: 1
    });
    const projectData = contextProject?.data || contextProject;

    // Auto-fill only from real records — never invented. Anything unresolvable
    // stays empty for manual completion (see missingVars). Price resolves in
    // order: the chosen unit's own price, then the project's min–max range,
    // then a single starting price ("from ₹X").
    const unitPrice = activeProperty && Number(activeProperty.price) > 0
        ? formatCurrency(activeProperty.price)
        : "";
    const projectPriceRange = projectData
        ? (projectData.startingPrice != null && projectData.maximumPrice != null
            ? `${formatCurrency(projectData.startingPrice)} – ${formatCurrency(projectData.maximumPrice)}`
            : projectData.startingPrice != null
                ? `from ${formatCurrency(projectData.startingPrice)}`
                : "")
        : "";
    const priceRange = unitPrice || projectPriceRange;
    // The brochure PDF is the employee's own upload — never generated. Its
    // link serves double duty: the `brochure_url` variable in the message
    // text (the public documents route Meta also fetches when the brochure
    // is attached), falling back to the project's public page when nothing
    // is on file. Origin is taken from the running app so the link is
    // correct in production too.
    const uploadedBrochure = (() => {
        if (!projectData?.id) return null;
        const docs = Array.isArray(projectData.documents) ? projectData.documents : [];
        return docs.find((doc) => doc && typeof doc === "object" && (doc.url || doc.key)
            && /brochure/i.test(String(doc.name || doc.label || doc.type || ""))) || null;
    })();
    // Version token for the brochure URL — same value the backend derives
    // on send (uploadedAt, else size, else storage key). WhatsApp/Meta
    // caches media BY URL, so the link must change whenever a new file is
    // uploaded; otherwise the client keeps receiving the first bytes ever
    // fetched from the old URL (the "stale blank preview PDF" complaint).
    // The public documents route ignores the extra `v` param — it only
    // reads projectId — so the same route serves the current file.
    const brochureVersion = uploadedBrochure
        ? String(uploadedBrochure.uploadedAt || uploadedBrochure.size || uploadedBrochure.key || "").trim()
        : "";
    const brochurePublicUrl = uploadedBrochure
        ? `${API_BASE}/public/documents?projectId=${projectData.id}${brochureVersion ? `&v=${encodeURIComponent(brochureVersion)}` : ""}`
        : "";
    const brochureUrl = (() => {
        if (!projectData) return "";
        if (brochurePublicUrl) return brochurePublicUrl;
        if (projectData.publicSlug) {
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            return `${origin}/projects/${projectData.publicSlug}`;
        }
        return "";
    })();
    // The unit scoped to that same project, if any — PDFs then cover the
    // exact apartment being discussed, not just the project. Shared by the
    // quotation link and the send payload.
    const attachUnitId = activeProperty?.id && projectData?.id
        && (!activeProperty.projectId || activeProperty.projectId === projectData.id)
        ? activeProperty.id
        : null;
    // The sanitized quotation sheet — mirrors the backend's sanitizeQuote
    // bounds exactly (names capped, amounts finite and bounded, percentages
    // inside 0-100, ≤12 rows / ≤6 payout stages) so the preview link, the
    // body variable and the attached PDF always agree on what prints. An
    // EMPTY amount drops the row: an unfilled figure must never print as
    // Rs 0.00.
    const validQuote = (() => {
        const rows = quoteRows
            .map((r) => ({
                name: String(r.name || "").trim().slice(0, 60),
                basis: String(r.basis || "").trim().slice(0, 90),
                amount: (r.amount === "" || r.amount === null || r.amount === undefined)
                    ? NaN
                    : Number(r.amount),
            }))
            .filter((r) => r.name && Number.isFinite(r.amount) && r.amount >= 0 && r.amount <= 999999999)
            .slice(0, 12);
        const rate = (value, fallback) => {
            const n = Number(value);
            return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : fallback;
        };
        const payouts = quotePayouts
            .map((p) => ({
                label: String(p.label || "").trim().slice(0, 90),
                ratio: p.ratio === "" ? NaN : Number(p.ratio),
            }))
            .filter((p) => p.label && Number.isFinite(p.ratio) && p.ratio >= 0 && p.ratio <= 100)
            .slice(0, 6);
        return {
            rows,
            brokerageOn: quoteBrokerageOn,
            brokerPct: rate(quoteBrokerPct, 1),
            gstPct: rate(quoteGstPct, 18),
            payouts,
        };
    })();
    // Live money the sheet implies — the same maths the PDF does: the net
    // property value is the row sum, the brokerage fee is the % of the NET
    // BASE VALUE (the BSP row, else the first priced row), GST rides that
    // fee, and each payout instalment is its ratio of the total payable.
    // Brokerage removed (builder-direct flat) → fee, GST and every
    // instalment collapse to zero.
    const quoteTotals = (() => {
        const net = validQuote.rows.reduce((sum, r) => sum + r.amount, 0);
        const bsp = validQuote.rows.find((r) => /basic sale price|\bbsp\b/i.test(r.name));
        const base = bsp && bsp.amount > 0
            ? bsp.amount
            : (validQuote.rows[0] && validQuote.rows[0].amount > 0 ? validQuote.rows[0].amount : 0);
        const off = validQuote.brokerageOn === false;
        const fee = off ? 0 : (base * validQuote.brokerPct) / 100;
        const gst = off ? 0 : (fee * validQuote.gstPct) / 100;
        return { net, fee, gst, payable: fee + gst };
    })();
    const payoutRatioSum = validQuote.payouts.reduce((sum, p) => sum + p.ratio, 0);
    // The sheet rides the URL/send only once the employee has actually edited
    // it: untouched, the backend derives the identical rows from the same
    // stored charges — and the message text keeps its short link.
    const quoteParam = quoteSheetTouched ? validQuote : null;
    // Quotation link, server-rendered on demand: the recipient (and Meta,
    // for the attachment) fetch a PDF built from the project's live price
    // list + charge sheet. Sender/customer names are display-only on the
    // document and get sanitized again server-side; the edited sheet (cost
    // rows / brokerage % / GST % / payout ratios) rides the URL and is fully
    // re-validated by the renderer.
    const quotationUrl = (() => {
        if (!projectData?.id) return "";
        const params = new URLSearchParams({ projectId: projectData.id });
        if (attachUnitId) params.set("unit", attachUnitId);
        if (user?.name) params.set("by", user.name);
        const clientName = selectedLead?.name || conversation?.lead?.name || "";
        if (clientName) params.set("customer", clientName);
        if (quoteParam) params.set("quote", JSON.stringify(quoteParam));
        return `${API_BASE}/public/quotations?${params.toString()}`;
    })();
    const autoVars = {
        customer_name: selectedLead?.name || conversation?.lead?.name || "",
        // House numbers never go out in WhatsApp text: unit titles ARE the
        // apartment numbers (A-101 / A-102), so property_name names the
        // configuration instead — older custom rows keep working without
        // ever leaking a unit number.
        property_name: activeProperty?.configuration || activeProperty?.config?.name || "",
        project_name: projectData?.name || selectedLead?.project?.name || activeProperty?.project?.name || "",
        location: [projectData?.locality, projectData?.city].filter(Boolean).join(", ")
            || [activeProperty?.project?.locality, activeProperty?.project?.city].filter(Boolean).join(", "),
        configuration: activeProperty?.configuration || activeProperty?.config?.name
            || (() => {
                // No unit picked: derive the project's configurations from
                // its configuration records, or — when a project stores the
                // configuration as unit text (no configuration records) —
                // from the unit rows. Distinct names, e.g. "3 BHK, 2 BHK".
                const names = [];
                for (const cfg of (Array.isArray(projectData?.configurations) ? projectData.configurations : [])) {
                    const n = cfg.name || (cfg.bhk ? `${cfg.bhk} BHK` : "");
                    if (n && !names.includes(n)) names.push(n);
                }
                for (const unit of (Array.isArray(projectData?.properties) ? projectData.properties : [])) {
                    const n = unit.configuration;
                    if (n && !names.includes(n)) names.push(n);
                }
                return names.slice(0, 3).join(", ");
            })(),
        price_range: priceRange,
        site_address: projectData?.address || "",
        brochure_url: brochureUrl,
        quotation_url: quotationUrl,
        salesperson_name: user?.name || "",
    };
    const getVar = (name) => (varValues[name] !== undefined ? varValues[name] : (autoVars[name] || ""));

    // Unified selectable definitions: library entries + active custom rows.
    // providerTemplateId is intentionally never surfaced here. Rows whose
    // name matches a catalog entry are local provisioning copies — the
    // always-current library entry wins, so a stale variable list (old
    // {{property_name}} bodies) can never be selected and sent.
    const libraryNames = new Set(library.map((entry) => String(entry.name || "").toLowerCase()));
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
        ...templateRows
            .filter((row) => !libraryNames.has(String(row.name || "").toLowerCase()))
            .map((row) => ({
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
    // Templates that talk about a project get the project picker, so the
    // project-derived values (brochure link included) fill themselves in.
    const templateNeedsProject = Boolean(
        selectedDef && selectedDef.variables.some((v) => PROJECT_TEMPLATE_VARS.includes(v))
    );
    // A template carrying quotation_url can send the itemised quotation
    // alongside the text; a template carrying brochure_url links the
    // brochure. Neither is required for the brochure option — it is offered
    // for every project, on every template and on plain text, independent
    // of the quotation. A customized row may have lost the recorded variable
    // list, so the body is checked too — the PDF must never be silently
    // skipped.
    const carriesVar = (name) => Boolean(
        selectedDef && (
            (Array.isArray(selectedDef.variables) && selectedDef.variables.includes(name)) ||
            String(selectedDef.body || "").includes(name)
        )
    );
    const usesCompanionPdf = carriesVar("quotation_url");
    // Which PDFs (if any) this send carries. Brochure and quotation are
    // INDEPENDENT options — the brochure is an employee-uploaded file and is
    // offered on every template and on plain text, with no quotation needed.
    // BOTH can be ticked: WhatsApp sends one document per message, so the
    // backend delivers them as two back-to-back documents (one click here,
    // two files on the phone) and records one thread row per file. Nothing
    // is attached unless a box is ticked.
    const sendKinds = [
        attachBrochure ? "brochure" : null,
        attachPdf && usesCompanionPdf ? "quotation" : null
    ].filter(Boolean);
    // Preview link for the PDF quotation — the same live render (incl. valid
    // add-ons) that fills the `quotation_url` body variable and that the
    // backend attaches when the box is ticked. It must be available as soon
    // as the template carries the variable and a project is picked, NOT only
    // after the tick: gating it on `attachPdf` hid the checkbox behind the
    // very state it sets, so the quotation could never be attached.
    const pdfPreviewUrl = usesCompanionPdf ? quotationUrl : "";
    // Photos for the optional image send: the picked unit's own gallery when
    // it has one, else the project gallery. Only live links — the backend
    // re-resolves the same sources server-side and re-filters, so what the
    // checkbox counts here is exactly what goes out.
    const sendableImages = (() => {
        const source = (Array.isArray(activeProperty?.images) && activeProperty.images.length > 0)
            ? activeProperty.images
            : (Array.isArray(projectData?.images) ? projectData.images : []);
        return source
            .map((u) => (typeof u === "string" ? toLiveLink(u.trim()) : ""))
            .filter((u) => /^https?:\/\//.test(u))
            .slice(0, 6);
    })();

    const selectTemplate = (option) => {
        // Re-picking the SAME template (a natural double-check while the
        // popup is open, or via the quick action again) must not wipe the
        // composer set-up: the typed variable values and the attachment
        // ticks belong to this template and stay. Only switching to a
        // DIFFERENT template starts fresh — otherwise the send silently
        // went out with cleared variables / unticked PDFs.
        const sameTemplate = selectedTemplate?.kind === option.kind
            && selectedTemplate?.key === option.key;
        if (!sameTemplate) {
            setVarValues({});
            setAttachPdf(false);
            setAttachImages(false);
        }
        setSelectedTemplate({ kind: option.kind, key: option.key });
        // Picking a template must actually SEND that template: without this
        // the composer stayed on the plain-text branch, so Send either
        // complained "Write a message first" or silently sent the draft text
        // instead of the quotation. The quick actions already flipped the
        // mode (see selectTemplateByName) — same behaviour here.
        setMode("template");
        // The quotation sheet stays as-is: it belongs to the picked project,
        // not to the template. The popup deliberately STAYS OPEN on pick —
        // the preview, project/unit picker, variables and quotation sheet all
        // render right below the template list, so the whole set-up happens
        // inside the big popup. It only goes down via Minimize / Close /
        // backdrop — never by itself.
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
            // Full send response — carries attachmentError when the PDF could
            // not be delivered (the text still went out).
            let sent = null;

            if (mode === "template") {
                if (!selectedDef) {
                    showToast("Choose a template", "error");
                    return;
                }
                if (missingVars.length > 0) {
                    showToast(`Fill in required values: ${missingVars.join(", ")}`, "error");
                    return;
                }
                sent = await sendMessage.mutateAsync({
                    conversationId: conv.id,
                    templateName: selectedDef.name,
                    variables: selectedDef.variables.map((v) => getVar(v).trim()),
                    // Companion media only when a box was ticked: the backend
                    // resolves the PDFs (the uploaded brochure and/or the
                    // quotation) and re-resolves the gallery images
                    // server-side from these ids. Without a tick, the message
                    // goes out as text alone. Brochure and quotation are
                    // independent options that can BOTH ride one send — the
                    // backend delivers each as its own document message and
                    // records one thread row per file. Valid add-on rows only
                    // matter for a quotation send.
                    ...((sendKinds.length > 0 || (attachImages && sendableImages.length > 0)) && projectData?.id
                        ? {
                            attachment: {
                                projectId: projectData.id,
                                ...(attachUnitId ? { propertyId: attachUnitId } : {}),
                                pdf: sendKinds.length > 0,
                                // `kind` is the first pick (older single-PDF
                                // handling); `kinds` is the full ordered list
                                // the backend delivers — one document each.
                                ...(sendKinds.length > 0
                                    ? { kind: sendKinds[0], kinds: sendKinds }
                                    : {}),
                                ...(sendKinds.includes("quotation") && quoteParam
                                    ? { quote: quoteParam }
                                    : {}),
                                ...(attachImages && sendableImages.length > 0 ? { images: true } : {})
                            }
                        }
                        : {})
                });
            } else {
                if (!draft.trim()) {
                    showToast("Write a message first", "error");
                    return;
                }
                await sendMessage.mutateAsync({
                    conversationId: conv.id,
                    body: draft.trim(),
                    ...(sharePropertyId ? { share: { propertyId: sharePropertyId } } : {}),
                    // Plain text carries companion media too — the brochure
                    // option does not depend on using a template.
                    ...((sendKinds.length > 0 || (attachImages && sendableImages.length > 0)) && projectData?.id
                        ? {
                            attachment: {
                                projectId: projectData.id,
                                ...(attachUnitId ? { propertyId: attachUnitId } : {}),
                                pdf: sendKinds.length > 0,
                                // `kind` is the first pick (older single-PDF
                                // handling); `kinds` is the full ordered list
                                // the backend delivers — one document each.
                                ...(sendKinds.length > 0
                                    ? { kind: sendKinds[0], kinds: sendKinds }
                                    : {}),
                                ...(sendKinds.includes("quotation") && quoteParam
                                    ? { quote: quoteParam }
                                    : {}),
                                ...(attachImages && sendableImages.length > 0 ? { images: true } : {})
                            }
                        }
                        : {})
                });
                setSharePropertyId(null);
            }

            setDraft("");
            setVarValues({});
            setAttachPdf(false);
            setAttachBrochure(false);
            setAttachImages(false);
            // The quotation sheet KEEPS its values after a send — the same
            // deal pricing usually goes to the next lead too, and only
            // picking another project/unit re-prefills it.
            // The text can go out even when the companion PDF did not (24-hour
            // window closed / Meta rejection) — surface that instead of a
            // false success; the thread chip shows the same pending state.
            const pdfError = sent?.attachmentError || (sent?.attachmentUrl && sent?.error) || null;
            if (pdfError) {
                showToast(`Message sent — attachments pending: ${pdfError}`, "error");
            } else {
                showToast("WhatsApp message sent", "success");
            }
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
        showToast("Pick a PDF brochure or a property photo below the message box — use the paperclip block that fits your message", "error");
    };
    const handleVideo = () => {
        showToast("WhatsApp voice and video calls aren't available in the CRM yet", "error");
    };

    // Brochure upload, right here in the composer: the employee picks a PDF
    // from their computer, exactly like property images on the project form.
    // Nothing is generated — this stores the file the employee chose and the
    // project's documents JSON records it (PDF magic bytes + 15 MB cap are
    // enforced server-side too). The cached project is patched in place so
    // the tickbox, preview link and brochure_url variable update at once.
    const queryClient = useQueryClient();
    const [brochureUploading, setBrochureUploading] = useState(false);
    const onPickBrochure = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = ""; // allow re-picking the same file
        if (!file) return;
        if (!projectData?.id) {
            showToast("Choose a project first, then upload its brochure", "error");
            return;
        }
        if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
            showToast("The brochure must be a PDF file", "error");
            return;
        }
        if (file.size > MAX_BROCHURE_MB * 1024 * 1024) {
            showToast(`The brochure is larger than ${MAX_BROCHURE_MB} MB`, "error");
            return;
        }
        setBrochureUploading(true);
        try {
            const entry = await uploadProjectBrochure(projectData.id, file);
            const key = ["project", projectData.id];
            queryClient.setQueryData(key, (old) => {
                const base = old?.data || old;
                if (!base) return old;
                const docs = Array.isArray(base.documents) ? base.documents : [];
                const next = { ...base, documents: [...docs.filter((d) => !isBrochureDoc(d)), entry] };
                return old?.data ? { ...old, data: next } : next;
            });
            setAttachBrochure(true);
            showToast(`Brochure uploaded${entry?.size ? ` · ${formatFileSize(entry.size)}` : ""}`);
        } catch (err) {
            showToast(err?.message || "Brochure upload failed", "error");
        } finally {
            setBrochureUploading(false);
        }
    };
    const onRemoveBrochure = async () => {
        if (!projectData?.id) return;
        try {
            await removeProjectBrochure(projectData.id);
            const key = ["project", projectData.id];
            queryClient.setQueryData(key, (old) => {
                const base = old?.data || old;
                if (!base) return old;
                const docs = Array.isArray(base.documents) ? base.documents : [];
                const next = { ...base, documents: docs.filter((d) => !isBrochureDoc(d)) };
                return old?.data ? { ...old, data: next } : next;
            });
            setAttachBrochure(false);
            showToast("Brochure removed");
        } catch (err) {
            showToast(err?.message || "Could not remove the brochure", "error");
        }
    };

    // Prefill the editable quotation sheet from the picked project + unit:
    // the same rows the backend derives when nothing is edited — BSP from the
    // unit's own price (or the project's starting price), then the stored
    // charge sheet. Done as a render-time adjustment (React's documented
    // pattern for derived state — same as the lead switch above) rather than
    // a setState inside an effect, which the compiler lint forbids and which
    // a background refetch would use to wipe the employee's edits. Keyed on
    // the picked IDS, so only picking a different project/unit re-prefills.
    const sheetKey = `${projectData?.id || ""}:${attachUnitId || ""}`;
    const [lastSheetKey, setLastSheetKey] = useState(sheetKey);
    if (sheetKey !== lastSheetKey) {
        setLastSheetKey(sheetKey);
        setQuoteSheetTouched(false);
        if (!projectData?.id) {
            setQuoteRows([]);
        } else {
            const positive = (v) => (Number(v) > 0 ? Number(v) : null);
            const base = positive(activeProperty?.price) ?? positive(projectData.startingPrice);
            const perSqft = positive(projectData.pricePerSqFt);
            const next = [{
                name: "Basic Sale Price (BSP)",
                basis: perSqft ? `Rs ${perSqft.toLocaleString("en-IN")}/sq. ft.` : "As per current price list",
                amount: base != null ? String(base) : "",
            }];
            const charge = (name, basis, value) => {
                const n = positive(value);
                if (n != null) next.push({ name, basis, amount: String(n) });
            };
            charge("Preferential Location Charges (PLC)", "Fixed charge", projectData.plcCharges);
            charge("Mandatory Covered Car Parking", "Fixed charge", projectData.parkingCharges);
            charge("Clubhouse Amenities Membership", "One-time charge", projectData.clubCharges);
            charge("Other Statutory / Utility Charges", "As applicable", projectData.otherCharges);
            setQuoteRows(next);
        }
    }

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

    // The Templates tab content. `tall` is true when rendered inside the
    // big popup — the inner lists then use viewport-based heights so the
    // templates/preview fill the window instead of a small scroll box.
    const templateBrowser = (tall) => (
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
                <div className={`space-y-4 overflow-y-auto custom-scrollbar pr-1 min-w-0 ${tall ? "max-h-[64vh]" : "max-h-72"}`}>
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
                    {templateNeedsProject && (
                        <div className="min-w-0">
                            <p className="flex items-center gap-2 text-[11px] font-bold text-gray-600 mb-1 min-w-0">
                                <span className="truncate">Choose project or unit</span>
                                <span className="shrink-0 text-[10px] font-semibold text-gray-400">
                                    {pickedPropertyId
                                        ? "unit chosen by you"
                                        : pickedProjectId
                                            ? "chosen by you"
                                            : activeProjectId
                                                ? "from this lead"
                                                : "tap one, then Send"}
                                </span>
                            </p>
                            <div className={`overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 ${tall ? "max-h-[40vh]" : "max-h-52"}`}>
                                {projectOptions.map((p) => {
                                    const units = propertiesByProject[p.id] || [];
                                    const projectOn = !pickedPropertyId && activeProjectId === p.id;
                                    const total = p.inventory?.total;
                                    // The option sells the property (price
                                    // range + live availability) — the address
                                    // stays out of the picker on purpose.
                                    const price = p.startingPrice != null
                                        ? (p.maximumPrice != null
                                            ? `${formatCurrency(p.startingPrice)} – ${formatCurrency(p.maximumPrice)}`
                                            : `from ${formatCurrency(p.startingPrice)}`)
                                        : null;
                                    const detail = [
                                        price,
                                        total ? `${p.inventory?.available ?? 0}/${total} units available` : null
                                    ].filter(Boolean).join(" · ");
                                    return (
                                        <div key={p.id}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPickedPropertyId(null);
                                                    setPickedProjectId(p.id);
                                                }}
                                                aria-pressed={projectOn}
                                                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 ${projectOn ? "bg-violet-50" : "hover:bg-gray-50"}`}
                                            >
                                                <span className="min-w-0">
                                                    <span className={`block text-sm font-bold truncate ${projectOn ? "text-violet-700" : "text-gray-800"}`}>{p.name}</span>
                                                    {detail && <span className="block text-[11px] text-gray-400 truncate">{detail}</span>}
                                                </span>
                                                {projectOn && <Check size={14} className="text-violet-600 shrink-0" />}
                                            </button>
                                            {units.map((u) => {
                                                const unitOn = pickedPropertyId === u.id;
                                                // House numbers stay inside the CRM —
                                                // the option sells the configuration
                                                // (BHK · price), not the door plate.
                                                const unitDetail = [
                                                    u.configuration || (u.bhk ? `${u.bhk} BHK` : null),
                                                    Number(u.price) > 0 ? formatCurrency(u.price) : null
                                                ].filter(Boolean).join(" · ") || "Configuration details on request";
                                                return (
                                                    <button
                                                        key={u.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setPickedPropertyId(u.id);
                                                            setPickedProjectId(p.id);
                                                        }}
                                                        aria-pressed={unitOn}
                                                        className={`w-full text-left pl-7 pr-3 py-1.5 border-t border-gray-50 flex items-center justify-between gap-2 ${unitOn ? "bg-violet-50" : "hover:bg-gray-50"}`}
                                                    >
                                                        <span className="min-w-0">
                                                            <span className={`block text-[13px] truncate ${unitOn ? "font-bold text-violet-700" : "text-gray-700"}`}>{unitDetail}</span>
                                                        </span>
                                                        {unitOn && <Check size={13} className="text-violet-600 shrink-0" />}
                                                    </button>
                                                );
                                            })}
                                            {units.length === 0 && (
                                                <p className="pl-7 pr-3 py-1 border-t border-gray-50 text-[11px] text-gray-400">No units listed</p>
                                            )}
                                        </div>
                                    );
                                })}
                                {projectOptions.length === 0 && (
                                    <p className="px-3 py-2 text-xs text-gray-400">Loading projects…</p>
                                )}
                            </div>
                        </div>
                    )}
                    {selectedDef.variables.length > 0 && (
                        <div className="space-y-2">
                            {selectedDef.variables.map((name) => {
                                const autoFilled = varValues[name] === undefined && autoVars[name];
                                // The brochure/quotation link comes from the
                                // selected project, so it is shown, not typed
                                // (brochure_url is the public project page —
                                // never a PDF: no brochure reaches a client).
                                // It only falls back to a manual field when the
                                // project has no public link to build from.
                                const derivedLink = (name === "brochure_url" || name === "quotation_url")
                                    && getVar(name).trim() !== "";
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
                                        {derivedLink ? (
                                            <>
                                                <div className="w-full min-w-0 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 flex items-start gap-2">
                                                    <Link2 size={13} className="shrink-0 mt-0.5 text-gray-400" />
                                                    <span className="min-w-0 break-all">{getVar(name)}</span>
                                                </div>
                                                {projectData?.name ? (
                                                    <p className="text-[10px] text-gray-400 mt-1">
                                                        From {projectData.name} — pick another project above to change it.
                                                        {name === "quotation_url" && pdfPreviewUrl ? (
                                                            <>
                                                                {" "}
                                                                <a
                                                                    href={pdfPreviewUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="font-bold text-indigo-600 hover:underline"
                                                                >
                                                                    Preview PDF quotation
                                                                </a>
                                                                <span> · attach it with the checkbox below</span>
                                                            </>
                                                        ) : null}
                                                    </p>
                                                ) : null}
                                            </>
                                        ) : (
                                            <input
                                                type="text"
                                                value={getVar(name)}
                                                onChange={(e) => setVarValues((v) => ({ ...v, [name]: e.target.value }))}
                                                placeholder={autoFilled ? autoFilled : `Enter ${name.replace(/_/g, " ")}`}
                                                aria-label={`Value for ${name}`}
                                                className={`w-full min-w-0 bg-white border rounded-xl px-3 py-2 text-sm focus:outline-none ${getVar(name).trim() === "" ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-green-500"}`}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {projectData?.id && (
                        <div className="space-y-1.5 pt-2 border-t border-gray-100">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Attachments · off by default · brochure + quotation can both be ticked</p>
                            {/* Brochure — independent of the quotation, and
                                both can ride the same send. The employee
                                uploads their OWN PDF from this computer
                                (never generated), exactly like property
                                images on the project form, and ticks it to
                                send. */}
                            <div className="space-y-1">
                                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={attachBrochure}
                                        disabled={!uploadedBrochure || brochureUploading}
                                        onChange={(e) => setAttachBrochure(e.target.checked)}
                                        className="shrink-0 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                    />
                                    <span className="min-w-0 truncate">
                                        Brochure PDF
                                        {uploadedBrochure?.size ? ` · ${formatFileSize(uploadedBrochure.size)}` : ""}
                                        {uploadedBrochure && brochurePublicUrl && (
                                            <a
                                                href={brochurePublicUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-bold text-indigo-600 hover:underline"
                                            >
                                                {" "}preview
                                            </a>
                                        )}
                                        {!uploadedBrochure && (
                                            <span className="text-gray-400"> · none on file — upload one below</span>
                                        )}
                                    </span>
                                </label>
                                <div className="flex items-center gap-2">
                                    <label className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-[11px] font-bold transition ${brochureUploading ? "cursor-wait border-gray-300 text-gray-400" : "cursor-pointer border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"}`}>
                                        <input
                                            type="file"
                                            accept="application/pdf,.pdf"
                                            className="hidden"
                                            disabled={brochureUploading}
                                            onChange={onPickBrochure}
                                        />
                                        <FileText size={12} />
                                        {brochureUploading
                                            ? "Uploading…"
                                            : uploadedBrochure ? "Replace brochure PDF" : "Upload brochure PDF from computer"}
                                    </label>
                                    {uploadedBrochure && (
                                        <button
                                            type="button"
                                            onClick={onRemoveBrochure}
                                            className="text-[11px] font-bold text-red-500 hover:underline"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-400">PDF only, up to {MAX_BROCHURE_MB} MB · optional · sent only when ticked</p>
                            </div>
                            {usesCompanionPdf && pdfPreviewUrl && (
                                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={attachPdf}
                                        onChange={(e) => setAttachPdf(e.target.checked)}
                                        className="shrink-0 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                    />
                                    <span className="min-w-0 truncate">
                                        PDF quotation ·
                                        <a
                                            href={pdfPreviewUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-bold text-indigo-600 hover:underline"
                                        >
                                            {" "}preview
                                        </a>
                                    </span>
                                </label>
                            )}
                            {usesCompanionPdf && (
                                <div className="pt-0.5 space-y-2">
                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider min-w-0 truncate">
                                            Quotation values · editable
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setQuoteSheetOpen((open) => !open)}
                                            aria-expanded={quoteSheetOpen}
                                            className="shrink-0 text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800"
                                        >
                                            {quoteSheetOpen ? "Hide" : "Edit"}
                                        </button>
                                    </div>
                                    {/* Live totals — the same maths the PDF does,
                                        so the preview link and the attachment
                                        always agree with what's on screen. */}
                                    <p className="text-[10px] text-gray-500 leading-relaxed">
                                        {validQuote.brokerageOn === false ? (
                                            <>Net value {formatCurrency(quoteTotals.net)} · No brokerage on this deal (builder direct)</>
                                        ) : (
                                            <>
                                                Net value {formatCurrency(quoteTotals.net)} · Brokerage {validQuote.brokerPct}%
                                                {" = "}{formatCurrency(quoteTotals.payable)} payable
                                            </>
                                        )}
                                    </p>
                                    {quoteSheetOpen && (
                                        <div className="space-y-2 border border-gray-200 rounded-xl p-2 bg-gray-50">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                                Cost breakdown
                                            </p>
                                            {quoteRows.map((row, idx) => (
                                                <div key={`qrow-${idx}`} className="space-y-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            value={row.name}
                                                            onChange={(e) => {
                                                                const name = e.target.value;
                                                                setQuoteRows((rows) => rows.map((r, i) => (i === idx ? { ...r, name } : r)));
                                                                setQuoteSheetTouched(true);
                                                            }}
                                                            aria-label={`Cost row ${idx + 1} name`}
                                                            className="min-w-0 flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                                        />
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            placeholder="₹ amount"
                                                            value={row.amount}
                                                            onChange={(e) => {
                                                                const amount = e.target.value;
                                                                setQuoteRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount } : r)));
                                                                setQuoteSheetTouched(true);
                                                            }}
                                                            aria-label={`Cost row ${idx + 1} amount`}
                                                            className="w-24 shrink-0 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setQuoteRows((rows) => rows.filter((_, i) => i !== idx));
                                                                setQuoteSheetTouched(true);
                                                            }}
                                                            aria-label={`Remove cost row ${idx + 1}`}
                                                            className="text-gray-400 hover:text-red-500 shrink-0"
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                    <input
                                                        value={row.basis}
                                                        placeholder="Calculation basis (e.g. Rs 8,500/sq. ft.)"
                                                        onChange={(e) => {
                                                            const basis = e.target.value;
                                                            setQuoteRows((rows) => rows.map((r, i) => (i === idx ? { ...r, basis } : r)));
                                                            setQuoteSheetTouched(true);
                                                        }}
                                                        aria-label={`Cost row ${idx + 1} basis`}
                                                        className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-[11px] text-gray-600 focus:outline-none focus:border-indigo-400"
                                                    />
                                                </div>
                                            ))}
                                            {quoteRows.length < 12 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setQuoteRows((rows) => [...rows, { name: "", basis: "", amount: "" }]);
                                                        setQuoteSheetTouched(true);
                                                    }}
                                                    className="text-[11px] font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
                                                >
                                                    <Plus size={12} /> Add cost row
                                                </button>
                                            )}

                                            <div className="pt-1 space-y-1.5">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={quoteBrokerageOn}
                                                        onChange={(e) => {
                                                            setQuoteBrokerageOn(e.target.checked);
                                                            setQuoteSheetTouched(true);
                                                        }}
                                                        aria-label="Charge brokerage and GST on this deal"
                                                        className="shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                                        Brokerage & GST
                                                        {!quoteBrokerageOn && (
                                                            <span className="ml-1.5 font-bold text-amber-600">— removed</span>
                                                        )}
                                                    </span>
                                                </label>
                                                {quoteBrokerageOn ? (
                                                    <>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="min-w-0 flex-1 text-xs text-gray-700">Brokerage fee</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setQuoteBrokerPct((v) => String(Math.max(0, Math.round((Number(v) - 0.25) * 100) / 100)));
                                                            setQuoteSheetTouched(true);
                                                        }}
                                                        aria-label="Decrease brokerage percentage"
                                                        className="w-6 h-6 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-indigo-600 text-sm font-bold leading-none"
                                                    >
                                                        −
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        step="0.25"
                                                        value={quoteBrokerPct}
                                                        onChange={(e) => {
                                                            setQuoteBrokerPct(e.target.value);
                                                            setQuoteSheetTouched(true);
                                                        }}
                                                        aria-label="Brokerage fee percentage"
                                                        className="w-16 shrink-0 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-indigo-400"
                                                    />
                                                    <span className="text-[11px] text-gray-500 shrink-0">%</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setQuoteBrokerPct((v) => String(Math.min(100, Math.round((Number(v) + 0.25) * 100) / 100)));
                                                            setQuoteSheetTouched(true);
                                                        }}
                                                        aria-label="Increase brokerage percentage"
                                                        className="w-6 h-6 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-indigo-600 text-sm font-bold leading-none"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="min-w-0 flex-1 text-xs text-gray-700">GST on brokerage</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={quoteGstPct}
                                                        onChange={(e) => {
                                                            setQuoteGstPct(e.target.value);
                                                            setQuoteSheetTouched(true);
                                                        }}
                                                        aria-label="GST percentage on brokerage"
                                                        className="w-16 shrink-0 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-indigo-400"
                                                    />
                                                    <span className="text-[11px] text-gray-500 shrink-0 w-6">%</span>
                                                </div>
                                                        <p className="text-[10px] text-gray-500">
                                                            Fee {formatCurrency(quoteTotals.fee)} · GST {formatCurrency(quoteTotals.gst)} · Total payable {formatCurrency(quoteTotals.payable)}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <p className="text-[10px] text-amber-600 font-semibold leading-relaxed">
                                                        Removed — the quotation prints no brokerage or GST (builder-direct flat).
                                                    </p>
                                                )}
                                            </div>

                                            {quoteBrokerageOn && (
                                            <div className="pt-1 space-y-1.5">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                                    Payout schedule
                                                </p>
                                                {quotePayouts.map((payout, idx) => (
                                                    <div key={`qpay-${idx}`} className="flex items-center gap-1.5">
                                                        <input
                                                            value={payout.label}
                                                            onChange={(e) => {
                                                                const label = e.target.value;
                                                                setQuotePayouts((rows) => rows.map((r, i) => (i === idx ? { ...r, label } : r)));
                                                                setQuoteSheetTouched(true);
                                                            }}
                                                            aria-label={`Payout stage ${idx + 1} milestone`}
                                                            className="min-w-0 flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:border-indigo-400"
                                                        />
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={payout.ratio}
                                                            onChange={(e) => {
                                                                const ratio = e.target.value;
                                                                setQuotePayouts((rows) => rows.map((r, i) => (i === idx ? { ...r, ratio } : r)));
                                                                setQuoteSheetTouched(true);
                                                            }}
                                                            aria-label={`Payout stage ${idx + 1} percentage`}
                                                            className="w-14 shrink-0 bg-white border border-gray-200 rounded-lg px-2 py-1 text-[11px] text-right focus:outline-none focus:border-indigo-400"
                                                        />
                                                        <span className="w-16 shrink-0 text-[10px] text-gray-500 text-right">
                                                            {formatCurrency((quoteTotals.payable * (Number(payout.ratio) || 0)) / 100)}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setQuotePayouts((rows) => rows.filter((_, i) => i !== idx));
                                                                setQuoteSheetTouched(true);
                                                            }}
                                                            aria-label={`Remove payout stage ${idx + 1}`}
                                                            className="text-gray-400 hover:text-red-500 shrink-0"
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                ))}
                                                {quotePayouts.length < 6 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setQuotePayouts((rows) => [...rows, { label: "", ratio: "" }]);
                                                            setQuoteSheetTouched(true);
                                                        }}
                                                        className="text-[11px] font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
                                                    >
                                                        <Plus size={12} /> Add payout stage
                                                    </button>
                                                )}
                                                <p className={`text-[10px] font-bold ${Math.abs(payoutRatioSum - 100) < 0.005 ? "text-gray-400" : "text-amber-600"}`}>
                                                    Ratios total {payoutRatioSum.toFixed(2)}%
                                                    {Math.abs(payoutRatioSum - 100) < 0.005 ? "" : " — should add up to 100%"}
                                                </p>
                                            </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {sendableImages.length > 0 && (
                                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={attachImages}
                                        onChange={(e) => setAttachImages(e.target.checked)}
                                        className="shrink-0 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                    />
                                    <span className="min-w-0 truncate">Property images ({sendableImages.length})</span>
                                </label>
                            )}
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
                                <span className="truncate">Share Project Page</span>
                            </button>
                            <button
                                onClick={() => selectTemplateByName("Property Quotation")}
                                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors min-w-0 text-left"
                            >
                                <Receipt size={14} className="shrink-0" />
                                <span className="truncate">Send Quotation</span>
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

    // The Details / Templates / Notes panel body — rendered twice: always in
    // the desktop third column, and inside the mobile popup drawer below.
    // Shared body of the side panel: tabs + the active tab's content. Rendered
    // small in the desktop column (`tall` false) and big inside the popup
    // (`tall` true), where the inner lists stretch to the window.
    const rightPanelBody = (tall) => (
        <>
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
            {rightTab === "templates" && templateBrowser(tall)}
            {rightTab === "notes" && (
                selectedLeadId
                    ? <UnifiedTimeline leadId={selectedLeadId} limit={20} />
                    : <p className="text-sm text-gray-500 text-center py-6">Select a conversation to see notes.</p>
            )}
        </>
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
                                            {m.attachmentUrl ? (
                                                <a
                                                    href={m.attachmentUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`mb-1.5 flex items-center gap-2 bg-white/95 border rounded-lg px-2.5 py-2 hover:bg-gray-50 transition-colors ${
                                                        m.error ? "border-amber-300" : "border-gray-200"
                                                    }`}
                                                    title={m.error ? `PDF not delivered yet — ${m.error}` : "Open the attached PDF"}
                                                >
                                                    <span className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
                                                        m.error ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600"
                                                    }`}>
                                                        <FileText size={15} />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-xs font-bold text-gray-800">{m.attachmentName || "Document.pdf"}</span>
                                                        <span className={`block text-[10px] ${m.error ? "text-amber-600" : "text-gray-500"}`}>
                                                            {m.error ? "PDF pending · goes out on their reply" : "PDF · tap to open"}
                                                        </span>
                                                    </span>
                                                    <ExternalLink size={13} className="shrink-0 text-gray-400" />
                                                </a>
                                            ) : null}
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

                {/* Details / Templates / Notes — desktop: always-visible third
                    column with a ⛶ button that pops the same panel up BIG (the
                    popup below, shared with small screens). */}
                <div className="hidden lg:block min-w-0 bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-5 lg:max-h-[720px] lg:overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Lead panel</p>
                        <button
                            type="button"
                            onClick={openSidePanel}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            aria-label="Open lead panel big"
                            title="Maximize — open in a big popup"
                        >
                            <Maximize2 size={14} />
                        </button>
                    </div>
                    {rightPanelBody(false)}
                </div>
            </div>

            {/* Small screens: the side screen pops UP on demand from the
                floating button. Big screens use the ⛶ button on the column
                (above). Either way the SAME popup below opens — pick a
                template, edit values, attach PDFs; it stays up until you
                use Minimize / Close / the backdrop. */}
            {!sidePanelOpen && (
                <button
                    type="button"
                    onClick={openSidePanel}
                    className="lg:hidden fixed bottom-6 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-violet-600 text-white text-sm font-bold shadow-lg hover:bg-violet-700 active:scale-95 transition"
                    aria-label="Open lead details and templates"
                >
                    <List size={16} />
                    Lead panel
                </button>
            )}
            {sidePanelOpen && (
                <div
                    className={`fixed inset-0 z-50 flex items-stretch sm:justify-center ${sidePanelMax ? "" : "sm:p-4 lg:p-6"}`}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Lead panel"
                >
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={closeSidePanel}
                        aria-hidden="true"
                    />
                    <div className={`relative flex min-w-0 w-full flex-col overflow-hidden bg-white shadow-2xl ${sidePanelMax ? "" : "sm:rounded-3xl sm:max-w-6xl lg:max-w-7xl"}`}>
                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 shrink-0">
                            <p className="text-sm font-black text-gray-900 truncate">Lead panel</p>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setSidePanelMax((v) => !v)}
                                    className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
                                    aria-label={sidePanelMax ? "Minimize lead panel" : "Maximize lead panel"}
                                    title={sidePanelMax ? "Minimize" : "Maximize"}
                                >
                                    {sidePanelMax ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={closeSidePanel}
                                    className="p-2 -mr-2 rounded-full text-gray-500 hover:bg-gray-100"
                                    aria-label="Close lead panel"
                                    title="Close"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            {rightPanelBody(true)}
                        </div>
                    </div>
                </div>
            )}

            <div className="text-xs text-gray-400">
                Templates and messaging follow the official WhatsApp Business API model ·{" "}
                <Link href="/dashboard/calling/calls" className="underline hover:text-gray-600">
                    calls
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
