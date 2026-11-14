"use client";
// Marketing Overview — the business-first home of the Meta Ads workspace.
//
// Contract notes:
// - Every number comes from live Meta Insights joined with real CRM records
//   (Lead / SiteVisit / Quotation / Booking). There is NO sample, demo or
//   fabricated data anywhere on this page; when the workspace is not
//   connected the exact Phase 2.5A disconnected string is shown instead of
//   metrics.
// - Costs with a zero denominator (e.g. cost per booking with no bookings)
//   render as "—" — never ₹0.00.
// - Analytics is read-only: nothing here can change budgets, targeting,
//   bids or statuses. Ad lifecycle actions live on their own screens with
//   explicit confirmation.
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
    Megaphone, AlertCircle, RefreshCw, ChevronRight, Wallet, Users, UserCheck,
    MapPin, FileText, CalendarCheck, IndianRupee, TrendingUp, BarChart3,
    Lightbulb, Plus, Image as ImageIcon, PlayCircle,
} from "lucide-react";
import { usePermissions } from "../../../../features/auth/hooks/usePermissions";
import {
    fetchMetaStatus,
    fetchMetaAnalyticsOverview,
    fetchMetaAnalyticsConversions,
} from "../../../../lib/api/metaAds";
import { ANALYTICS_DATE_PRESETS, formatMoney, formatMetricNumber, formatPercent } from "../../../../lib/metaAdsEnums";
import {
    AdminId, DisconnectedCard, EmptyState, ErrorBox, LoadingRow, Notice,
    PageContainer, PageHeader, SectionCard, StatCard, StatusBadge,
    btnPrimaryClass, btnSecondaryClass,
} from "./_components/metaAdsUi";

const count = (value) => formatMetricNumber(value, 0);

export default function MetaOverviewPage() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");

    const [datePreset, setDatePreset] = useState("last_30d");
    const rangeParams = { datePreset };

    const statusQuery = useQuery({
        queryKey: ["meta-ads", "status"],
        queryFn: fetchMetaStatus,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });
    const connected = statusQuery.data?.connected === true;

    const overviewQuery = useQuery({
        queryKey: ["meta-ads", "analytics", "overview", datePreset],
        queryFn: () => fetchMetaAnalyticsOverview(rangeParams),
        enabled: canView && connected,
        retry: 1,
    });

    const funnelQuery = useQuery({
        queryKey: ["meta-ads", "analytics", "conversions", datePreset],
        queryFn: () => fetchMetaAnalyticsConversions(rangeParams),
        enabled: canView && connected,
        retry: 1,
    });

    if (!canView) {
        return (
            <PageContainer>
                <PageHeader
                    icon={Megaphone}
                    title="Marketing Overview"
                    subtitle="Advertising performance and sales results in one place."
                />
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Marketing reporting is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </PageContainer>
        );
    }

    const overview = overviewQuery.data || null;
    const funnelData = funnelQuery.data || null;
    const currency = overview?.currency || funnelData?.currency || "INR";
    const totals = overview?.totals || null;
    const funnel = funnelData?.funnel || null;
    const costs = funnelData?.costs || null;
    const attribution = funnelData?.attribution || null;
    const campaigns = overview?.campaigns || [];
    const loading = overviewQuery.isPending || funnelQuery.isPending;
    const queryError = overviewQuery.error || funnelQuery.error;

    return (
        <PageContainer>
            <PageHeader
                icon={Megaphone}
                title="Marketing Overview"
                subtitle="Advertising spend, leads and sales results — actual data from your connected ad account and CRM."
                actions={
                    <>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Period
                            <select
                                value={datePreset}
                                onChange={(e) => setDatePreset(e.target.value)}
                                className="ml-2 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-purple-500"
                            >
                                {ANALYTICS_DATE_PRESETS.map((preset) => (
                                    <option key={preset.value} value={preset.value}>{preset.label}</option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => {
                                overviewQuery.refetch();
                                funnelQuery.refetch();
                            }}
                            className={btnSecondaryClass}
                        >
                            <RefreshCw size={14} className={overviewQuery.isFetching || funnelQuery.isFetching ? "animate-spin" : ""} />
                            Refresh
                        </button>
                        {canManage && (
                            <Link href="/dashboard/marketing/meta-ads/campaigns" className={btnPrimaryClass}>
                                <Plus size={15} /> New campaign
                            </Link>
                        )}
                    </>
                }
            />

            {statusQuery.isPending && <LoadingRow label="Checking your Meta connection…" />}
            {!statusQuery.isPending && !connected && (
                <>
                    <DisconnectedCard title="Meta account not connected" />
                    <Notice tone="blue">
                        Until the connection is set up, advertising metrics are unavailable — nothing is estimated or
                        faked. Leads you capture through other channels keep flowing into the{" "}
                        <Link href="/dashboard/leads" className="underline font-semibold">Leads</Link> pipeline as usual.
                    </Notice>
                </>
            )}

            {connected && loading && <LoadingRow label="Loading your marketing results…" />}

            {connected && queryError && !loading && (
                <ErrorBox error={queryError} onRetry={() => { overviewQuery.refetch(); funnelQuery.refetch(); }} />
            )}

            {connected && !loading && !queryError && overview && (
                <>
                    {/* ---------------- Business KPI grid ---------------- */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                        <StatCard
                            icon={Wallet}
                            label="Advertising spend"
                            value={formatMoney(costs?.spend ?? totals?.spend ?? null, currency)}
                            hint="Charged to your Meta ad account"
                            tone="purple"
                        />
                        <StatCard
                            icon={Users}
                            label="Leads generated"
                            value={count(funnel?.attributedLeads ?? totals?.crmAttributedLeads ?? null)}
                            hint="Leads attributed to your ads"
                            tone="blue"
                        />
                        <StatCard
                            icon={IndianRupee}
                            label="Cost per lead"
                            value={formatMoney(costs?.costPerLead ?? totals?.crmCostPerLead ?? null, currency)}
                            hint="Spend ÷ attributed leads"
                            tone="amber"
                        />
                        <StatCard
                            icon={UserCheck}
                            label="Qualified leads"
                            value={count(funnel?.qualified ?? totals?.crmQualified ?? null)}
                            hint="Qualified, visited, quoted, booked"
                            tone="emerald"
                        />
                        <StatCard
                            icon={MapPin}
                            label="Site visits"
                            value={count(funnel?.siteVisits ?? null)}
                            hint="From attributed leads"
                            tone="emerald"
                        />
                        <StatCard
                            icon={FileText}
                            label="Quotations"
                            value={count(funnel?.quotations ?? null)}
                            hint="Sent to attributed leads"
                            tone="blue"
                        />
                        <StatCard
                            icon={CalendarCheck}
                            label="Bookings"
                            value={count(funnel?.bookings ?? null)}
                            hint={`${count(funnel?.completedBookings ?? 0)} fully paid`}
                            tone="emerald"
                        />
                        <StatCard
                            icon={IndianRupee}
                            label="Cost per booking"
                            value={formatMoney(costs?.costPerBooking ?? null, currency)}
                            hint="Spend ÷ bookings"
                            tone="amber"
                        />
                        <StatCard
                            icon={TrendingUp}
                            label="Booking value"
                            value={formatMoney(costs?.bookingValue ?? null, currency)}
                            hint="Value of bookings from ad leads"
                            tone="emerald"
                        />
                        <StatCard
                            icon={BarChart3}
                            label="Return on ad spend"
                            value={costs?.returnOnAdSpend === null || costs?.returnOnAdSpend === undefined
                                ? "—"
                                : `${costs.returnOnAdSpend.toFixed(2)}×`}
                            hint="Booking value ÷ ad spend"
                            tone={costs?.returnOnAdSpend > 1 ? "emerald" : "gray"}
                        />
                    </div>

                    {/* ---------------- Attribution honesty ---------------- */}
                    {attribution && attribution.unattributedLeads > 0 && (
                        <Notice tone="amber" icon={AlertCircle}>
                            <strong>{count(attribution.unattributedLeads)}</strong> lead
                            {attribution.unattributedLeads === 1 ? "" : "s"} reported by Meta in this period did not carry
                            ad attribution into the CRM (usually Instant Form leads synced before attribution fields were
                            in place). They are counted as leads but excluded from attributed cost-per-lead maths — nothing
                            is invented to close this gap.
                        </Notice>
                    )}

                    {/* ---------------- Campaign performance ---------------- */}
                    <SectionCard
                        icon={BarChart3}
                        title="Campaign performance"
                        subtitle="Live delivery numbers joined with your CRM's lead outcomes"
                        action={
                            <Link
                                href="/dashboard/marketing/meta-ads/analytics"
                                className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline"
                            >
                                Full analytics <ChevronRight size={13} />
                            </Link>
                        }
                    >
                        {campaigns.length === 0 ? (
                            <EmptyState
                                icon={Megaphone}
                                title="No campaigns in this period"
                                hint="Meta returned no campaign delivery for the selected period. This page never shows sample campaigns."
                                action={
                                    canManage ? (
                                        <Link href="/dashboard/marketing/meta-ads/campaigns" className={`${btnPrimaryClass} mt-2`}>
                                            <Plus size={15} /> Create a campaign
                                        </Link>
                                    ) : null
                                }
                            />
                        ) : (
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                            <th className="py-2 pr-3 font-bold">Campaign</th>
                                            <th className="py-2 pr-3 font-bold">Spend</th>
                                            <th className="py-2 pr-3 font-bold">Ad leads</th>
                                            <th className="py-2 pr-3 font-bold">CRM leads</th>
                                            <th className="py-2 pr-3 font-bold">Cost / lead</th>
                                            <th className="py-2 pr-3 font-bold">Clicks</th>
                                            <th className="py-2 pr-3 font-bold">CTR</th>
                                            <th className="py-2 pr-3 text-right" aria-label="Open" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {campaigns.map((campaign) => (
                                            <tr key={campaign.campaignId || campaign.campaignName} className="border-b border-gray-50 hover:bg-gray-50/60">
                                                <td className="py-2.5 pr-3">
                                                    <Link
                                                        href={`/dashboard/marketing/meta-ads/campaigns/${campaign.campaignId}`}
                                                        className="font-semibold text-gray-900 hover:text-purple-600"
                                                    >
                                                        {campaign.campaignName || "Unnamed campaign"}
                                                    </Link>
                                                    <AdminId value={campaign.campaignId} />
                                                </td>
                                                <td className="py-2.5 pr-3 text-gray-700">{formatMoney(campaign.spend, currency)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700">{count(campaign.leads)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700 font-semibold">{count(campaign.crmLeads)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700">{formatMoney(campaign.crmCostPerLead, currency)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700">{count(campaign.clicks)}</td>
                                                <td className="py-2.5 pr-3 text-gray-700">{formatPercent(campaign.ctr, 2)}</td>
                                                <td className="py-2.5 pr-3 text-right">
                                                    <Link
                                                        href={`/dashboard/marketing/meta-ads/campaigns/${campaign.campaignId}`}
                                                        className="text-xs font-bold text-purple-600 inline-flex items-center gap-0.5"
                                                    >
                                                        Manage <ChevronRight size={13} />
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="text-[11px] text-gray-400">
                            “Ad leads” = lead actions reported by Meta. “CRM leads” = leads in SpaceEzy carrying this
                            campaign&apos;s attribution. Cost per lead uses CRM leads; “—” means no attributed leads yet.
                        </p>
                    </SectionCard>

                    {/* ---------------- Quick actions ---------------- */}
                    <SectionCard icon={Lightbulb} title="Quick actions" subtitle="Everything you need to run your advertising">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            <Link
                                href="/dashboard/marketing/meta-ads/campaigns"
                                className="p-4 rounded-2xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50/40 transition group"
                            >
                                <Megaphone size={18} className="text-purple-600 mb-2" />
                                <p className="font-bold text-gray-900 text-sm group-hover:text-purple-700">Campaigns</p>
                                <p className="text-xs text-gray-500 mt-0.5">Create, pause and manage campaigns</p>
                            </Link>
                            <Link
                                href="/dashboard/marketing/meta-ads/ads"
                                className="p-4 rounded-2xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50/40 transition group"
                            >
                                <PlayCircle size={18} className="text-purple-600 mb-2" />
                                <p className="font-bold text-gray-900 text-sm group-hover:text-purple-700">Advertisements</p>
                                <p className="text-xs text-gray-500 mt-0.5">Review, pause and activate your ads</p>
                            </Link>
                            <Link
                                href="/dashboard/marketing/meta-ads/creatives"
                                className="p-4 rounded-2xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50/40 transition group"
                            >
                                <ImageIcon size={18} className="text-purple-600 mb-2" />
                                <p className="font-bold text-gray-900 text-sm group-hover:text-purple-700">Creative Studio</p>
                                <p className="text-xs text-gray-500 mt-0.5">Upload photos & videos, write ad copy</p>
                            </Link>
                            <Link
                                href="/dashboard/marketing/meta-ads/analytics"
                                className="p-4 rounded-2xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50/40 transition group"
                            >
                                <BarChart3 size={18} className="text-purple-600 mb-2" />
                                <p className="font-bold text-gray-900 text-sm group-hover:text-purple-700">Analytics & ROI</p>
                                <p className="text-xs text-gray-500 mt-0.5">Funnel, cost per booking and suggestions</p>
                            </Link>
                        </div>
                    </SectionCard>

                    <p className="text-[11px] text-gray-400 flex items-center gap-1.5 pb-2">
                        <StatusBadge status="ACTIVE" />
                        Live delivery data from Meta — no sample or projected figures are shown.
                        {overview?.range?.since || overview?.range?.until
                            ? ` Period: ${overview.range.since} to ${overview.range.until}.`
                            : ""}
                    </p>
                </>
            )}
        </PageContainer>
    );
}
