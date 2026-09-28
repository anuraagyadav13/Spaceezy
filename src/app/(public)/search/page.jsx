"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { searchProperties } from "../../../lib/mock/properties";
import { getProjects } from "../../../lib/mock/projects";
import { getLocations } from "../../../lib/mock/locations";
import { MapPin, Maximize, Compass, Filter, ArrowRight } from "lucide-react";

function SearchContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const [properties, setProperties] = useState([]);
    const [projects, setProjects] = useState({});
    const [locations, setLocations] = useState([]);
    const [allProjects, setAllProjects] = useState([]);
    
    // Filters state
    const [filters, setFilters] = useState({
        bhk: searchParams.get("bhk") || "",
        maxPrice: searchParams.get("maxPrice") || "",
        minPrice: searchParams.get("minPrice") || "",
        projectId: searchParams.get("projectId") || "",
        location: searchParams.get("location") || ""
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            const prjs = getProjects();
            setAllProjects(prjs);
            const prjMap = {};
            prjs.forEach(p => prjMap[p.id] = p);
            setProjects(prjMap);
            setLocations(getLocations());
            
            // Execute search
            const currentFilters = {
                bhk: searchParams.get("bhk"),
                maxPrice: searchParams.get("maxPrice"),
                minPrice: searchParams.get("minPrice"),
                projectId: searchParams.get("projectId")
            };
            const locationFilter = searchParams.get("location");
            
            let results = searchProperties(currentFilters);
            if (locationFilter) {
                results = results.filter(p => prjMap[p.projectId]?.location === locationFilter || prjMap[p.projectId]?.city === locationFilter);
            }
            setProperties(results);
        }, 0);
        return () => clearTimeout(timer);
    }, [searchParams]);

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
    };

    const handleSearch = (e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.set(key, value);
        });
        router.push(`/search?${params.toString()}`);
    };

    const formatPrice = (price) => {
        if (price >= 10000000) return `₹ ${(price / 10000000).toFixed(2)} Cr`;
        if (price >= 100000) return `₹ ${(price / 100000).toFixed(2)} L`;
        return `₹ ${price.toLocaleString()}`;
    };

    return (
        <div className="flex flex-col lg:flex-row gap-8">
            {/* FILTER SIDEBAR */}
            <div className="w-full lg:w-80 shrink-0">
                <form onSubmit={handleSearch} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 sticky top-32">
                    <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
                        <Filter size={20} className="text-gray-900"/>
                        <h2 className="text-lg font-bold text-gray-900">Filters</h2>
                    </div>

                    <div className="flex flex-col gap-5">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Location / City</label>
                            <select name="location" value={filters.location} onChange={handleFilterChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                                <option value="">All Locations</option>
                                {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Project</label>
                            <select name="projectId" value={filters.projectId} onChange={handleFilterChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                                <option value="">All Projects</option>
                                {allProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Configuration</label>
                            <select name="bhk" value={filters.bhk} onChange={handleFilterChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                                <option value="">Any BHK</option>
                                <option value="2">2 BHK</option>
                                <option value="3">3 BHK</option>
                                <option value="4">4 BHK</option>
                                <option value="5">5+ BHK</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Max Price</label>
                            <select name="maxPrice" value={filters.maxPrice} onChange={handleFilterChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                                <option value="">No Limit</option>
                                <option value="10000000">₹ 1.0 Cr</option>
                                <option value="20000000">₹ 2.0 Cr</option>
                                <option value="30000000">₹ 3.0 Cr</option>
                                <option value="50000000">₹ 5.0 Cr</option>
                            </select>
                        </div>
                        <button type="submit" className="w-full bg-gray-900 text-white rounded-xl py-3 font-bold hover:bg-gray-800 transition-colors mt-2">
                            Apply Filters
                        </button>
                    </div>
                </form>
            </div>

            {/* RESULTS */}
            <div className="flex-1">
                <div className="mb-6 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-900">{properties.length} Properties Found</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {properties.map((prop) => {
                        const project = projects[prop.projectId];
                        if (!project) return null;
                        
                        return (
                            <div key={prop.id} className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100 flex flex-col">
                                <div className="relative h-48 overflow-hidden">
                                    <Image src={prop.images[0]} alt={prop.title} fill className="object-cover group-hover:scale-105 transition-transform duration-700" />
                                    <div className="absolute top-4 right-4">
                                        <span className="bg-white/90 backdrop-blur-md text-gray-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                                            {formatPrice(prop.price)}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-5 flex-grow flex flex-col justify-between">
                                    <div className="mb-4">
                                        <span className="text-purple-600 font-bold tracking-wider uppercase text-[10px] mb-1 block">{project.name}</span>
                                        <h3 className="text-lg font-bold text-gray-900 mb-1 leading-tight line-clamp-1">{prop.title}</h3>
                                        <p className="text-gray-500 text-xs flex items-center gap-1 mb-3"><MapPin size={12}/> {project.location}, {project.city}</p>
                                        
                                        <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-50">
                                            <div className="text-center">
                                                <p className="text-[9px] text-gray-400 uppercase font-bold mb-1">Conf</p>
                                                <p className="text-xs font-semibold text-gray-800">{prop.configuration}</p>
                                            </div>
                                            <div className="text-center border-x border-gray-50">
                                                <p className="text-[9px] text-gray-400 uppercase font-bold mb-1">Area</p>
                                                <p className="text-xs font-semibold text-gray-800">{prop.area} sqft</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[9px] text-gray-400 uppercase font-bold mb-1">Facing</p>
                                                <p className="text-xs font-semibold text-gray-800">{prop.facing}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <Link href={`/properties/${prop.id}`} className="w-full flex justify-center items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-900 py-2.5 rounded-xl text-sm font-bold transition-colors">
                                        View Details
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                    {properties.length === 0 && (
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

export default function SearchPage() {
    return (
        <div className="bg-gray-50 min-h-screen pt-32 pb-24">
            <div className="container mx-auto px-6 md:px-12">
                <div className="mb-10">
                    <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">Property Search</h1>
                    <p className="text-gray-500">Find exactly what you&apos;re looking for with our advanced search.</p>
                </div>
                
                <Suspense fallback={<div className="flex justify-center p-20"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div></div>}>
                    <SearchContent />
                </Suspense>
            </div>
        </div>
    );
}
