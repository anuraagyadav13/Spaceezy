"use client";
import { useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import {
    BarChart3, Users, Home, TrendingUp, Calendar,
    CheckCircle2, Download, Save, Bookmark,
    RefreshCw, Table as TableIcon, Loader2, Layers,
    DollarSign, ChevronRight
} from "lucide-react";
import { fetchLeads } from "../../../lib/api/leads";
import { fetchBookings } from "../../../lib/api/bookings";
import { fetchProperties } from "../../../lib/api/properties";
import { fetchProjects } from "../../../lib/api/projects";
import { fetchUsers } from "../../../lib/api/users";
import { fetchSiteVisits } from "../../../lib/api/siteVisits";
import { useProductivity } from "../../../features/communication/hooks/useCommunication";
import { showToast } from "../../../lib/toast";

const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "SITE VISIT", "NEGOTIATION", "BOOKING"];
const PAYMENT_STATES = ["COMPLETED", "PARTIAL", "PENDING"];
const PAYMENT_COLORS = {
    COMPLETED: "bg-emerald-500",
    PARTIAL: "bg-amber-400",
    PENDING: "bg-gray-300"
};

const TABS = [
    { id: "overview", label: "Executive Overview", icon: BarChart3 },
    { id: "leads", label: "Leads & Acquisition", icon: Users },
    { id: "sales", label: "Sales & Productivity", icon: TrendingUp },
    { id: "site-visits", label: "Site Visits", icon: Calendar },
    { id: "bookings", label: "Bookings & Revenue", icon: DollarSign },
    { id: "inventory", label: "Inventory Occupancy", icon: Home },
    { id: "custom", label: "Custom Builder", icon: Layers }
];

const REPORT_TYPES = [
    { id: "leads", name: "Leads & Acquisition", desc: "Analyze lead distribution by source, stage, and channel." },
    { id: "site-visits", name: "Site Visit Outcomes", desc: "Track scheduled vs completed site visits by project." },
    { id: "sales", name: "Sales & Conversions", desc: "Evaluate deal velocity and booking conversion." },
    { id: "inventory", name: "Inventory Occupancy", desc: "Analyze available vs reserved vs booked units." }
];

const DIMENSIONS = ["Lead Source", "Lead Stage", "Sales Employee", "Project Name", "Month / Date"];
const METRICS = ["Total Count", "Conversion Rate (%)", "Site Visits Conducted", "Agreement Value (₹)"];
const DATE_RANGES = ["This Month", "Last 30 Days", "All Time"];
const SAVED_REPORTS_KEY = "Spaceezy.customReports";

const formatRupees = (n) => {
    if (!n) return "₹0";
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    return `₹${Number(n).toLocaleString("en-IN")}`;
};

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

function ReportsPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const rawTab = searchParams.get("tab");
    const activeTab = TABS.some(t => t.id === rawTab) ? rawTab : "overview";

    const handleTabChange = (tabId) => {
        const params = new URLSearchParams(window.location.search);
        params.set("tab", tabId);
        router.replace(`/dashboard/reports?${params.toString()}`, { scroll: false });
    };

    // Global Dataset Query via React Query
    const reportsQuery = useQuery({
        queryKey: ["dashboard-reports"],
        queryFn: async () => {
            const [leadsRes, bookingsRes, propsRes, projsRes, empsRes, visitsRes] = await Promise.all([
                fetchLeads({ limit: 1000 }).catch(() => ({ leads: [] })),
                fetchBookings({ limit: 1000 }).catch(() => ({ bookings: [] })),
                fetchProperties({ limit: 1000 }).catch(() => ({ properties: [] })),
                fetchProjects({ limit: 1000 }).catch(() => ({ projects: [] })),
                fetchUsers({ limit: 1000 }).catch(() => ({ users: [] })),
                fetchSiteVisits({ limit: 1000 }).catch(() => ({ siteVisits: [] }))
            ]);

            return {
                leads: leadsRes.leads || leadsRes.data?.leads || leadsRes || [],
                bookings: bookingsRes.bookings || bookingsRes.data?.bookings || bookingsRes || [],
                properties: propsRes.properties || propsRes.data?.properties || propsRes || [],
                projects: projsRes.projects || projsRes.data?.projects || projsRes || [],
                employees: empsRes.users || empsRes.data?.users || empsRes || [],
                siteVisits: visitsRes.siteVisits || visitsRes.visits || visitsRes.data?.siteVisits || visitsRes || []
            };
        },
        retry: 1
    });

    const loading = reportsQuery.isLoading;
    const leads = reportsQuery.data?.leads || [];
    const bookings = reportsQuery.data?.bookings || [];
    const properties = reportsQuery.data?.properties || [];
    const projects = reportsQuery.data?.projects || [];
    const employees = reportsQuery.data?.employees || [];
    const siteVisits = reportsQuery.data?.siteVisits || [];

    // Sales / Productivity from communication hook
    const { data: productivityData, isLoading: prodLoading, refetch: refetchProductivity } = useProductivity();

    const handleRefreshAll = () => {
        reportsQuery.refetch();
        refetchProductivity();
        showToast("Reports & Analytics data refreshed");
    };

    // Mappings
    const usersById = useMemo(() => {
        return Object.fromEntries(employees.map(u => [u.id, u]));
    }, [employees]);

    const projectsById = useMemo(() => {
        return Object.fromEntries(projects.map(p => [p.id, p]));
    }, [projects]);

    // Derived High-Level Metrics
    const totalLeads = leads.length;
    const bookedLeads = leads.filter(l => l.stage === "BOOKING").length;
    const conversionRate = totalLeads ? Math.round((bookedLeads / totalLeads) * 100) : 0;

    const totalUnits = properties.reduce((sum, p) => sum + (p.totalUnits || 0), 0);
    const occupiedUnits = properties.reduce((sum, p) => sum + (p.occupiedUnits || 0), 0);
    const occupancyRate = totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    const totalAgreementValue = useMemo(() => {
        return bookings.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    }, [bookings]);

    const completedRevenue = useMemo(() => {
        return bookings
            .filter(b => b.paymentStatus === "COMPLETED")
            .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    }, [bookings]);

    // Site Visit aggregates
    const visitStats = useMemo(() => {
        const byStatus = (status) => siteVisits.filter(v => v.status === status);
        const bookedLeadIds = new Set(bookings.map(b => b.leadId).filter(Boolean));
        const converted = siteVisits.filter(v => v.leadId && bookedLeadIds.has(v.leadId)).length;
        return {
            scheduled: byStatus("SCHEDULED").length,
            conducted: byStatus("COMPLETED").length,
            noShow: byStatus("NO_SHOW").length,
            cancelled: byStatus("CANCELLED").length,
            converted,
            rate: siteVisits.length ? Math.round((converted / siteVisits.length) * 100) : 0
        };
    }, [siteVisits, bookings]);

    // Lead Funnel & Source aggregates
    const { stageStats, sourceStats } = useMemo(() => {
        const countBy = (keyFn) => {
            const map = new Map();
            for (const lead of leads) {
                const key = keyFn(lead) || "Direct / Unknown";
                map.set(key, (map.get(key) || 0) + 1);
            }
            return [...map.entries()].sort((a, b) => b[1] - a[1]);
        };
        return {
            stageStats: countBy(l => l.stage),
            sourceStats: countBy(l => l.source)
        };
    }, [leads]);

    // Team Leaderboard
    const leaderboard = useMemo(() => {
        return employees
            .map(emp => ({
                ...emp,
                leadCount: leads.filter(l => l.assignedTo === emp.id || l.assignedTo?.id === emp.id).length
            }))
            .sort((a, b) => b.leadCount - a.leadCount);
    }, [employees, leads]);

    // Custom Builder State
    const [reportType, setReportType] = useState("leads");
    const [dimension, setDimension] = useState("Lead Source");
    const [selectedMetrics, setSelectedMetrics] = useState(["Total Count", "Conversion Rate (%)"]);
    const [dateRange, setDateRange] = useState("All Time");
    const [viewFormat, setViewFormat] = useState("bar");
    const [savedReports, setSavedReports] = useState(() => {
        if (typeof window === "undefined") return [];
        try {
            const stored = JSON.parse(localStorage.getItem(SAVED_REPORTS_KEY) || "[]");
            return Array.isArray(stored) ? stored : [];
        } catch {
            return [];
        }
    });
    const [reportSaved, setReportSaved] = useState(false);
    const [reportTitle, setReportTitle] = useState("Custom Analytics View");

    const customRows = useMemo(() => {
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

        const filteredLeads = leads.filter(l => inRange(l.createdAt));
        const leadIds = new Set(filteredLeads.map(l => l.id));
        const filteredVisits = siteVisits.filter(v => leadIds.has(v.leadId) && inRange(v.createdAt));
        const filteredBookings = bookings.filter(b => leadIds.has(b.leadId) && inRange(b.createdAt));

        const groups = new Map();
        for (const lead of filteredLeads) {
            const key = groupKeyForLead(lead, dimension, usersById, projectsById);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(lead);
        }

        return [...groups.entries()].map(([label, groupLeads]) => {
            const groupIds = new Set(groupLeads.map(l => l.id));
            const booked = groupLeads.filter(l => l.stage === "BOOKING").length;
            const agreementValue = filteredBookings
                .filter(b => groupIds.has(b.leadId))
                .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
            const visits = filteredVisits.filter(v => groupIds.has(v.leadId)).length;
            return {
                label,
                count: groupLeads.length,
                conversion: groupLeads.length ? Math.round((booked / groupLeads.length) * 1000) / 10 : 0,
                agreementValue,
                visits
            };
        }).sort((a, b) => b.count - a.count);
    }, [leads, bookings, siteVisits, usersById, projectsById, dimension, dateRange]);

    const maxCustomCount = Math.max(1, ...customRows.map(r => r.count));

    const toggleMetric = (m) => {
        setSelectedMetrics(prev =>
            prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
        );
    };

    const persistSaved = (list) => {
        setSavedReports(list);
        try { localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
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
        if (activeTab === "custom") {
            if (customRows.length === 0) {
                showToast("Nothing to export for current custom selection", "error");
                return;
            }
            const header = [dimension, ...selectedMetrics];
            const body = customRows.map(r => [
                r.label,
                ...selectedMetrics.map(m => {
                    if (m === "Total Count") return r.count;
                    if (m === "Conversion Rate (%)") return r.conversion;
                    if (m === "Agreement Value (₹)") return r.agreementValue;
                    if (m === "Site Visits Conducted") return r.visits;
                    return "";
                })
            ]);
            downloadCsvFile(`Spaceezy-custom-${dimension.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, header, body);
        } else if (activeTab === "leads") {
            const header = ["Stage", "Lead Count", "Source", "Source Count"];
            const maxLen = Math.max(stageStats.length, sourceStats.length);
            const body = [];
            for (let i = 0; i < maxLen; i++) {
                body.push([
                    stageStats[i] ? stageStats[i][0] : "",
                    stageStats[i] ? stageStats[i][1] : "",
                    sourceStats[i] ? sourceStats[i][0] : "",
                    sourceStats[i] ? sourceStats[i][1] : ""
                ]);
            }
            downloadCsvFile("Spaceezy-leads-acquisition", header, body);
        } else if (activeTab === "bookings") {
            const header = ["Client", "Amount", "Payment Status", "Created At"];
            const body = bookings.map(b => [
                b.clientName || b.lead?.name || "Client",
                b.amount || 0,
                b.paymentStatus || "PENDING",
                b.createdAt || ""
            ]);
            downloadCsvFile("Spaceezy-bookings-revenue", header, body);
        } else {
            // General overview export
            const header = ["Metric", "Value"];
            const body = [
                ["Total Agreement Value", totalAgreementValue],
                ["Completed Collections", completedRevenue],
                ["Total Leads", totalLeads],
                ["Lead to Booking Conversion Rate (%)", `${conversionRate}%`],
                ["Total Bookings", bookings.length],
                ["Portfolio Occupancy Rate (%)", `${occupancyRate}%`],
                ["Total Units", totalUnits],
                ["Occupied Units", occupiedUnits],
                ["Site Visits Scheduled", visitStats.scheduled],
                ["Site Visits Conducted", visitStats.conducted],
                ["Site Visits Converted to Booking", visitStats.converted]
            ];
            downloadCsvFile("Spaceezy-overview-report", header, body);
        }
    };

    const downloadCsvFile = (filename, header, body) => {
        const csv = [header, ...body]
            .map(line => line.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("CSV downloaded successfully");
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Top Intelligence Header */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 py-5 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-purple-100 text-purple-700 rounded-lg">
                            <BarChart3 size={20} />
                        </span>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Reports &amp; Analytics</h1>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        Unified business intelligence hub: sales performance, lead acquisition, bookings revenue, site visits, and inventory.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefreshAll}
                        disabled={loading || prodLoading}
                        className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 shadow-xs transition-colors disabled:opacity-50"
                        title="Reload live data"
                    >
                        <RefreshCw size={14} className={loading || prodLoading ? "animate-spin text-purple-600" : ""} />
                        <span>Refresh</span>
                    </button>
                    <button
                        onClick={exportCsv}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 shadow-sm transition-colors"
                    >
                        <Download size={14} />
                        <span>Export CSV</span>
                    </button>
                </div>
            </div>

            {/* Quick KPI Strip across all categories */}
            <div className="bg-white/80 border-b border-gray-100 px-4 sm:px-8 py-3 shrink-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                            <DollarSign size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Total Agreement Value</p>
                            <p className="text-lg font-black text-gray-900 truncate">{formatRupees(totalAgreementValue)}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <Users size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Total Leads</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-lg font-black text-gray-900">{totalLeads}</p>
                                <span className="text-[11px] font-bold text-emerald-600">({conversionRate}% conv.)</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <Calendar size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Site Visits Done</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-lg font-black text-gray-900">{visitStats.conducted}</p>
                                <span className="text-[11px] font-bold text-purple-600">({visitStats.converted} booked)</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <Home size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Portfolio Occupancy</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-lg font-black text-gray-900">{occupancyRate}%</p>
                                <span className="text-[11px] font-bold text-gray-400">({occupiedUnits}/{totalUnits} units)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs Pill Bar */}
            <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-2 shrink-0 overflow-x-auto custom-scrollbar">
                <div className="flex items-center gap-2 min-w-max">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                                    isActive
                                        ? "bg-purple-600 text-white shadow-xs"
                                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                                }`}
                            >
                                <Icon size={15} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Main Interactive Tab Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar space-y-6">
                {loading && (
                    <div className="flex items-center justify-center p-12 text-sm text-gray-400 gap-2">
                        <Loader2 size={18} className="animate-spin text-purple-600" />
                        <span>Aggregating business reports from live database...</span>
                    </div>
                )}

                {!loading && (
                    <>
                        {/* ================= OVERVIEW TAB ================= */}
                        {activeTab === "overview" && (
                            <div className="space-y-6">
                                {/* Lead Pipeline & Revenue Split */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Lead Pipeline by Stage */}
                                    <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xs">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h3 className="font-bold text-base text-gray-900">Lead Pipeline Funnel</h3>
                                                <p className="text-xs text-gray-500">Distribution across active lead lifecycle stages</p>
                                            </div>
                                            <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg">
                                                {totalLeads} Total
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            {STAGES.map((stage) => {
                                                const count = leads.filter(l => l.stage === stage).length;
                                                const pct = totalLeads ? Math.round((count / totalLeads) * 100) : 0;
                                                return (
                                                    <div key={stage}>
                                                        <div className="flex justify-between text-xs text-gray-500 mb-1 font-semibold">
                                                            <span className="text-gray-700">{stage}</span>
                                                            <span className="text-purple-700">{count} ({pct}%)</span>
                                                        </div>
                                                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-500"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Bookings & Payments Breakdown */}
                                    <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xs flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between mb-6">
                                                <div>
                                                    <h3 className="font-bold text-base text-gray-900">Revenue Collections</h3>
                                                    <p className="text-xs text-gray-500">Breakdown by booking payment status</p>
                                                </div>
                                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                                                    {formatRupees(completedRevenue)} Collected
                                                </span>
                                            </div>

                                            <div className="flex flex-col gap-4">
                                                {PAYMENT_STATES.map((state) => {
                                                    const groupBookings = bookings.filter(b => b.paymentStatus === state);
                                                    const count = groupBookings.length;
                                                    const sum = groupBookings.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
                                                    const pct = bookings.length ? Math.round((count / bookings.length) * 100) : 0;
                                                    return (
                                                        <div key={state}>
                                                            <div className="flex justify-between text-xs text-gray-600 mb-1 font-semibold">
                                                                <span className="text-gray-800">{state}</span>
                                                                <span>{count} booking{count === 1 ? "" : "s"} · {formatRupees(sum)}</span>
                                                            </div>
                                                            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all duration-500 ${PAYMENT_COLORS[state]}`}
                                                                    style={{ width: `${pct}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {bookings.length === 0 && (
                                                    <p className="text-xs text-gray-400 py-4">No bookings recorded yet.</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-gray-500">
                                            <span>Agreement Total: <span className="text-purple-700">{formatRupees(totalAgreementValue)}</span></span>
                                            <button onClick={() => handleTabChange("bookings")} className="text-purple-600 hover:underline flex items-center gap-1">
                                                View booking ledger <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Site Visits & Team Leaderboard */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Site Visits summary */}
                                    <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xs space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-bold text-base text-gray-900">Site Visit Conversion</h3>
                                                <p className="text-xs text-gray-500">Visits conducted and downstream conversion to bookings</p>
                                            </div>
                                            <button onClick={() => handleTabChange("site-visits")} className="text-xs font-bold text-purple-600 hover:underline">
                                                Details
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                                                <p className="text-2xl font-black text-gray-900">{visitStats.scheduled}</p>
                                                <p className="text-[11px] font-bold text-gray-500">Scheduled</p>
                                            </div>
                                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                                                <p className="text-2xl font-black text-emerald-600">{visitStats.conducted}</p>
                                                <p className="text-[11px] font-bold text-gray-500">Conducted</p>
                                            </div>
                                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                                                <p className="text-2xl font-black text-purple-700">{visitStats.converted}</p>
                                                <p className="text-[11px] font-bold text-gray-500">Converted</p>
                                            </div>
                                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                                                <p className="text-2xl font-black text-orange-500">{visitStats.noShow}</p>
                                                <p className="text-[11px] font-bold text-gray-500">No Show</p>
                                            </div>
                                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                                                <p className="text-2xl font-black text-gray-400">{visitStats.cancelled}</p>
                                                <p className="text-[11px] font-bold text-gray-500">Cancelled</p>
                                            </div>
                                            <div className="p-3.5 bg-purple-50 rounded-2xl border border-purple-100">
                                                <p className="text-2xl font-black text-purple-700">{visitStats.rate}%</p>
                                                <p className="text-[11px] font-bold text-purple-600">Close Rate</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Team Leaderboard */}
                                    <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xs">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <h3 className="font-bold text-base text-gray-900">Team Leaderboard</h3>
                                                <p className="text-xs text-gray-500">Lead distribution across sales representatives</p>
                                            </div>
                                            <button onClick={() => handleTabChange("sales")} className="text-xs font-bold text-purple-600 hover:underline">
                                                Productivity
                                            </button>
                                        </div>

                                        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar">
                                            {leaderboard.map((emp, idx) => (
                                                <Link
                                                    key={emp.id}
                                                    href={`/dashboard/team/${emp.id}`}
                                                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors"
                                                >
                                                    <span className="text-xs font-bold text-gray-400 w-5">#{idx + 1}</span>
                                                    {emp.avatar ? (
                                                        <Image src={emp.avatar} alt={emp.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                                                            {emp.name?.[0] || "U"}
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold text-gray-900 truncate">{emp.name}</p>
                                                        <p className="text-[10px] text-gray-400 truncate">{emp.role}</p>
                                                    </div>
                                                    <span className="text-xs font-extrabold text-purple-700 shrink-0">
                                                        {emp.leadCount} leads
                                                    </span>
                                                </Link>
                                            ))}
                                            {leaderboard.length === 0 && (
                                                <p className="text-xs text-gray-400 py-4">No team members found.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ================= LEADS TAB ================= */}
                        {activeTab === "leads" && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">Leads by Stage</h2>
                                            <span className="text-xs font-bold text-purple-700">{totalLeads} Total</span>
                                        </div>
                                        <div className="space-y-3">
                                            {stageStats.length === 0 && <p className="text-xs text-gray-400">No leads recorded yet.</p>}
                                            {stageStats.map(([stage, count]) => {
                                                const pct = totalLeads ? Math.round((count / totalLeads) * 100) : 0;
                                                return (
                                                    <div key={stage} className="p-3 bg-gray-50 rounded-2xl border border-gray-100 space-y-1.5">
                                                        <div className="flex justify-between items-center text-xs font-bold">
                                                            <span className="text-gray-800">{stage}</span>
                                                            <span className="text-purple-700">{count} Leads ({pct}%)</span>
                                                        </div>
                                                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                                            <div className="h-full bg-purple-600 rounded-full" style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">Leads by Source Channel</h2>
                                            <span className="text-xs font-bold text-emerald-700">{sourceStats.length} Channels</span>
                                        </div>
                                        <div className="space-y-3">
                                            {sourceStats.length === 0 && <p className="text-xs text-gray-400">No lead sources recorded.</p>}
                                            {sourceStats.map(([source, count]) => {
                                                const pct = totalLeads ? Math.round((count / totalLeads) * 100) : 0;
                                                return (
                                                    <div key={source} className="p-3 bg-gray-50 rounded-2xl border border-gray-100 space-y-1.5">
                                                        <div className="flex justify-between items-center text-xs font-bold">
                                                            <span className="text-gray-800">{source}</span>
                                                            <span className="text-emerald-700">{count} Leads ({pct}%)</span>
                                                        </div>
                                                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ================= SALES & PRODUCTIVITY TAB ================= */}
                        {activeTab === "sales" && (
                            <div className="space-y-6">
                                {prodLoading ? (
                                    <div className="p-8 text-center text-sm text-gray-400">Loading productivity metrics...</div>
                                ) : (
                                    <>
                                        {/* Productivity Stat Grid */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            {[
                                                { label: "Calls (Period)", value: productivityData?.calls ?? 0, tone: "text-gray-900" },
                                                {
                                                    label: "Avg Talk Time",
                                                    value: productivityData && productivityData.connectedCalls > 0
                                                        ? `${Math.round((productivityData.callDurationSeconds || 0) / productivityData.connectedCalls)}s`
                                                        : "—",
                                                    tone: "text-purple-700"
                                                },
                                                { label: "Follow-ups Done", value: productivityData?.followupsCompleted ?? 0, tone: "text-emerald-600" },
                                                { label: "Overdue Follow-ups", value: productivityData?.overdueFollowups ?? 0, tone: "text-red-600" },
                                                { label: "Tasks Completed", value: productivityData?.tasksCompleted ?? 0, tone: "text-blue-600" },
                                                { label: "WhatsApp Sent", value: productivityData?.whatsappMessages ?? 0, tone: "text-green-600" },
                                                { label: "Site Visits", value: productivityData?.siteVisits ?? 0, tone: "text-indigo-600" },
                                                { label: "Quotations", value: productivityData?.quotations ?? 0, tone: "text-orange-600" }
                                            ].map((card) => (
                                                <div key={card.label} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{card.label}</p>
                                                    <p className={`text-2xl font-black mt-1 ${card.tone}`}>{card.value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Employee Productivity Breakdown */}
                                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">
                                                    Employee Performance &amp; Activity
                                                </h2>
                                                {productivityData?.needsAttention != null && (
                                                    <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-lg">
                                                        {productivityData.needsAttention} leads need attention
                                                    </span>
                                                )}
                                            </div>

                                            {productivityData?.employees && productivityData.employees.length > 0 ? (
                                                <div className="divide-y divide-gray-100">
                                                    {productivityData.employees.map((emp, idx) => (
                                                        <div key={emp.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                                                                    #{idx + 1}
                                                                </span>
                                                                <div>
                                                                    <p className="font-bold text-gray-900 text-sm">{emp.name}</p>
                                                                    <p className="text-xs text-gray-500">{String(emp.role || "").replace(/_/g, " ").toLowerCase()}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-wrap gap-4 text-xs font-bold">
                                                                <span className="text-gray-700">Calls: {emp.calls}</span>
                                                                <span className="text-blue-600">Connected: {emp.connectedCalls}</span>
                                                                <span className="text-emerald-600">Follow-ups: {emp.followupsCompleted}</span>
                                                                <span className={emp.overdueFollowups > 0 ? "text-red-600" : "text-gray-400"}>
                                                                    Overdue: {emp.overdueFollowups}
                                                                </span>
                                                                <span className="text-purple-600">Visits: {emp.siteVisits}</span>
                                                                <span className="text-orange-600">Quotes: {emp.quotations}</span>
                                                                <span className="text-emerald-700">Bookings: {emp.bookings}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400 py-4">No team activity metrics available for this period.</p>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ================= SITE VISITS TAB ================= */}
                        {activeTab === "site-visits" && (
                            <div className="space-y-6">
                                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-base font-bold text-gray-900">Site Visit Conversion Metrics</h2>
                                            <p className="text-xs text-gray-500">Scheduled visits vs verified conducted visits and conversion</p>
                                        </div>
                                        <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
                                            {visitStats.rate}% Conversion Rate
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-center">
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-2xl font-black text-gray-900">{visitStats.scheduled}</p>
                                            <p className="text-xs font-bold text-gray-500 mt-0.5">Scheduled</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-2xl font-black text-emerald-600">{visitStats.conducted}</p>
                                            <p className="text-xs font-bold text-gray-500 mt-0.5">Conducted</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-2xl font-black text-purple-700">{visitStats.converted}</p>
                                            <p className="text-xs font-bold text-gray-500 mt-0.5">Converted to Booking</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-2xl font-black text-orange-500">{visitStats.noShow}</p>
                                            <p className="text-xs font-bold text-gray-500 mt-0.5">No Show</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-2xl font-black text-gray-400">{visitStats.cancelled}</p>
                                            <p className="text-xs font-bold text-gray-500 mt-0.5">Cancelled</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Conversion Funnel Representation */}
                                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
                                    <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Visit Funnel Efficiency</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                                                <span>Conducted / Scheduled Execution</span>
                                                <span className="text-emerald-600">
                                                    {visitStats.scheduled ? Math.round((visitStats.conducted / visitStats.scheduled) * 100) : 0}%
                                                </span>
                                            </div>
                                            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-emerald-500 rounded-full"
                                                    style={{ width: `${visitStats.scheduled ? Math.min(100, Math.round((visitStats.conducted / visitStats.scheduled) * 100)) : 0}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                                                <span>Booking Conversion / Conducted Visits</span>
                                                <span className="text-purple-600">
                                                    {visitStats.conducted ? Math.round((visitStats.converted / visitStats.conducted) * 100) : 0}%
                                                </span>
                                            </div>
                                            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-purple-600 rounded-full"
                                                    style={{ width: `${visitStats.conducted ? Math.min(100, Math.round((visitStats.converted / visitStats.conducted) * 100)) : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ================= BOOKINGS TAB ================= */}
                        {activeTab === "bookings" && (
                            <div className="space-y-6">
                                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
                                    <div>
                                        <h2 className="text-base font-bold text-gray-900">Booking &amp; Agreement Revenue Analytics</h2>
                                        <p className="text-xs text-gray-500">Live agreement amounts and collected payments</p>
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-xs font-bold text-gray-400 uppercase">Total Agreement Value</p>
                                            <p className="text-2xl font-black text-purple-700 mt-1">{formatRupees(totalAgreementValue)}</p>
                                            <p className="text-[10px] text-gray-400 mt-1">{bookings.length} booking{bookings.length === 1 ? "" : "s"}</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-xs font-bold text-gray-400 uppercase">Collected (Completed)</p>
                                            <p className="text-2xl font-black text-emerald-600 mt-1">{formatRupees(completedRevenue)}</p>
                                            <p className="text-[10px] text-gray-400 mt-1">
                                                {bookings.filter(b => b.paymentStatus === "COMPLETED").length} completed
                                            </p>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-xs font-bold text-gray-400 uppercase">Partially Collected</p>
                                            <p className="text-2xl font-black text-amber-500 mt-1">
                                                {formatRupees(
                                                    bookings
                                                        .filter(b => b.paymentStatus === "PARTIAL")
                                                        .reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
                                                )}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-xs font-bold text-gray-400 uppercase">Pending Collection</p>
                                            <p className="text-2xl font-black text-gray-700 mt-1">
                                                {formatRupees(
                                                    bookings
                                                        .filter(b => b.paymentStatus === "PENDING")
                                                        .reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Booking ledger table */}
                                <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
                                    <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                                        <h3 className="font-bold text-sm text-gray-900">Recent Bookings</h3>
                                        <Link href="/dashboard/bookings" className="text-xs font-bold text-purple-600 hover:underline">
                                            Full Bookings View
                                        </Link>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50/70 border-b border-gray-100 text-gray-500 font-bold">
                                                    <th className="p-3.5">Client</th>
                                                    <th className="p-3.5">Unit / Property</th>
                                                    <th className="p-3.5">Amount</th>
                                                    <th className="p-3.5">Payment</th>
                                                    <th className="p-3.5">Date</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 font-medium">
                                                {bookings.slice(0, 10).map((b) => (
                                                    <tr key={b.id} className="hover:bg-gray-50">
                                                        <td className="p-3.5 font-bold text-gray-900">{b.clientName || b.lead?.name || "Client"}</td>
                                                        <td className="p-3.5 text-gray-600">{b.property?.title || b.unit?.unitNumber || "Property Unit"}</td>
                                                        <td className="p-3.5 font-bold text-purple-700">{formatRupees(b.amount)}</td>
                                                        <td className="p-3.5">
                                                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                                                b.paymentStatus === "COMPLETED" ? "bg-emerald-100 text-emerald-700" :
                                                                b.paymentStatus === "PARTIAL" ? "bg-amber-100 text-amber-700" :
                                                                "bg-gray-100 text-gray-600"
                                                            }`}>
                                                                {b.paymentStatus || "PENDING"}
                                                            </span>
                                                        </td>
                                                        <td className="p-3.5 text-gray-400">
                                                            {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : "—"}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {bookings.length === 0 && (
                                                    <tr>
                                                        <td colSpan={5} className="p-6 text-center text-gray-400">No bookings available</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ================= INVENTORY TAB ================= */}
                        {activeTab === "inventory" && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Total Properties</p>
                                        <p className="text-2xl font-black text-gray-900 mt-1">{properties.length}</p>
                                    </div>
                                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Total Portfolio Units</p>
                                        <p className="text-2xl font-black text-blue-600 mt-1">{totalUnits}</p>
                                    </div>
                                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Occupied Units</p>
                                        <p className="text-2xl font-black text-emerald-600 mt-1">{occupiedUnits}</p>
                                    </div>
                                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Portfolio Occupancy</p>
                                        <p className="text-2xl font-black text-purple-700 mt-1">{occupancyRate}%</p>
                                    </div>
                                </div>

                                <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
                                    <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                                        <div>
                                            <h3 className="font-bold text-sm text-gray-900">Project Occupancy Breakdown</h3>
                                            <p className="text-xs text-gray-500">Live units allocation across projects</p>
                                        </div>
                                        <Link href="/dashboard/inventory/grid" className="text-xs font-bold text-purple-600 hover:underline">
                                            Inventory Grid
                                        </Link>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50/70 border-b border-gray-100 text-gray-500 font-bold">
                                                    <th className="p-3.5">Property / Project</th>
                                                    <th className="p-3.5">Location</th>
                                                    <th className="p-3.5">Total Units</th>
                                                    <th className="p-3.5">Occupied</th>
                                                    <th className="p-3.5">Occupancy Bar</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 font-medium">
                                                {properties.map((p) => {
                                                    const rate = p.totalUnits ? Math.round(((p.occupiedUnits || 0) / p.totalUnits) * 100) : 0;
                                                    return (
                                                        <tr key={p.id} className="hover:bg-gray-50">
                                                            <td className="p-3.5 font-bold text-gray-900">{p.title || p.name}</td>
                                                            <td className="p-3.5 text-gray-500">{p.location || "Wave City"}</td>
                                                            <td className="p-3.5 font-bold">{p.totalUnits || 0}</td>
                                                            <td className="p-3.5 text-emerald-600 font-bold">{p.occupiedUnits || 0}</td>
                                                            <td className="p-3.5 w-48">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-purple-600 rounded-full" style={{ width: `${rate}%` }} />
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-gray-500">{rate}%</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {properties.length === 0 && (
                                                    <tr>
                                                        <td colSpan={5} className="p-6 text-center text-gray-400">No properties recorded</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ================= CUSTOM REPORT BUILDER TAB ================= */}
                        {activeTab === "custom" && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                {/* LEFT CONTROLS PANEL */}
                                <div className="space-y-6">
                                    {/* 1. Report Type Selection */}
                                    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
                                        <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">1. Select Report Type</h3>
                                        <div className="space-y-2">
                                            {REPORT_TYPES.map(rt => (
                                                <div
                                                    key={rt.id}
                                                    onClick={() => setReportType(rt.id)}
                                                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                                                        reportType === rt.id ? "border-purple-600 bg-purple-50/60 shadow-xs" : "border-gray-100 hover:border-gray-200"
                                                    }`}
                                                >
                                                    <p className="font-bold text-sm text-gray-900">{rt.name}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">{rt.desc}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 2. Grouping Dimension */}
                                    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
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
                                    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
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
                                    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
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
                                    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
                                        <input
                                            type="text"
                                            value={reportTitle}
                                            onChange={e => setReportTitle(e.target.value)}
                                            className="text-base sm:text-lg font-bold text-gray-900 border-b border-transparent hover:border-gray-200 focus:border-purple-500 focus:outline-none px-1 py-0.5"
                                        />

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleSaveReport}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 shadow-xs"
                                            >
                                                <Save size={13} /> {reportSaved ? "Saved!" : "Save Template"}
                                            </button>

                                            <div className="bg-gray-100 p-1 rounded-xl flex gap-1">
                                                <button
                                                    onClick={() => setViewFormat("bar")}
                                                    className={`p-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 ${viewFormat === "bar" ? "bg-white shadow-xs text-purple-600" : "text-gray-500"}`}
                                                >
                                                    <BarChart3 size={13} /> Bar
                                                </button>
                                                <button
                                                    onClick={() => setViewFormat("table")}
                                                    className={`p-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 ${viewFormat === "table" ? "bg-white shadow-xs text-purple-600" : "text-gray-500"}`}
                                                >
                                                    <TableIcon size={13} /> Table
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Interactive Visualization Canvas */}
                                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-xs space-y-6">
                                        <div className="flex justify-between items-center text-xs font-bold text-gray-400 border-b pb-4">
                                            <span>Breakdown of {reportType.toUpperCase()} by {dimension}</span>
                                            <span className="text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full">{dateRange}</span>
                                        </div>

                                        {customRows.length === 0 ? (
                                            <p className="text-sm text-gray-400 py-8 text-center">No data found for the current selection criteria.</p>
                                        ) : viewFormat === "bar" ? (
                                            <div className="space-y-6 py-4">
                                                {customRows.map((d) => (
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
                                                                style={{ width: `${(d.count / maxCustomCount) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="border-b bg-gray-50 font-bold text-gray-500">
                                                            <th className="p-3">{dimension}</th>
                                                            {selectedMetrics.includes("Total Count") && <th className="p-3">Count</th>}
                                                            {selectedMetrics.includes("Conversion Rate (%)") && <th className="p-3">Conversion</th>}
                                                            {selectedMetrics.includes("Site Visits Conducted") && <th className="p-3">Site Visits</th>}
                                                            {selectedMetrics.includes("Agreement Value (₹)") && <th className="p-3">Agreement Value</th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 font-semibold">
                                                        {customRows.map(d => (
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
                                            </div>
                                        )}
                                    </div>

                                    {/* Saved Reports Library */}
                                    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
                                        <div className="flex items-center gap-2 text-xs font-extrabold text-gray-400 uppercase tracking-wider">
                                            <Bookmark size={14} className="text-purple-600" /> Saved Report Templates
                                        </div>
                                        {savedReports.length === 0 ? (
                                            <p className="text-xs text-gray-400">No saved templates yet. Configure filters and click Save Template above.</p>
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
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default function DashboardReportsPage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col h-full items-center justify-center bg-gray-50/50 p-8">
                <Loader2 size={24} className="animate-spin text-purple-600 mb-2" />
                <p className="text-sm font-medium text-gray-500">Loading Reports &amp; Analytics...</p>
            </div>
        }>
            <ReportsPageContent />
        </Suspense>
    );
}
