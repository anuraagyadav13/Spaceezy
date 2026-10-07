"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, ArrowRight, Maximize, Home, ImageOff, Search } from "lucide-react";
import { motion } from "framer-motion";
import { fetchPublicProperties, fetchPublicConfigurations } from "../../../lib/api/publicSite";
import { formatPrice } from "../../../utils/format";

const EMPTY_DATA = { items: [], page: 1, limit: 50, total: 0, totalPages: 0 };

const AVAILABILITY_OPTIONS = ["Available", "Limited Availability", "Sold"];

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

const placeLabel = (location) =>
    [location?.locality || location?.district, location?.state].filter(Boolean).join(", ");

const availabilityClasses = (availability) =>
    availability === "Available"
        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
        : availability === "Limited Availability"
            ? "bg-amber-50 text-amber-700 border-amber-100"
            : "bg-gray-100 text-gray-600 border-gray-200";

export default function PropertiesClient({ initialData, initialFilters }) {
    const [filters, setFilters] = useState(initialFilters);
    const [data, setData] = useState(initialData);
    const [configurations, setConfigurations] = useState([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef(null);

    useEffect(() => {
        let active = true;
        fetchPublicConfigurations()
            .then((list) => {
                if (active) setConfigurations(Array.isArray(list) ? list : []);
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
            const result = await fetchPublicProperties(buildParams(next));
            const items = result?.items || [];
            setData({ ...EMPTY_DATA, ...(result || {}), items });
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

    const properties = data.items || [];

    return (
        <div className="bg-gray-50 min-h-screen pt-32 pb-24">
            <div className="container mx-auto px-6 md:px-12">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight mb-4">Available Properties</h1>
                    <p className="text-gray-500 text-lg max-w-2xl">
                        Discover your perfect home from our curated selection of premium units.
                    </p>
                </motion.div>

                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 mb-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                        <div className="lg:col-span-2">
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="property-search">Search</label>
                            <div className="relative">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="property-search"
                                    type="text"
                                    value={filters.q}
                                    onChange={(e) => apply({ q: e.target.value }, false)}
                                    placeholder="Unit, project or locality"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="property-availability">Availability</label>
                            <select
                                id="property-availability"
                                value={filters.availability}
                                onChange={(e) => apply({ availability: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            >
                                <option value="">Any Availability</option>
                                {AVAILABILITY_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="property-configuration">Configuration</label>
                            <select
                                id="property-configuration"
                                value={filters.configuration}
                                onChange={(e) => apply({ configuration: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            >
                                <option value="">All Configurations</option>
                                {configurations.map((conf) => (
                                    <option key={conf} value={conf}>{conf}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="property-min-price">Min Price</label>
                            <input
                                id="property-min-price"
                                type="number"
                                min="0"
                                value={filters.minPrice}
                                onChange={(e) => apply({ minPrice: e.target.value }, false)}
                                placeholder="₹ Min"
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="property-max-price">Max Price</label>
                            <input
                                id="property-max-price"
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
                            {loading ? "Updating results…" : `${data.total ?? properties.length} propert${(data.total ?? properties.length) === 1 ? "y" : "ies"} found`}
                        </p>
                        {loading && (
                            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        )}
                    </div>
                </div>

                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 transition-opacity ${loading ? "opacity-50 pointer-events-none" : ""}`}>
                    {properties.map((prop, i) => (
                        <motion.div
                            key={prop.token}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.1, 0.5) }}
                            className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-gray-100 flex flex-col"
                        >
                            <div className="relative h-64 overflow-hidden bg-gray-100">
                                {prop.image ? (
                                    <img src={prop.image} alt={prop.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                        <ImageOff size={36} />
                                    </div>
                                )}
                                <div className="absolute top-4 right-4">
                                    <span className="bg-white/95 backdrop-blur-md text-gray-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                                        {prop.price != null ? formatPrice(prop.price) : "On request"}
                                    </span>
                                </div>
                                <div className="absolute top-4 left-4">
                                    <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border backdrop-blur-md ${availabilityClasses(prop.availability)}`}>
                                        {prop.availability}
                                    </span>
                                </div>
                            </div>
                            <div className="p-6 flex-grow flex flex-col justify-between">
                                <div className="mb-6">
                                    <span className="text-purple-600 font-bold tracking-wider uppercase text-[10px] mb-2 block">{prop.project?.name || "—"}</span>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2 leading-tight line-clamp-2">{prop.title}</h3>
                                    <p className="text-gray-500 text-sm flex items-center gap-1 mb-4"><MapPin size={14}/> {placeLabel(prop.location) || "Location coming soon"}</p>

                                    <div className="grid grid-cols-3 gap-2 py-4 border-y border-gray-100">
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Conf</p>
                                            <p className="text-sm font-semibold text-gray-800">{prop.configuration || "—"}</p>
                                        </div>
                                        <div className="text-center border-x border-gray-100">
                                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Area</p>
                                            <p className="text-sm font-semibold text-gray-800 flex items-center justify-center gap-1"><Maximize size={12}/> {prop.area ? `${prop.area} sqft` : "—"}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">BHK</p>
                                            <p className="text-sm font-semibold text-gray-800 flex items-center justify-center gap-1"><Home size={12}/> {prop.bhk ?? "—"}</p>
                                        </div>
                                    </div>
                                </div>
                                <Link href={`/properties/${prop.token}`} className="w-full flex justify-center items-center gap-2 bg-gray-50 hover:bg-purple-600 hover:text-white text-gray-900 py-3 rounded-xl font-bold transition-colors">
                                    View Property <ArrowRight size={18} />
                                </Link>
                            </div>
                        </motion.div>
                    ))}
                    {properties.length === 0 && !loading && (
                        <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-gray-100">
                            <h4 className="text-lg font-bold text-gray-900 mb-2">No properties found</h4>
                            <p className="text-gray-500 text-sm">Try adjusting your filters to see more results.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
