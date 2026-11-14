"use client";
// Creative detail + preview — Phase 5. Shows one saved ad creative with its
// actual Meta previews and the safe management actions (rename, delete,
// use in a new ad).
//
// Preview safety: Meta returns provider iframe HTML (valid 24 h). We extract
// the iframe src and render it sandboxed — provider HTML is never injected
// into the DOM. A format Meta rejects shows an honest per-format error, never
// a fabricated image.
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Image as ImageIcon, Film, RefreshCw, Trash2, Pencil, PlayCircle,
    AlertCircle, Monitor,
} from "lucide-react";
import { usePermissions } from "../../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../../lib/toast";
import {
    fetchMetaStatus,
    getMetaCreative,
    fetchMetaCreativePreviews,
    updateMetaCreative,
    deleteMetaCreative,
} from "../../../../../../lib/api/metaAds";
import {
    CTA_LABELS, PREVIEW_FORMAT_INFO, extractPreviewFrameSrc,
} from "../../../../../../lib/metaAdsEnums";
import {
    AdminId, ConfirmDialog, ErrorBox, LoadingRow, Modal, Notice,
    PageContainer, PageHeader, SectionCard, StatusBadge, btnDangerClass,
    btnPrimaryClass, btnSecondaryClass, inputClass, labelClass,
} from "../../_components/metaAdsUi";

const DEFAULT_FORMATS = ["DESKTOP_FEED_STANDARD", "MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD", "INSTAGRAM_STORY"];

export default function CreativeDetailPage() {
    const params = useParams();
    const creativeId = String(params?.creativeId || "");
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");
    const queryClient = useQueryClient();

    const [showExtended, setShowExtended] = useState(false);
    const [previews, setPreviews] = useState(null); // { loading, items, error }
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [renameError, setRenameError] = useState(null);
    const [deleteOpen, setDeleteOpen] = useState(false);

    const statusQuery = useQuery({
        queryKey: ["meta-ads", "status"],
        queryFn: fetchMetaStatus,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });
    const connected = statusQuery.data?.connected === true;

    const detailQuery = useQuery({
        queryKey: ["meta-ads", "creative", creativeId],
        queryFn: () => getMetaCreative(creativeId),
        enabled: canView && connected && Boolean(creativeId),
        retry: 1,
    });

    const renameMutation = useMutation({
        mutationFn: (payload) => updateMetaCreative(creativeId, payload),
        onSuccess: () => {
            showToast("Creative renamed", "success");
            setRenameOpen(false);
            setRenameError(null);
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "creative", creativeId] });
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "creatives"] });
        },
        onError: (error) => setRenameError(error),
    });

    const deleteMutation = useMutation({
        mutationFn: () => deleteMetaCreative(creativeId),
        onSuccess: () => {
            showToast("Creative deleted permanently", "success");
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "creatives"] });
            router.push("/dashboard/marketing/meta-ads/creatives");
        },
        onError: (error) => {
            setDeleteOpen(false);
            showToast(error.message || "Could not delete the creative — it may still be used by an ad", "error");
        },
    });

    const loadPreviews = async (formats) => {
        setPreviews({ loading: true, items: [], error: null });
        try {
            const data = await fetchMetaCreativePreviews(creativeId, formats);
            setPreviews({ loading: false, items: data?.previews || [], error: null });
        } catch (error) {
            setPreviews({ loading: false, items: [], error });
        }
    };

    if (!canView) {
        return (
            <PageContainer>
                <PageHeader icon={ImageIcon} title="Ad creative" subtitle="Creative details." />
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">This area is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </PageContainer>
        );
    }

    const creative = detailQuery.data || null;

    return (
        <PageContainer>
            <PageHeader
                backHref="/dashboard/marketing/meta-ads/creatives"
                backLabel="Creative Studio"
                icon={creative?.mediaType === "video" ? Film : ImageIcon}
                title={creative?.name || "Ad creative"}
                subtitle="Saved content you can attach to any advertisement."
                badge={creative?.status ? <StatusBadge status={creative.status} /> : null}
                actions={
                    <>
                        <button type="button" onClick={() => detailQuery.refetch()} className={btnSecondaryClass}>
                            <RefreshCw size={14} className={detailQuery.isFetching ? "animate-spin" : ""} /> Refresh
                        </button>
                        {canManage && creative && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRenameError(null);
                                        setRenameValue(creative.name || "");
                                        setRenameOpen(true);
                                    }}
                                    className={btnSecondaryClass}
                                >
                                    <Pencil size={14} /> Rename
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
                    <Link href="/dashboard/marketing/meta-ads/settings" className={btnPrimaryClass}>Open Meta connection settings</Link>
                </div>
            )}

            {connected && detailQuery.isPending && <LoadingRow label="Loading your creative…" />}
            {connected && detailQuery.isError && <ErrorBox error={detailQuery.error} onRetry={() => detailQuery.refetch()} />}

            {connected && creative && (
                <>
                    {/* ---------------- Content ---------------- */}
                    <div className="grid lg:grid-cols-2 gap-5 items-start">
                        <SectionCard icon={ImageIcon} title="Ad content" subtitle="Exactly what customers will see">
                            <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white max-w-sm mx-auto">
                                <div className="flex items-center gap-2 p-3 border-b border-gray-100">
                                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xs">
                                        {(creative.pageId || "P").toString().charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-900 truncate">Your Facebook Page</p>
                                        <p className="text-[10px] text-gray-400">Sponsored</p>
                                    </div>
                                </div>
                                <p className="px-3 pt-2 text-sm text-gray-800 whitespace-pre-wrap">{creative.body || ""}</p>
                                <div className="mx-3 mt-2 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                                    {creative.mediaType === "video" ? (
                                        <div className="h-40 flex items-center justify-center">
                                            <Film size={26} className="text-gray-300" />
                                            <span className="ml-2 text-xs text-gray-400">Video creative</span>
                                        </div>
                                    ) : creative.thumbnailUrl || creative.objectUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={creative.thumbnailUrl || creative.objectUrl} alt="" className="w-full h-40 object-cover" />
                                    ) : (
                                        <div className="h-40 flex items-center justify-center text-xs text-gray-400">
                                            Image creative
                                        </div>
                                    )}
                                </div>
                                <div className="px-3 py-2">
                                    <p className="text-[11px] text-gray-500 truncate">{creative.link || ""}</p>
                                    <p className="text-sm font-bold text-gray-900">{creative.headline || creative.title || ""}</p>
                                    <p className="text-[11px] text-gray-500">{creative.description || ""}</p>
                                </div>
                                <div className="px-3 pb-3">
                                    <span className="block text-center px-3 py-2 rounded-lg bg-gray-100 text-sm font-bold text-gray-700">
                                        {CTA_LABELS[creative.callToActionType] || creative.callToActionType || ""}
                                    </span>
                                </div>
                            </div>
                            <AdminId value={creative.id} prefix="Creative" />
                        </SectionCard>

                        <div className="space-y-4">
                            <SectionCard icon={Monitor} title="Details" subtitle="Saved in your Meta ad library">
                                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                    <div>
                                        <dt className={labelClass}>Status</dt>
                                        <dd><StatusBadge status={creative.status} /></dd>
                                    </div>
                                    <div>
                                        <dt className={labelClass}>Media type</dt>
                                        <dd className="text-gray-700 capitalize">{creative.mediaType || "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className={labelClass}>Button</dt>
                                        <dd className="text-gray-700">{CTA_LABELS[creative.callToActionType] || creative.callToActionType || "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className={labelClass}>Destination</dt>
                                        <dd className="text-gray-700 break-all">{creative.link || creative.ctaLink || "—"}</dd>
                                    </div>
                                </dl>
                                <Notice tone="gray">
                                    Ad content is fixed once saved — Meta does not allow editing it. To change the wording,
                                    create a new creative. You can rename this one at any time.
                                </Notice>
                                {canManage && (
                                    <Link
                                        href={`/dashboard/marketing/meta-ads/ads/new?creativeId=${creative.id}`}
                                        className={`${btnPrimaryClass} w-full justify-center`}
                                    >
                                        <PlayCircle size={15} /> Use in a new advertisement
                                    </Link>
                                )}
                            </SectionCard>

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
                                    Show all placements (stories & reels — Meta may reject some for this creative type)
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
                        </div>
                    </div>
                </>
            )}

            {/* Rename */}
            <Modal open={renameOpen} title="Rename creative" subtitle="Only the name can be changed." onClose={() => setRenameOpen(false)}>
                <div className="space-y-4">
                    <ErrorBox error={renameError} />
                    <div>
                        <label className={labelClass}>Creative name</label>
                        <input
                            type="text"
                            maxLength={100}
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

            {/* Permanent delete */}
            <ConfirmDialog
                open={deleteOpen}
                title="Delete this ad creative permanently?"
                body={creative ? `“${creative.name || creative.id}” will be deleted from Meta.` : ""}
                warning="Deletion is permanent. Any advertisement using this creative stops delivering and cannot be restored."
                confirmLabel="Delete permanently"
                requireCheckbox
                checkboxLabel="I understand this creative will be permanently deleted and cannot be restored."
                busy={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate()}
                onCancel={() => setDeleteOpen(false)}
            />
        </PageContainer>
    );
}
