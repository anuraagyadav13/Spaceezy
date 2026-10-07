"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLeads, fetchLeadsPage, fetchClaimableLeads, claimLead } from "../../../lib/api/leads";
import { usePermissions } from "../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../lib/toast";
import { 
    Search, Filter, ChevronDown, CheckSquare, 
    Square, MoreHorizontal, ArrowUpDown, Download, AlertCircle, X, UserPlus
} from "lucide-react";
import LeadPipelineDashboard from "../../../features/pipeline/components/LeadPipelineDashboard";

function LeadsWorkspace() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { hasRole } = usePermissions();
    const isExecutive = hasRole("SALES_EXECUTIVE");

    const LEAD_VIEWS = isExecutive
        ? [
            { key: "my", label: "My Leads" },
            { key: "new", label: "New Leads" },
            { key: "pipeline", label: "Pipeline" }
        ]
        : [
            { key: "all", label: "All Leads" },
            { key: "pipeline", label: "Pipeline" }
        ];

    const rawView = searchParams.get("view");
    const view = rawView === "pipeline" || rawView === "new"
        ? rawView
        : (isExecutive ? "my" : "all");

    const switchView = (next) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === "pipeline" || next === "new") params.set("view", next);
        else params.delete("view");
        const qs = params.toString();
        router.replace(qs ? `/dashboard/leads?${qs}` : "/dashboard/leads", { scroll: false });
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            <nav aria-label="Leads views" className="bg-white border-b border-gray-100 px-4 sm:px-8 py-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-2">
                        {LEAD_VIEWS.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => switchView(tab.key)}
                                aria-current={view === tab.key ? "page" : undefined}
                                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                                    view === tab.key
                                        ? "bg-purple-50 border-purple-200 text-purple-700"
                                        : "bg-transparent border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    {isExecutive && <ClaimStatsBar />}
                </div>
            </nav>
            <div className="flex-1 min-h-0 flex flex-col">
                {view === "pipeline"
                    ? <LeadPipelineDashboard />
                    : view === "new" && isExecutive
                        ? <NewLeadsContent />
                        : <LeadsListContent isExecutive={isExecutive} />}
            </div>
        </div>
    );
}

function ClaimStatsBar() {
    const { data: myLeadsPage } = useQuery({
        queryKey: ["leads", "stats"],
        queryFn: () => fetchLeadsPage({ limit: 1 }),
        retry: 1,
        refetchOnWindowFocus: false
    });
    const { data: claimableStats } = useQuery({
        queryKey: ["leads", "claimable", "stats"],
        queryFn: () => fetchClaimableLeads({ limit: 1 }),
        retry: 1,
        refetchOnWindowFocus: false
    });

    const claim = claimableStats?.claim;

    return (
        <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
            <span className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100">
                My Leads <span className="text-purple-700">{myLeadsPage?.total ?? "-"}</span>
            </span>
            {claim && (
                <span className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100">
                    Self-Claimed <span className="text-purple-700">{claim.claimed} / {claim.limit}</span>
                </span>
            )}
            <span className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100">
                New Leads <span className="text-purple-700">{claimableStats?.total ?? "-"}</span>
            </span>
        </div>
    );
}

function NewLeadsContent() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");

    const { data, isLoading, error } = useQuery({
        queryKey: ["leads", "claimable", { search }],
        queryFn: () => fetchClaimableLeads({ search, limit: 50 }),
        retry: 1,
        refetchOnWindowFocus: false
    });

    const claimMutation = useMutation({
        mutationFn: (id) => claimLead(id),
        onSuccess: () => {
            showToast("Lead claimed successfully", "success");
            queryClient.invalidateQueries({ queryKey: ["leads", "claimable"] });
            queryClient.invalidateQueries({ queryKey: ["leads", "stats"] });
        },
        onError: (err) => {
            if (err?.code === "ALREADY_CLAIMED") {
                showToast("Lead was already claimed by another employee.", "error");
            } else if (err?.code === "SELF_CLAIM_LIMIT_REACHED") {
                showToast(err.message || "Self-claim limit reached.", "error");
            } else {
                showToast(err?.message || "Failed to claim lead", "error");
            }
            queryClient.invalidateQueries({ queryKey: ["leads", "claimable"] });
        }
    });

    const claim = data?.claim;
    const leads = data?.leads || [];
    const limitNotConfigured = claim && claim.limit === 0 && claim.claimed === 0 && claim.remaining === 0;

    return (
        <div className="flex-1 overflow-auto bg-gray-50/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 sm:px-8 sm:py-6 bg-white border-b border-gray-100 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">New Leads</h1>
                    <p className="text-sm text-gray-500 mt-1">Unassigned leads available for self-claim.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500">
                    {claim && (
                        <span className="px-2.5 py-1.5 rounded-lg bg-purple-50 border border-purple-100 text-purple-700">
                            Self-Claimed {claim.claimed} / {claim.limit}
                        </span>
                    )}
                    {claim && (
                        <span className="px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                            Remaining <span className="text-purple-700">{claim.remaining}</span>
                        </span>
                    )}
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search leads..."
                            className="w-48 pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        />
                    </div>
                </div>
            </div>

            <div className="p-4 sm:p-8">
                {limitNotConfigured && (
                    <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm font-medium text-amber-800">
                        Self-claiming is not enabled for your account. Contact your administrator to set a claim limit.
                    </div>
                )}

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-3">
                        <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                        <p className="text-gray-500 font-medium">Loading new leads...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-2 text-red-500">
                        <AlertCircle size={24} className="text-red-500" />
                        <p className="font-bold text-red-600">Failed to load new leads</p>
                        <p className="text-sm">{error.message}</p>
                    </div>
                ) : leads.length === 0 ? (
                    <div className="py-16 text-center text-gray-500">
                        No unassigned leads available right now.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {leads.map((lead) => (
                            <div key={lead.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <Link href={`/dashboard/leads/${lead.id}`} className="font-bold text-gray-900 hover:text-purple-600 transition-colors truncate block">
                                            {lead.name}
                                        </Link>
                                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                                            {lead.phone}{lead.email ? ` • ${lead.email}` : ""}
                                        </p>
                                    </div>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-gray-50 text-gray-600 border border-gray-100 shrink-0">
                                        {lead.source || "Lead"}
                                    </span>
                                </div>

                                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                                    <div>
                                        <dt className="text-gray-400 font-semibold uppercase tracking-wider">Project</dt>
                                        <dd className="text-gray-900 font-bold truncate">{lead.project?.name || "-"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-400 font-semibold uppercase tracking-wider">Budget</dt>
                                        <dd className="text-gray-900 font-bold truncate">
                                            {lead.budget ? `₹${Number(lead.budget).toLocaleString("en-IN")}` : "-"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-400 font-semibold uppercase tracking-wider">Created</dt>
                                        <dd className="text-gray-600 font-medium">{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : "-"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-400 font-semibold uppercase tracking-wider">Stage</dt>
                                        <dd className="text-gray-600 font-medium">{lead.status || "NEW"}</dd>
                                    </div>
                                </dl>

                                <button
                                    type="button"
                                    disabled={!claim?.canClaim || claimMutation.isPending}
                                    onClick={() => claimMutation.mutate(lead.id)}
                                    title={claim?.canClaim ? "Claim this lead" : "Self-claim limit reached"}
                                    className="mt-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                                >
                                    <UserPlus size={15} />
                                    {claimMutation.isPending ? "Claiming..." : "Claim Lead"}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function LeadsListContent({ isExecutive = false }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const stage = searchParams.get("stage") || "";
    const stageLabel = searchParams.get("stageLabel") || stage;

    const [leads, setLeads] = useState([]);
    const [selectedLeads, setSelectedLeads] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const leadsData = await fetchLeads(stage ? { stage } : {});
                setLeads(leadsData.leads || leadsData || []);
                setError(null);
            } catch (err) {
                setError(err.message || "Failed to load leads from the server");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [stage]);

    const toggleSelectAll = () => {
        if (selectedLeads.size === leads.length) {
            setSelectedLeads(new Set());
        } else {
            setSelectedLeads(new Set(leads.map(l => l.id)));
        }
    };

    const toggleSelect = (id) => {
        const newSet = new Set(selectedLeads);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedLeads(newSet);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 sm:px-8 sm:py-6 bg-white border-b border-gray-100 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{isExecutive ? "My Leads" : "All Leads"}</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {isExecutive
                            ? "Leads assigned to you or claimed by you."
                            : "Manage, filter, and assign your sales leads."}
                    </p>
                </div>
                <div className="flex gap-3 mt-4 sm:mt-0">
                    <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
                        <Download size={16} /> Export
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-center p-4 sm:px-8 border-b border-gray-100 bg-white shrink-0 gap-4">
                {/* Search */}
                <div className="relative w-full sm:w-80">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search name, phone, email..." 
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                    />
                </div>
                
                {/* Filters */}
                <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
                    {stage ? (
                        <button
                            onClick={() => router.replace("/dashboard/leads", { scroll: false })}
                            className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700 hover:bg-purple-100 shrink-0 font-semibold"
                            title="Clear stage filter"
                        >
                            Stage: {stageLabel} <X size={14} />
                        </button>
                    ) : (
                        <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 shrink-0">
                            <Filter size={14} className="text-gray-400" /> Stage: All <ChevronDown size={14} className="text-gray-400" />
                        </button>
                    )}
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 shrink-0">
                        Source: All <ChevronDown size={14} className="text-gray-400" />
                    </button>
                    {hasPermission("employee:view") && (
                        <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 shrink-0">
                            Assigned To: All <ChevronDown size={14} className="text-gray-400" />
                        </button>
                    )}
                    {selectedLeads.size > 0 && (
                        <div className="flex items-center gap-2 pl-2 border-l border-gray-200 shrink-0">
                            <span className="text-sm font-bold text-purple-600">{selectedLeads.size} selected</span>
                            {hasPermission("lead:assign") && (
                                <button className="text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">Assign</button>
                            )}
                            <button className="text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">Update Stage</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-white">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead className="bg-gray-50/50 sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                        <tr>
                            <th className="px-4 py-3 w-12 text-center">
                                <button onClick={toggleSelectAll} className="text-gray-400 hover:text-purple-600 transition-colors">
                                    {selectedLeads.size === leads.length && leads.length > 0 ? <CheckSquare size={18} className="text-purple-600" /> : <Square size={18} />}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 group">
                                <div className="flex items-center gap-1">Lead Details <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100" /></div>
                            </th>
                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 group">
                                <div className="flex items-center gap-1">Stage <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100" /></div>
                            </th>
                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Source</th>
                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Interested Project</th>
                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Assigned To</th>
                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Creation Date</th>
                            <th className="px-4 py-3 w-12 text-center"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan="8" className="px-4 py-12 text-center">
                                    <div className="flex flex-col items-center justify-center space-y-3">
                                        <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                                        <p className="text-gray-500 font-medium">Loading leads...</p>
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan="8" className="px-4 py-12 text-center text-red-500 bg-red-50/50">
                                    <div className="flex flex-col items-center justify-center space-y-2">
                                        <AlertCircle size={24} className="text-red-500" />
                                        <p className="font-bold text-red-600">Failed to load leads</p>
                                        <p className="text-sm">{error}</p>
                                    </div>
                                </td>
                            </tr>
                        ) : leads.length === 0 ? (
                            <tr>
                                <td colSpan="8" className="px-4 py-12 text-center text-gray-500">
                                    No leads found. Adjust your filters or add a new lead.
                                </td>
                            </tr>
                        ) : (
                            leads.map((lead) => (
                                <tr key={lead.id} className={`hover:bg-purple-50/30 transition-colors group ${selectedLeads.has(lead.id) ? 'bg-purple-50/30' : ''}`}>
                                    <td className="px-4 py-4 text-center">
                                        <button onClick={() => toggleSelect(lead.id)} className="text-gray-300 hover:text-purple-600 transition-colors">
                                            {selectedLeads.has(lead.id) ? <CheckSquare size={18} className="text-purple-600" /> : <Square size={18} />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-4">
                                        <Link href={`/dashboard/leads/${lead.id}`} className="block">
                                            <p className="font-bold text-gray-900 group-hover:text-purple-600 transition-colors">{lead.name}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{lead.phone} {lead.email && `• ${lead.email}`}</p>
                                        </Link>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100">
                                            {lead.status || lead.stage || "NEW"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-sm text-gray-600 font-medium">{lead.source || "-"}</td>
                                    <td className="px-4 py-4 text-sm text-gray-900 font-bold">{lead.project?.name || lead.project || "-"}</td>
                                    <td className="px-4 py-4 text-sm text-gray-600">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden shrink-0">
                                                <img src={`https://i.pravatar.cc/150?u=${lead.assignedToId || "unassigned"}`} alt="" />
                                            </div>
                                            <span className="font-medium">{lead.assignedTo?.name || (lead.assignedToId ? "Assigned" : "Unassigned")}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-sm text-gray-500 font-medium">{new Date(lead.createdAt).toLocaleDateString()}</td>
                                    <td className="px-4 py-4 text-center">
                                        <button className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                            <MoreHorizontal size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 sm:px-8 py-3 bg-white border-t border-gray-100 shrink-0">
                <span className="text-sm text-gray-500">Showing <span className="font-bold text-gray-900">1</span> to <span className="font-bold text-gray-900">{leads.length}</span> of <span className="font-bold text-gray-900">{leads.length}</span> leads</span>
                <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-400 cursor-not-allowed">Previous</button>
                    <button className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-400 cursor-not-allowed">Next</button>
                </div>
            </div>
        </div>
    );
}

export default function LeadsList() {
    return (
        <Suspense fallback={<div className="p-8 text-gray-400 font-medium">Loading leads...</div>}>
            <LeadsWorkspace />
        </Suspense>
    );
}
