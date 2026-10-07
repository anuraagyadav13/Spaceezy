"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
    Loader2, AlertCircle, Save, ArrowLeft, Home, KeyRound,
    Share2, Globe, GlobeLock, ExternalLink
} from "lucide-react";
import { fetchPropertyById, updateProperty } from "../../../../../lib/api/properties";
import { fetchConfigurations } from "../../../../../lib/api/configurations";
import { PermissionGate } from "../../../../../features/auth/components/PermissionGate";
import SharePropertyModal from "../../../../../components/shared/SharePropertyModal";
import { showToast } from "../../../../../lib/toast";
import { formatCurrency } from "../../../../../features/pipeline/helpers";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all disabled:opacity-60";
const labelClass = "block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1";

const UNIT_BADGES = {
    AVAILABLE: "bg-emerald-50 text-emerald-700",
    RESERVED: "bg-purple-50 text-purple-700",
    SOLD: "bg-gray-800 text-white",
};

const TRANSITIONS = {
    AVAILABLE: [
        { to: "RESERVED", label: "Reserve Unit" },
        { to: "SOLD", label: "Mark Sold" },
    ],
    RESERVED: [
        { to: "AVAILABLE", label: "Release Unit" },
        { to: "SOLD", label: "Close Sale" },
    ],
    SOLD: [],
};

export default function UnitEditPage() {
    const params = useParams();
    const unitId = params?.id;
    const queryClient = useQueryClient();
    const [statusError, setStatusError] = useState("");
    const [shareOpen, setShareOpen] = useState(false);

    const { data: unit, isPending, isError, error, refetch } = useQuery({
        queryKey: ["property", unitId],
        queryFn: () => fetchPropertyById(unitId),
        enabled: !!unitId,
        retry: 1
    });

    const projectId = unit?.projectId;

    const { data: configurations } = useQuery({
        queryKey: ["configurations", projectId],
        queryFn: () => fetchConfigurations(projectId),
        enabled: !!projectId,
        retry: 1
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["property", unitId] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        queryClient.invalidateQueries({ queryKey: ["projects"] });
    };

    const saveUnit = useMutation({
        mutationFn: (data) => updateProperty({ id: unitId, ...data }),
        onSuccess: () => {
            showToast("Unit updated");
            invalidate();
        },
        onError: (err) => showToast(err?.message || "Failed to update unit", "error")
    });

    const changeStatus = useMutation({
        mutationFn: (status) => updateProperty({ id: unitId, status }),
        onSuccess: (data) => {
            setStatusError("");
            showToast(`Unit marked ${String(data?.status || "").toLowerCase()}`);
            invalidate();
        },
        onError: (err) => {
            setStatusError(err?.message || "Status change failed");
            showToast(err?.message || "Status change failed", "error");
        }
    });

    // Publish/unpublish the unit on the public website (default: draft).
    const togglePublish = useMutation({
        mutationFn: (isPublic) => updateProperty({ id: unitId, isPublic }),
        onSuccess: (data) => {
            showToast(data?.isPublic ? "Unit published to the public website" : "Unit set back to draft");
            invalidate();
        },
        onError: (err) => showToast(err?.message || "Could not change publication", "error")
    });

    if (isPending) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400">
                <Loader2 size={28} className="animate-spin mr-3" /> Loading unit…
            </div>
        );
    }

    if (isError || !unit) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <AlertCircle size={32} className="text-red-400 mb-3" />
                <p className="text-sm font-semibold text-gray-600 mb-3">{error?.message || "Unit not found"}</p>
                <button onClick={() => refetch()} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold">Retry</button>
            </div>
        );
    }

    const configList = Array.isArray(configurations) ? configurations : [];
    const editable = true; // mutation buttons are gated by PermissionGate

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <div className="p-4 sm:p-8 w-full max-w-4xl mx-auto flex-1 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                        href={`/dashboard/inventory/projects/${unit.projectId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900"
                    >
                        <ArrowLeft size={14} /> Back to project
                    </Link>
                    <span className={`text-[11px] font-black px-3 py-1 rounded-full ${UNIT_BADGES[unit.status] || "bg-gray-100 text-gray-600"}`}>
                        {unit.status}
                    </span>
                </div>

                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-11 h-11 rounded-2xl bg-gray-900 text-purple-300 flex items-center justify-center shrink-0">
                            <Home size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{unit.unitNumber || unit.title}</h1>
                            <p className="text-xs text-gray-500">
                                {unit.project?.name}
                                {unit.tower ? ` · Tower ${unit.tower}` : ""}
                                {unit.floor != null ? ` · Floor ${unit.floor}` : ""}
                                {" · "}{formatCurrency(unit.price)}
                            </p>
                        </div>
                    </div>

                    <PermissionGate permission="inventory:update">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const fd = new FormData(e.currentTarget);
                                const configId = fd.get("configurationId");
                                const selectedConfig = configList.find((c) => c.id === configId);
                                saveUnit.mutate({
                                    title: fd.get("title"),
                                    unitNumber: fd.get("unitNumber") || null,
                                    configurationId: configId || null,
                                    configuration: selectedConfig ? selectedConfig.name : (fd.get("configurationText") || null),
                                    tower: fd.get("tower") || null,
                                    floor: fd.get("floor") !== "" ? Number(fd.get("floor")) : null,
                                    bhk: fd.get("bhk") !== "" ? Number(fd.get("bhk")) : null,
                                    area: fd.get("area") !== "" ? Number(fd.get("area")) : null,
                                    areaCarpet: fd.get("areaCarpet") !== "" ? Number(fd.get("areaCarpet")) : null,
                                    areaSaleable: fd.get("areaSaleable") !== "" ? Number(fd.get("areaSaleable")) : null,
                                    facing: fd.get("facing") || null,
                                    purpose: fd.get("purpose") || null,
                                    price: Number(fd.get("price")),
                                });
                            }}
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                        >
                            <div>
                                <label className={labelClass}>Title *</label>
                                <input name="title" defaultValue={unit.title} required disabled={!editable} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Unit Number</label>
                                <input name="unitNumber" defaultValue={unit.unitNumber || ""} disabled={!editable} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Project</label>
                                <input value={unit.project?.name || ""} disabled className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Configuration</label>
                                <select name="configurationId" defaultValue={unit.configurationId || ""} disabled={!editable} className={inputClass}>
                                    <option value="">— Free text —</option>
                                    {configList.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}{c.bhk ? ` (${c.bhk} BHK)` : ""}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Configuration Label</label>
                                <input name="configurationText" defaultValue={unit.configuration || ""} disabled={!editable} className={inputClass} placeholder="e.g. 3 BHK" />
                            </div>
                            <div>
                                <label className={labelClass}>Tower / Block</label>
                                <input name="tower" defaultValue={unit.tower || ""} disabled={!editable} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Floor</label>
                                <input name="floor" type="number" defaultValue={unit.floor ?? ""} disabled={!editable} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>BHK</label>
                                <input name="bhk" type="number" min="0" max="20" defaultValue={unit.bhk ?? ""} disabled={!editable} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Price (₹) *</label>
                                <input name="price" type="number" min="0" step="1" defaultValue={unit.price ?? ""} required disabled={!editable} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Area (sq.ft)</label>
                                <input name="area" type="number" min="0" defaultValue={unit.area ?? ""} disabled={!editable} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Carpet Area</label>
                                <input name="areaCarpet" type="number" min="0" defaultValue={unit.areaCarpet ?? ""} disabled={!editable} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Saleable Area</label>
                                <input name="areaSaleable" type="number" min="0" defaultValue={unit.areaSaleable ?? ""} disabled={!editable} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Facing</label>
                                <input name="facing" defaultValue={unit.facing || ""} disabled={!editable} className={inputClass} placeholder="e.g. East" />
                            </div>
                            <div>
                                <label className={labelClass}>Purpose</label>
                                <select name="purpose" defaultValue={unit.purpose || ""} disabled={!editable} className={inputClass}>
                                    <option value="">—</option>
                                    <option>Sale</option>
                                    <option>Resale</option>
                                    <option>Rent</option>
                                </select>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3 pt-1">
                                <button
                                    type="submit"
                                    disabled={saveUnit.isPending}
                                    className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {saveUnit.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Unit
                                </button>
                                <span className="text-[11px] text-gray-400">Version {unit.version} · Updated {new Date(unit.updatedAt).toLocaleString()}</span>
                            </div>
                        </form>
                    </PermissionGate>

                    <div className="mt-8 border-t border-gray-100 pt-5">
                        <h2 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <KeyRound size={13} /> Status
                        </h2>
                        {statusError && (
                            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
                                {statusError}
                            </p>
                        )}
                        <PermissionGate permission="inventory:update">
                            <div className="flex flex-wrap gap-2">
                                {(TRANSITIONS[unit.status] || []).map((t) => (
                                    <button
                                        key={t.to}
                                        onClick={() => changeStatus.mutate(t.to)}
                                        disabled={changeStatus.isPending}
                                        className={`px-4 py-2 rounded-xl text-xs font-black disabled:opacity-50 ${
                                            t.to === "AVAILABLE"
                                                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                                : t.to === "RESERVED"
                                                    ? "bg-purple-600 hover:bg-purple-700 text-white"
                                                    : "bg-gray-900 hover:bg-black text-white"
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                                {(TRANSITIONS[unit.status] || []).length === 0 && (
                                    <p className="text-xs font-semibold text-gray-400">Sold is terminal — no further transitions.</p>
                                )}
                            </div>
                        </PermissionGate>
                        <PermissionGate permission="inventory:update" fallback={
                            <p className="text-xs text-gray-400 mt-2">You do not have permission to change unit status.</p>
                        }>
                            <div />
                        </PermissionGate>
                    </div>

                    {/* Public website publication + sharing */}
                    <div className="mt-8 border-t border-gray-100 pt-5">
                        <h2 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Globe size={13} /> Public Website
                        </h2>
                        <div className="flex flex-wrap items-center gap-3">
                            <PermissionGate permission="inventory:update">
                                <button
                                    onClick={() => togglePublish.mutate(!unit.isPublic)}
                                    disabled={togglePublish.isPending}
                                    className={`px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 disabled:opacity-50 ${
                                        unit.isPublic
                                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                            : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
                                    }`}
                                >
                                    {unit.isPublic ? <Globe size={13} /> : <GlobeLock size={13} />}
                                    {unit.isPublic ? "Published" : "Draft"}
                                </button>
                            </PermissionGate>
                            <span className="text-xs text-gray-400">
                                {unit.isPublic
                                    ? "Anyone with the public link can view this unit."
                                    : "Hidden from the public website — only your team can see it."}
                            </span>
                            {unit.isPublic && unit.publicToken && (
                                <a
                                    href={`/properties/${unit.publicToken}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-bold text-purple-600 hover:underline inline-flex items-center gap-1"
                                >
                                    <ExternalLink size={12} /> View public page
                                </a>
                            )}
                        </div>
                        <div className="mt-4">
                            <PermissionGate permission="whatsapp:create">
                                <button
                                    onClick={() => setShareOpen(true)}
                                    className="px-4 py-2 rounded-xl text-xs font-black bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 inline-flex items-center gap-1.5"
                                >
                                    <Share2 size={13} /> Share on WhatsApp
                                </button>
                            </PermissionGate>
                        </div>
                    </div>
                </div>
            </div>

            <SharePropertyModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                propertyId={unitId}
            />
        </div>
    );
}
