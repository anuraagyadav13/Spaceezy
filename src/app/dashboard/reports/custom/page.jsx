"use client";
import { useEffect, useMemo, useState } from "react";
import {
    BarChart3, Table as TableIcon, Download, Save,
    CheckCircle2, Bookmark, Loader2
} from "lucide-react";
import { fetchLeads } from "../../../../lib/api/leads";
import { fetchBookings } from "../../../../lib/api/bookings";
import { fetchUsers } from "../../../../lib/api/users";
import { fetchProjects } from "../../../../lib/api/projects";
import { fetchSiteVisits } from "../../../../lib/api/siteVisits";
import { showToast } from "../../../../lib/toast";

const REPORT_TYPES = [
    { id: "leads", name: "Leads & Acquisition", desc: "Analyze lead distribution by source, stage, and channel." },
    { id: "site-visits", name: "Site Visit Outcomes", desc: "Track scheduled vs completed site visits by project." },
    { id: "sales", name: "Sales & Conversions", desc: "Evaluate deal velocity and booking conversion." },
    { id: "inventory", name: "Inventory Occupancy", desc: "Analyze available vs reserved vs booked units." }
];

const DIMENSIONS = ["Lead Source", "Lead Stage", "Sales Employee", "Project Name", "Month / Date"];
const METRICS = ["Total Count", "Conversion Rate (%)", "Site Visits Conducted", "Agreement Value (₹)"];
const DATE_RANGES = ["This Month", "Last 30 Days", "All Time"];
const SAVED_REPORTS_KEY = "spaceezy.customReports";

const groupKeyForLead = (lead, dimension, usersById, projectsById) => {
    switch (dimension) {
        case "Lead Source":
            return lead.source || "Unknown";
        case "Lead Stage":
            return lead.stage || "Unknown";
        case "Sales Employee": {
            const id = typeof lead.assignedTo === "object" ? lead.assignedTo?.id : lead.assignedTo;
            if (id && usersById[id]) return usersById[id].name;
            if (typeof lead.assignedTo === "object" && lead.assignedTo?.name) return lead.assignedTo.name;
            return "Unassigned";
        }
        case "Project Name": {
            const id = typeof lead.projectId === "object" ? lead.projectId?.id : lead.projectId;
            if (id && projectsById[id]) return projectsById[id].name;
            return "No Project";
        }
        case "Month / Date": {
            if (!lead.createdAt) return "Unknown";
            return new Date(lead.createdAt).toLocaleString("en-IN", { month: "short", year: "numeric" });
        }
        default:
            return "Unknown";
    }
};

const formatRupees = (n) => {
    if (!n) return "₹0";
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    return `₹${Number(n).toLocaleString("en-IN")}`;
};

export default function CustomReportBuilder() {
    const [reportType, setReportType] = useState("leads");
    const [dimension, setDimension] = useState("Lead Source");
    const [selectedMetrics, setSelectedMetrics] = useState(["Total Count", "Conversion Rate (%)"]);
    const [dateRange, setDateRange] = useState("All Time");
    const [viewFormat, setViewFormat] = useState("bar");
    const [savedReports, setSavedReports] = useState([]);
    const [reportSaved, setReportSaved] = useState(false);
    const [reportTitle, setReportTitle] = useState("Custom Analytics View");
    const [loading, setLoading] = useState(true);

    const [leads, setLeads] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [siteVisits, setSiteVisits] = useState([]);
    const [usersById, setUsersById] = useState({});
    const [projectsById, setProjectsById] = useState({});

    useEffect(() => {
        // Deferred so the initial (server) render stays consistent and the
        // compiler's setState-in-effect rule is respected.
        const t = setTimeout(() => {
            try {
                const stored = JSON.parse(localStorage.getItem(SAVED_REPORTS_KEY) || "[]");
                if (Array.isArray(stored)) setSavedReports(stored);
            } catch { /* ignore corrupt storage */ }
        }, 0);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [leadsRes, bookingsRes, usersRes, projectsRes, visitsRes] = await Promise.all([
                    fetchLeads({ limit: 1000 }),
                    fetchBookings({ limit: 1000 }),
                    fetchUsers({ limit: 1000 }),
                    fetchProjects({ limit: 1000 }),
                    fetchSiteVisits({ limit: 1000 })
                ]);
                const leadRows = leadsRes.leads || leadsRes.data?.leads || leadsRes || [];
                setLeads(Array.isArray(leadRows) ? leadRows : []);
                const bookingRows = bookingsRes.bookings || bookingsRes.data?.bookings || bookingsRes || [];
                setBookings(Array.isArray(bookingRows) ? bookingRows : []);
                const userRows = usersRes.users || usersRes.data?.users || usersRes || [];
                setUsersById(Object.fromEntries((Array.isArray(userRows) ? userRows : []).map((u) => [u.id, u])));
                const projectRows = projectsRes.projects || projectsRes.data?.projects || projectsRes || [];
                setProjectsById(Object.fromEntries((Array.isArray(projectRows) ? projectRows : []).map((p) => [p.id, p])));
                const visitRows = visitsRes.siteVisits || visitsRes.visits || visitsRes.data?.siteVisits || visitsRes || [];
                setSiteVisits(Array.isArray(visitRows) ? visitRows : []);
            } catch (err) {
                showToast(`Failed to load report data: ${err.message}`, "error");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const inRange = (iso) => {
        if (dateRange === "All Time") return true;
        if (!iso) return false;
        const d = new Date(iso);
        const now = new Date();
        if (dateRange === "This Month") {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        return now - d <= 30 * 24 * 60 * 60 * 1000;
    };

    const rows = useMemo(() => {
        const filteredLeads = leads.filter((l) => inRange(l.createdAt));
        const leadIds = new Set(filteredLeads.map((l) => l.id));
        const filteredVisits = siteVisits.filter((v) => leadIds.has(v.leadId) && inRange(v.createdAt));
        const filteredBookings = bookings.filter((b) => leadIds.has(b.leadId) && inRange(b.createdAt));

        const groups = new Map();
        for (const lead of filteredLeads) {
            const key = groupKeyForLead(lead, dimension, usersById, projectsById);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(lead);
        }

        return [...groups.entries()].map(([label, groupLeads]) => {
            const groupIds = new Set(groupLeads.map((l) => l.id));
            const booked = groupLeads.filter((l) => l.stage === "BOOKING").length;
            const agreementValue = filteredBookings
                .filter((b) => groupIds.has(b.leadId))
                .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
            const visits = filteredVisits.filter((v) => groupIds.has(v.leadId)).length;
            return {
                label,
                count: groupLeads.length,
                conversion: groupLeads.length ? Math.round((booked / groupLeads.length) * 1000) / 10 : 0,
                agreementValue,
                visits
            };
        }).sort((a, b) => b.count - a.count);
    }, [leads, bookings, siteVisits, usersById, projectsById, dimension, dateRange]);

    const maxCount = Math.max(1, ...rows.map((r) => r.count));

    const toggleMetric = (m) => {
        setSelectedMetrics(prev =>
            prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
        );
    };

    const persistSaved = (list) => {
        setSavedReports(list);
        try { localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(list)); } catch { /* storage full */ }
    };

    const handleSaveReport = () => {
        persistSaved([
            ...savedReports,
            {
                id: String(Date.now()),
                name: reportTitle,
                type: reportType,
                dimension,
                metrics: selectedMetrics,
                dateRange,
                date: new Date().toISOString().slice(0, 10)
            }
        ]);
        setReportSaved(true);
        setTimeout(() => setReportSaved(false), 2000);
    };

    const reopenReport = (sr) => {
        setReportTitle(sr.name);
        setReportType(sr.type || "leads");
        if (sr.dimension) setDimension(sr.dimension);
        if (Array.isArray(sr.metrics)) setSelectedMetrics(sr.metrics);
        if (sr.dateRange) setDateRange(sr.dateRange);
    };

    const exportCsv = () => {
        if (rows.length === 0) {
            showToast("Nothing to export for the current selection", "error");
            return;
        }
        const header = [dimension, ...selectedMetrics];
        const body = rows.map((r) => [
            r.label,
            ...selectedMetrics.map((m) => {
                if (m === "Total Count") return r.count;
                if (m === "Conversion Rate (%)") return r.conversion;
                if (m === "Agreement Value (₹)") return r.agreementValue;
                if (m === "Site Visits Conducted") return r.visits;
                return "";
            })
        ]);
        const csv = [header, ...body]
            .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `spaceezy-report-${dimension.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 py-5 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Custom Report Builder</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Build reports from live lead, visit and booking data — no fabricated numbers.</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSaveReport}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 shadow-sm"
                    >
                        <Save size={14} /> {reportSaved ? "Saved!" : "Save Report"}
                    </button>
                    <button
                        onClick={exportCsv}
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

                        {/* 4. Date Range */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">4. Date Range</h3>
                            <select
                                value={dateRange}
                                onChange={e => setDateRange(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-800"
                            >
                                {DATE_RANGES.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
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

                            {loading ? (
                                <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
                                    <Loader2 size={16} className="animate-spin" /> Loading live data…
                                </div>
                            ) : rows.length === 0 ? (
                                <p className="text-sm text-gray-400 py-8 text-center">No data for the current selection.</p>
                            ) : viewFormat === "bar" ? (
                                <div className="space-y-6 py-4">
                                    {rows.map((d) => (
                                        <div key={d.label} className="space-y-1.5">
                                            <div className="flex justify-between text-xs font-bold text-gray-700">
                                                <span>{d.label}</span>
                                                <span className="text-purple-700">
                                                    {d.count} Leads
                                                    {selectedMetrics.includes("Conversion Rate (%)") ? ` (${d.conversion}%)` : ""}
                                                    {selectedMetrics.includes("Agreement Value (₹)") ? ` · ${formatRupees(d.agreementValue)}` : ""}
                                                </span>
                                            </div>
                                            <div className="w-full h-3.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full"
                                                    style={{ width: `${(d.count / maxCount) * 100}%` }}
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
                                            {selectedMetrics.includes("Total Count") && <th className="p-3">Count</th>}
                                            {selectedMetrics.includes("Conversion Rate (%)") && <th className="p-3">Conversion</th>}
                                            {selectedMetrics.includes("Site Visits Conducted") && <th className="p-3">Site Visits</th>}
                                            {selectedMetrics.includes("Agreement Value (₹)") && <th className="p-3">Total Agreement Value</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 font-semibold">
                                        {rows.map(d => (
                                            <tr key={d.label} className="hover:bg-gray-50">
                                                <td className="p-3 text-gray-900 font-bold">{d.label}</td>
                                                {selectedMetrics.includes("Total Count") && <td className="p-3">{d.count}</td>}
                                                {selectedMetrics.includes("Conversion Rate (%)") && <td className="p-3 text-emerald-600">{d.conversion}%</td>}
                                                {selectedMetrics.includes("Site Visits Conducted") && <td className="p-3">{d.visits}</td>}
                                                {selectedMetrics.includes("Agreement Value (₹)") && <td className="p-3 text-purple-700">{formatRupees(d.agreementValue)}</td>}
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
                            {savedReports.length === 0 ? (
                                <p className="text-xs text-gray-400">No saved reports yet — configure a view and hit Save Report.</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {savedReports.map(sr => (
                                        <div key={sr.id} className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-bold text-gray-900">{sr.name}</p>
                                                <p className="text-[10px] text-gray-400">Created: {sr.date}</p>
                                            </div>
                                            <button onClick={() => reopenReport(sr)} className="text-xs font-bold text-purple-600 hover:underline">Reopen</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
