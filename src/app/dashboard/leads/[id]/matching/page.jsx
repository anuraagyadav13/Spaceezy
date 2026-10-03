"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchLeadById } from "../../../../../lib/api/leads";
import { fetchProperties } from "../../../../../lib/api/properties";
import { showToast } from "../../../../../lib/toast";
import { 
    ArrowLeft, Search, Filter, CheckCircle2, Share2, Heart, 
    Building2, MapPin, Grid, List, Sparkles, X, Check, Send
} from "lucide-react";

export default function PropertyMatchingPage() {
    const params = useParams();
    const router = useRouter();
    const [lead, setLead] = useState(null);
    const [properties, setProperties] = useState([]);
    const [selectedUnits, setSelectedUnits] = useState([]);
    const [interestedUnits, setInterestedUnits] = useState([]);
    const [viewMode, setViewMode] = useState("grid");
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [shareChannel, setShareChannel] = useState("whatsapp");
    const [shareSuccess, setShareSuccess] = useState(false);

    // Filters
    const [configFilter, setConfigFilter] = useState("ALL");
    const [maxBudget, setMaxBudget] = useState("");
    const [locationFilter, setLocationFilter] = useState("ALL");
    const [typeFilter, setTypeFilter] = useState("ALL");
    const [showMoreFilters, setShowMoreFilters] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                const leadData = await fetchLeadById(params.id);
                setLead(leadData);
                const propsData = await fetchProperties({ limit: 100 });
                setProperties(propsData.properties || propsData || []);
            } catch (err) {
                showToast(`Failed to load data: ${err.message}`, "error");
            }
        };
        loadData();
    }, [params.id]);

    if (!lead) {
        return <div className="p-8 text-center text-gray-500">Loading Lead Property Matching...</div>;
    }

    const filteredProperties = properties.filter(p => {
        if (configFilter !== "ALL" && !p.name?.toLowerCase().includes(configFilter.toLowerCase()) && !p.type?.toLowerCase().includes(configFilter.toLowerCase())) {
            // loose match for config in mock
        }
        if (locationFilter !== "ALL" && !p.address?.toLowerCase().includes(locationFilter.toLowerCase())) {
            return false;
        }
        if (typeFilter !== "ALL" && p.type !== typeFilter) {
            return false;
        }
        return true;
    });

    const toggleSelect = (id) => {
        setSelectedUnits(prev => 
            prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
        );
    };

    const toggleInterested = (id) => {
        setInterestedUnits(prev => 
            prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
        );
    };

    const handleShare = () => {
        setShareSuccess(true);
        setTimeout(() => {
            setShareSuccess(false);
            setShareModalOpen(false);
        }, 2000);
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
                            <h2 className="text-lg font-bold">{lead.project || "Any Premium Project"}</h2>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-6 text-sm">
                        <div className="border-r border-white/10 pr-6">
                            <p className="text-xs text-purple-300">Target Budget</p>
                            <p className="font-bold text-amber-300">{lead.budget || "₹1.0 - ₹2.5 Cr"}</p>
                        </div>
                        <div className="border-r border-white/10 pr-6">
                            <p className="text-xs text-purple-300">Preferred Location</p>
                            <p className="font-bold text-white">South Delhi / Gurugram</p>
                        </div>
                        <div className="border-r border-white/10 pr-6">
                            <p className="text-xs text-purple-300">Configuration</p>
                            <p className="font-bold text-white">2 BHK / 3 BHK Apartment</p>
                        </div>
                        <div>
                            <p className="text-xs text-purple-300">Stage</p>
                            <p className="font-bold text-emerald-300">{lead.stage}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <Filter size={14} /> Quick Filters:
                    </div>
                    <select 
                        value={typeFilter} 
                        onChange={e => setTypeFilter(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-purple-500"
                    >
                        <option value="ALL">All Categories</option>
                        <option value="Residential">Residential</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Retail">Retail</option>
                    </select>

                    <select 
                        value={configFilter} 
                        onChange={e => setConfigFilter(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-purple-500"
                    >
                        <option value="ALL">All Configurations</option>
                        <option value="1 BHK">1 BHK</option>
                        <option value="2 BHK">2 BHK</option>
                        <option value="3 BHK">3 BHK</option>
                        <option value="4 BHK">4 BHK / Villa</option>
                    </select>

                    <button 
                        onClick={() => setShowMoreFilters(!showMoreFilters)} 
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors ${showMoreFilters ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                    >
                        {showMoreFilters ? "Hide Filters" : "+ More Filters"}
                    </button>
                </div>

                <div className="text-xs font-semibold text-gray-500">
                    Showing <span className="text-purple-600 font-bold">{filteredProperties.length}</span> matching properties
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                {viewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProperties.map(prop => {
                            const isSelected = selectedUnits.includes(prop.id);
                            const isInterested = interestedUnits.includes(prop.id);
                            return (
                                <div key={prop.id} className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col ${isSelected ? "border-purple-500 ring-2 ring-purple-100 shadow-md" : "border-gray-200 hover:border-purple-200 hover:shadow-sm"}`}>
                                    <div className="relative h-48 bg-gray-100">
                                        <img src={prop.image} alt={prop.name} className="w-full h-full object-cover" />
                                        <div className="absolute top-3 left-3 flex items-center gap-2">
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected}
                                                onChange={() => toggleSelect(prop.id)}
                                                className="w-5 h-5 rounded accent-purple-600 cursor-pointer shadow"
                                            />
                                            <span className="bg-white/90 backdrop-blur text-gray-900 text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm">
                                                {prop.type}
                                            </span>
                                        </div>

                                        <button 
                                            onClick={() => toggleInterested(prop.id)}
                                            className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur transition-all ${isInterested ? "bg-red-500 text-white shadow-md" : "bg-white/80 text-gray-600 hover:bg-white"}`}
                                        >
                                            <Heart size={16} className={isInterested ? "fill-white" : ""} />
                                        </button>

                                        <div className="absolute bottom-3 left-3 bg-gray-900/80 backdrop-blur text-white text-xs font-bold px-3 py-1 rounded-lg">
                                            {prop.status}
                                        </div>
                                    </div>

                                    <div className="p-5 flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="font-bold text-gray-900 text-lg">{prop.name}</h3>
                                                <span className="text-base font-extrabold text-purple-700">{prop.price}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 flex items-center gap-1 mb-4">
                                                <MapPin size={14} className="text-gray-400" /> {prop.address}
                                            </p>

                                            <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-xl mb-4 border border-gray-100">
                                                <div>
                                                    <span className="text-gray-400 font-medium block">Total Units</span>
                                                    <span className="font-bold text-gray-800">{prop.totalUnits || "12"}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 font-medium block">Possession</span>
                                                    <span className="font-bold text-gray-800">{prop.yearBuilt || "Ready"}</span>
                                                </div>
                                            </div>

                                            <p className="text-xs text-gray-600 line-clamp-2 mb-4">{prop.description}</p>
                                        </div>

                                        <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                                            <Link 
                                                href={`/properties/${prop.id}`} 
                                                target="_blank"
                                                className="text-xs font-bold text-purple-600 hover:underline"
                                            >
                                                View Public Listing
                                            </Link>
                                            <button 
                                                onClick={() => toggleInterested(prop.id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isInterested ? "bg-red-50 text-red-600 border border-red-200" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                                            >
                                                {isInterested ? "Marked Interested" : "+ Mark Interested"}
                                            </button>
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
                                    <th className="p-4">Location</th>
                                    <th className="p-4">Category</th>
                                    <th className="p-4">Price / Agreement</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {filteredProperties.map(prop => {
                                    const isSelected = selectedUnits.includes(prop.id);
                                    const isInterested = interestedUnits.includes(prop.id);
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
                                                    <img src={prop.image} className="w-10 h-10 rounded-lg object-cover" alt="" />
                                                    <div>
                                                        <p>{prop.name}</p>
                                                        <p className="text-xs font-normal text-gray-400">{prop.floors || "10"} Floors • {prop.parkingSpots || "20"} Parking</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-gray-600 text-xs">{prop.address}</td>
                                            <td className="p-4"><span className="bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-0.5 rounded">{prop.type}</span></td>
                                            <td className="p-4 font-extrabold text-purple-700">{prop.price}</td>
                                            <td className="p-4"><span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded border border-emerald-100">{prop.status}</span></td>
                                            <td className="p-4 text-right">
                                                <button 
                                                    onClick={() => toggleInterested(prop.id)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${isInterested ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                                                >
                                                    {isInterested ? "Interested" : "Mark Interest"}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

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

                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 text-xs font-mono text-gray-700 space-y-2">
                                <p className="font-bold text-gray-900">Preview Message:</p>
                                <p className="text-gray-600">Hi {lead.name}, based on your requirement for {lead.project || "properties"}, here are {selectedUnits.length} hand-picked units from Spaceezy:</p>
                                {selectedUnits.map(id => {
                                    const p = properties.find(x => x.id === id);
                                    return <p key={id} className="text-purple-700 font-semibold">• {p?.name} ({p?.price})</p>;
                                })}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                            <button onClick={() => setShareModalOpen(false)} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">
                                Cancel
                            </button>
                            <button 
                                onClick={handleShare} 
                                className="px-5 py-2 text-xs font-bold bg-green-600 text-white rounded-xl hover:bg-green-700 shadow-sm"
                            >
                                {shareSuccess ? "Sent Successfully!" : "Send Proposal"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
