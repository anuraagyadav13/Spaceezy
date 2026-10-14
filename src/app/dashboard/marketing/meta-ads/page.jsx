"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { usePermissions } from "../../../../features/auth/hooks/usePermissions";
import { formatCurrency } from "../../../../features/pipeline/helpers";
import {
    fetchMetaStatus,
    fetchMetaCampaigns,
    fetchMetaInsights,
    mergeCampaignStats,
    sumInsights,
    DATE_PRESETS,
    CAMPAIGN_STATUSES,
} from "../../../../lib/api/metaAds";

const money = (value) => (value === null || value === undefined ? "—" : formatCurrency(value));
const count = (value) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("en-IN"));

const dayString = (date) => date.toISOString().slice(0, 10);

const lastCompletedDays = (n) => {
    const days = [];
    const today = new Date();
    for (let i = n; i >= 1; i--) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
        days.push(dayString(d));
    }
    return days;
};

const DISCONNECT_HELP = {
    MISSING_CONFIG: "Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in the server environment, then rebuild the API service.",
    TOKEN_INVALID: "The Meta access token is invalid or expired. Replace META_ACCESS_TOKEN with a fresh system-user token.",
    PERMISSION_DENIED: "The token is missing required Meta permissions. Re-issue it with ads_read granted.",
    RATE_LIMITED: "Meta throttled the request. Wait a minute and retry.",
};

export default function MetaAdsPage() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");

    const [datePreset, setDatePreset] = useState("last_30d");
    const [customSince, setCustomSince] = useState("");
    const [customUntil, setCustomUntil] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [cursorStack, setCursorStack] = useState([]);

    const useCustomRange = customSince !== "" && customUntil !== "";
    const rangeValid = !useCustomRange || customSince <= customUntil;
    const rangeParams = useCustomRange
        ? { since: customSince, until: customUntil }
        : { datePreset };
    const after = cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : undefined;

    const resetPaging = () => setCursorStack([]);

    const statusQuery = useQuery({
        queryKey: ["meta-ads", "status"],
        queryFn: fetchMetaStatus,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });
    const connected = statusQuery.data?.connected === true;

    const campaignsQuery = useQuery({
        queryKey: ["meta-ads", "campaigns", datePreset, customSince, customUntil, statusFilter, after],
        queryFn: () => fetchMetaCampaigns({
            limit: 10,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(after ? { after } : {}),
        }),
        enabled: canView && connected && rangeValid,
        retry: 1,
    });

    const insightsQuery = useQuery({
        queryKey: ["meta-ads", "insights", datePreset, customSince, customUntil],
        queryFn: () => fetchMetaInsights({ level: "campaign", ...rangeParams, limit: 100 }),
        enabled: canView && connected && rangeValid,
        retry: 1,
    });

    const trendDays = useMemo(() => lastCompletedDays(7), []);
    const trendQuery = useQuery({
        queryKey: ["meta-ads", "trend", trendDays.join(",")],
        queryFn: async () => Promise.all(
            trendDays.map((day) =>
                fetchMetaInsights({ level: "campaign", since: day, until: day, limit: 100 })
                    .then((res) => ({ day, totals: sumInsights(res?.items || []) }))
                    .catch(() => ({ day, totals: null }))
            )
        ),
        enabled: canView && connected,
        staleTime: 10 * 60_000,
        retry: 1,
    });

    const kpis = useMemo(
        () => sumInsights(insightsQuery.data?.items || []),
        [insightsQuery.data]
    );
    const tableRows = useMemo(
        () => mergeCampaignStats(campaignsQuery.data?.items || [], insightsQuery.data?.items || []),
        [campaignsQuery.data, insightsQuery.data]
    );
    const topRows = useMemo(
        () => [...tableRows].sort((a, b) => (b.stats?.spend || 0) - (a.stats?.spend || 0)).slice(0, 5),
        [tableRows]
    );
    const trendMax = Math.max(0, ...(trendQuery.data || []).map((d) => d.totals?.spend || 0));

    const loading = statusQuery.isPending || campaignsQuery.isPending || insightsQuery.isPending;
    const queryError = campaignsQuery.error || insightsQuery.error;

    if (!canView) {
        return (
            <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Marketing reporting is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for access to Meta Ads reporting.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Megaphone size={22} className="text-purple-600" /> Meta Ads
                    </h1>
                    <p className="text-sm text-gray-500">Live spend, reach and lead performance from the Meta Marketing API.</p>
                </div>
                <div className="flex items-center gap-2">
                    {statusQuery.isPending ? (
                        <span className="text-xs text-gray-400">Checking connection...</span>
                    ) : connected ? (
                        <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                            Connected · Live
                        </span>
                    ) : (
                        <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                            Disconnected
                        </span>
                    )}
                    <button
                        onClick={() => { statusQuery.refetch(); campaignsQuery.refetch(); insightsQuery.refetch(); trendQuery.refetch(); }}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-white rounded-xl border border-transparent hover:border-gray-200"
                        title="Refresh all"
                    >
                        <RefreshCw size={15} />
                    </button>
                </div>
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
                                {DISCONNECT_HELP[statusQuery.data?.reason] || "The Meta Marketing API is unreachable. Check server configuration and try again."}
                            </p>
                            {Array.isArray(statusQuery.data?.missingPermissions) && statusQuery.data.missingPermissions.length > 0 && (
                                <p className="text-sm text-gray-600 mt-1">
                                    Missing permissions: {statusQuery.data.missingPermissions.join(", ")}
                                </p>
                            )}
                            {Array.isArray(statusQuery.data?.missing) && statusQuery.data.missing.length > 0 && (
                                <p className="text-sm text-gray-600 mt-1">
                                    Missing configuration: {statusQuery.data.missing.join(", ")}
                                </p>
                            )}
                            <p className="text-xs text-gray-400 mt-2">No metrics are shown until the backend confirms a live connection.</p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap gap-3 items-end">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Date range</label>
                            <select
                                value={useCustomRange ? "custom" : datePreset}
                                onChange={(e) => {
                                    if (e.target.value === "custom") { setCustomSince(""); setCustomUntil(""); }
                                    else { setDatePreset(e.target.value); setCustomSince(""); setCustomUntil(""); }
                                    resetPaging();
                                }}
                                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700"
                            >
                                {DATE_PRESETS.map((p) => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                                <option value="custom">Custom...</option>
                            </select>
                        </div>
                        {useCustomRange && (
                            <>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Since</label>
                                    <input type="date" value={customSince} onChange={(e) => { setCustomSince(e.target.value); resetPaging(); }} className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Until</label>
                                    <input type="date" value={customUntil} onChange={(e) => { setCustomUntil(e.target.value); resetPaging(); }} className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700" />
                                </div>
                            </>
                        )}
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Status</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); resetPaging(); }}
                                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700"
                            >
                                {CAMPAIGN_STATUSES.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {!rangeValid && (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm font-semibold">
                            Custom range is invalid: “since” must not be after “until”.
                        </div>
                    )}

                    {queryError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm">
                            <span className="font-bold">Couldn’t load reporting data. </span>
                            {queryError?.message || "Meta API error."}{" "}
                            <button onClick={() => { campaignsQuery.refetch(); insightsQuery.refetch(); }} className="underline font-bold">Retry</button>
                        </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {[
                            { label: "Ad spend", value: money(kpis.spend) },
                            { label: "Impressions", value: count(kpis.impressions) },
                            { label: "Reach", value: count(kpis.reach) },
                            { label: "Clicks", value: count(kpis.clicks) },
                            { label: "Meta leads", value: count(kpis.leads) },
                            { label: "Cost / lead", value: money(kpis.costPerLead) },
                        ].map((kpi) => (
                            <div key={kpi.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{kpi.label}</p>
                                <p className="text-xl font-black text-gray-900 mt-1">{loading ? "…" : kpi.value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                        <h2 className="font-bold text-gray-900 mb-1">Daily spend · last 7 days</h2>
                        <p className="text-xs text-gray-400 mb-4">Leads shown per day where Meta reports them.</p>
                        {trendQuery.isPending ? (
                            <p className="text-sm text-gray-400">Loading trend…</p>
                        ) : (
                            <div className="flex items-end gap-2 h-32">
                                {(trendQuery.data || []).map((d) => (
                                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                                        <span className="text-[10px] font-bold text-purple-700">{d.totals?.leads ?? "—"}</span>
                                        <div
                                            className="w-full rounded-t-lg bg-purple-100"
                                            style={{ height: `${trendMax > 0 ? Math.max(4, ((d.totals?.spend || 0) / trendMax) * 100) : 4}%` }}
                                            title={`${d.day}: ${d.totals?.spend ?? "—"}`}
                                        />
                                        <span className="text-[10px] text-gray-400">{d.day.slice(5)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 pt-5 pb-3">
                            <h2 className="font-bold text-gray-900">Top campaigns</h2>
                            <Link href="/dashboard/marketing/campaigns" className="text-xs font-bold text-purple-700 hover:text-purple-900">
                                View all →
                            </Link>
                        </div>
                        {tableRows.length === 0 && !loading ? (
                            <p className="px-6 pb-6 text-sm text-gray-400">No campaigns in this account or range.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-y border-gray-100 font-black text-gray-500 uppercase text-[10px]">
                                            <th className="p-3 pl-6">Campaign</th>
                                            <th className="p-3">Status</th>
                                            <th className="p-3 text-right">Spend</th>
                                            <th className="p-3 text-right">Leads</th>
                                            <th className="p-3 text-right pr-6">CPL</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {topRows.map(({ campaign, stats }) => (
                                            <tr key={campaign.id} className="hover:bg-gray-50">
                                                <td className="p-3 pl-6 font-bold text-gray-900">{campaign.name || campaign.id}</td>
                                                <td className="p-3 text-gray-600">{campaign.effectiveStatus || campaign.status || "—"}</td>
                                                <td className="p-3 text-right text-gray-700">{money(stats?.spend)}</td>
                                                <td className="p-3 text-right font-bold text-purple-700">{count(stats?.leads)}</td>
                                                <td className="p-3 text-right pr-6 text-gray-700">{money(stats?.costPerLead)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    <p className="text-[11px] text-gray-400">Metrics come live from the Meta Marketing API · lead counts use Meta-attributed lead actions.</p>
                </>
            )}
        </div>
    );
}
