"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, ArrowRight, Home, ImageOff, Search } from "lucide-react";
import { motion } from "framer-motion";
import { Breadcrumbs } from "../../../components/seo/Breadcrumbs";
import { fetchPublicProjects, fetchPublicLocations } from "../../../lib/api/publicSite";
import { formatPrice } from "../../../utils/format";

const EMPTY_DATA = { items: [], page: 1, limit: 50, total: 0, totalPages: 0 };

const buildParams = (filters) => {
    const params = { limit: 50 };
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") params[key] = value;
    });
    return params;
};

const syncUrl = (filters) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value) query.set(key, String(value));
    });
    const qs = query.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
};

const placeLabel = (location) => {
    const { locality, district, state } = location || {};
    if (locality && district) return `${locality}, ${district}`;
    return [locality || district, state].filter(Boolean).join(", ");
};

const priceRange = (project) => {
    const { startingPrice, maximumPrice } = project;
    if (startingPrice == null && maximumPrice == null) return "On request";
    if (
        startingPrice != null &&
        maximumPrice != null &&
        maximumPrice !== startingPrice
    ) {
        return `${formatPrice(startingPrice)} – ${formatPrice(maximumPrice)}`;
    }
    return formatPrice(startingPrice ?? maximumPrice);
};

const collectTypes = (items, active) => {
    const types = new Set((items || []).map((item) => item.projectType).filter(Boolean));
    if (active) types.add(active);
    return Array.from(types);
};

export default function ProjectsClient({ initialData, initialFilters }) {
    const [filters, setFilters] = useState(initialFilters);
    const [data, setData] = useState(initialData);
    const [locations, setLocations] = useState([]);
    const [typeOptions, setTypeOptions] = useState(() =>
        collectTypes(initialData.items, initialFilters.propertyType)
    );
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef(null);

    useEffect(() => {
        let active = true;
        fetchPublicLocations()
            .then((tree) => {
                if (active) setLocations(Array.isArray(tree) ? tree : []);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    const load = async (next) => {
        syncUrl(next);
        setLoading(true);
        try {
            const result = await fetchPublicProjects(buildParams(next));
            const items = result?.items || [];
            setData({ ...EMPTY_DATA, ...(result || {}), items });
            setTypeOptions((prev) => collectTypes([...prev.map((t) => ({ projectType: t })), ...items], next.propertyType));
        } catch {
            setData(EMPTY_DATA);
        } finally {
            setLoading(false);
        }
    };

    const apply = (patch, immediate = true) => {
        const next = { ...filters, ...patch };
        setFilters(next);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (immediate) {
            load(next);
        } else {
            debounceRef.current = setTimeout(() => load(next), 400);
        }
    };

    const selectedState = locations.find((state) => state.id === filters.stateId);
    const districts = selectedState?.districts || [];
    const projects = data.items || [];

    return (
        <div className="bg-gray-50 min-h-screen pt-32 pb-24">
            <div className="container mx-auto px-6 md:px-12">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
                    <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Projects", href: null }]} />
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight mb-4">Discover Projects</h1>
                    <p className="text-gray-500 text-lg max-w-2xl">
                        Browse every published project with current prices, unit availability and configurations,
                        synced from the SpaceEzy team&apos;s inventory. Narrow the list by state, district, property
                        type and budget — then open a project for amenities, RERA details, possession timelines and
                        ready-to-move units.
                    </p>
                </motion.div>

                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 mb-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4 items-end">
                        <div className="lg:col-span-2">
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="project-search">Search</label>
                            <div className="relative">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="project-search"
                                    type="text"
                                    value={filters.q}
                                    onChange={(e) => apply({ q: e.target.value }, false)}
                                    placeholder="Project name or locality"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="project-state">State</label>
                            <select
                                id="project-state"
                                value={filters.stateId}
                                onChange={(e) => apply({ stateId: e.target.value, districtId: "" })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            >
                                <option value="">All States</option>
                                {locations.map((state) => (
                                    <option key={state.id} value={state.id}>{state.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="project-district">District</label>
                            <select
                                id="project-district"
                                value={filters.districtId}
                                onChange={(e) => apply({ districtId: e.target.value })}
                                disabled={!filters.stateId}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <option value="">{filters.stateId ? "All Districts" : "Select a state"}</option>
                                {districts.map((district) => (
                                    <option key={district.id} value={district.id}>{district.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="project-type">Property Type</label>
                            <select
                                id="project-type"
                                value={filters.propertyType}
                                onChange={(e) => apply({ propertyType: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            >
                                <option value="">All Types</option>
                                {typeOptions.map((type) => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="project-min-price">Min Price</label>
                            <input
                                id="project-min-price"
                                type="number"
                                min="0"
                                value={filters.minPrice}
                                onChange={(e) => apply({ minPrice: e.target.value }, false)}
                                placeholder="₹ Min"
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="project-max-price">Max Price</label>
                            <input
                                id="project-max-price"
                                type="number"
                                min="0"
                                value={filters.maxPrice}
                                onChange={(e) => apply({ maxPrice: e.target.value }, false)}
                                placeholder="₹ Max"
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
                        <p className="text-sm text-gray-500">
                            {loading ? "Updating results…" : `${data.total ?? projects.length} project${(data.total ?? projects.length) === 1 ? "" : "s"} found`}
                        </p>
                        {loading && (
                            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        )}
                    </div>
                </div>

                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 transition-opacity ${loading ? "opacity-50 pointer-events-none" : ""}`}>
                    {projects.map((project, i) => (
                        <motion.div
                            key={project.slug}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.1, 0.5) }}
                            className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-gray-100 flex flex-col"
                        >
                            <div className="relative h-64 overflow-hidden bg-gray-100">
                                {project.image ? (
                                    <img src={project.image} alt={project.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                        <ImageOff size={36} />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent"></div>
                                <div className="absolute bottom-4 left-6">
                                    {project.status ? (
                                        <span className="bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full border border-white/30 mb-2 inline-block">
                                            {String(project.status).replace(/_/g, " ")}
                                        </span>
                                    ) : null}
                                    <h3 className="text-2xl font-bold text-white">{project.name}</h3>
                                    <p className="text-gray-200 text-sm flex items-center gap-1 mt-1">
                                        <MapPin size={14}/> {placeLabel(project.location) || "Location coming soon"}
                                    </p>
                                </div>
                            </div>
                            <div className="p-6 flex-grow flex flex-col justify-between">
                                <div className="mb-6">
                                    <div className="flex justify-between items-start gap-4 mb-4 pb-4 border-b border-gray-100">
                                        <div>
                                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Price Range</p>
                                            <p className="text-lg font-bold text-purple-600">{priceRange(project)}</p>
                                            <p className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                                                <Home size={12} /> {project.availableUnits ?? 0} units available
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Configurations</p>
                                            <div className="flex flex-wrap gap-1.5 justify-end">
                                                {(project.configurations || []).map((conf) => (
                                                    <span key={conf} className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-md font-medium">
                                                        {conf}
                                                    </span>
                                                ))}
                                                {(project.configurations || []).length === 0 && (
                                                    <span className="text-sm text-gray-400">Coming soon</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-600 line-clamp-2">{project.description || ""}</p>
                                </div>
                                <Link href={`/projects/${project.slug}`} className="w-full flex justify-center items-center gap-2 bg-gray-50 hover:bg-gray-900 hover:text-white text-gray-900 py-3 rounded-xl font-bold transition-colors">
                                    View Project Details <ArrowRight size={18} />
                                </Link>
                            </div>
                        </motion.div>
                    ))}
                    {projects.length === 0 && !loading && (
                        <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-gray-100">
                            <h4 className="text-lg font-bold text-gray-900 mb-2">No projects found</h4>
                            <p className="text-gray-500 text-sm">Try adjusting your filters to see more results.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
