"use client";
import { useState, useEffect } from "react";
import { fetchProjects } from "../../../../lib/api/projects";
import { fetchProperties } from "../../../../lib/api/properties";
import { 
    Building2, Layers, Search, Filter, Grid as GridIcon, List as ListIcon, 
    CheckCircle2, AlertCircle, Bookmark, ShieldAlert, ArrowLeft
} from "lucide-react";
import Link from "next/link";

const STATUS_COLORS = {
    "Available": "bg-emerald-500 text-white",
    "On Hold": "bg-amber-500 text-white",
    "Reserved": "bg-purple-600 text-white",
    "Booked": "bg-blue-600 text-white",
    "Sold": "bg-gray-800 text-white",
    "Unavailable": "bg-red-500 text-white"
};

export default function InventoryGridPage() {
    const [projects, setProjects] = useState([]);
    const [properties, setProperties] = useState([]);
    const [selectedProject, setSelectedProject] = useState("ALL");
    const [selectedTower, setSelectedTower] = useState("Tower A");
    const [selectedStatus, setSelectedStatus] = useState("ALL");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedUnits, setSelectedUnits] = useState([]);

    useEffect(() => {
        const load = async () => {
            try {
                const [projData, propData] = await Promise.all([
                    fetchProjects(),
                    fetchProperties()
                ]);
                setProjects(projData);
                setProperties(propData);
            } catch (err) {
                console.error("Failed to load grid data", err);
            }
        };
        load();
    }, []);

    // Floor structure mock generator for grid
    const floors = [
        { floorNum: "Floor 12", units: [{ id: "U-1201", code: "A-1201", status: "Available", price: "₹1.4 Cr" }, { id: "U-1202", code: "A-1202", status: "Booked", price: "₹1.45 Cr" }, { id: "U-1203", code: "A-1203", status: "On Hold", price: "₹1.5 Cr" }, { id: "U-1204", code: "A-1204", status: "Reserved", price: "₹1.42 Cr" }] },
        { floorNum: "Floor 11", units: [{ id: "U-1101", code: "A-1101", status: "Available", price: "₹1.38 Cr" }, { id: "U-1102", code: "A-1102", status: "Sold", price: "₹1.40 Cr" }, { id: "U-1103", code: "A-1103", status: "Available", price: "₹1.41 Cr" }, { id: "U-1104", code: "A-1104", status: "Available", price: "₹1.39 Cr" }] },
        { floorNum: "Floor 10", units: [{ id: "U-1001", code: "A-1001", status: "Booked", price: "₹1.35 Cr" }, { id: "U-1002", code: "A-1002", status: "Booked", price: "₹1.36 Cr" }, { id: "U-1003", code: "A-1003", status: "Available", price: "₹1.37 Cr" }, { id: "U-1004", code: "A-1004", status: "On Hold", price: "₹1.35 Cr" }] },
    ];

    const toggleSelect = (id) => {
        setSelectedUnits(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 py-5 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Inventory Matrix & Availability Grid</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Real-time floor-wise inventory status, holds, reservations and bookings.</p>
                </div>

                <div className="flex items-center gap-2">
                    <Link 
                        href="/dashboard/inventory/units/quick-add"
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:opacity-95 shadow-sm"
                    >
                        + Quick Add Unit
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
                        onChange={e => setSelectedProject(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-800"
                    >
                        <option value="ALL">All Projects</option>
                        {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>

                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider ml-2">
                        <Layers size={14} /> Tower:
                    </div>
                    <select 
                        value={selectedTower}
                        onChange={e => setSelectedTower(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-800"
                    >
                        <option>Tower A</option>
                        <option>Tower B</option>
                        <option>Tower C</option>
                    </select>

                    <select 
                        value={selectedStatus}
                        onChange={e => setSelectedStatus(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-800"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="Available">Available Only</option>
                        <option value="On Hold">On Hold Only</option>
                        <option value="Reserved">Reserved Only</option>
                        <option value="Booked">Booked Only</option>
                    </select>
                </div>

                {/* Status Legend */}
                <div className="flex items-center gap-3 text-xs font-bold">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Available</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Hold</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span> Reserved</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Booked</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-800"></span> Sold</span>
                </div>
            </div>

            {/* Grid Canvas */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                <div className="max-w-6xl mx-auto space-y-6">
                    {floors.map(fl => (
                        <div key={fl.floorNum} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                            <div className="flex justify-between items-center border-b pb-3">
                                <h3 className="font-bold text-gray-900 text-sm">{fl.floorNum} Matrix</h3>
                                <span className="text-xs font-bold text-gray-400">{fl.units.length} Units</span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {fl.units.map(u => {
                                    const isSel = selectedUnits.includes(u.id);
                                    const badgeBg = STATUS_COLORS[u.status] || "bg-gray-500 text-white";
                                    return (
                                        <div 
                                            key={u.id}
                                            onClick={() => toggleSelect(u.id)}
                                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                                                isSel ? "border-purple-600 bg-purple-50/60 shadow-md" : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-extrabold text-gray-900 text-base">{u.code}</span>
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${badgeBg}`}>
                                                    {u.status}
                                                </span>
                                            </div>
                                            <p className="text-xs font-bold text-purple-700">{u.price}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
