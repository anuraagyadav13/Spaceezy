"use client";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
    Building2, Layers, Search, Loader2, AlertCircle, Plus, LayoutGrid
} from "lucide-react";
import { fetchProjects } from "../../../../lib/api/projects";
import { fetchProperties, updateProperty } from "../../../../lib/api/properties";
import { PermissionGate } from "../../../../features/auth/components/PermissionGate";
import { showToast } from "../../../../lib/toast";
import { formatCurrency } from "../../../../features/pipeline/helpers";

const STATUS_META = {
    AVAILABLE: { label: "Available", badge: "bg-emerald-500 text-white", dot: "bg-emerald-500" },
    RESERVED: { label: "Reserved", badge: "bg-purple-600 text-white", dot: "bg-purple-600" },
    SOLD: { label: "Sold", badge: "bg-gray-800 text-white", dot: "bg-gray-800" },
};

const selectClass =
    "bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20";

const TRANSITIONS = {
    AVAILABLE: [{ to: "RESERVED", label: "Reserve" }, { to: "SOLD", label: "Mark Sold" }],
    RESERVED: [{ to: "AVAILABLE", label: "Release" }, { to: "SOLD", label: "Close Sale" }],
    SOLD: [],
};

export default function InventoryGridPage() {
    const queryClient = useQueryClient();
    const [selectedProject, setSelectedProject] = useState("");
    const [selectedTower, setSelectedTower] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [activeUnit, setActiveUnit] = useState(null);

    const { data: projects } = useQuery({
        queryKey: ["projects", "filter-options"],
        queryFn: () => fetchProjects({ limit: 200 }),
        staleTime: 5 * 60 * 1000,
        retry: 1
    });

    const params = { limit: 500 };
    if (selectedProject) params.projectId = selectedProject;
    if (selectedStatus) params.status = selectedStatus;

    const {
        data: properties,
        isPending,
        isError,
        error,
        refetch
    } = useQuery({
        queryKey: ["properties", "grid", params],
        queryFn: () => fetchProperties(null, params),
        staleTime: 30 * 1000,
        retry: 1
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        if (selectedProject) queryClient.invalidateQueries({ queryKey: ["project", selectedProject] });
    };

    const changeStatus = useMutation({
        mutationFn: ({ id, status }) => updateProperty({ id, status }),
        onSuccess: (_data, vars) => {
            showToast(`Unit marked ${vars.status.toLowerCase()}`);
            setActiveUnit(null);
            invalidate();
        },
        onError: (err) => showToast(err?.message || "Status change failed", "error")
    });

    const unitList = useMemo(() => (Array.isArray(properties) ? properties : []), [properties]);

    const towers = useMemo(
        () => Array.from(new Set(unitList.map((u) => u.tower).filter(Boolean))).sort(),
        [unitList]
    );

    const visibleUnits = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return unitList.filter((u) => {
            if (selectedTower && (u.tower || "") !== selectedTower) return false;
            if (!q) return true;
            return [u.unitNumber, u.title, u.configuration]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));
        });
    }, [unitList, selectedTower, searchQuery]);

    const floors = useMemo(() => {
        const byFloor = new Map();
        visibleUnits.forEach((u) => {
            const key = u.floor === null || u.floor === undefined || u.floor === "" ? "— Floor" : Number(u.floor);
            if (!byFloor.has(key)) byFloor.set(key, []);
            byFloor.get(key).push(u);
        });
        return Array.from(byFloor.entries())
            .sort((a, b) => {
                if (a[0] === "— Floor") return 1;
                if (b[0] === "— Floor") return -1;
                return b[0] - a[0];
            });
    }, [visibleUnits]);

    const projectList = Array.isArray(projects) ? projects : [];
    const counts = {
        AVAILABLE: visibleUnits.filter((u) => u.status === "AVAILABLE").length,
        RESERVED: visibleUnits.filter((u) => u.status === "RESERVED").length,
        SOLD: visibleUnits.filter((u) => u.status === "SOLD").length,
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 py-5 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Inventory Matrix & Availability Grid</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Floor-wise unit status — live from inventory, reservable, and closable.</p>
                </div>

                <div className="flex items-center gap-2">
                    <PermissionGate permission="inventory:create">
                        <Link
                            href="/dashboard/inventory/units/quick-add"
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:opacity-95 shadow-sm inline-flex items-center gap-1.5"
                        >
                            <Plus size={14} /> Quick Add Unit
                        </Link>
                    </PermissionGate>
                    <Link
                        href="/dashboard/inventory"
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200 inline-flex items-center gap-1.5"
                    >
                        <LayoutGrid size={14} /> Projects
                    </Link>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <Building2 size={14} /> Project:
                    </div>
                    <select
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className={selectClass}
                    >
                        <option value="">All Projects</option>
                        {projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>

                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider ml-2">
                        <Layers size={14} /> Tower:
                    </div>
                    <select
                        value={selectedTower}
                        onChange={(e) => setSelectedTower(e.target.value)}
                        className={selectClass}
                        disabled={towers.length === 0}
                    >
                        <option value="">{towers.length ? "All Towers" : "No towers yet"}</option>
                        {towers.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className={selectClass}
                    >
                        <option value="">All Statuses</option>
                        <option value="AVAILABLE">Available Only</option>
                        <option value="RESERVED">Reserved Only</option>
                        <option value="SOLD">Sold Only</option>
                    </select>

                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search unit…"
                            className="bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold w-40"
                        />
                    </div>

                    {isPending && <Loader2 size={14} className="animate-spin text-purple-600" />}
                </div>

                {/* Status Legend */}
                <div className="flex items-center gap-3 text-xs font-bold">
                    {Object.entries(STATUS_META).map(([key, meta]) => (
                        <span key={key} className="flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`}></span> {meta.label} ({counts[key]})
                        </span>
                    ))}
                </div>
            </div>

            {/* Grid Canvas */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                {isPending ? (
                    <div className="flex items-center justify-center py-24 text-gray-400">
                        <Loader2 size={26} className="animate-spin mr-3" /> Loading inventory…
                    </div>
                ) : isError ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <AlertCircle size={30} className="text-red-400 mb-3" />
                        <p className="text-sm font-semibold text-gray-600 mb-3">{error?.message || "Failed to load inventory"}</p>
                        <button onClick={() => refetch()} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold">Retry</button>
                    </div>
                ) : floors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center text-gray-400">
                        <LayoutGrid size={30} className="mb-3" />
                        <p className="text-sm font-semibold mb-2">No units match the current filters.</p>
                        <PermissionGate permission="inventory:create">
                            <Link href="/dashboard/inventory/units/quick-add" className="text-purple-600 font-bold text-sm hover:underline">
                                Add units to see them here →
                            </Link>
                        </PermissionGate>
                    </div>
                ) : (
                    <div className="max-w-6xl mx-auto space-y-6">
                        {floors.map(([floorNum, units]) => (
                            <div key={String(floorNum)} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                                <div className="flex justify-between items-center border-b pb-3">
                                    <h3 className="font-bold text-gray-900 text-sm">
                                        {floorNum === "— Floor" ? "Unassigned Floor" : `Floor ${floorNum}`} Matrix
                                    </h3>
                                    <span className="text-xs font-bold text-gray-400">{units.length} Units</span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {units.map((u) => {
                                        const meta = STATUS_META[u.status] || { label: u.status, badge: "bg-gray-500 text-white" };
                                        return (
                                            <button
                                                key={u.id}
                                                onClick={() => setActiveUnit(u)}
                                                className="p-4 rounded-2xl border-2 border-gray-100 hover:border-purple-300 hover:shadow-md bg-gray-50/50 text-left transition-all"
                                            >
                                                <div className="flex justify-between items-start mb-2 gap-1">
                                                    <span className="font-extrabold text-gray-900 text-base truncate">{u.unitNumber || u.title}</span>
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${meta.badge}`}>
                                                        {meta.label}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-bold text-purple-700">{formatCurrency(u.price)}</p>
                                                <p className="text-[10px] text-gray-400 font-semibold mt-0.5 truncate">
                                                    {[u.configuration, u.tower ? `Tower ${u.tower}` : null].filter(Boolean).join(" · ") || "\u00A0"}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Unit action sheet */}
            {activeUnit && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setActiveUnit(null)}>
                    <div
                        className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{activeUnit.unitNumber || activeUnit.title}</h3>
                                <p className="text-xs text-gray-500">
                                    {[activeUnit.project?.name, activeUnit.configuration, activeUnit.tower ? `Tower ${activeUnit.tower}` : null]
                                        .filter(Boolean).join(" · ")}
                                </p>
                            </div>
                            <span className={`text-[10px] font-black px-2 py-1 rounded-full ${STATUS_META[activeUnit.status]?.badge || "bg-gray-100"}`}>
                                {activeUnit.status}
                            </span>
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-4 flex justify-between text-xs">
                            <span className="font-bold text-gray-500">Price</span>
                            <span className="font-black text-purple-700">{formatCurrency(activeUnit.price)}</span>
                        </div>

                        <PermissionGate permission="inventory:update">
                            <div className="flex flex-wrap gap-2">
                                {(TRANSITIONS[activeUnit.status] || []).map((t) => (
                                    <button
                                        key={t.to}
                                        onClick={() => changeStatus.mutate({ id: activeUnit.id, status: t.to })}
                                        disabled={changeStatus.isPending}
                                        className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-black disabled:opacity-50 ${
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
                                {(TRANSITIONS[activeUnit.status] || []).length === 0 && (
                                    <p className="text-xs font-semibold text-gray-400">Sold is terminal.</p>
                                )}
                            </div>
                        </PermissionGate>

                        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                            <button onClick={() => setActiveUnit(null)} className="text-xs font-bold text-gray-400 hover:text-gray-700">Close</button>
                            <Link
                                href={`/dashboard/inventory/units/${activeUnit.id}`}
                                className="text-xs font-black text-purple-600 hover:underline"
                            >
                                Open full editor →
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
