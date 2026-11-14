"use client";
// Ads Manager — Phase 5. The complete ad lifecycle in plain language:
// filter, pause/resume, activate (with mandatory acknowledgement), rename,
// duplicate (always lands paused) and delete (permanent, acknowledged).
//
// Safety notes:
// - Activation only through ConfirmDialog + acknowledge checkbox (server
//   additionally requires confirm:true). Pausing is one click — it reduces
//   risk, never spend.
// - Duplicate forces PAUSED server-side; a copy can never start delivering
//   on its own.
// - Delete is permanent in Meta's API → mandatory acknowledge + ?confirm=true.
// - No raw API payloads or technical IDs are shown to ordinary client users
//   (AdminId renders IDs for administrators only).
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    PlayCircle, Pause, Pencil, Copy, Trash2, Plus, RefreshCw, AlertCircle,
    Filter, Eye,
} from "lucide-react";
import { usePermissions } from "../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../lib/toast";
import {
    fetchMetaStatus,
    fetchMetaCampaigns,
    fetchMetaAdSets,
    fetchMetaAds,
    setMetaAdStatus,
    updateMetaAd,
    duplicateMetaAd,
    deleteMetaAd,
} from "../../../../../lib/api/metaAds";
import {
    AdminId, ConfirmDialog, EmptyState, ErrorBox, LoadingRow, Modal, Notice,
    PageContainer, PageHeader, Pager, SectionCard, StatusBadge,
    btnPrimaryClass, btnSecondaryClass, inputClass, labelClass,
} from "../_components/metaAdsUi";

const PAGE_SIZE = 50;

// Filter options for ads: the states a client user actually reasons about.
const AD_STATUS_FILTERS = [
    { value: "", label: "All ads" },
    { value: "ACTIVE", label: "Active (delivering)" },
    { value: "PAUSED", label: "Paused" },
    { value: "PENDING_REVIEW", label: "In review" },
    { value: "DISAPPROVED", label: "Not approved" },
];

export default function AdsManagerPage() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");
    const queryClient = useQueryClient();

    const [campaignFilter, setCampaignFilter] = useState("");
    const [adsetFilter, setAdsetFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [cursorStack, setCursorStack] = useState([]);

    // Action targets
    const [activateTarget, setActivateTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [renameTarget, setRenameTarget] = useState(null);
    const [renameValue, setRenameValue] = useState("");
    const [renameError, setRenameError] = useState(null);

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
        queryKey: ["meta-ads", "campaigns", "filter"],
        queryFn: () => fetchMetaCampaigns({ limit: 100 }),
        enabled: canView && connected,
        staleTime: 120_000,
        retry: 1,
    });

    const adsetsQuery = useQuery({
        queryKey: ["meta-ads", "adsets", "filter", campaignFilter],
        queryFn: () => fetchMetaAdSets({ campaignId: campaignFilter, limit: 100 }),
        enabled: canView && connected && Boolean(campaignFilter),
        staleTime: 120_000,
        retry: 1,
    });

    const adsQuery = useQuery({
        queryKey: ["meta-ads", "ads", "list", campaignFilter, adsetFilter, statusFilter, after],
        queryFn: () =>
            fetchMetaAds({
                limit: PAGE_SIZE,
                ...(campaignFilter ? { campaignId: campaignFilter } : {}),
                ...(adsetFilter ? { adsetId: adsetFilter } : {}),
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(after ? { after } : {}),
            }),
        enabled: canView && connected,
        retry: 1,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["meta-ads", "ads"] });
        queryClient.invalidateQueries({ queryKey: ["meta-ads", "campaigns"] });
    };

    // ---------------- Status changes ----------------
    const statusMutation = useMutation({
        mutationFn: ({ ad, status }) => setMetaAdStatus(ad.id, status === "ACTIVE" ? { status: "ACTIVE", confirm: true } : { status }),
        onSuccess: (_data, variables) => {
            showToast(variables.status === "ACTIVE" ? "Advertisement activated" : "Advertisement paused", "success");
            setActivateTarget(null);
            invalidate();
        },
        onError: (error) => {
            setActivateTarget(null);
            showToast(error.message || "Could not change the status", "error");
        },
    });

    // ---------------- Rename (modal) ----------------
    const renameMutation = useMutation({
        mutationFn: ({ id, payload }) => updateMetaAd(id, payload),
        onSuccess: () => {
            showToast("Advertisement renamed", "success");
            setRenameTarget(null);
            setRenameError(null);
            invalidate();
        },
        onError: (error) => setRenameError(error),
    });

    // ---------------- Duplicate (always paused) ----------------
    const duplicateMutation = useMutation({
        mutationFn: (ad) => duplicateMetaAd(ad.id),
        onSuccess: () => {
            showToast("Copy created — it is paused until you activate it", "success");
            invalidate();
        },
        onError: (error) => showToast(error.message || "Could not duplicate the ad", "error"),
    });

    // ---------------- Delete (permanent) ----------------
    const deleteMutation = useMutation({
        mutationFn: (ad) => deleteMetaAd(ad.id),
        onSuccess: () => {
            showToast("Advertisement deleted permanently", "success");
            setDeleteTarget(null);
            invalidate();
        },
        onError: (error) => {
            setDeleteTarget(null);
            showToast(error.message || "Could not delete the ad", "error");
        },
    });

    if (!canView) {
        return (
            <PageContainer>
                <PageHeader icon={PlayCircle} title="Advertisements" subtitle="Review and manage your ads." />
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Advertisements are restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </PageContainer>
        );
    }

    const campaigns = campaignsQuery.data?.items || [];
    const adsets = adsetsQuery.data?.items || [];
    const ads = adsQuery.data?.items || [];
    const paging = adsQuery.data?.paging || null;
    const hasNext = Boolean(paging?.cursors?.after);
    const hasPrev = cursorStack.length > 0;

    const isActive = (ad) => ad.effectiveStatus === "ACTIVE" || ad.status === "ACTIVE";

    return (
        <PageContainer>
            <PageHeader
                icon={PlayCircle}
                title="Advertisements"
                subtitle="Every ad you have created — pause, activate, duplicate or delete with full control."
                actions={
                    <>
                        <button type="button" onClick={() => adsQuery.refetch()} className={btnSecondaryClass}>
                            <RefreshCw size={14} className={adsQuery.isFetching ? "animate-spin" : ""} /> Refresh
                        </button>
                        {canManage && (
                            <Link href="/dashboard/marketing/meta-ads/ads/new" className={btnPrimaryClass}>
                                <Plus size={15} /> New advertisement
                            </Link>
                        )}
                    </>
                }
            />

            {statusQuery.isPending && <LoadingRow label="Checking your Meta connection…" />}
            {!statusQuery.isPending && !connected && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center space-y-3">
                    <p className="font-bold text-gray-900">Meta account not connected</p>
                    <p className="text-sm text-gray-500 max-w-lg mx-auto">
                        Connect your Meta account to see and manage your advertisements.
                    </p>
                    <Link href="/dashboard/marketing/meta-ads/settings" className={btnPrimaryClass}>
                        Open Meta connection settings
                    </Link>
                </div>
            )}

            {connected && (
                <>
                    <Notice tone="amber" icon={AlertCircle}>
                        New advertisements are always created <strong>paused</strong>. Activation is a separate,
                        deliberate step — nothing ever starts spending on its own.
                    </Notice>

                    <SectionCard
                        icon={Filter}
                        title="Your advertisements"
                        subtitle="Filter by campaign, ad set or status"
                        action={
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={campaignFilter}
                                    onChange={(e) => {
                                        setCampaignFilter(e.target.value);
                                        setAdsetFilter("");
                                        resetPaging();
                                    }}
                                    className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-700 focus:outline-none focus:border-purple-500"
                                >
                                    <option value="">All campaigns</option>
                                    {campaigns.map((campaign) => (
                                        <option key={campaign.id} value={campaign.id}>
                                            {campaign.name || `Campaign ${campaign.id}`}
                                        </option>
                                    ))}
                                </select>
                                {campaignFilter && (
                                    <select
                                        value={adsetFilter}
                                        onChange={(e) => {
                                            setAdsetFilter(e.target.value);
                                            resetPaging();
                                        }}
                                        className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-700 focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="">All ad sets</option>
                                        {adsets.map((adset) => (
                                            <option key={adset.id} value={adset.id}>
                                                {adset.name || `Ad set ${adset.id}`}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <select
                                    value={statusFilter}
                                    onChange={(e) => {
                                        setStatusFilter(e.target.value);
                                        resetPaging();
                                    }}
                                    className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-700 focus:outline-none focus:border-purple-500"
                                >
                                    {AD_STATUS_FILTERS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                        }
                    >
                        <ErrorBox error={adsQuery.error} onRetry={() => adsQuery.refetch()} />

                        {adsQuery.isPending ? (
                            <LoadingRow label="Loading your advertisements…" />
                        ) : ads.length === 0 ? (
                            <EmptyState
                                icon={PlayCircle}
                                title={campaignFilter || adsetFilter || statusFilter ? "No ads match these filters" : "No advertisements yet"}
                                hint={
                                    campaignFilter || adsetFilter || statusFilter
                                        ? "Try clearing the filters above."
                                        : "An advertisement combines an ad set (who sees it) with a creative (what they see). Create one to start reaching customers."
                                }
                                action={
                                    canManage && !campaignFilter && !adsetFilter && !statusFilter ? (
                                        <Link href="/dashboard/marketing/meta-ads/ads/new" className={`${btnPrimaryClass} mt-2`}>
                                            <Plus size={15} /> Create your first advertisement
                                        </Link>
                                    ) : null
                                }
                            />
                        ) : (
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                            <th className="py-2 pr-3 font-bold">Advertisement</th>
                                            <th className="py-2 pr-3 font-bold">Status</th>
                                            <th className="py-2 pr-3 font-bold">Campaign</th>
                                            <th className="py-2 pr-3 font-bold">Ad set</th>
                                            <th className="py-2 pr-3 text-right" aria-label="Actions" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ads.map((ad) => (
                                            <tr key={ad.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                                                <td className="py-2.5 pr-3">
                                                    <Link
                                                        href={`/dashboard/marketing/meta-ads/ads/${ad.id}`}
                                                        className="font-semibold text-gray-900 hover:text-purple-600"
                                                    >
                                                        {ad.name || "Unnamed ad"}
                                                    </Link>
                                                    <AdminId value={ad.id} prefix="Ad" />
                                                </td>
                                                <td className="py-2.5 pr-3">
                                                    <StatusBadge status={ad.effectiveStatus || ad.status} />
                                                </td>
                                                <td className="py-2.5 pr-3 text-xs text-gray-500">
                                                    {ad.campaignId ? (
                                                        <Link
                                                            href={`/dashboard/marketing/meta-ads/campaigns/${ad.campaignId}`}
                                                            className="hover:text-purple-600 hover:underline"
                                                        >
                                                            Open campaign
                                                        </Link>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </td>
                                                <td className="py-2.5 pr-3 text-xs text-gray-500">
                                                    {ad.adsetId ? (
                                                        <Link
                                                            href={`/dashboard/marketing/meta-ads/campaigns/${ad.campaignId || ""}/adsets/${ad.adsetId}`}
                                                            className="hover:text-purple-600 hover:underline"
                                                        >
                                                            Open ad set
                                                        </Link>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </td>
                                                <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                                                    <Link
                                                        href={`/dashboard/marketing/meta-ads/ads/${ad.id}`}
                                                        className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline mr-3"
                                                    >
                                                        <Eye size={12} /> Open
                                                    </Link>
                                                    {canManage && (
                                                        <>
                                                            {isActive(ad) ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => statusMutation.mutate({ ad, status: "PAUSED" })}
                                                                    disabled={statusMutation.isPending}
                                                                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:underline mr-3"
                                                                >
                                                                    <Pause size={12} /> Pause
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setActivateTarget(ad)}
                                                                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline mr-3"
                                                                >
                                                                    <PlayCircle size={12} /> Activate
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setRenameError(null);
                                                                    setRenameValue(ad.name || "");
                                                                    setRenameTarget(ad);
                                                                }}
                                                                className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 hover:underline mr-3"
                                                            >
                                                                <Pencil size={12} /> Rename
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => duplicateMutation.mutate(ad)}
                                                                disabled={duplicateMutation.isPending}
                                                                className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 hover:underline mr-3"
                                                            >
                                                                <Copy size={12} /> Duplicate
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDeleteTarget(ad)}
                                                                className="inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:underline"
                                                            >
                                                                <Trash2 size={12} /> Delete
                                                            </button>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {(hasNext || hasPrev) && (
                            <Pager
                                label={`${ads.length} ad${ads.length === 1 ? "" : "s"} on this page`}
                                loading={adsQuery.isFetching}
                                hasPrev={hasPrev}
                                hasNext={hasNext}
                                onPrev={() => setCursorStack((s) => s.slice(0, -1))}
                                onNext={() => setCursorStack((s) => [...s, paging.cursors.after])}
                            />
                        )}

                        <p className="text-[11px] text-gray-400">
                            Statuses shown are Meta&apos;s live delivery state. Pausing takes effect immediately;
                            activating may start ad spend.
                        </p>
                    </SectionCard>
                </>
            )}

            {/* Activate — mandatory acknowledgement */}
            <ConfirmDialog
                open={Boolean(activateTarget)}
                title="Activate this advertisement?"
                body={activateTarget ? `“${activateTarget.name || "This ad"}” will start delivering to your audience.` : ""}
                warning="Activation may start ad spend immediately. Charges apply for as long as the ad is active."
                confirmLabel="Activate advertisement"
                requireCheckbox
                checkboxLabel="I understand this ad will start delivering and may spend money."
                busy={statusMutation.isPending}
                onConfirm={() => statusMutation.mutate({ ad: activateTarget, status: "ACTIVE" })}
                onCancel={() => setActivateTarget(null)}
            />

            {/* Delete — permanent, mandatory acknowledgement */}
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title="Delete this advertisement permanently?"
                body={deleteTarget ? `“${deleteTarget.name || "This ad"}” will be deleted from Meta.` : ""}
                warning="Deletion is permanent. The ad stops delivering and cannot be restored — you would have to recreate it."
                confirmLabel="Delete permanently"
                requireCheckbox
                checkboxLabel="I understand this advertisement will be permanently deleted and cannot be restored."
                busy={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate(deleteTarget)}
                onCancel={() => setDeleteTarget(null)}
                tone="red"
            />

            {/* Rename */}
            <Modal open={Boolean(renameTarget)} title="Rename advertisement" subtitle="Only the name changes — delivery is unaffected." onClose={() => setRenameTarget(null)}>
                <div className="space-y-4">
                    <ErrorBox error={renameError} />
                    <div>
                        <label className={labelClass}>Advertisement name</label>
                        <input
                            type="text"
                            maxLength={200}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setRenameTarget(null)} disabled={renameMutation.isPending} className={btnSecondaryClass}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setRenameError(null);
                                if (!renameValue.trim()) {
                                    setRenameError(new Error("Name cannot be empty"));
                                    return;
                                }
                                renameMutation.mutate({ id: renameTarget.id, payload: { name: renameValue.trim() } });
                            }}
                            disabled={renameMutation.isPending}
                            className={btnPrimaryClass}
                        >
                            {renameMutation.isPending && <RefreshCw size={14} className="animate-spin" />} Save name
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
