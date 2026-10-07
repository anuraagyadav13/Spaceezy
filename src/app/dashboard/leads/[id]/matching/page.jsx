"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    fetchLeadById,
    fetchMatchingProperties,
    addInterestedProperty,
    removeInterestedProperty,
    buildPropertyProposal
} from "../../../../../lib/api/leads";
import { formatPrice } from "../../../../../utils/format";
import { showToast } from "../../../../../lib/toast";
import {
    useWhatsAppStatus,
    useCreateConversation,
    useSendMessage
} from "../../../../../features/communication/hooks/useWhatsApp";
import { usePermissions } from "../../../../../features/auth/hooks/usePermissions";
import SharePropertyModal from "../../../../../components/shared/SharePropertyModal";
import {
    ArrowLeft, Share2, Heart,
    Building2, MapPin, Grid, List, Sparkles, X, Send, MessageSquare
} from "lucide-react";

const unitLabel = (unit) => {
    const parts = [unit.configuration || (unit.bhk ? `${unit.bhk} BHK` : "")];
    if (unit.tower) parts.push(`Tower ${unit.tower}`);
    if (unit.unitNumber) parts.push(`Unit ${unit.unitNumber}`);
    return parts.filter(Boolean).join(" · ") || "Unit";
};

const areaLabel = (unit) => {
    const area = unit.areaSaleable || unit.area;
    return area ? `${area} sq.ft` : "—";
};

// Requirement profile labels come from the lead's structured requirement.
const budgetLabel = (lead) => {
    const min = lead.budgetMin != null ? Number(lead.budgetMin) : null;
    const max = lead.budgetMax != null ? Number(lead.budgetMax)
        : (lead.budget != null ? Number(lead.budget) : null);
    if (min != null && max != null) return `${formatPrice(min)} – ${formatPrice(max)}`;
    if (max != null) return `Up to ${formatPrice(max)}`;
    if (min != null) return `From ${formatPrice(min)}`;
    return "Not specified";
};

const configurationLabel = (lead) => {
    if (Array.isArray(lead.configurations) && lead.configurations.length > 0) {
        return lead.configurations.join(", ");
    }
    return lead.interestedUnitType || "Any configuration";
};

const locationLabel = (lead) => {
    if (Array.isArray(lead.preferredLocations) && lead.preferredLocations.length > 0) {
        return lead.preferredLocations
            .map((row) => [row.region?.name, row.district?.name, row.state?.name].filter(Boolean).join(", "))
            .filter(Boolean)
            .join(" · ");
    }
    return lead.project?.city || "Any location";
};

export default function PropertyMatchingPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { hasPermission } = usePermissions();

    const [viewMode, setViewMode] = useState("grid");
    const [selectedUnits, setSelectedUnits] = useState([]);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [shareChannel, setShareChannel] = useState("whatsapp");
    const [shareSuccess, setShareSuccess] = useState(false);
    const [shareSending, setShareSending] = useState(false);
    // Per-card public property link share (opens SharePropertyModal)
    const [shareUnit, setShareUnit] = useState(null);

    const { data: lead, isLoading: leadLoading, isError: leadError } = useQuery({
        queryKey: ["lead", params.id],
        queryFn: () => fetchLeadById(params.id),
        retry: 1
    });

    const {
        data: properties = [],
        isLoading: propertiesLoading,
        isError: propertiesError
    } = useQuery({
        queryKey: ["lead-matching", params.id],
        queryFn: () => fetchMatchingProperties(params.id),
        select: (data) => (Array.isArray(data) ? data : data?.properties || []),
        retry: 1
    });

    const { data: whatsappStatus } = useWhatsAppStatus();
    const createConversation = useCreateConversation();
    const sendMessage = useSendMessage();

    // The proposal text is always composed by the backend from the
    // authoritative lead requirement + selected unit records.
    const selectedKey = [...selectedUnits].sort().join(",");
    const {
        data: proposal,
        isFetching: proposalLoading
    } = useQuery({
        queryKey: ["lead-proposal", params.id, selectedKey],
        queryFn: () => buildPropertyProposal(params.id, selectedUnits),
        enabled: shareModalOpen && selectedUnits.length > 0,
        staleTime: 30 * 1000,
        retry: 1
    });

    if (leadLoading || (!lead && !leadError)) {
        return <div className="p-8 text-center text-gray-500">Loading Lead Property Matching...</div>;
    }

    if (leadError || !lead) {
        return (
            <div className="p-8 text-center">
                <p className="text-gray-700 font-bold mb-2">Failed to load this lead</p>
                <button onClick={() => router.back()} className="px-4 py-2 text-sm font-bold text-purple-600 hover:bg-purple-50 rounded-xl">
                    Go back
                </button>
            </div>
        );
    }

    const projectName =
        (typeof lead.project === "string" ? lead.project : lead.project?.name) || "";
    const stage = lead.status || lead.stage || "NEW";
    const budget = budgetLabel(lead);
    const location = locationLabel(lead);
    const configuration = configurationLabel(lead);
    const propertyType = lead.propertyType || "Any type";

    const toggleSelect = (id) => {
        setSelectedUnits((prev) =>
            prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
        );
    };

    const toggleInterested = async (property, isInterested) => {
        try {
            if (isInterested) {
                await removeInterestedProperty(params.id, property.id);
                showToast("Interest removed", "success");
            } else {
                await addInterestedProperty(params.id, property.id);
                showToast("Marked as interested", "success");
            }
            queryClient.invalidateQueries({ queryKey: ["lead-matching", params.id] });
        } catch (err) {
            showToast(err?.message || "Failed to update interest", "error");
        }
    };

    const selectedProperties = selectedUnits
        .map((id) => properties.find((p) => p.id === id))
        .filter(Boolean);
    const previewMessage = proposal?.body
        || (proposalLoading ? "Composing proposal from lead requirement..." : "");

    const handleShare = async () => {
        if (shareSending || selectedProperties.length === 0) return;
        if (shareChannel === "email") {
            showToast("Email sharing is not configured. Send the proposal on WhatsApp instead.", "error");
            return;
        }
        if (!whatsappStatus?.configured) {
            showToast(
                "WhatsApp integration is not configured. Ask your administrator to connect the WhatsApp Business API.",
                "error"
            );
            return;
        }
        if (!hasPermission("whatsapp:create")) {
            showToast("You do not have permission to send WhatsApp messages.", "error");
            return;
        }

        setShareSending(true);
        try {
            // The backend composes the message from authoritative data
            // (lead requirement + selected units); never build it client-side.
            const composed = proposal?.body
                || (await buildPropertyProposal(lead.id, selectedUnits))?.body;
            if (!composed) throw new Error("Could not build the proposal message");
            const conversation = await createConversation.mutateAsync({ leadId: lead.id });
            await sendMessage.mutateAsync({ conversationId: conversation.id, body: composed });
            setShareSuccess(true);
            showToast("Proposal sent on WhatsApp", "success");
            setTimeout(() => {
                setShareSuccess(false);
                setShareModalOpen(false);
                setSelectedUnits([]);
            }, 1200);
        } catch (err) {
            const map = {
                WHATSAPP_NOT_CONFIGURED:
                    "WhatsApp integration is not configured. Ask your administrator to connect the WhatsApp Business API.",
                CONVERSATION_CLOSED: "This conversation is closed.",
                NOT_FOUND: "One of the selected units no longer exists."
            };
            showToast(map[err?.code] || err?.message || "Failed to send the proposal", "error");
        } finally {
            setShareSending(false);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Top Bar */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 py-5 shrink-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-bold text-gray-900">Property Matching</h1>
                                <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2.5 py-0.5 rounded-full">{lead.name} ({lead.id})</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">Match inventory units against lead preferences and share curated proposals.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedUnits.length > 0 && (
                            <>
                                <button
                                    onClick={() => setShareModalOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-semibold hover:opacity-95 shadow-sm shadow-purple-200"
                                >
                                    <Share2 size={16} /> Share {selectedUnits.length} Selected
                                </button>
                                <button
                                    onClick={() => setSelectedUnits([])}
                                    className="px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
                                >
                                    Clear
                                </button>
                            </>
                        )}
                        <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1">
                            <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded-lg ${viewMode === "grid" ? "bg-white shadow text-purple-600" : "text-gray-400"}`}>
                                <Grid size={16} />
                            </button>
                            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded-lg ${viewMode === "list" ? "bg-white shadow text-purple-600" : "text-gray-400"}`}>
                                <List size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Lead Requirement Summary Card */}
            <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-4 sm:px-8 py-5 shrink-0 shadow-md">
                <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
                            <Sparkles className="text-amber-400" size={24} />
                        </div>
                        <div>
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-200">Lead Requirement Profile</span>
                            <h2 className="text-lg font-bold">{projectName || "Any available project"}</h2>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-6 text-sm">
                        <div className="border-r border-white/10 pr-6">
                            <p className="text-xs text-purple-300">Target Budget</p>
                            <p className="font-bold text-amber-300">{budget}</p>
                        </div>
                        <div className="border-r border-white/10 pr-6">
                            <p className="text-xs text-purple-300">Preferred Location</p>
                            <p className="font-bold text-white">{location}</p>
                        </div>
                        <div className="border-r border-white/10 pr-6">
                            <p className="text-xs text-purple-300">Type</p>
                            <p className="font-bold text-white">{propertyType}</p>
                        </div>
                        <div className="border-r border-white/10 pr-6">
                            <p className="text-xs text-purple-300">Configuration</p>
                            <p className="font-bold text-white">{configuration}</p>
                        </div>
                        <div>
                            <p className="text-xs text-purple-300">Stage</p>
                            <p className="font-bold text-emerald-300">{stage}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Results Bar (filtering happens on the backend from the lead requirement) */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <Sparkles size={14} className="text-purple-500" /> Matching is filtered by this lead&apos;s saved
                    requirement — edit it on the lead page to change results.
                </div>

                <div className="text-xs font-semibold text-gray-500">
                    {propertiesLoading
                        ? "Loading units..."
                        : <>Showing <span className="text-purple-600 font-bold">{properties.length}</span> matching properties</>}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                {!propertiesLoading && properties.length === 0 ? (
                    <div className="text-center text-gray-500 p-12 border border-dashed border-gray-200 rounded-2xl bg-white max-w-2xl mx-auto">
                        <p className="font-bold text-gray-700 mb-1">
                            {propertiesError
                                ? "Failed to load matching units"
                                : "No available units match this lead right now"}
                        </p>
                        <p className="text-sm">
                            {propertiesError
                                ? "Check your connection and try again."
                                : "Adjust the lead's requirement (budget, configurations, preferred locations) or mark more units available in inventory."}
                        </p>
                    </div>
                ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {properties.map(prop => {
                            const isSelected = selectedUnits.includes(prop.id);
                            const isInterested = Boolean(prop.isInterested);
                            const imageSrc = Array.isArray(prop.images) && prop.images[0] ? prop.images[0] : null;
                            return (
                                <div key={prop.id} className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col ${isSelected ? "border-purple-500 ring-2 ring-purple-100 shadow-md" : "border-gray-200 hover:border-purple-200 hover:shadow-sm"}`}>
                                    <div className="relative h-48 bg-gray-100">
                                        {imageSrc ? (
                                            <img src={imageSrc} alt={prop.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                                                <Building2 size={44} className="text-gray-400" />
                                            </div>
                                        )}
                                        <div className="absolute top-3 left-3 flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelect(prop.id)}
                                                className="w-5 h-5 rounded accent-purple-600 cursor-pointer shadow"
                                            />
                                            <span className="bg-white/90 backdrop-blur text-gray-900 text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm">
                                                {prop.type || prop.purpose || "Unit"}
                                            </span>
                                        </div>

                                        {hasPermission("lead:update") && (
                                            <button
                                                onClick={() => toggleInterested(prop, isInterested)}
                                                className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur transition-all ${isInterested ? "bg-red-500 text-white shadow-md" : "bg-white/80 text-gray-600 hover:bg-white"}`}
                                                aria-label={isInterested ? "Remove interest" : "Mark interested"}
                                            >
                                                <Heart size={16} className={isInterested ? "fill-white" : ""} />
                                            </button>
                                        )}

                                        <div className="absolute bottom-3 left-3 bg-gray-900/80 backdrop-blur text-white text-xs font-bold px-3 py-1 rounded-lg">
                                            {prop.status}
                                        </div>
                                    </div>

                                    <div className="p-5 flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start mb-2 gap-2">
                                                <h3 className="font-bold text-gray-900 text-lg leading-snug">{prop.title}</h3>
                                                <span className="text-base font-extrabold text-purple-700 whitespace-nowrap">{formatPrice(Number(prop.price))}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 flex items-center gap-1 mb-4">
                                                <MapPin size={14} className="text-gray-400 shrink-0" />
                                                {[prop.project?.name, prop.tower && `Tower ${prop.tower}`, prop.unitNumber && `Unit ${prop.unitNumber}`].filter(Boolean).join(" · ") || "—"}
                                            </p>

                                            <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-xl mb-4 border border-gray-100">
                                                <div>
                                                    <span className="text-gray-400 font-medium block">Configuration</span>
                                                    <span className="font-bold text-gray-800">{prop.configuration || (prop.bhk ? `${prop.bhk} BHK` : "—")}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 font-medium block">Area</span>
                                                    <span className="font-bold text-gray-800">{areaLabel(prop)}</span>
                                                </div>
                                            </div>

                                            <p className="text-xs text-gray-600 mb-1">
                                                Floor {prop.floor ?? "—"} · Facing {prop.facing || "—"}{prop.purpose ? ` · ${prop.purpose}` : ""}
                                            </p>
                                        </div>

                                        <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                                            <Link
                                                href={`/dashboard/inventory/units/${prop.id}`}
                                                className="text-xs font-bold text-purple-600 hover:underline"
                                            >
                                                View Unit
                                            </Link>
                                            <div className="flex items-center gap-2">
                                                {hasPermission("whatsapp:create") && (
                                                    <button
                                                        onClick={() => setShareUnit(prop)}
                                                        title="Share this unit's public link on WhatsApp"
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors flex items-center gap-1.5"
                                                    >
                                                        <MessageSquare size={13} /> Share Link
                                                    </button>
                                                )}
                                                {hasPermission("lead:update") && (
                                                    <button
                                                        onClick={() => toggleInterested(prop, isInterested)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isInterested ? "bg-red-50 text-red-600 border border-red-200" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                                                    >
                                                        {isInterested ? "Marked Interested" : "+ Mark Interested"}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <th className="p-4 w-10">Select</th>
                                    <th className="p-4">Property / Unit Name</th>
                                    <th className="p-4">Project</th>
                                    <th className="p-4">Category</th>
                                    <th className="p-4">Price / Agreement</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {properties.map(prop => {
                                    const isSelected = selectedUnits.includes(prop.id);
                                    const isInterested = Boolean(prop.isInterested);
                                    const imageSrc = Array.isArray(prop.images) && prop.images[0] ? prop.images[0] : null;
                                    return (
                                        <tr key={prop.id} className={`hover:bg-gray-50/80 transition-colors ${isSelected ? "bg-purple-50/40" : ""}`}>
                                            <td className="p-4">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(prop.id)}
                                                    className="w-4 h-4 accent-purple-600 cursor-pointer"
                                                />
                                            </td>
                                            <td className="p-4 font-bold text-gray-900">
                                                <div className="flex items-center gap-3">
                                                    {imageSrc ? (
                                                        <img src={imageSrc} className="w-10 h-10 rounded-lg object-cover" alt="" />
                                                    ) : (
                                                        <span className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                                            <Building2 size={18} className="text-gray-400" />
                                                        </span>
                                                    )}
                                                    <div>
                                                        <p>{prop.title}</p>
                                                        <p className="text-xs font-normal text-gray-400">{unitLabel(prop)} · {areaLabel(prop)}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-gray-600 text-xs">{prop.project?.name || "—"}</td>
                                            <td className="p-4"><span className="bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-0.5 rounded">{prop.type || prop.purpose || "—"}</span></td>
                                            <td className="p-4 font-extrabold text-purple-700">{formatPrice(Number(prop.price))}</td>
                                            <td className="p-4"><span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded border border-emerald-100">{prop.status}</span></td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {hasPermission("whatsapp:create") && (
                                                        <button
                                                            onClick={() => setShareUnit(prop)}
                                                            title="Share this unit's public link on WhatsApp"
                                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                                                        >
                                                            Share Link
                                                        </button>
                                                    )}
                                                    {hasPermission("lead:update") && (
                                                        <button
                                                            onClick={() => toggleInterested(prop, isInterested)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${isInterested ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                                                        >
                                                            {isInterested ? "Interested" : "Mark Interest"}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Public property link share (WhatsApp) */}
            <SharePropertyModal
                isOpen={Boolean(shareUnit)}
                onClose={() => setShareUnit(null)}
                leadId={params.id}
                initialPropertyId={shareUnit?.id || null}
            />

            {/* Share Proposals Modal */}
            {shareModalOpen && (
                <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100">
                        <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                            <h3 className="font-bold text-lg text-gray-900">Share Selected Properties</h3>
                            <button onClick={() => setShareModalOpen(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="py-4 space-y-4">
                            <p className="text-xs text-gray-500">
                                You are about to send property proposals to <span className="font-bold text-gray-900">{lead.name} ({lead.phone})</span>.
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setShareChannel("whatsapp")}
                                    className={`p-3 rounded-2xl border text-center font-bold text-xs flex flex-col items-center gap-2 ${shareChannel === "whatsapp" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-600"}`}
                                >
                                    <Send size={18} className="text-green-600" /> WhatsApp Proposal
                                </button>
                                <button
                                    onClick={() => setShareChannel("email")}
                                    className={`p-3 rounded-2xl border text-center font-bold text-xs flex flex-col items-center gap-2 ${shareChannel === "email" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
                                >
                                    <Share2 size={18} className="text-blue-600" /> Email PDF Flyer
                                </button>
                            </div>

                            {shareChannel === "email" && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                    Email channel is not configured yet — the CRM will not simulate deliveries. Send the proposal on WhatsApp instead.
                                </p>
                            )}

                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-xs font-mono text-gray-700 space-y-2">
                                <p className="font-bold text-gray-900">Preview Message:</p>
                                <p className="text-gray-600 whitespace-pre-wrap">{previewMessage}</p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                            <button onClick={() => setShareModalOpen(false)} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">
                                Cancel
                            </button>
                            <button
                                onClick={handleShare}
                                disabled={shareSending}
                                className="px-5 py-2 text-xs font-bold bg-green-600 text-white rounded-xl hover:bg-green-700 shadow-sm disabled:opacity-60"
                            >
                                {shareSending ? "Sending..." : shareSuccess ? "Sent Successfully!" : "Send Proposal"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
