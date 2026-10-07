"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Filter, ImageOff, ArrowRight, Home, Maximize } from "lucide-react";
import { motion } from "framer-motion";
import {
    fetchPublicProjects,
    fetchPublicProperties,
    fetchPublicLocations,
    fetchPublicConfigurations,
} from "../../../lib/api/publicSite";
import { formatPrice } from "../../../utils/format";

const EMPTY_DATA = { items: [], page: 1, limit: 50, total: 0, totalPages: 0 };

const projectParams = (filters) => {
    const params = { limit: 50 };
    ["q", "stateId", "configuration", "minPrice", "maxPrice"].forEach((key) => {
        if (filters[key]) params[key] = filters[key];
    });
    return params;
};

const propertyParams = (filters) => {
    const params = { limit: 50 };
    Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value;
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

const placeLabel = (location) =>
    [location?.locality || location?.district, location?.state].filter(Boolean).join(", ");

const projectPrice = (project) =>
    project.startingPrice != null ? formatPrice(project.startingPrice) : "On request";

export default function SearchClient({ initialProjects, initialProperties, initialFilters }) {
    const [filters, setFilters] = useState(initialFilters);
    const [projects, setProjects] = useState(initialProjects);
    const [properties, setProperties] = useState(initialProperties);
    const [locations, setLocations] = useState([]);
    const [configurations, setConfigurations] = useState([]);
    const [projectOptions, setProjectOptions] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let active = true;
        fetchPublicLocations()
            .then((tree) => {
                if (active) setLocations(Array.isArray(tree) ? tree : []);
            })
            .catch(() => {});
        fetchPublicConfigurations()
            .then((list) => {
                if (active) setConfigurations(Array.isArray(list) ? list : []);
            })
            .catch(() => {});
        fetchPublicProjects({ limit: 50 })
            .then((result) => {
                if (active) setProjectOptions(result?.items || []);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        syncUrl(filters);
        setLoading(true);
        try {
            const [projectResult, propertyResult] = await Promise.all([
                fetchPublicProjects(projectParams(filters)),
                fetchPublicProperties(propertyParams(filters)),
            ]);
            setProjects({ ...EMPTY_DATA, ...(projectResult || {}), items: projectResult?.items || [] });
            setProperties({ ...EMPTY_DATA, ...(propertyResult || {}), items: propertyResult?.items || [] });
        } catch {
            setProjects(EMPTY_DATA);
            setProperties(EMPTY_DATA);
        } finally {
            setLoading(false);
        }
    };

    const projectItems = projects.items || [];
    const propertyItems = properties.items || [];
    const projectCount = projects.total ?? projectItems.length;
    const propertyCount = properties.total ?? propertyItems.length;
    const totalCount = projectCount + propertyCount;

    return (
        <div className="bg-gray-50 min-h-screen pt-32 pb-24">
            <div className="container mx-auto px-6 md:px-12">
                <div className="mb-10">
                    <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">Property Search</h1>
                    <p className="text-gray-500">Find exactly what you&apos;re looking for with our advanced search.</p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                    {/* FILTER SIDEBAR */}
                    <div className="w-full lg:w-80 shrink-0">
                        <form onSubmit={handleSearch} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 lg:sticky lg:top-32">
                            <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
                                <Filter size={20} className="text-gray-900"/>
                                <h2 className="text-lg font-bold text-gray-900">Filters</h2>
                                {loading && <div className="ml-auto w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>}
                            </div>

                            <div className="flex flex-col gap-5">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="search-keyword">Keyword</label>
                                    <input
                                        id="search-keyword"
                                        name="q"
                                        type="text"
                                        value={filters.q}
                                        onChange={handleFilterChange}
                                        placeholder="Project, unit or locality"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="search-location">Location / City</label>
                                    <select
                                        id="search-location"
                                        name="stateId"
                                        value={filters.stateId}
                                        onChange={handleFilterChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    >
                                        <option value="">All Locations</option>
                                        {locations.map((state) => (
                                            <option key={state.id} value={state.id}>{state.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="search-project">Project</label>
                                    <select
                                        id="search-project"
                                        name="projectSlug"
                                        value={filters.projectSlug}
                                        onChange={handleFilterChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    >
                                        <option value="">All Projects</option>
                                        {projectOptions.map((project) => (
                                            <option key={project.slug} value={project.slug}>{project.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="search-configuration">Configuration</label>
                                    <select
                                        id="search-configuration"
                                        name="configuration"
                                        value={filters.configuration}
                                        onChange={handleFilterChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    >
                                        <option value="">Any Configuration</option>
                                        {configurations.map((conf) => (
                                            <option key={conf} value={conf}>{conf}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="search-max-price">Max Price</label>
                                    <input
                                        id="search-max-price"
                                        name="maxPrice"
                                        type="number"
                                        min="0"
                                        value={filters.maxPrice}
                                        onChange={handleFilterChange}
                                        placeholder="₹ No Limit"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                                <button type="submit" className="w-full bg-gray-900 text-white rounded-xl py-3 font-bold hover:bg-gray-800 transition-colors mt-2">
                                    Apply Filters
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* RESULTS */}
                    <div className={`flex-1 transition-opacity ${loading ? "opacity-50 pointer-events-none" : ""}`}>
                        <div className="mb-6 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-900">{totalCount} Result{totalCount === 1 ? "" : "s"} Found</h3>
                        </div>

                        <section className="mb-12">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-lg font-bold text-gray-900">{projectCount} Project{projectCount === 1 ? "" : "s"} Found</h4>
                                <Link href="/projects" className="text-sm text-purple-600 font-medium hover:underline flex items-center gap-1">
                                    Browse all <ArrowRight size={14} />
                                </Link>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {projectItems.map((project) => (
                                    <div key={project.slug} className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100 flex flex-col">
                                        <div className="relative h-48 overflow-hidden bg-gray-100">
                                            {project.image ? (
                                                <img src={project.image} alt={project.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                                    <ImageOff size={32} />
                                                </div>
                                            )}
                                            <div className="absolute top-4 right-4">
                                                <span className="bg-white/95 backdrop-blur-md text-gray-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                                                    {projectPrice(project)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-5 flex-grow flex flex-col justify-between">
                                            <div className="mb-4">
                                                <span className="text-purple-600 font-bold tracking-wider uppercase text-[10px] mb-1 block">
                                                    {project.status ? String(project.status).replace(/_/g, " ") : "Project"}
                                                </span>
                                                <h3 className="text-lg font-bold text-gray-900 mb-1 leading-tight line-clamp-1">{project.name}</h3>
                                                <p className="text-gray-500 text-xs flex items-center gap-1 mb-3"><MapPin size={12}/> {placeLabel(project.location) || "Location coming soon"}</p>

                                                <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-50">
                                                    <div className="text-center">
                                                        <p className="text-[9px] text-gray-400 uppercase font-bold mb-1">Units</p>
                                                        <p className="text-xs font-semibold text-gray-800 flex items-center justify-center gap-1"><Home size={12}/> {project.availableUnits ?? 0}</p>
                                                    </div>
                                                    <div className="text-center border-x border-gray-50">
                                                        <p className="text-[9px] text-gray-400 uppercase font-bold mb-1">Types</p>
                                                        <p className="text-xs font-semibold text-gray-800 line-clamp-1">{(project.configurations || []).join(", ") || "—"}</p>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-[9px] text-gray-400 uppercase font-bold mb-1">Price</p>
                                                        <p className="text-xs font-semibold text-gray-800 line-clamp-1">{project.startingPrice != null ? formatPrice(project.startingPrice) : "On request"}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <Link href={`/projects/${project.slug}`} className="w-full flex justify-center items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-900 py-2.5 rounded-xl text-sm font-bold transition-colors">
                                                View Details
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                                {projectItems.length === 0 && (
                                    <div className="col-span-full bg-white rounded-3xl p-8 text-center border border-gray-100">
                                        <p className="text-sm text-gray-500">No projects match this search.</p>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-lg font-bold text-gray-900">{propertyCount} Propert{propertyCount === 1 ? "y" : "ies"} Found</h4>
                                <Link href="/properties" className="text-sm text-purple-600 font-medium hover:underline flex items-center gap-1">
                                    Browse all <ArrowRight size={14} />
                                </Link>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {propertyItems.map((prop) => (
                                    <div key={prop.token} className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100 flex flex-col">
                                        <div className="relative h-48 overflow-hidden bg-gray-100">
                                            {prop.image ? (
                                                <img src={prop.image} alt={prop.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                                    <ImageOff size={32} />
                                                </div>
                                            )}
                                            <div className="absolute top-4 right-4">
                                                <span className="bg-white/95 backdrop-blur-md text-gray-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                                                    {prop.price != null ? formatPrice(prop.price) : "On request"}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-5 flex-grow flex flex-col justify-between">
                                            <div className="mb-4">
                                                <span className="text-purple-600 font-bold tracking-wider uppercase text-[10px] mb-1 block">{prop.project?.name || "—"}</span>
                                                <h3 className="text-lg font-bold text-gray-900 mb-1 leading-tight line-clamp-1">{prop.title}</h3>
                                                <p className="text-gray-500 text-xs flex items-center gap-1 mb-3"><MapPin size={12}/> {placeLabel(prop.location) || "Location coming soon"}</p>

                                                <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-50">
                                                    <div className="text-center">
                                                        <p className="text-[9px] text-gray-400 uppercase font-bold mb-1">Conf</p>
                                                        <p className="text-xs font-semibold text-gray-800">{prop.configuration || "—"}</p>
                                                    </div>
                                                    <div className="text-center border-x border-gray-50">
                                                        <p className="text-[9px] text-gray-400 uppercase font-bold mb-1">Area</p>
                                                        <p className="text-xs font-semibold text-gray-800 flex items-center justify-center gap-1"><Maximize size={12}/> {prop.area ? `${prop.area} sqft` : "—"}</p>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-[9px] text-gray-400 uppercase font-bold mb-1">Status</p>
                                                        <p className="text-xs font-semibold text-gray-800 line-clamp-1">{prop.availability || "—"}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <Link href={`/properties/${prop.token}`} className="w-full flex justify-center items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-900 py-2.5 rounded-xl text-sm font-bold transition-colors">
                                                View Details
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                                {propertyItems.length === 0 && (
                                    <div className="col-span-full bg-white rounded-3xl p-8 text-center border border-gray-100">
                                        <p className="text-sm text-gray-500">No properties match this search.</p>
                                    </div>
                                )}
                            </div>
                        </section>

                        {projectCount === 0 && propertyCount === 0 && !loading && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-12 text-center border border-gray-100 mt-6">
                                <h4 className="text-lg font-bold text-gray-900 mb-2">No results found</h4>
                                <p className="text-gray-500 text-sm">Try adjusting your filters or search for something else.</p>
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
