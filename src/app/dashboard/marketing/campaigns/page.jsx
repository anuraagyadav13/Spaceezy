"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, AlertCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { usePermissions } from "../../../../features/auth/hooks/usePermissions";
import { formatCurrency } from "../../../../features/pipeline/helpers";
import {
    fetchMetaStatus,
    fetchMetaCampaigns,
    fetchMetaInsights,
    mergeCampaignStats,
    DATE_PRESETS,
    CAMPAIGN_STATUSES,
} from "../../../../lib/api/metaAds";

const money = (value) => (value === null || value === undefined ? "—" : formatCurrency(value));
const count = (value) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("en-IN"));

const budgetOf = (campaign) => {
    if (campaign.dailyBudget !== null && campaign.dailyBudget !== undefined) return `${money(Number(campaign.dailyBudget))} / day`;
    if (campaign.lifetimeBudget !== null && campaign.lifetimeBudget !== undefined) return `${money(Number(campaign.lifetimeBudget))} total`;
    return "—";
};

export default function CampaignsPage() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");

    const [datePreset, setDatePreset] = useState("last_30d");
    const [statusFilter, setStatusFilter] = useState("");
    const [cursorStack, setCursorStack] = useState([]);
    const after = cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : undefined;

    const statusQuery = useQuery({
        queryKey: ["meta-ads", "status"],
        queryFn: fetchMetaStatus,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });
    const connected = statusQuery.data?.connected === true;

    const campaignsQuery = useQuery({
        queryKey: ["meta-ads", "campaigns", datePreset, statusFilter, after],
        queryFn: () => fetchMetaCampaigns({
            limit: 20,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(after ? { after } : {}),
        }),
        enabled: canView && connected,
        retry: 1,
    });

    const insightsQuery = useQuery({
        queryKey: ["meta-ads", "insights", datePreset],
        queryFn: () => fetchMetaInsights({ level: "campaign", datePreset, limit: 100 }),
        enabled: canView && connected,
        retry: 1,
    });

    const rows = useMemo(
        () => mergeCampaignStats(campaignsQuery.data?.items || [], insightsQuery.data?.items || []),
        [campaignsQuery.data, insightsQuery.data]
    );

    const loading = statusQuery.isPending || campaignsQuery.isPending || insightsQuery.isPending;
    const queryError = campaignsQuery.error || insightsQuery.error;
    const nextCursor = campaignsQuery.data?.paging?.cursors?.after;

    if (!canView) {
        return (
            <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Campaign reporting is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for access to Meta Ads reporting.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Megaphone size={22} className="text-purple-600" /> Marketing Campaigns & Ad Spend
                </h1>
                <p className="text-sm text-gray-500">Read-only performance from the Meta Marketing API. No values are fabricated.</p>
            </div>

            {statusQuery.isPending ? (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center text-gray-400">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2" /> Checking Meta connection...
                </div>
            ) : !connected ? (
                <div className="bg-white rounded-3xl border border-amber-200 shadow-sm p-8">
                    <div className="flex items-start gap-3">
                        <AlertCircle size={20} className="text-amber-500 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-bold text-gray-900">Meta account not connected</p>
                            <p className="text-sm text-gray-600 mt-1">
                                Campaign reporting is unavailable until the backend confirms a live Meta connection.
                                {statusQuery.data?.reason === "MISSING_CONFIG" && " Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in the server environment."}
                                {statusQuery.data?.reason === "TOKEN_INVALID" && " The access token is invalid or expired."}
                                {statusQuery.data?.reason === "PERMISSION_DENIED" && ` Missing: ${(statusQuery.data?.missingPermissions || []).join(", ")}.`}
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap gap-3 items-end">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Date range</label>
                            <select
                                value={datePreset}
                                onChange={(e) => { setDatePreset(e.target.value); setCursorStack([]); }}
                                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700"
                            >
                                {DATE_PRESETS.map((p) => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Status</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setCursorStack([]); }}
                                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700"
                            >
                                {CAMPAIGN_STATUSES.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {queryError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm">
                            <span className="font-bold">Couldn’t load campaigns. </span>
                            {queryError?.message || "Meta API error."}{" "}
                            <button onClick={() => { campaignsQuery.refetch(); insightsQuery.refetch(); }} className="underline font-bold">Retry</button>
                        </div>
                    )}

                    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                        {rows.length === 0 && !loading ? (
                            <p className="p-8 text-sm text-gray-400 text-center">No campaigns found for this filter. Metrics appear here only from live Meta data.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100 font-black text-gray-500 uppercase text-[10px]">
                                            <th className="p-4">Campaign</th>
                                            <th className="p-4">Objective</th>
                                            <th className="p-4">Status</th>
                                            <th className="p-4">Budget</th>
                                            <th className="p-4 text-right">Spend</th>
                                            <th className="p-4 text-right">Impr.</th>
                                            <th className="p-4 text-right">Reach</th>
                                            <th className="p-4 text-right">Clicks</th>
                                            <th className="p-4 text-right">Leads</th>
                                            <th className="p-4 text-right">CPL</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {rows.map(({ campaign, stats }) => (
                                            <tr key={campaign.id} className="hover:bg-gray-50">
                                                <td className="p-4 font-bold text-gray-900">{campaign.name || campaign.id}</td>
                                                <td className="p-4 text-gray-600">{campaign.objective || "—"}</td>
                                                <td className="p-4">
                                                    <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${campaign.effectiveStatus === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                                                        {campaign.effectiveStatus || campaign.status || "—"}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-gray-600">{budgetOf(campaign)}</td>
                                                <td className="p-4 text-right text-gray-700">{money(stats?.spend)}</td>
                                                <td className="p-4 text-right text-gray-600">{count(stats?.impressions)}</td>
                                                <td className="p-4 text-right text-gray-600">{count(stats?.reach)}</td>
                                                <td className="p-4 text-right text-gray-600">{count(stats?.clicks)}</td>
                                                <td className="p-4 text-right font-bold text-purple-700">{count(stats?.leads)}</td>
                                                <td className="p-4 text-right text-gray-700">{money(stats?.costPerLead)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                            <button
                                disabled={cursorStack.length === 0}
                                onClick={() => setCursorStack((s) => s.slice(0, -1))}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 disabled:opacity-40"
                            >
                                <ChevronLeft size={14} /> Previous
                            </button>
                            {loading && <span className="text-xs text-gray-400">Loading…</span>}
                            <button
                                disabled={!nextCursor || campaignsQuery.isPending}
                                onClick={() => nextCursor && setCursorStack((s) => [...s, nextCursor])}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 disabled:opacity-40"
                            >
                                Next <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                    <p className="text-[11px] text-gray-400">Read-only Meta reporting · budgets shown as configured in Ads Manager · “—” means Meta did not report a value.</p>
                </>
            )}
        </div>
    );
}
