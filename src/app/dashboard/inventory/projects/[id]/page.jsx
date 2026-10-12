"use client";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
    Loader2, AlertCircle, Building2, Layers, Plus, Trash2, Pencil, Save,
    Search, ArrowLeft, Archive, CheckCircle2, Home, Globe, GlobeLock, ExternalLink
} from "lucide-react";
import { fetchProjectById, updateProject, deleteProject } from "../../../../../lib/api/projects";
import {
    fetchConfigurations, createConfiguration, deleteConfiguration,
    updateConfigurationInventory
} from "../../../../../lib/api/configurations";
import { updateProperty } from "../../../../../lib/api/properties";
import { createBooking } from "../../../../../lib/api/bookings";
import { PermissionGate } from "../../../../../features/auth/components/PermissionGate";
import { showToast } from "../../../../../lib/toast";
import { formatCurrency } from "../../../../../features/pipeline/helpers";
import LocationSelector from "../../../../../components/shared/LocationSelector";
import ImageUploader from "../../../../../components/shared/ImageUploader";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";
const labelClass = "block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1";

const STATUS_BADGES = {
    UPCOMING: "bg-blue-50 text-blue-700",
    PRE_LAUNCH: "bg-indigo-50 text-indigo-700",
    UNDER_CONSTRUCTION: "bg-amber-50 text-amber-700",
    READY_TO_MOVE: "bg-emerald-50 text-emerald-700",
    AVAILABLE: "bg-emerald-50 text-emerald-700",
    COMPLETED: "bg-gray-100 text-gray-700",
    FULLY_OCCUPIED: "bg-purple-50 text-purple-700",
    RENOVATING: "bg-orange-50 text-orange-700",
    ON_HOLD: "bg-yellow-50 text-yellow-700",
    SOLD_OUT: "bg-gray-800 text-white",
    INACTIVE: "bg-gray-100 text-gray-500",
};

const UNIT_BADGES = {
    AVAILABLE: "bg-emerald-50 text-emerald-700",
    RESERVED: "bg-purple-50 text-purple-700",
    SOLD: "bg-gray-800 text-white",
};

// Backend-authoritative transition whitelist with UI labels
const TRANSITIONS = {
    AVAILABLE: [
        { to: "RESERVED", label: "Reserve", cls: "bg-purple-600 hover:bg-purple-700 text-white" },
        { to: "SOLD", label: "Mark Sold", cls: "bg-gray-900 hover:bg-black text-white" },
    ],
    RESERVED: [
        { to: "AVAILABLE", label: "Release", cls: "bg-emerald-600 hover:bg-emerald-700 text-white" },
        { to: "SOLD", label: "Close Sale", cls: "bg-gray-900 hover:bg-black text-white" },
    ],
    SOLD: [],
};

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const projectId = params?.id;

    const [editing, setEditing] = useState(false);
    const [unitSearch, setUnitSearch] = useState("");
    const [unitStatus, setUnitStatus] = useState("");
    // Multi-row bulk configuration draft. totalUnits set = bulk inventory
    // mode (available defaults to total server-side); empty = classic
    // unit-tracked mode.
    const emptyConfigRow = () => ({ name: "", bhk: "", areaSaleable: "", basePrice: "", totalUnits: "", availableUnits: "" });
    const [configRows, setConfigRows] = useState([emptyConfigRow()]);
    const [bulkAdding, setBulkAdding] = useState(false);
    // Inline bulk-inventory adjust state (config id + draft counters).
    const [adjustingId, setAdjustingId] = useState(null);
    const [adjustForm, setAdjustForm] = useState({ totalUnits: "", availableUnits: "" });
    // Inline bulk booking state (config + customer/amount draft).
    const [bookingFor, setBookingFor] = useState(null);
    const [bookForm, setBookForm] = useState({ name: "", phone: "", amount: "" });
    const [locationSel, setLocationSel] = useState({ stateId: "", districtId: "", regionId: "" });
    const [editImages, setEditImages] = useState([]);

    const {
        data: project,
        isPending,
        isError,
        error,
        refetch
    } = useQuery({
        queryKey: ["project", projectId],
        queryFn: () => fetchProjectById(projectId),
        enabled: !!projectId,
        retry: 1
    });

    const { data: configurations } = useQuery({
        queryKey: ["configurations", projectId],
        queryFn: () => fetchConfigurations(projectId),
        enabled: !!projectId,
        retry: 1
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        queryClient.invalidateQueries({ queryKey: ["configurations", projectId] });
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
    };

    const saveProject = useMutation({
        mutationFn: (data) => updateProject({ id: projectId, ...data }),
        onSuccess: () => {
            showToast("Project updated");
            setEditing(false);
            invalidate();
        },
        onError: (err) => showToast(err?.message || "Failed to update project", "error")
    });

    const archiveProject = useMutation({
        mutationFn: () => deleteProject(projectId),
        onSuccess: () => {
            showToast("Project archived");
            queryClient.invalidateQueries({ queryKey: ["projects"] });
            router.push("/dashboard/inventory");
        },
        onError: (err) => showToast(err?.message || "Failed to archive project", "error")
    });

    // Publish/unpublish the project on the public website (default: draft).
    const togglePublish = useMutation({
        mutationFn: (isPublic) => updateProject({ id: projectId, isPublic }),
        onSuccess: (data) => {
            showToast(
                data?.isPublic
                    ? "Project published to the public website"
                    : "Project set back to draft — its public page now returns 404"
            );
            invalidate();
        },
        onError: (err) => showToast(err?.message || "Could not change publication", "error")
    });

    const removeConfig = useMutation({
        mutationFn: (configId) => deleteConfiguration(projectId, configId),
        onSuccess: () => {
            showToast("Configuration removed");
            invalidate();
        },
        onError: (err) => showToast(err?.message || "Failed to delete configuration", "error")
    });

    // Explicit bulk-inventory adjustment with optimistic concurrency. On a
    // 409 conflict the data is refreshed and the user retries against the
    // latest version — never silent last-write-wins.
    const adjustInventory = useMutation({
        mutationFn: ({ configId, data }) => updateConfigurationInventory(projectId, configId, data),
        onSuccess: () => {
            showToast("Inventory updated");
            setAdjustingId(null);
            invalidate();
        },
        onError: (err) => {
            if (err?.code === "INVENTORY_CONFLICT" || err?.status === 409) {
                showToast("Inventory was changed by someone else — refreshed to the latest. Review and retry.", "error");
            } else {
                showToast(err?.message || "Failed to update inventory", "error");
            }
            invalidate();
        }
    });

    // Direct bulk booking: reserves one unit out of a bulk configuration's
    // available inventory (atomic server-side; 409 when just sold out).
    const bookBulk = useMutation({
        mutationFn: ({ configId, data }) => createBooking({ configurationId: configId, ...data }),
        onSuccess: () => {
            showToast("Unit booked from bulk inventory");
            setBookingFor(null);
            invalidate();
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
        },
        onError: (err) => {
            showToast(err?.message || "Failed to create booking", "error");
            invalidate();
        }
    });

    const changeUnitStatus = useMutation({
        mutationFn: ({ id, status }) => updateProperty({ id, status }),
        onSuccess: (_data, vars) => {
            showToast(`Unit marked ${vars.status.toLowerCase()}`);
            invalidate();
        },
        onError: (err) => showToast(err?.message || "Status change failed", "error")
    });

    const units = useMemo(() => {
        const list = project?.properties || [];
        const q = unitSearch.trim().toLowerCase();
        return list.filter((u) => {
            if (unitStatus && u.status !== unitStatus) return false;
            if (!q) return true;
            return [u.unitNumber, u.title, u.configuration, u.tower]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));
        });
    }, [project, unitSearch, unitStatus]);

    const configList = Array.isArray(configurations) ? configurations : [];

    // Available units per configuration for unit-tracked configs, derived
    // from the loaded unit rows (bulk configs carry stored counters instead).
    const unitAvailByConfigId = useMemo(() => {
        const map = new Map();
        for (const u of project?.properties || []) {
            if (u.status !== "AVAILABLE" || !u.configurationId) continue;
            map.set(u.configurationId, (map.get(u.configurationId) || 0) + 1);
        }
        return map;
    }, [project]);

    // Booking-derived reserved/sold per configuration (both modes), from the
    // detail summary. Keyed by lowercased name (unique per project).
    const summaryByName = useMemo(() => {
        const map = new Map();
        for (const s of project?.configurationSummary || []) {
            if (s?.configuration) map.set(String(s.configuration).toLowerCase(), s);
        }
        return map;
    }, [project]);

    if (isPending) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400">
                <Loader2 size={28} className="animate-spin mr-3" /> Loading project…
            </div>
        );
    }

    if (isError || !project) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <AlertCircle size={32} className="text-red-400 mb-3" />
                <p className="text-sm font-semibold text-gray-600 mb-3">
                    {error?.message || "Project not found"}
                </p>
                <div className="flex gap-2">
                    <button onClick={() => refetch()} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold">Retry</button>
                    <Link href="/dashboard/inventory" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold">Back to inventory</Link>
                </div>
            </div>
        );
    }

    const inv = project.inventory || {};
    const updateConfigRow = (idx, patch) =>
        setConfigRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    const addConfigRow = () =>
        setConfigRows((rows) => [...rows, emptyConfigRow()]);
    const removeConfigRow = (idx) =>
        setConfigRows((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));

    const buildConfigPayload = (row) => ({
        name: row.name.trim(),
        ...(row.bhk !== "" ? { bhk: Number(row.bhk) } : {}),
        ...(row.areaSaleable !== "" ? { areaSaleable: Number(row.areaSaleable) } : {}),
        ...(row.basePrice !== "" ? { basePrice: Number(row.basePrice) } : {}),
        ...(row.totalUnits !== "" ? { totalUnits: Number(row.totalUnits) } : {}),
        ...(row.availableUnits !== "" ? { availableUnits: Number(row.availableUnits) } : {}),
    });

    // Save all filled rows in one workflow. Rows are created sequentially so
    // per-row server errors (duplicates, available > total, mixed mode) can
    // be attributed; one refresh happens at the end.
    const handleConfigSubmit = async (e) => {
        e.preventDefault();
        const rows = configRows.map(buildConfigPayload).filter((r) => r.name);
        if (!rows.length || bulkAdding) return;
        setBulkAdding(true);
        let ok = 0;
        const failures = [];
        for (let i = 0; i < rows.length; i++) {
            try {
                await createConfiguration(projectId, rows[i]);
                ok += 1;
            } catch (err) {
                failures.push(`${rows[i].name}: ${err?.message || "failed"}`);
            }
        }
        setBulkAdding(false);
        setConfigRows([emptyConfigRow()]);
        invalidate();
        if (failures.length === 0) {
            showToast(`Added ${ok} configuration${ok === 1 ? "" : "s"}`);
        } else {
            showToast(
                `Added ${ok} of ${rows.length} configuration${rows.length === 1 ? "" : "s"}. Failed: ${failures.join("; ")}`,
                "error"
            );
        }
    };

    const openAdjust = (config) => {
        setBookingFor(null);
        setAdjustingId(config.id);
        setAdjustForm({
            totalUnits: config.totalUnits ?? "",
            availableUnits: config.availableUnits ?? "",
        });
    };

    const adjustingConfig = adjustingId ? configList.find((c) => c.id === adjustingId) || null : null;

    const submitAdjust = (e, config) => {
        e.preventDefault();
        if (adjustForm.totalUnits === "" && adjustForm.availableUnits === "") {
            showToast("Enter both totals to save, or use Unit mode to clear back to individual-unit tracking", "error");
            return;
        }
        adjustInventory.mutate({
            configId: config.id,
            data: {
                totalUnits: adjustForm.totalUnits === "" ? null : Number(adjustForm.totalUnits),
                availableUnits: adjustForm.availableUnits === "" ? null : Number(adjustForm.availableUnits),
                expectedInventoryVersion: config.inventoryVersion ?? 0,
            },
        });
    };

    const clearToUnitMode = (config) => {
        if (!window.confirm(`Switch "${config.name}" back to individual-unit tracking? Stored totals will be cleared.`)) return;
        adjustInventory.mutate({
            configId: config.id,
            data: { totalUnits: null, availableUnits: null, expectedInventoryVersion: config.inventoryVersion ?? 0 },
        });
    };

    const openBook = (config) => {
        setAdjustingId(null);
        setBookingFor(config);
        setBookForm({ name: "", phone: "", amount: config.basePrice != null ? String(config.basePrice) : "" });
    };

    const submitBook = (e, config) => {
        e.preventDefault();
        if (!bookForm.name.trim() || !bookForm.phone.trim() || bookForm.amount === "") {
            showToast("Customer name, phone and amount are required", "error");
            return;
        }
        bookBulk.mutate({
            configId: config.id,
            data: {
                amount: Number(bookForm.amount),
                customer: { name: bookForm.name.trim(), phone: bookForm.phone.trim() },
            },
        });
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <div className="p-4 sm:p-8 w-full max-w-7xl mx-auto flex-1 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                        href="/dashboard/inventory"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900"
                    >
                        <ArrowLeft size={14} /> All projects
                    </Link>
                    <div className="flex flex-wrap gap-2">
                        <PermissionGate permission="inventory:create">
                            <Link
                                href={`/dashboard/inventory/units/quick-add?projectId=${projectId}`}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold inline-flex items-center gap-1.5"
                            >
                                <Plus size={15} /> Add Unit
                            </Link>
                        </PermissionGate>
                        <PermissionGate permission="project:update">
                            <button
                                onClick={() => {
                                    setLocationSel({
                                        stateId: project?.stateId || "",
                                        districtId: project?.districtId || "",
                                        regionId: project?.regionId || "",
                                    });
                                    setEditImages(project?.images || []);
                                    setEditing((v) => !v);
                                }}
                                className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-bold inline-flex items-center gap-1.5"
                            >
                                <Pencil size={14} /> {editing ? "Close Editor" : "Edit Project"}
                            </button>
                        </PermissionGate>
                        <PermissionGate permission="project:delete">
                            <button
                                onClick={() => {
                                    if (window.confirm(`Archive "${project.name}"? It will be hidden from active projects.`)) {
                                        archiveProject.mutate();
                                    }
                                }}
                                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold inline-flex items-center gap-1.5"
                            >
                                <Archive size={14} /> Archive
                            </button>
                        </PermissionGate>
                    </div>
                </div>

                {/* Overview */}
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div className="flex items-start gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-gray-900 text-purple-300 flex items-center justify-center shrink-0">
                                <Building2 size={20} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {[project.locality, project.city, project.state].filter(Boolean).join(", ") || project.address}
                                    {project.developer ? ` · ${project.developer}` : ""}
                                </p>
                                {project.isPublic && project.publicSlug && (
                                    <a
                                        href={`/projects/${project.publicSlug}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-bold text-purple-600 hover:underline inline-flex items-center gap-1 mt-1"
                                    >
                                        <ExternalLink size={12} /> View public page
                                    </a>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <PermissionGate permission="project:update">
                                <button
                                    onClick={() => togglePublish.mutate(!project.isPublic)}
                                    disabled={togglePublish.isPending}
                                    className={`text-[11px] font-black px-3 py-1 rounded-full inline-flex items-center gap-1.5 disabled:opacity-50 ${
                                        project.isPublic
                                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                                    }`}
                                >
                                    {project.isPublic ? <Globe size={12} /> : <GlobeLock size={12} />}
                                    {project.isPublic ? "Published" : "Draft"}
                                </button>
                            </PermissionGate>
                            <span className={`text-[11px] font-black px-3 py-1 rounded-full ${STATUS_BADGES[project.status] || "bg-gray-100 text-gray-700"}`}>
                                {String(project.status || "").replace(/_/g, " ")}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-4">
                        {[
                            { label: "Total Units", value: inv.total ?? 0, cls: "text-gray-900" },
                            { label: "Available", value: inv.available ?? 0, cls: "text-emerald-600" },
                            { label: "Reserved", value: inv.reserved ?? 0, cls: "text-purple-600" },
                            { label: "Sold", value: inv.sold ?? 0, cls: "text-gray-500" },
                        ].map((s) => (
                            <div key={s.label} className="bg-gray-50 rounded-2xl py-3">
                                <p className={`text-2xl font-black leading-none ${s.cls}`}>{s.value}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mt-1.5">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {editing && (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if ((locationSel.districtId || locationSel.regionId) && !locationSel.stateId) {
                                    showToast("Select a state before choosing a district or area", "error");
                                    return;
                                }
                                const fd = new FormData(e.currentTarget);
                                saveProject.mutate({
                                    name: fd.get("name"),
                                    status: fd.get("status"),
                                    projectType: fd.get("projectType"),
                                    developer: fd.get("developer") || undefined,
                                    stateId: locationSel.stateId || undefined,
                                    districtId: locationSel.districtId || undefined,
                                    regionId: locationSel.regionId || undefined,
                                    startingPrice: fd.get("startingPrice") ? Number(fd.get("startingPrice")) : undefined,
                                    totalUnits: fd.get("totalUnits") ? Number(fd.get("totalUnits")) : undefined,
                                    description: fd.get("description") || undefined,
                                    images: editImages,
                                });
                            }}
                            className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                        >
                            <div><label className={labelClass}>Project Name</label><input name="name" defaultValue={project.name} required className={inputClass} /></div>
                            <div>
                                <label className={labelClass}>Status</label>
                                <select name="status" defaultValue={project.status} className={inputClass}>
                                    {["UPCOMING", "PRE_LAUNCH", "UNDER_CONSTRUCTION", "READY_TO_MOVE", "AVAILABLE", "COMPLETED", "FULLY_OCCUPIED", "RENOVATING", "ON_HOLD", "SOLD_OUT", "INACTIVE"].map((s) => (
                                        <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Type</label>
                                <select name="projectType" defaultValue={project.projectType} className={inputClass}>
                                    {["Residential", "Commercial", "Mixed_Use"].map((t) => <option key={t}>{t}</option>)}
                                </select>
                            </div>
                            <div><label className={labelClass}>Developer</label><input name="developer" defaultValue={project.developer || ""} className={inputClass} /></div>
                            <div className="sm:col-span-2">
                                <label className={labelClass}>Location (State / District / Area)</label>
                                <LocationSelector
                                    value={locationSel}
                                    onChange={setLocationSel}
                                    disabled={saveProject.isPending}
                                />
                            </div>
                            <div><label className={labelClass}>Starting Price (₹)</label><input name="startingPrice" type="number" min="0" defaultValue={project.startingPrice ?? ""} className={inputClass} /></div>
                            <div><label className={labelClass}>Total Units</label><input name="totalUnits" type="number" min="0" defaultValue={project.totalUnits ?? ""} className={inputClass} /></div>
                            <div className="sm:col-span-2 lg:col-span-3">
                                <label className={labelClass}>Description</label>
                                <textarea name="description" rows={2} defaultValue={project.description || ""} className={inputClass} />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                                <label className={labelClass}>Gallery Images</label>
                                <ImageUploader
                                    images={editImages}
                                    onChange={setEditImages}
                                    disabled={saveProject.isPending}
                                    altPrefix="Project"
                                />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
                                <button
                                    type="submit"
                                    disabled={saveProject.isPending}
                                    className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {saveProject.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* Configurations */}
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Layers size={18} className="text-purple-600" />
                            <h2 className="font-bold text-gray-900">Configurations</h2>
                            <span className="text-xs font-bold text-gray-400">{configList.length}</span>
                        </div>
                    </div>

                    {configList.length === 0 ? (
                        <p className="text-xs text-gray-400 mb-4">No configurations yet. Units can still be created manually.</p>
                    ) : (
                        <div className="overflow-x-auto mb-4">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 font-black text-gray-500 uppercase text-[10px]">
                                        <th className="p-3">Name</th>
                                        <th className="p-3">BHK</th>
                                        <th className="p-3">Area (sq.ft)</th>
                                        <th className="p-3">Base Price</th>
                                        <th className="p-3">Total</th>
                                        <th className="p-3">Available</th>
                                        <th className="p-3">Reserved</th>
                                        <th className="p-3">Sold</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {configList.map((c) => {
                                        const isBulk = c.totalUnits !== null && c.totalUnits !== undefined;
                                        const summary = summaryByName.get(String(c.name).toLowerCase());
                                        return (
                                            <tr key={c.id} className="hover:bg-gray-50">
                                                <td className="p-3 font-bold text-gray-900">
                                                    {c.name}
                                                    {isBulk && (
                                                        <span className="ml-2 px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-black uppercase">Bulk</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-gray-600">{c.bhk ?? "—"}</td>
                                                <td className="p-3 text-gray-600">{c.areaSaleable ?? "—"}</td>
                                                <td className="p-3 font-black text-purple-700">{c.basePrice != null ? formatCurrency(c.basePrice) : "—"}</td>
                                                <td className="p-3 text-gray-600">{isBulk ? c.totalUnits : (c._count?.properties ?? 0)}</td>
                                                <td className="p-3 text-gray-600">{isBulk ? c.availableUnits : (unitAvailByConfigId.get(c.id) ?? 0)}</td>
                                                <td className="p-3 text-gray-600">{summary?.reservedUnits ?? 0}</td>
                                                <td className="p-3 text-gray-600">{summary?.soldUnits ?? 0}</td>
                                                <td className="p-3 text-right whitespace-nowrap">
                                                    {isBulk && (c.availableUnits ?? 0) > 0 && (
                                                        <PermissionGate permission="booking:create">
                                                            <button
                                                                onClick={() => openBook(c)}
                                                                className="mr-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-black"
                                                                title="Book one unit from bulk inventory"
                                                            >
                                                                Book
                                                            </button>
                                                        </PermissionGate>
                                                    )}
                                                    {isBulk && (
                                                        <PermissionGate permission="project:update">
                                                            <button
                                                                onClick={() => openAdjust(c)}
                                                                className="text-purple-600 hover:text-purple-800 p-1"
                                                                title="Adjust bulk inventory"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                        </PermissionGate>
                                                    )}
                                                    <PermissionGate permission="project:update">
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm(`Delete configuration "${c.name}"?`)) removeConfig.mutate(c.id);
                                                            }}
                                                            className="text-red-500 hover:text-red-700 p-1"
                                                            title="Delete configuration"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </PermissionGate>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {adjustingConfig && (
                        <PermissionGate permission="project:update">
                            <form onSubmit={(e) => submitAdjust(e, adjustingConfig)} className="mb-4 rounded-2xl border border-purple-200 bg-[#faf7ff] p-4">
                                <div className="text-xs font-black text-gray-700 mb-3">
                                    Adjust bulk inventory — {adjustingConfig.name}
                                    <span className="ml-2 font-semibold text-gray-400">version {adjustingConfig.inventoryVersion ?? 0}</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                                    <div>
                                        <label className={labelClass}>Total units</label>
                                        <input
                                            type="number" min="0"
                                            value={adjustForm.totalUnits}
                                            onChange={(e) => setAdjustForm((f) => ({ ...f, totalUnits: e.target.value }))}
                                            className={inputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Available units</label>
                                        <input
                                            type="number" min="0"
                                            value={adjustForm.availableUnits}
                                            onChange={(e) => setAdjustForm((f) => ({ ...f, availableUnits: e.target.value }))}
                                            className={inputClass}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={adjustInventory.isPending}
                                        className="h-[38px] px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        {adjustInventory.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => clearToUnitMode(adjustingConfig)}
                                            disabled={adjustInventory.isPending}
                                            className="h-[38px] px-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-xs font-bold disabled:opacity-50"
                                            title="Clear stored totals and return to individual-unit tracking"
                                        >
                                            Unit mode
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAdjustingId(null)}
                                            className="h-[38px] px-3 text-gray-400 hover:text-gray-700 text-xs font-bold"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                                <p className="mt-2 text-[11px] text-gray-400">
                                    Only aggregate availability changes — no unit records are created or modified. If someone else saves first, you will be asked to refresh and retry.
                                </p>
                            </form>
                        </PermissionGate>
                    )}

                    {bookingFor && (
                        <PermissionGate permission="booking:create">
                            <form onSubmit={(e) => submitBook(e, bookingFor)} className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                                <div className="text-xs font-black text-gray-700 mb-3">
                                    Book one unit — {bookingFor.name}
                                    <span className="ml-2 font-semibold text-gray-400">{bookingFor.availableUnits ?? 0} available</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                                    <div>
                                        <label className={labelClass}>Customer name *</label>
                                        <input
                                            value={bookForm.name}
                                            onChange={(e) => setBookForm((f) => ({ ...f, name: e.target.value }))}
                                            className={inputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Customer phone *</label>
                                        <input
                                            value={bookForm.phone}
                                            onChange={(e) => setBookForm((f) => ({ ...f, phone: e.target.value }))}
                                            className={inputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Amount (₹) *</label>
                                        <input
                                            type="number" min="0"
                                            value={bookForm.amount}
                                            onChange={(e) => setBookForm((f) => ({ ...f, amount: e.target.value }))}
                                            className={inputClass}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="submit"
                                            disabled={bookBulk.isPending}
                                            className="h-[38px] px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                                        >
                                            {bookBulk.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Book
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBookingFor(null)}
                                            className="h-[38px] px-3 text-gray-400 hover:text-gray-700 text-xs font-bold"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                                <p className="mt-2 text-[11px] text-gray-400">
                                    Reserves one unit immediately from bulk availability. Fails safely if the last unit was just taken.
                                </p>
                            </form>
                        </PermissionGate>
                    )}

                    <PermissionGate permission="project:create">
                        <form onSubmit={handleConfigSubmit} className="border-t border-gray-100 pt-4 space-y-3">
                            {configRows.map((row, idx) => (
                                <div key={idx} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
                                    <div><label className={labelClass}>Name *</label><input value={row.name} onChange={(e) => updateConfigRow(idx, { name: e.target.value })} placeholder="e.g. 2 BHK" className={inputClass} /></div>
                                    <div><label className={labelClass}>BHK</label><input type="number" min="0" max="20" value={row.bhk} onChange={(e) => updateConfigRow(idx, { bhk: e.target.value })} className={inputClass} /></div>
                                    <div><label className={labelClass}>Saleable Area</label><input type="number" min="0" value={row.areaSaleable} onChange={(e) => updateConfigRow(idx, { areaSaleable: e.target.value })} className={inputClass} /></div>
                                    <div><label className={labelClass}>Base Price (₹)</label><input type="number" min="0" value={row.basePrice} onChange={(e) => updateConfigRow(idx, { basePrice: e.target.value })} className={inputClass} /></div>
                                    <div><label className={labelClass}>Total Units</label><input type="number" min="0" value={row.totalUnits} onChange={(e) => updateConfigRow(idx, { totalUnits: e.target.value })} placeholder="Bulk mode" className={inputClass} /></div>
                                    <div><label className={labelClass}>Available</label><input type="number" min="0" value={row.availableUnits} onChange={(e) => updateConfigRow(idx, { availableUnits: e.target.value })} placeholder="= Total" className={inputClass} /></div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => removeConfigRow(idx)}
                                            disabled={configRows.length <= 1}
                                            className="h-[38px] px-3 text-gray-300 hover:text-red-500 disabled:opacity-30"
                                            title="Remove row"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={addConfigRow}
                                    className="h-[38px] px-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-bold inline-flex items-center gap-1.5"
                                >
                                    <Plus size={14} /> Add row
                                </button>
                                <button
                                    type="submit"
                                    disabled={bulkAdding || !configRows.some((r) => r.name.trim())}
                                    className="h-[38px] px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                    {bulkAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                    Add {configRows.filter((r) => r.name.trim()).length || ""} configuration{configRows.filter((r) => r.name.trim()).length === 1 ? "" : "s"}
                                </button>
                            </div>
                            <p className="text-[11px] text-gray-400">
                                Leave Total Units empty for individual-unit tracking. Setting it creates a bulk configuration (Available defaults to Total) — no flat numbers or unit records needed.
                            </p>
                        </form>
                    </PermissionGate>
                </div>

                {/* Units */}
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-2">
                            <Home size={18} className="text-purple-600" />
                            <h2 className="font-bold text-gray-900">Units</h2>
                            <span className="text-xs font-bold text-gray-400">{units.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={unitSearch}
                                    onChange={(e) => setUnitSearch(e.target.value)}
                                    placeholder="Search units…"
                                    className="bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold w-44"
                                />
                            </div>
                            <select value={unitStatus} onChange={(e) => setUnitStatus(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl px-2 py-1.5 text-xs font-semibold">
                                <option value="">All Statuses</option>
                                <option value="AVAILABLE">Available</option>
                                <option value="RESERVED">Reserved</option>
                                <option value="SOLD">Sold</option>
                            </select>
                        </div>
                    </div>

                    {units.length === 0 ? (
                        <div className="py-10 text-center text-gray-400 text-sm">
                            No units match.{" "}
                            <PermissionGate permission="inventory:create">
                                <Link href={`/dashboard/inventory/units/quick-add?projectId=${projectId}`} className="text-purple-600 font-bold hover:underline">Add the first unit</Link>
                            </PermissionGate>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 font-black text-gray-500 uppercase text-[10px]">
                                        <th className="p-3">Unit</th>
                                        <th className="p-3">Tower</th>
                                        <th className="p-3">Floor</th>
                                        <th className="p-3">Configuration</th>
                                        <th className="p-3">Price</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {units.map((u) => (
                                        <tr key={u.id} className="hover:bg-gray-50">
                                            <td className="p-3 font-black text-gray-900">{u.unitNumber || u.title}</td>
                                            <td className="p-3 text-gray-600">{u.tower || "—"}</td>
                                            <td className="p-3 text-gray-600">{u.floor ?? "—"}</td>
                                            <td className="p-3 text-gray-600">{u.configuration || "—"}</td>
                                            <td className="p-3 font-bold text-purple-700">{formatCurrency(u.price)}</td>
                                            <td className="p-3">
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${UNIT_BADGES[u.status] || "bg-gray-100 text-gray-600"}`}>
                                                    {u.status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <PermissionGate permission="inventory:update">
                                                        {(TRANSITIONS[u.status] || []).map((t) => (
                                                            <button
                                                                key={t.to}
                                                                onClick={() => changeUnitStatus.mutate({ id: u.id, status: t.to })}
                                                                disabled={changeUnitStatus.isPending}
                                                                className={`text-[10px] font-black px-2 py-1 rounded-lg disabled:opacity-50 ${t.cls}`}
                                                            >
                                                                {t.label}
                                                            </button>
                                                        ))}
                                                    </PermissionGate>
                                                    <PermissionGate permission="inventory:view">
                                                        <Link
                                                            href={`/dashboard/inventory/units/${u.id}`}
                                                            className="text-[10px] font-black px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 inline-flex items-center gap-1"
                                                        >
                                                            <Pencil size={11} /> Edit
                                                        </Link>
                                                    </PermissionGate>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {project.configurationSummary?.length > 0 && (
                    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                        <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> Price ranges by configuration</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {project.configurationSummary.map((c) => (
                                <div key={c.configuration} className="bg-gray-50 rounded-2xl p-3">
                                    <p className="text-xs font-black text-gray-900">{c.configuration}</p>
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        {c.mode === "bulk"
                                            ? `${c.availableUnits ?? 0} of ${c.count} available`
                                            : `${c.count} units`}
                                        {((c.reservedUnits ?? 0) > 0 || (c.soldUnits ?? 0) > 0)
                                            ? ` · ${c.reservedUnits ?? 0} reserved · ${c.soldUnits ?? 0} sold`
                                            : ""}
                                    </p>
                                    <p className="text-sm font-black text-purple-700 mt-1">{formatCurrency(c.minPrice)} – {formatCurrency(c.maxPrice)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
