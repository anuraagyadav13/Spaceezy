"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
    Search, Plus, UploadCloud, LayoutGrid, Building2, MapPin,
    Loader2, AlertCircle, ArrowRight, Home
} from "lucide-react";
import { fetchProjects } from "../../../lib/api/projects";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";

const selectClass =
    "bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

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

function StatBar({ inventory }) {
    const { total = 0, available = 0, reserved = 0, sold = 0 } = inventory || {};
    return (
        <div className="grid grid-cols-4 gap-2 text-center">
            {[
                { label: "Total", value: total, cls: "text-gray-900" },
                { label: "Available", value: available, cls: "text-emerald-600" },
                { label: "Reserved", value: reserved, cls: "text-purple-600" },
                { label: "Sold", value: sold, cls: "text-gray-500" },
            ].map((s) => (
                <div key={s.label} className="bg-gray-50 rounded-xl py-2">
                    <p className={`text-lg font-black leading-none ${s.cls}`}>{s.value}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">{s.label}</p>
                </div>
            ))}
        </div>
    );
}

export default function DashboardInventoryPage() {
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");

    const {
        data: projects,
        isPending,
        isError,
        error,
        refetch,
        isFetching
    } = useQuery({
        queryKey: ["projects", "inventory-list", { status }],
        queryFn: () => fetchProjects({ limit: 200, ...(status ? { status } : {}) }),
        staleTime: 30 * 1000,
        retry: 1
    });

    const projectList = useMemo(() => {
        const list = Array.isArray(projects) ? projects : [];
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter((p) =>
            [p.name, p.city, p.locality, p.developer]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [projects, search]);

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <div className="p-4 sm:p-8 w-full max-w-7xl mx-auto text-gray-800 flex-1">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Inventory Management</h1>
                        <p className="text-gray-500 text-sm mt-1">Projects, configurations, units, availability and pricing.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/dashboard/inventory/grid"
                            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-all inline-flex items-center gap-2"
                        >
                            <LayoutGrid size={16} /> Availability Grid
                        </Link>
                        <PermissionGate permission="inventory:create">
                            <Link
                                href="/dashboard/inventory/import"
                                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-all inline-flex items-center gap-2"
                            >
                                <UploadCloud size={16} /> Bulk Import
                            </Link>
                        </PermissionGate>
                        <PermissionGate permission="project:create">
                            <Link
                                href="/dashboard/inventory/projects/new"
                                className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-bold transition-all shadow-sm inline-flex items-center gap-2"
                            >
                                <Plus size={16} /> New Project
                            </Link>
                        </PermissionGate>
                    </div>
                </header>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search projects by name, city, locality…"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                        />
                    </div>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
                        <option value="">All Statuses</option>
                        <option value="UPCOMING">Upcoming</option>
                        <option value="PRE_LAUNCH">Pre-Launch</option>
                        <option value="UNDER_CONSTRUCTION">Under Construction</option>
                        <option value="READY_TO_MOVE">Ready to Move</option>
                        <option value="AVAILABLE">Available</option>
                        <option value="INACTIVE">Inactive (Archived)</option>
                    </select>
                    {isFetching && !isPending && <Loader2 size={16} className="animate-spin text-purple-600" />}
                </div>

                {isPending ? (
                    <div className="flex items-center justify-center py-24 text-gray-400">
                        <Loader2 size={28} className="animate-spin mr-3" /> Loading projects…
                    </div>
                ) : isError ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <AlertCircle size={32} className="text-red-400 mb-3" />
                        <p className="text-sm font-semibold text-gray-600 mb-3">
                            {error?.message || "Failed to load projects"}
                        </p>
                        <button
                            onClick={() => refetch()}
                            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold"
                        >
                            Retry
                        </button>
                    </div>
                ) : projectList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center text-gray-400">
                        <Home size={32} className="mb-3" />
                        <p className="text-sm font-semibold mb-1">
                            {search || status ? "No projects match your filters." : "No projects yet."}
                        </p>
                        {!search && !status && (
                            <PermissionGate permission="project:create">
                                <Link href="/dashboard/inventory/projects/new" className="text-purple-600 font-bold text-sm hover:underline">
                                    Create your first project →
                                </Link>
                            </PermissionGate>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projectList.map((project) => (
                            <Link
                                key={project.id}
                                href={`/dashboard/inventory/projects/${project.id}`}
                                className="block bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:border-purple-200 transition-all group"
                            >
                                <div className="relative h-28 bg-gradient-to-br from-gray-900 via-gray-800 to-purple-900 p-5 flex flex-col justify-between">
                                    <span className={`absolute top-3 right-3 text-[10px] font-black px-2.5 py-1 rounded-full ${STATUS_BADGES[project.status] || "bg-gray-100 text-gray-700"}`}>
                                        {String(project.status || "").replace(/_/g, " ")}
                                    </span>
                                    <Building2 size={26} className="text-purple-300" />
                                    <div>
                                        <h3 className="text-lg font-bold text-white leading-tight">{project.name}</h3>
                                        <p className="text-[11px] text-gray-300 flex items-center gap-1 mt-0.5">
                                            <MapPin size={11} />
                                            {[project.locality, project.city].filter(Boolean).join(", ") || project.address || "—"}
                                        </p>
                                    </div>
                                </div>
                                <div className="p-5 space-y-4">
                                    <StatBar inventory={project.inventory} />
                                    <div className="flex justify-between items-center text-xs text-gray-500">
                                        <span>{project.projectType}{project.developer ? ` · ${project.developer}` : ""}</span>
                                        <span className="font-bold text-purple-600 group-hover:underline inline-flex items-center gap-1">
                                            Manage <ArrowRight size={12} />
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
