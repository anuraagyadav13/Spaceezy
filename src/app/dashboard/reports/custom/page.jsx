"use client";
import { useState } from "react";
import { 
    BarChart3, PieChart, Table as TableIcon, Download, Save, 
    Play, Filter, RefreshCw, Layers, CheckCircle2, Bookmark
} from "lucide-react";

const REPORT_TYPES = [
    { id: "leads", name: "Leads & Acquisition", desc: "Analyze lead distribution by source, stage, and channel." },
    { id: "site-visits", name: "Site Visit Outcomes", desc: "Track scheduled vs completed site visits by project." },
    { id: "sales", name: "Sales & Conversions", desc: "Evaluate deal velocity, talk time, and team performance." },
    { id: "inventory", name: "Inventory Occupancy", desc: "Analyze available vs reserved vs booked units." }
];

const DIMENSIONS = ["Lead Source", "Lead Stage", "Sales Employee", "Project Name", "Month / Date"];
const METRICS = ["Total Count", "Conversion Rate (%)", "Talk Time (mins)", "Agreement Value (₹)", "Site Visits Conducted"];

export default function CustomReportBuilder() {
    const [reportType, setReportType] = useState("leads");
    const [dimension, setDimension] = useState("Lead Source");
    const [selectedMetrics, setSelectedMetrics] = useState(["Total Count", "Conversion Rate (%)"]);
    const [dateRange, setDateRange] = useState("This Month");
    const [viewFormat, setViewFormat] = useState("bar");
    const [savedReports, setSavedReports] = useState([
        { id: "1", name: "Q3 Source Conversion Analysis", type: "leads", date: "2026-09-28" },
        { id: "2", name: "Monthly Site Visit Performance", type: "site-visits", date: "2026-09-25" }
    ]);
    const [reportSaved, setReportSaved] = useState(false);
    const [reportTitle, setReportTitle] = useState("Custom Analytics View");

    const toggleMetric = (m) => {
        setSelectedMetrics(prev => 
            prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
        );
    };

    const handleSaveReport = () => {
        setSavedReports(prev => [
            ...prev,
            { id: String(Date.now()), name: reportTitle, type: reportType, date: new Date().toISOString().slice(0, 10) }
        ]);
        setReportSaved(true);
        setTimeout(() => setReportSaved(false), 2000);
    };

    // Mock chart data points based on selection
    const mockData = [
        { label: "Website", count: 42, conversion: "18.5%", value: "₹4.2 Cr" },
        { label: "Google Ads", count: 35, conversion: "14.2%", value: "₹3.8 Cr" },
        { label: "Referrals", count: 28, conversion: "24.0%", value: "₹5.1 Cr" },
        { label: "Portal Leads", count: 19, conversion: "9.5%", value: "₹1.9 Cr" }
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 py-5 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Custom Report Builder</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Build custom analytical reports with metric/dimension combinations.</p>
                </div>
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleSaveReport}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 shadow-sm"
                    >
                        <Save size={14} /> {reportSaved ? "Saved!" : "Save Report"}
                    </button>
                    <button 
                        onClick={() => alert("Report exported to CSV!")}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 shadow-sm"
                    >
                        <Download size={14} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Main Layout Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* LEFT CONTROLS PANEL */}
                    <div className="space-y-6">
                        {/* 1. Report Type Selection */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">1. Select Report Type</h3>
                            <div className="space-y-2">
                                {REPORT_TYPES.map(rt => (
                                    <div 
                                        key={rt.id}
                                        onClick={() => setReportType(rt.id)}
                                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                                            reportType === rt.id ? "border-purple-600 bg-purple-50/60 shadow-sm" : "border-gray-100 hover:border-gray-200"
                                        }`}
                                    >
                                        <p className="font-bold text-sm text-gray-900">{rt.name}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{rt.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 2. Grouping Dimension */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">2. Dimension / Grouping</h3>
                            <select 
                                value={dimension}
                                onChange={e => setDimension(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-800"
                            >
                                {DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>

                        {/* 3. Metrics Picker */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">3. Select Metrics</h3>
                            <div className="space-y-2">
                                {METRICS.map(m => {
                                    const isSel = selectedMetrics.includes(m);
                                    return (
                                        <button 
                                            key={m}
                                            onClick={() => toggleMetric(m)}
                                            className={`w-full text-left p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-colors ${
                                                isSel ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-100 text-gray-600 hover:bg-gray-50"
                                            }`}
                                        >
                                            <span>{m}</span>
                                            {isSel && <CheckCircle2 size={16} className="text-purple-600" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PREVIEW CANVAS */}
                    <div className="lg:col-span-2 space-y-6">
                        
                        {/* Title & View Controls */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                            <input 
                                type="text" 
                                value={reportTitle} 
                                onChange={e => setReportTitle(e.target.value)}
                                className="text-lg font-bold text-gray-900 border-b border-transparent hover:border-gray-200 focus:border-purple-500 focus:outline-none px-1 py-0.5"
                            />
                            
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-400">View:</span>
                                <div className="bg-gray-100 p-1 rounded-xl flex gap-1">
                                    <button 
                                        onClick={() => setViewFormat("bar")}
                                        className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1 ${viewFormat === "bar" ? "bg-white shadow text-purple-600" : "text-gray-500"}`}
                                    >
                                        <BarChart3 size={14} /> Bar
                                    </button>
                                    <button 
                                        onClick={() => setViewFormat("table")}
                                        className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1 ${viewFormat === "table" ? "bg-white shadow text-purple-600" : "text-gray-500"}`}
                                    >
                                        <TableIcon size={14} /> Table
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Interactive Visualization Canvas */}
                        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                            <div className="flex justify-between items-center text-xs font-bold text-gray-400 border-b pb-4">
                                <span>Previewing {reportType.toUpperCase()} breakdown by {dimension}</span>
                                <span className="text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full">{dateRange}</span>
                            </div>

                            {viewFormat === "bar" ? (
                                <div className="space-y-6 py-4">
                                    {mockData.map((d, idx) => (
                                        <div key={d.label} className="space-y-1.5">
                                            <div className="flex justify-between text-xs font-bold text-gray-700">
                                                <span>{d.label}</span>
                                                <span className="text-purple-700">{d.count} Leads ({d.conversion})</span>
                                            </div>
                                            <div className="w-full h-3.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full" 
                                                    style={{ width: `${(d.count / 45) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b bg-gray-50 font-bold text-gray-500">
                                            <th className="p-3">{dimension}</th>
                                            <th className="p-3">Count</th>
                                            <th className="p-3">Conversion</th>
                                            <th className="p-3">Total Agreement Value</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 font-semibold">
                                        {mockData.map(d => (
                                            <tr key={d.label} className="hover:bg-gray-50">
                                                <td className="p-3 text-gray-900 font-bold">{d.label}</td>
                                                <td className="p-3">{d.count}</td>
                                                <td className="p-3 text-emerald-600">{d.conversion}</td>
                                                <td className="p-3 text-purple-700">{d.value}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Saved Reports Library */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 text-xs font-extrabold text-gray-400 uppercase tracking-wider">
                                <Bookmark size={14} className="text-purple-600" /> Saved Report Templates
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {savedReports.map(sr => (
                                    <div key={sr.id} className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-bold text-gray-900">{sr.name}</p>
                                            <p className="text-[10px] text-gray-400">Created: {sr.date}</p>
                                        </div>
                                        <button className="text-xs font-bold text-purple-600 hover:underline">Reopen</button>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
