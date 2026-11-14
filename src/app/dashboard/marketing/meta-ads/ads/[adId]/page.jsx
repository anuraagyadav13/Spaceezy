"use client";
// Advertisement detail + preview — Phase 5. One ad with its live status,
// safe lifecycle actions (pause / activate-with-confirm / rename /
// duplicate / delete-with-confirm) and actual Meta previews.
//
// Preview safety: Meta returns provider iframe HTML (valid 24 h). We extract
// the iframe src and render it sandboxed — provider HTML is never injected
// into the DOM. A format Meta rejects shows an honest per-format error.
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    PlayCircle, Pause, Pencil, Copy, Trash2, RefreshCw, AlertCircle,
    Monitor, ChevronRight,
} from "lucide-react";
import { usePermissions } from "../../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../../lib/toast";
import {
    fetchMetaStatus,
    getMetaAd,
    fetchMetaAdPreviews,
    setMetaAdStatus,
    updateMetaAd,
    duplicateMetaAd,
    deleteMetaAd,
} from "../../../../../../lib/api/metaAds";
import { PREVIEW_FORMAT_INFO, extractPreviewFrameSrc } from "../../../../../../lib/metaAdsEnums";
import {
    AdminId, ConfirmDialog, ErrorBox, LoadingRow, Modal, Notice,
    PageContainer, PageHeader, SectionCard, StatusBadge, btnDangerClass,
    btnPrimaryClass, btnSecondaryClass, inputClass, labelClass,
} from "../../_components/metaAdsUi";

const DEFAULT_FORMATS = ["DESKTOP_FEED_STANDARD", "MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD", "INSTAGRAM_STORY"];

export default function AdDetailPage() {
    const params = useParams();
    const adId = String(params?.adId || "");
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");
    const queryClient = useQueryClient();

    const [previews, setPreviews] = useState(null); // { loading, items, error }
    const [showExtended, setShowExtended] = useState(false);
    const [activateOpen, setActivateOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [renameError, setRenameError] = useState(null);

    const statusQuery = useQuery({
        queryKey: ["meta-ads", "status"],
        queryFn: fetchMetaStatus,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });
    const connected = statusQuery.data?.connected === true;

    const detailQuery = useQuery({
        queryKey: ["meta-ads", "ad", adId],
        queryFn: () => getMetaAd(adId),
        enabled: canView && connected && Boolean(adId),
        retry: 1,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["meta-ads", "ad", adId] });
        queryClient.invalidateQueries({ queryKey: ["meta-ads", "ads"] });
    };

    const statusMutation = useMutation({
        mutationFn: (status) =>
            status === "ACTIVE" ? setMetaAdStatus(adId, { status: "ACTIVE", confirm: true }) : setMetaAdStatus(adId, { status }),
        onSuccess: (_data, status) => {
            showToast(status === "ACTIVE" ? "Advertisement activated" : "Advertisement paused", "success");
            setActivateOpen(false);
            invalidate();
        },
        onError: (error) => {
            setActivateOpen(false);
            showToast(error.message || "Could not change the status", "error");
        },
    });

    const renameMutation = useMutation({
        mutationFn: (payload) => updateMetaAd(adId, payload),
        onSuccess: () => {
            showToast("Advertisement renamed", "success");
            setRenameOpen(false);
            setRenameError(null);
            invalidate();
        },
        onError: (error) => setRenameError(error),
    });

    const duplicateMutation = useMutation({
        mutationFn: () => duplicateMetaAd(adId),
        onSuccess: () => {
            showToast("Copy created — it is paused until you activate it", "success");
            invalidate();
        },
        onError: (error) => showToast(error.message || "Could not duplicate the ad", "error"),
    });

    const deleteMutation = useMutation({
        mutationFn: () => deleteMetaAd(adId),
        onSuccess: () => {
            showToast("Advertisement deleted permanently", "success");
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "ads"] });
            router.push("/dashboard/marketing/meta-ads/ads");
        },
        onError: (error) => {
            setDeleteOpen(false);
            showToast(error.message || "Could not delete the ad", "error");
        },
    });

    const loadPreviews = async (formats) => {
        setPreviews({ loading: true, items: [], error: null });
        try {
            const data = await fetchMetaAdPreviews(adId, formats);
            setPreviews({ loading: false, items: data?.previews || [], error: null });
        } catch (error) {
            setPreviews({ loading: false, items: [], error });
        }
    };

    if (!canView) {
        return (
            <PageContainer>
                <PageHeader icon={PlayCircle} title="Advertisement" subtitle="Ad details." />
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">This area is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </PageContainer>
        );
    }

    const ad = detailQuery.data || null;
    const effective = ad?.effectiveStatus || ad?.status || null;
    const isActive = effective === "ACTIVE";

    return (
        <PageContainer>
            <PageHeader
                backHref="/dashboard/marketing/meta-ads/ads"
                backLabel="Advertisements"
                icon={PlayCircle}
                title={ad?.name || "Advertisement"}
                subtitle="Live status, previews and full lifecycle control."
                badge={ad ? <StatusBadge status={effective} /> : null}
                actions={
                    <>
                        <button type="button" onClick={() => detailQuery.refetch()} className={btnSecondaryClass}>
                            <RefreshCw size={14} className={detailQuery.isFetching ? "animate-spin" : ""} /> Refresh
                        </button>
                        {canManage && ad && (
                            <>
                                {isActive ? (
                                    <button
                                        type="button"
                                        onClick={() => statusMutation.mutate("PAUSED")}
                                        disabled={statusMutation.isPending}
                                        className="px-3.5 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                                    >
                                        <Pause size={14} className="inline mr-1.5" /> Pause
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setActivateOpen(true)}
                                        className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                                    >
                                        <PlayCircle size={14} className="inline mr-1.5" /> Activate
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRenameError(null);
                                        setRenameValue(ad.name || "");
                                        setRenameOpen(true);
                                    }}
                                    className={btnSecondaryClass}
                                >
                                    <Pencil size={14} /> Rename
                                </button>
                                <button
                                    type="button"
                                    onClick={() => duplicateMutation.mutate()}
                                    disabled={duplicateMutation.isPending}
                                    className={btnSecondaryClass}
                                >
                                    <Copy size={14} /> Duplicate
                                </button>
                                <button type="button" onClick={() => setDeleteOpen(true)} className={btnDangerClass}>
                                    <Trash2 size={14} /> Delete
                                </button>
                            </>
                        )}
                    </>
                }
            />

            {statusQuery.isPending && <LoadingRow label="Checking your Meta connection…" />}
            {!statusQuery.isPending && !connected && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center space-y-3">
                    <p className="font-bold text-gray-900">Meta account not connected</p>
                    <Link href="/dashboard/marketing/meta-ads/settings" className={btnPrimaryClass}>
                        Open Meta connection settings
                    </Link>
                </div>
            )}

            {connected && detailQuery.isPending && <LoadingRow label="Loading your advertisement…" />}
            {connected && detailQuery.isError && <ErrorBox error={detailQuery.error} onRetry={() => detailQuery.refetch()} />}

            {connected && ad && (
                <>
                    {/* ---------------- Overview ---------------- */}
                    <div className="grid lg:grid-cols-3 gap-5 items-start">
                        <SectionCard icon={PlayCircle} title="Advertisement" subtitle="Where it runs and what it shows">
                            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                <div>
                                    <dt className={labelClass}>Status</dt>
                                    <dd><StatusBadge status={effective} /></dd>
                                </div>
                                <div>
                                    <dt className={labelClass}>Configured as</dt>
                                    <dd className="text-gray-700 capitalize">{ad.configuredStatus ? ad.configuredStatus.toLowerCase() : "—"}</dd>
                                </div>
                                <div>
                                    <dt className={labelClass}>Campaign</dt>
                                    <dd>
                                        {ad.campaignId ? (
                                            <Link
                                                href={`/dashboard/marketing/meta-ads/campaigns/${ad.campaignId}`}
                                                className="text-purple-600 font-semibold hover:underline inline-flex items-center gap-1"
                                            >
                                                Open campaign <ChevronRight size={13} />
                                            </Link>
                                        ) : (
                                            "—"
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt className={labelClass}>Ad set</dt>
                                    <dd>
                                        {ad.adsetId ? (
                                            <Link
                                                href={`/dashboard/marketing/meta-ads/campaigns/${ad.campaignId || ""}/adsets/${ad.adsetId}`}
                                                className="text-purple-600 font-semibold hover:underline inline-flex items-center gap-1"
                                            >
                                                Open ad set <ChevronRight size={13} />
                                            </Link>
                                        ) : (
                                            "—"
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt className={labelClass}>Creative</dt>
                                    <dd>
                                        {ad.creativeId ? (
                                            <Link
                                                href={`/dashboard/marketing/meta-ads/creatives/${ad.creativeId}`}
                                                className="text-purple-600 font-semibold hover:underline inline-flex items-center gap-1"
                                            >
                                                View creative <ChevronRight size={13} />
                                            </Link>
                                        ) : (
                                            "—"
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt className={labelClass}>Last updated</dt>
                                    <dd className="text-gray-700">
                                        {ad.updatedTime
                                            ? new Date(ad.updatedTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                                            : "—"}
                                    </dd>
                                </div>
                            </dl>
                            <AdminId value={ad.id} prefix="Ad" />

                            {!isActive && (
                                <Notice tone="amber" icon={AlertCircle}>
                                    This advertisement is not delivering. When you activate it, Meta reviews it first and it
                                    may start spending — you will confirm before that happens.
                                </Notice>
                            )}
                            {isActive && (
                                <Notice tone="blue" icon={PlayCircle}>
                                    This advertisement is active and may be spending. Pause it any time to stop delivery
                                    immediately.
                                </Notice>
                            )}
                        </SectionCard>

                        <div className="lg:col-span-2 space-y-4">
                            {/* ---------------- Actual Meta preview ---------------- */}
                            <SectionCard
                                icon={Monitor}
                                title="Actual Meta preview"
                                subtitle="Rendered by Meta — valid for 24 hours"
                                action={
                                    <button
                                        type="button"
                                        onClick={() => loadPreviews(showExtended ? PREVIEW_FORMAT_INFO.map((f) => f.format) : DEFAULT_FORMATS)}
                                        disabled={previews?.loading}
                                        className={btnSecondaryClass}
                                    >
                                        {previews?.loading ? <RefreshCw size={14} className="animate-spin" /> : <Monitor size={14} />}
                                        {previews?.loading ? "Asking Meta…" : "Load preview"}
                                    </button>
                                }
                            >
                                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={showExtended}
                                        onChange={(e) => setShowExtended(e.target.checked)}
                                    />
                                    Show all placements (stories & reels — Meta may reject some for this ad type)
                                </label>

                                {previews?.error && <ErrorBox error={previews.error} />}
                                {previews?.loading && <LoadingRow label="Meta is rendering your preview…" />}
                                {previews && !previews.loading && (
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        {previews.items.map((entry) => {
                                            const src = extractPreviewFrameSrc(entry.html);
                                            const info = PREVIEW_FORMAT_INFO.find((f) => f.format === entry.format);
                                            return (
                                                <div key={entry.format} className="rounded-2xl border border-gray-200 overflow-hidden">
                                                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                                                        <p className="text-xs font-bold text-gray-700">{info?.label || entry.format}</p>
                                                        {entry.error && <span className="text-[10px] font-bold text-amber-600">Unavailable</span>}
                                                    </div>
                                                    {src ? (
                                                        <iframe
                                                            src={src}
                                                            title={`Meta preview — ${info?.label || entry.format}`}
                                                            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                                                            className="w-full h-72 bg-white"
                                                            loading="lazy"
                                                            referrerPolicy="no-referrer"
                                                        />
                                                    ) : (
                                                        <div className="h-40 flex items-center justify-center px-4 text-center">
                                                            <p className="text-xs text-gray-500">
                                                                {entry.error || "Meta did not return a preview for this placement."}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {!previews && (
                                    <Notice tone="gray" icon={Monitor}>
                                        Press <strong>Load preview</strong> to see how Meta renders this ad. Nothing is
                                        simulated — if Meta has no preview for a placement, you will see that instead.
                                    </Notice>
                                )}
                            </SectionCard>

                            {ad.previewShareableLink && (
                                <SectionCard icon={Monitor} title="Shareable preview link" subtitle="Send it to a colleague to review the ad before activation">
                                    <p className="text-xs text-gray-500 break-all bg-gray-50 rounded-xl p-3 border border-gray-100">
                                        {ad.previewShareableLink}
                                    </p>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Generated by Meta — links expire after 24 hours.
                                    </p>
                                </SectionCard>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Activate — mandatory acknowledgement */}
            <ConfirmDialog
                open={activateOpen}
                title="Activate this advertisement?"
                body={ad ? `“${ad.name || "This ad"}” will start delivering to your audience.` : ""}
                warning="Activation may start ad spend immediately. Charges apply for as long as the ad is active."
                confirmLabel="Activate advertisement"
                requireCheckbox
                checkboxLabel="I understand this ad will start delivering and may spend money."
                busy={statusMutation.isPending}
                onConfirm={() => statusMutation.mutate("ACTIVE")}
                onCancel={() => setActivateOpen(false)}
            />

            {/* Delete — permanent, mandatory acknowledgement */}
            <ConfirmDialog
                open={deleteOpen}
                title="Delete this advertisement permanently?"
                body={ad ? `“${ad.name || "This ad"}” will be deleted from Meta.` : ""}
                warning="Deletion is permanent. The ad stops delivering and cannot be restored — you would have to recreate it."
                confirmLabel="Delete permanently"
                requireCheckbox
                checkboxLabel="I understand this advertisement will be permanently deleted and cannot be restored."
                busy={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate()}
                onCancel={() => setDeleteOpen(false)}
                tone="red"
            />

            {/* Rename */}
            <Modal open={renameOpen} title="Rename advertisement" subtitle="Only the name changes — delivery is unaffected." onClose={() => setRenameOpen(false)}>
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
                        <button type="button" onClick={() => setRenameOpen(false)} disabled={renameMutation.isPending} className={btnSecondaryClass}>
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
                                renameMutation.mutate({ name: renameValue.trim() });
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
