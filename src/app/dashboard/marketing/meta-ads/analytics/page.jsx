"use client";
// Analytics, attribution & ROI — Phase 6. READ-ONLY by construction: every
// endpoint behind this screen is a marketing:view GET, so no budget,
// targeting, bid or status can ever be changed from here.
//
// Contract notes:
// - Delivery metrics come from live Meta Insights; funnel/cost numbers join
//   real CRM records (Lead / SiteVisit / Quotation / Booking). Nothing is
//   fabricated — unknown metrics render "—", and attribution gaps are
//   reported as counts rather than papered over.
// - Recommendations are advisory only: the server repeats automated:false
//   and a standing disclaimer, and this screen labels them the same way.
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
    BarChart3, AlertCircle, RefreshCw, Wallet, Users, IndianRupee, MapPin,
    FileText, CalendarCheck, TrendingUp, Lightbulb, ChevronRight, Info,
    Filter, Target, Activity,
} from "lucide-react";
import { usePermissions } from "../../../../../features/auth/hooks/usePermissions";
import {
    fetchMetaStatus,
    fetchMetaAnalyticsOverview,
    fetchMetaAnalyticsConversions,
    fetchMetaAnalyticsPerformance,
    fetchMetaAnalyticsRecommendations,
} from "../../../../../lib/api/metaAds";
import {
    ANALYTICS_DATE_PRESETS,
    PERFORMANCE_LEVEL_LABELS,
    RECOMMENDATION_SEVERITY_LABELS,
    RECOMMENDATION_TYPE_LABELS,
    formatMoney,
    formatMetricNumber,
    formatPercent,
} from "../../../../../lib/metaAdsEnums";
import {
    AdminId, DisconnectedCard, EmptyState, ErrorBox, LoadingRow, Notice,
    PageContainer, PageHeader, SectionCard, StatCard, StatusBadge,
    btnSecondaryClass,
} from "../_components/metaAdsUi";

const count = (value) => formatMetricNumber(value, 0);

export default function MetaAnalyticsPage() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");

    const [mode, setMode] = useState("preset");
    const [datePreset, setDatePreset] = useState("last_30d");
    const [custom, setCustom] = useState({ since: "", until: "" });

    const rangeParams = mode === "preset"
        ? { datePreset }
        : { since: custom.since || undefined, until: custom.until || undefined };
    const rangeReady = mode === "preset" || Boolean(custom.since && custom.until);

    const statusQuery = useQuery({
        queryKey: ["meta-ads", "status"],
        queryFn: fetchMetaStatus,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });
    const connected = statusQuery.data?.connected === true;
    const enabled = canView && connected && rangeReady;

    const overviewQuery = useQuery({
        queryKey: ["meta-ads", "analytics", "overview", mode, datePreset, custom.since, custom.until],
        queryFn: () => fetchMetaAnalyticsOverview(rangeParams),
        enabled,
        retry: 1,
    });
    const funnelQuery = useQuery({
        queryKey: ["meta-ads", "analytics", "conversions", mode, datePreset, custom.since, custom.until],
        queryFn: () => fetchMetaAnalyticsConversions(rangeParams),
        enabled,
        retry: 1,
    });
    const performanceQuery = useQuery({
        queryKey: ["meta-ads", "analytics", "performance", mode, datePreset, custom.since, custom.until],
        queryFn: () => fetchMetaAnalyticsPerformance({ ...rangeParams, level: "campaign", limit: 100 }),
        enabled,
        retry: 1,
    });
    const recsQuery = useQuery({
        queryKey: ["meta-ads", "analytics", "recommendations", mode, datePreset, custom.since, custom.until],
        queryFn: () => fetchMetaAnalyticsRecommendations(rangeParams),
        enabled,
        retry: 1,
    });

    if (!canView) {
        return (
            <PageContainer>
                <PageHeader icon={BarChart3} title="Analytics & ROI" subtitle="Advertising performance and sales results." />
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Analytics is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </PageContainer>
        );
    }

    const overview = overviewQuery.data || null;
    const funnelData = funnelQuery.data || null;
    const performance = performanceQuery.data || null;
    const recs = recsQuery.data || null;
    const currency = overview?.currency || funnelData?.currency || "INR";
    const totals = overview?.totals || null;
    const funnel = funnelData?.funnel || null;
    const costs = funnelData?.costs || null;
    const attribution = funnelData?.attribution || null;
    const campaigns = performance?.items || overview?.campaigns || [];
    const loading = overviewQuery.isPending || funnelQuery.isPending;
    const queryError = overviewQuery.error || funnelQuery.error || performanceQuery.error;

    const refetchAll = () => {
        overviewQuery.refetch();
        funnelQuery.refetch();
        performanceQuery.refetch();
        recsQuery.refetch();
    };

    return (
        <PageContainer>
            <PageHeader
                icon={BarChart3}
                title="Analytics & ROI"
                subtitle="Where your ad money goes, how many leads it buys and what those leads turn into."
                actions={
                    <>
                        <div className="flex items-center gap-2">
                            <Filter size={14} className="text-gray-400" />
                            <select
                                value={mode}
                                onChange={(e) => setMode(e.target.value)}
                                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-purple-500"
                            >
                                <option value="preset">Quick range</option>
                                <option value="custom">Custom dates</option>
                            </select>
                            {mode === "preset" ? (
                                <select
                                    value={datePreset}
                                    onChange={(e) => setDatePreset(e.target.value)}
                                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-purple-500"
                                >
                                    {ANALYTICS_DATE_PRESETS.map((preset) => (
                                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={custom.since}
                                        onChange={(e) => setCustom((p) => ({ ...p, since: e.target.value }))}
                                        className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-purple-500"
                                    />
                                    <span className="text-xs text-gray-400">to</span>
                                    <input
                                        type="date"
                                        value={custom.until}
                                        onChange={(e) => setCustom((p) => ({ ...p, until: e.target.value }))}
                                        className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-purple-500"
                                    />
                                </span>
                            )}
                        </div>
                        <button type="button" onClick={refetchAll} className={btnSecondaryClass}>
                            <RefreshCw size={14} className={overviewQuery.isFetching ? "animate-spin" : ""} /> Refresh
                        </button>
                    </>
                }
            />

            {mode === "custom" && !rangeReady && (
                <Notice tone="amber" icon={AlertCircle}>Pick both a start and an end date to see results.</Notice>
            )}

            {statusQuery.isPending && <LoadingRow label="Checking your Meta connection…" />}
            {!statusQuery.isPending && !connected && <DisconnectedCard title="Meta account not connected" />}

            {connected && rangeReady && loading && <LoadingRow label="Loading analytics…" />}
            {connected && rangeReady && queryError && !loading && (
                <ErrorBox error={queryError} onRetry={refetchAll} />
            )}

            {connected && rangeReady && !loading && !queryError && overview && (
                <>
                    {/* ---------------- Headline numbers ---------------- */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                        <StatCard icon={Wallet} label="Ad spend" value={formatMoney(costs?.spend ?? totals?.spend ?? null, currency)} tone="purple" />
                        <StatCard icon={Users} label="Attributed leads" value={count(funnel?.attributedLeads ?? totals?.crmAttributedLeads ?? null)} tone="blue" />
                        <StatCard icon={IndianRupee} label="Cost per lead" value={formatMoney(costs?.costPerLead ?? totals?.crmCostPerLead ?? null, currency)} tone="amber" />
                        <StatCard icon={IndianRupee} label="Cost per qualified lead" value={formatMoney(costs?.costPerQualifiedLead ?? null, currency)} tone="amber" />
                        <StatCard icon={IndianRupee} label="Cost per booking" value={formatMoney(costs?.costPerBooking ?? null, currency)} tone="amber" />
                        <StatCard icon={MapPin} label="Site visits" value={count(funnel?.siteVisits ?? null)} tone="emerald" />
                        <StatCard icon={FileText} label="Quotations" value={count(funnel?.quotations ?? null)} tone="blue" />
                        <StatCard icon={CalendarCheck} label="Bookings" value={count(funnel?.bookings ?? null)} tone="emerald" />
                        <StatCard icon={TrendingUp} label="Booking value" value={formatMoney(costs?.bookingValue ?? null, currency)} tone="emerald" />
                        <StatCard
                            icon={TrendingUp}
                            label="Return on ad spend"
                            value={costs?.returnOnAdSpend === null || costs?.returnOnAdSpend === undefined
                                ? "—"
                                : `${costs.returnOnAdSpend.toFixed(2)}×`}
                            hint={costs?.netReturn !== null && costs?.netReturn !== undefined
                                ? `Net ${formatMoney(costs.netReturn, currency)}`
                                : undefined}
                            tone={costs?.returnOnAdSpend > 1 ? "emerald" : "gray"}
                        />
                    </div>

                    {/* ---------------- Sales funnel ---------------- */}
                    <SectionCard icon={Activity} title="Sales funnel" subtitle="From ad click to booked deal — CRM records linked to ad leads">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[
                                { label: "Leads", value: funnel?.attributedLeads, icon: Users },
                                { label: "Contacted", value: funnel?.contacted, icon: Users },
                                { label: "Qualified", value: funnel?.qualified, icon: Target },
                                { label: "Site visits", value: funnel?.siteVisits, icon: MapPin },
                                { label: "Quotations", value: funnel?.quotations, icon: FileText },
                                { label: "Bookings", value: funnel?.bookings, icon: CalendarCheck },
                            ].map((step) => (
                                <div key={step.label} className="rounded-2xl border border-gray-200 bg-white p-3 text-center">
                                    <step.icon size={15} className="mx-auto text-purple-500 mb-1" />
                                    <p className="text-xl font-bold text-gray-900">{count(step.value)}</p>
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{step.label}</p>
                                </div>
                            ))}
                        </div>
                        {(funnelData?.notes || []).length > 0 && (
                            <details className="text-xs text-gray-500">
                                <summary className="cursor-pointer font-semibold text-gray-600 inline-flex items-center gap-1">
                                    <Info size={13} /> How these numbers are counted
                                </summary>
                                <ul className="mt-2 space-y-1 list-disc pl-5">
                                    {funnelData.notes.map((note) => <li key={note}>{note}</li>)}
                                </ul>
                            </details>
                        )}
                    </SectionCard>

                    {/* ---------------- Attribution gap ---------------- */}
                    {attribution && (
                        <SectionCard
                            icon={AlertCircle}
                            title="Attribution check"
                            subtitle="Where Meta's reported leads and the CRM's attributed leads disagree — reported honestly, never invented"
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                <StatCard label="Meta reported leads" value={count(attribution.metaReportedLeads)} tone="blue" />
                                <StatCard label="CRM attributed leads" value={count(attribution.crmAttributedLeads)} tone="emerald" />
                                <StatCard label="Missing ad attribution" value={count(attribution.unattributedLeads)} hint="Arrived without ad fields" tone="amber" />
                                <StatCard label="CRM beyond Meta" value={count(attribution.crmBeyondMeta)} hint="Attributed but not in Meta's count" tone="gray" />
                                <StatCard label="Leads missing ad detail" value={count((attribution.missingMetaAdId || 0) + (attribution.missingMetaAdsetId || 0))} hint="Campaign known, ad/ad set unknown" tone="gray" />
                            </div>
                            {attribution.unattributedLeads > 0 && (
                                <Notice tone="amber" icon={AlertCircle}>
                                    <strong>{count(attribution.unattributedLeads)}</strong> Meta-reported lead
                                    {attribution.unattributedLeads === 1 ? "" : "s"} in this period carry no campaign
                                    attribution in the CRM, so they are excluded from cost-per-lead figures. Check that
                                    lead sync is enabled on the{" "}
                                    <Link href="/dashboard/marketing/meta-ads/lead-sync" className="underline font-semibold">
                                        Lead Sync
                                    </Link>{" "}
                                    screen to reduce this gap.
                                </Notice>
                            )}
                        </SectionCard>
                    )}

                    {/* ---------------- Campaign comparison ---------------- */}
                    <SectionCard
                        icon={BarChart3}
                        title="Campaign comparison"
                        subtitle={`Side-by-side delivery for ${PERFORMANCE_LEVEL_LABELS.campaign.toLowerCase()} in this period`}
                    >
                        <ErrorBox error={performanceQuery.error} onRetry={() => performanceQuery.refetch()} />
                        {performanceQuery.isPending ? (
                            <LoadingRow label="Loading campaign performance…" />
                        ) : campaigns.length === 0 ? (
                            <EmptyState
                                icon={BarChart3}
                                title="No campaign delivery in this period"
                                hint="Meta returned no rows for the selected period — nothing is faked here."
                            />
                        ) : (
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                            <th className="py-2 pr-3 font-bold">Campaign</th>
                                            <th className="py-2 pr-3 font-bold">Status</th>
                                            <th className="py-2 pr-3 font-bold">Spend</th>
                                            <th className="py-2 pr-3 font-bold">Impressions</th>
                                            <th className="py-2 pr-3 font-bold">Clicks</th>
                                            <th className="py-2 pr-3 font-bold">CTR</th>
                                            <th className="py-2 pr-3 font-bold">CPC</th>
                                            <th className="py-2 pr-3 font-bold">Ad leads</th>
                                            <th className="py-2 pr-3 font-bold">CRM leads</th>
                                            <th className="py-2 pr-3 font-bold">Cost / lead</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {campaigns.map((row) => (
                                            <tr key={row.campaignId || row.campaignName} className="border-b border-gray-50 hover:bg-gray-50/60">
                                                <td className="py-2.5 pr-3">
                                                    {row.campaignId ? (
                                                        <Link
                                                            href={`/dashboard/marketing/meta-ads/campaigns/${row.campaignId}`}
                                                            className="font-semibold text-gray-900 hover:text-purple-600"
                                                        >
                                                            {row.campaignName || "Unnamed campaign"}
                                                        </Link>
                                                    ) : (
                                                        <span className="font-semibold text-gray-900">{row.campaignName || "—"}</span>
                                                    )}
                                                    <AdminId value={row.campaignId} />
                                                </td>
                                                <td className="py-2.5 pr-3"><StatusBadge status={row.status || row.effectiveStatus} /></td>
                                                <td className="py-2.5 pr-3 text-gray-700">{formatMoney(row.spend, currency)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700">{count(row.impressions)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700">{count(row.clicks)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700">{formatPercent(row.ctr, 2)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700">{formatMoney(row.cpc, currency)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700">{count(row.leads)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700 font-semibold">{count(row.crmLeads ?? row.crmAttributedLeads)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700">{formatMoney(row.crmCostPerLead ?? row.costPerLead, currency)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="text-[11px] text-gray-400">
                            All values come from live Meta Insights joined with CRM lead attribution for the selected
                            period. “—” means the metric is unknown or has no data — never zero.
                        </p>
                    </SectionCard>

                    {/* ---------------- Recommendations (advisory) ---------------- */}
                    <SectionCard
                        icon={Lightbulb}
                        title="Optimization suggestions"
                        subtitle="Advisory only — SpaceEzy never changes budgets, targeting, bids or statuses on its own"
                        action={
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-[11px] font-bold text-blue-700">
                                <Info size={12} /> Suggestions only
                            </span>
                        }
                    >
                        <ErrorBox error={recsQuery.error} onRetry={() => recsQuery.refetch()} />
                        {recsQuery.isPending ? (
                            <LoadingRow label="Analysing your campaigns…" />
                        ) : !recs ? null : recs.insufficientData && (recs.items || []).length === 0 ? (
                            <EmptyState
                                icon={Lightbulb}
                                title="Not enough data yet"
                                hint="Suggestions appear once at least a couple of campaigns have delivery in this period."
                            />
                        ) : (
                            <div className="space-y-3">
                                {(recs.items || []).length === 0 && (
                                    <Notice tone="emerald" icon={Lightbulb}>
                                        Nothing needs attention — your campaigns are performing within normal ranges for
                                        this period.
                                    </Notice>
                                )}
                                {(recs.items || []).map((item, index) => (
                                    <div
                                        key={`${item.type}-${item.scopeId || index}`}
                                        className={`rounded-2xl border p-4 ${
                                            item.severity === "warning"
                                                ? "border-amber-200 bg-amber-50/60"
                                                : "border-emerald-200 bg-emerald-50/60"
                                        }`}
                                    >
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                                item.severity === "warning"
                                                    ? "bg-amber-100 text-amber-700 border-amber-200"
                                                    : "bg-emerald-100 text-emerald-700 border-emerald-200"
                                            }`}>
                                                {RECOMMENDATION_SEVERITY_LABELS[item.severity] || item.severity}
                                            </span>
                                            <span className="text-xs font-bold text-gray-700">
                                                {RECOMMENDATION_TYPE_LABELS[item.type] || item.type}
                                            </span>
                                            {item.scope === "campaign" && item.scopeId && (
                                                <Link
                                                    href={`/dashboard/marketing/meta-ads/campaigns/${item.scopeId}`}
                                                    className="text-xs font-bold text-purple-600 inline-flex items-center gap-0.5 hover:underline"
                                                >
                                                    {item.scopeName} <ChevronRight size={12} />
                                                </Link>
                                            )}
                                            {item.scope === "creative" && (
                                                <span className="text-xs font-semibold text-gray-600">{item.scopeName}</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-800">{item.message}</p>
                                        <p className="text-sm text-gray-600 mt-1">
                                            <strong>Suggested action:</strong> {item.recommendation}
                                        </p>
                                        <p className="text-[11px] text-gray-400 mt-1.5">Suggestion only — no change was made.</p>
                                    </div>
                                ))}
                                {recs.disclaimer && (
                                    <p className="text-[11px] text-gray-400">{recs.disclaimer}</p>
                                )}
                                <p className="text-[11px] text-gray-400">
                                    Benchmarks for this period — median spend {formatMoney(recs.benchmarks?.medianSpend, currency)},
                                    median cost per lead {formatMoney(recs.benchmarks?.medianCostPerLead, currency)},
                                    median click rate {formatPercent(recs.benchmarks?.medianCtr, 2)}.
                                </p>
                            </div>
                        )}
                    </SectionCard>
                </>
            )}
        </PageContainer>
    );
}
