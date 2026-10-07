"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, CalendarRange, FolderOpen, Radio, UserCog, Layers } from "lucide-react";
import { fetchProjects } from "../../../lib/api/projects";
import { fetchUsers } from "../../../lib/api/users";
import { usePermissions } from "../../auth/hooks/usePermissions";
import { SOURCE_OPTIONS, DATE_PRESETS } from "../helpers";

const selectClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

function FilterLabel({ icon: Icon, children }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
            <Icon size={12} /> {children}
        </span>
    );
}

export default function PipelineFilters({ filters, onChange, stageOptions, dataSources }) {
    const { hasPermission } = usePermissions();
    const canViewEmployees = hasPermission("employee:view");
    const [searchValue, setSearchValue] = useState(filters.search || "");
    const [lastUrlSearch, setLastUrlSearch] = useState(filters.search || "");

    if ((filters.search || "") !== lastUrlSearch) {
        setLastUrlSearch(filters.search || "");
        setSearchValue(filters.search || "");
    }

    useEffect(() => {
        const timer = setTimeout(() => {
            if ((searchValue || "") !== (filters.search || "")) {
                onChange({ search: searchValue });
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [searchValue, filters.search, onChange]);

    const { data: projects } = useQuery({
        queryKey: ["projects", "filter-options"],
        queryFn: () => fetchProjects({ limit: 200 }),
        staleTime: 5 * 60 * 1000,
        retry: 1
    });

    const { data: users } = useQuery({
        queryKey: ["users", "filter-options"],
        queryFn: () => fetchUsers({ limit: 200 }),
        staleTime: 5 * 60 * 1000,
        retry: 1,
        enabled: canViewEmployees
    });

    const projectList = Array.isArray(projects) ? projects : [];
    const userList = Array.isArray(users) ? users : [];

    const sourceOptions = Array.from(new Set([...(dataSources || []).map((s) => s.source), ...SOURCE_OPTIONS]));

    const hasActiveFilters =
        filters.search ||
        filters.projectId ||
        filters.source ||
        filters.assignedTo ||
        filters.stage ||
        filters.preset !== "this-month";

    return (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <div className="xl:col-span-2">
                    <FilterLabel icon={Search}>Search</FilterLabel>
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            placeholder="Search name, phone, email..."
                            className={`${selectClass} pl-9`}
                        />
                    </div>
                </div>

                <div>
                    <FilterLabel icon={CalendarRange}>Date range</FilterLabel>
                    <select
                        value={filters.preset}
                        onChange={(e) => onChange({ preset: e.target.value })}
                        className={selectClass}
                    >
                        {DATE_PRESETS.map((preset) => (
                            <option key={preset.value} value={preset.value}>{preset.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <FilterLabel icon={FolderOpen}>Project</FilterLabel>
                    <select
                        value={filters.projectId}
                        onChange={(e) => onChange({ projectId: e.target.value })}
                        className={selectClass}
                    >
                        <option value="">All projects</option>
                        {projectList.map((project) => (
                            <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <FilterLabel icon={Radio}>Source</FilterLabel>
                    <select
                        value={filters.source}
                        onChange={(e) => onChange({ source: e.target.value })}
                        className={selectClass}
                    >
                        <option value="">All sources</option>
                        {sourceOptions.map((source) => (
                            <option key={source} value={source}>{source}</option>
                        ))}
                    </select>
                </div>

                <div className={`grid gap-3 ${canViewEmployees ? "grid-cols-2" : "grid-cols-1"}`}>
                    {canViewEmployees && (
                        <div>
                            <FilterLabel icon={UserCog}>Assigned to</FilterLabel>
                            <select
                                value={filters.assignedTo}
                                onChange={(e) => onChange({ assignedTo: e.target.value })}
                                className={selectClass}
                            >
                                <option value="">Everyone</option>
                                {userList.map((user) => (
                                    <option key={user.id} value={user.id}>{user.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div>
                        <FilterLabel icon={Layers}>Stage</FilterLabel>
                        <select
                            value={filters.stage}
                            onChange={(e) => onChange({ stage: e.target.value })}
                            className={selectClass}
                        >
                            <option value="">All stages</option>
                            {stageOptions.map((stage) => (
                                <option key={stage.stage} value={stage.stage}>{stage.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {filters.preset === "custom" && (
                <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-gray-100">
                    <div>
                        <FilterLabel icon={CalendarRange}>From</FilterLabel>
                        <input
                            type="date"
                            value={filters.from}
                            onChange={(e) => onChange({ from: e.target.value })}
                            className={`${selectClass} w-44`}
                        />
                    </div>
                    <div>
                        <FilterLabel icon={CalendarRange}>To</FilterLabel>
                        <input
                            type="date"
                            value={filters.to}
                            onChange={(e) => onChange({ to: e.target.value })}
                            className={`${selectClass} w-44`}
                        />
                    </div>
                </div>
            )}

            {hasActiveFilters && (
                <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
                    <button
                        onClick={() =>
                            onChange({
                                search: "",
                                preset: "this-month",
                                from: "",
                                to: "",
                                projectId: "",
                                source: "",
                                assignedTo: "",
                                stage: ""
                            })
                    }
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-red-500 transition-colors"
                    >
                        <X size={13} /> Clear all filters
                    </button>
                </div>
            )}
        </div>
    );
}
