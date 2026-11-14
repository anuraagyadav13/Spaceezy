"use client";
// Creative Library — Phase 5. Photos, videos and saved ad creatives from the
// connected Meta ad account, with upload / rename / delete.
//
// Safety notes:
// - Nothing here can publish an ad: creatives are content containers and are
//   only ever attached to an ad through the explicit ad-creation flow, which
//   itself lands the ad PAUSED.
// - Image/video/creative deletion is PERMANENT in Meta's API, so every
//   delete runs through the mandatory-acknowledge ConfirmDialog and sends
//   ?confirm=true (server-enforced). A file still in use is rejected by
//   Meta and that error surfaces honestly.
// - Uploads are size- and type-gated client-side (same limits as the
//   server) before any bytes leave the browser.
import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Images, Image as ImageIcon, Film, LayoutList, Upload, RefreshCw, Trash2,
    Pencil, Plus, AlertCircle, Eye,
} from "lucide-react";
import { usePermissions } from "../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../lib/toast";
import {
    fetchMetaStatus,
    fetchMetaImages,
    fetchMetaVideos,
    fetchMetaCreatives,
    uploadMetaImage,
    uploadMetaVideo,
    deleteMetaImage,
    deleteMetaVideo,
    deleteMetaCreative,
    updateMetaCreative,
} from "../../../../../lib/api/metaAds";
import {
    CTA_LABELS,
    IMAGE_MIME_TYPES,
    MAX_IMAGE_BYTES,
    MAX_VIDEO_BYTES,
    VIDEO_MIME_TYPES,
} from "../../../../../lib/metaAdsEnums";
import {
    AdminId, ConfirmDialog, EmptyState, ErrorBox, LoadingRow, Modal, Notice,
    PageContainer, PageHeader, Pager, SectionCard, StatCard,
    Tabs, btnPrimaryClass, btnSecondaryClass, inputClass, labelClass,
} from "../_components/metaAdsUi";

const PAGE_SIZE = 50;

const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read the selected file"));
        reader.readAsDataURL(file);
    });

const formatDateTime = (iso) => {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const formatSize = (bytes) => {
    if (!Number.isFinite(bytes)) return "—";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

export default function CreativeLibraryPage() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");
    const queryClient = useQueryClient();

    const [tab, setTab] = useState("images");
    const [cursorStack, setCursorStack] = useState([]);
    const [uploadError, setUploadError] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null); // { kind, item }
    const [renameTarget, setRenameTarget] = useState(null); // creative
    const [renameValue, setRenameValue] = useState("");
    const [renameError, setRenameError] = useState(null);
    const imageInputRef = useRef(null);
    const videoInputRef = useRef(null);

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

    const imagesQuery = useQuery({
        queryKey: ["meta-ads", "creative", "images", after],
        queryFn: () => fetchMetaImages({ limit: PAGE_SIZE, ...(after ? { after } : {}) }),
        enabled: canView && connected && tab === "images",
        retry: 1,
    });
    const videosQuery = useQuery({
        queryKey: ["meta-ads", "creative", "videos", after],
        queryFn: () => fetchMetaVideos({ limit: PAGE_SIZE, ...(after ? { after } : {}) }),
        enabled: canView && connected && tab === "videos",
        retry: 1,
    });
    const creativesQuery = useQuery({
        queryKey: ["meta-ads", "creatives", after],
        queryFn: () => fetchMetaCreatives({ limit: PAGE_SIZE, ...(after ? { after } : {}) }),
        enabled: canView && connected && tab === "creatives",
        retry: 1,
    });

    const activeQuery = tab === "images" ? imagesQuery : tab === "videos" ? videosQuery : creativesQuery;
    const items = activeQuery.data?.items || [];
    const paging = activeQuery.data?.paging || null;
    const hasNext = Boolean(paging?.cursors?.after);
    const hasPrev = cursorStack.length > 0;

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["meta-ads", "creative"] });
        queryClient.invalidateQueries({ queryKey: ["meta-ads", "creatives"] });
    };

    // ---------------- Uploads ----------------
    const uploadMutation = useMutation({
        mutationFn: ({ kind, payload }) =>
            kind === "image" ? uploadMetaImage(payload) : uploadMetaVideo(payload),
        onSuccess: (_data, variables) => {
            showToast(
                variables.kind === "image" ? "Photo uploaded to your ad library" : "Video uploaded to your ad library",
                "success"
            );
            setUploading(false);
            setUploadError(null);
            invalidate();
        },
        onError: (error) => {
            setUploading(false);
            setUploadError(error);
            showToast(error.message || "Upload failed", "error");
        },
    });

    const handleFile = async (kind, file) => {
        if (!file) return;
        setUploadError(null);
        const allowed = kind === "image" ? IMAGE_MIME_TYPES : VIDEO_MIME_TYPES;
        const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
        if (!allowed.includes(file.type)) {
            setUploadError(new Error(
                kind === "image"
                    ? "Please choose a JPEG, PNG or GIF image."
                    : "Please choose an MP4, MOV or WebM video."
            ));
            return;
        }
        if (file.size > maxBytes) {
            setUploadError(new Error(
                `That file is ${formatSize(file.size)} — the limit is ${formatSize(maxBytes)}.`
            ));
            return;
        }
        setUploading(true);
        try {
            const dataBase64 = await readFileAsBase64(file);
            uploadMutation.mutate({
                kind,
                payload: { fileName: file.name, mimeType: file.type, dataBase64 },
            });
        } catch (error) {
            setUploading(false);
            setUploadError(error);
        }
    };

    // ---------------- Delete (permanent) ----------------
    const deleteMutation = useMutation({
        mutationFn: ({ kind, item }) => {
            if (kind === "image") return deleteMetaImage(item.hash);
            if (kind === "video") return deleteMetaVideo(item.id);
            return deleteMetaCreative(item.id);
        },
        onSuccess: () => {
            showToast("Deleted permanently from Meta", "success");
            setDeleteTarget(null);
            invalidate();
        },
        onError: (error) => {
            setDeleteTarget(null);
            showToast(error.message || "Could not delete — it may still be used by an ad", "error");
        },
    });

    // ---------------- Rename (creatives only) ----------------
    const renameMutation = useMutation({
        mutationFn: ({ id, payload }) => updateMetaCreative(id, payload),
        onSuccess: () => {
            showToast("Creative renamed", "success");
            setRenameTarget(null);
            setRenameError(null);
            invalidate();
        },
        onError: (error) => setRenameError(error),
    });

    if (!canView) {
        return (
            <PageContainer>
                <PageHeader icon={Images} title="Creative Studio" subtitle="Your photos, videos and ad creatives." />
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Creative Studio is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </PageContainer>
        );
    }

    const tabs = [
        { value: "images", label: "Photos", icon: ImageIcon },
        { value: "videos", label: "Videos", icon: Film },
        { value: "creatives", label: "Ad creatives", icon: LayoutList },
    ];

    const deleteCopy = () => {
        if (!deleteTarget) return { title: "", body: "", warning: "" };
        const { kind, item } = deleteTarget;
        const name = item.name || item.title || item.headline || "this item";
        if (kind === "image") {
            return {
                title: "Delete this photo permanently?",
                body: `“${name}” will be removed from your Meta ad library.`,
                warning: "Deletion is permanent. Photos already used by a creative cannot be deleted — Meta will refuse and you will see that message.",
            };
        }
        if (kind === "video") {
            return {
                title: "Delete this video permanently?",
                body: `“${name}” will be removed from your Meta ad library.`,
                warning: "Deletion is permanent and cannot be undone. Videos in use by a creative cannot be deleted.",
            };
        }
        return {
            title: "Delete this ad creative permanently?",
            body: `“${name}” will be deleted from Meta.`,
            warning: "Deletion is permanent. Ads using this creative stop delivering and cannot be restored.",
        };
    };
    const deleteCopyValue = deleteCopy();

    return (
        <PageContainer>
            <PageHeader
                icon={Images}
                title="Creative Studio"
                subtitle="Upload photos and videos, then turn them into ad creatives — the content your customers will see."
                actions={
                    <>
                        <button type="button" onClick={() => activeQuery.refetch()} className={btnSecondaryClass}>
                            <RefreshCw size={14} className={activeQuery.isFetching ? "animate-spin" : ""} /> Refresh
                        </button>
                        {canManage && (
                            <Link href="/dashboard/marketing/meta-ads/creatives/new" className={btnPrimaryClass}>
                                <Plus size={15} /> New ad creative
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
                        Connect your Meta account to upload media and build ad creatives. Nothing is faked meanwhile.
                    </p>
                    <Link href="/dashboard/marketing/meta-ads/settings" className={btnPrimaryClass}>
                        Open Meta connection settings
                    </Link>
                </div>
            )}

            {connected && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <StatCard
                            icon={ImageIcon}
                            label="Photos available"
                            value={imagesQuery.data ? String(imagesQuery.data.totalCount ?? imagesQuery.data.items?.length ?? 0) : "—"}
                            hint="In your Meta ad library"
                            loading={tab === "images" && imagesQuery.isPending}
                        />
                        <StatCard
                            icon={Film}
                            label="Videos available"
                            value={videosQuery.data ? String(videosQuery.data.totalCount ?? videosQuery.data.items?.length ?? 0) : "—"}
                            hint="In your Meta ad library"
                            loading={tab === "videos" && videosQuery.isPending}
                        />
                        <StatCard
                            icon={LayoutList}
                            label="Ad creatives saved"
                            value={creativesQuery.data ? String(creativesQuery.data.totalCount ?? creativesQuery.data.items?.length ?? 0) : "—"}
                            hint="Ready to attach to ads"
                            loading={tab === "creatives" && creativesQuery.isPending}
                        />
                    </div>

                    <SectionCard
                        icon={Images}
                        title={tabs.find((t) => t.value === tab)?.label || "Library"}
                        subtitle="Everything here lives in your connected Meta ad account"
                        action={
                            <Tabs
                                tabs={tabs}
                                active={tab}
                                ariaLabel="Creative library sections"
                                onChange={(value) => {
                                    setTab(value);
                                    resetPaging();
                                }}
                            />
                        }
                    >
                        <ErrorBox error={uploadError} onRetry={() => setUploadError(null)} />
                        <ErrorBox error={activeQuery.error} onRetry={() => activeQuery.refetch()} />

                        {canManage && tab !== "creatives" && (
                            <div className="flex flex-wrap items-center gap-3">
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept={tab === "images" ? IMAGE_MIME_TYPES.join(",") : VIDEO_MIME_TYPES.join(",")}
                                    className="hidden"
                                    onChange={(e) => {
                                        handleFile(tab === "images" ? "image" : "video", e.target.files?.[0]);
                                        e.target.value = "";
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => (tab === "images" ? imageInputRef.current : videoInputRef.current)?.click()}
                                    disabled={uploading}
                                    className={btnPrimaryClass}
                                >
                                    {uploading ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
                                    {uploading
                                        ? "Uploading…"
                                        : tab === "images"
                                            ? `Upload photo (JPEG/PNG/GIF, up to ${formatSize(MAX_IMAGE_BYTES)})`
                                            : `Upload video (MP4/MOV/WebM, up to ${formatSize(MAX_VIDEO_BYTES)})`}
                                </button>
                                <p className="text-[11px] text-gray-400">
                                    Files go straight to your Meta ad library — nothing is published.
                                </p>
                            </div>
                        )}
                        {!canManage && (
                            <Notice tone="gray">View-only access — uploading and deleting requires marketing management permission.</Notice>
                        )}

                        {activeQuery.isPending ? (
                            <LoadingRow label="Loading your library…" />
                        ) : activeQuery.isError ? null : items.length === 0 ? (
                            <EmptyState
                                icon={tab === "videos" ? Film : tab === "creatives" ? LayoutList : ImageIcon}
                                title={
                                    tab === "images" ? "No photos yet"
                                        : tab === "videos" ? "No videos yet"
                                            : "No ad creatives yet"
                                }
                                hint={
                                    tab === "creatives"
                                        ? "An ad creative combines a photo or video with your ad copy and a call-to-action button."
                                        : "Upload media to get started — it stays in your Meta ad library until you use it."
                                }
                                action={
                                    canManage ? (
                                        tab === "creatives" ? (
                                            <Link href="/dashboard/marketing/meta-ads/creatives/new" className={`${btnPrimaryClass} mt-2`}>
                                                <Plus size={15} /> Create your first creative
                                            </Link>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    (tab === "images" ? imageInputRef.current : videoInputRef.current)?.click()
                                                }
                                                className={`${btnPrimaryClass} mt-2`}
                                            >
                                                <Upload size={15} /> Upload now
                                            </button>
                                        )
                                    ) : null
                                }
                            />
                        ) : tab === "images" ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                {items.map((image) => (
                                    <div key={image.hash} className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                                        <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                                            {image.url128 || image.url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={image.url128 || image.url}
                                                    alt={image.name || "Uploaded photo"}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <ImageIcon size={22} className="text-gray-300" />
                                            )}
                                        </div>
                                        <div className="p-2.5 space-y-1">
                                            <p className="text-xs font-semibold text-gray-800 truncate" title={image.name || ""}>
                                                {image.name || "Untitled photo"}
                                            </p>
                                            <p className="text-[10px] text-gray-400">
                                                {image.width && image.height ? `${image.width}×${image.height}` : ""}
                                                {image.width && image.height && image.usedInCreatives?.length ? " · " : ""}
                                                {image.usedInCreatives?.length ? `used in ${image.usedInCreatives.length}` : ""}
                                            </p>
                                            {canManage && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDeleteTarget({ kind: "image", item: image })}
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-500 hover:underline"
                                                >
                                                    <Trash2 size={11} /> Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : tab === "videos" ? (
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                            <th className="py-2 pr-3 font-bold">Video</th>
                                            <th className="py-2 pr-3 font-bold">Description</th>
                                            <th className="py-2 pr-3 font-bold">Added</th>
                                            <th className="py-2 pr-3 text-right" aria-label="Actions" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((video) => (
                                            <tr key={video.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                                                <td className="py-2.5 pr-3">
                                                    <span className="font-semibold text-gray-900">{video.title || "Untitled video"}</span>
                                                    <AdminId value={video.id} prefix="Video" />
                                                </td>
                                                <td className="py-2.5 pr-3 text-xs text-gray-500 max-w-xs truncate">
                                                    {video.description || "—"}
                                                </td>
                                                <td className="py-2.5 pr-3 text-xs text-gray-500">{formatDateTime(video.createdTime)}</td>
                                                <td className="py-2.5 pr-3 text-right">
                                                    {canManage && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteTarget({ kind: "video", item: video })}
                                                            className="inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:underline"
                                                        >
                                                            <Trash2 size={12} /> Delete
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                            <th className="py-2 pr-3 font-bold">Creative</th>
                                            <th className="py-2 pr-3 font-bold">Copy</th>
                                            <th className="py-2 pr-3 font-bold">Button</th>
                                            <th className="py-2 pr-3 font-bold">Media</th>
                                            <th className="py-2 pr-3 text-right" aria-label="Actions" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((creative) => (
                                            <tr key={creative.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                                                <td className="py-2.5 pr-3">
                                                    <span className="font-semibold text-gray-900">{creative.name || "Untitled creative"}</span>
                                                    <AdminId value={creative.id} prefix="Creative" />
                                                </td>
                                                <td className="py-2.5 pr-3 text-xs text-gray-600 max-w-xs">
                                                    <span className="block truncate font-semibold">{creative.headline || creative.title || ""}</span>
                                                    <span className="block truncate text-gray-400">{creative.body || ""}</span>
                                                </td>
                                                <td className="py-2.5 pr-3 text-xs text-gray-600">
                                                    {CTA_LABELS[creative.callToActionType] || creative.callToActionType || "—"}
                                                </td>
                                                <td className="py-2.5 pr-3 text-xs text-gray-600">
                                                    <span className="inline-flex items-center gap-1 capitalize">
                                                        {creative.mediaType === "video" ? <Film size={12} /> : <ImageIcon size={12} />}
                                                        {creative.mediaType || "—"}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                                                    <Link
                                                        href={`/dashboard/marketing/meta-ads/creatives/${creative.id}`}
                                                        className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline mr-3"
                                                    >
                                                        <Eye size={12} /> Preview
                                                    </Link>
                                                    {canManage && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setRenameError(null);
                                                                    setRenameValue(creative.name || "");
                                                                    setRenameTarget(creative);
                                                                }}
                                                                className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 hover:underline mr-3"
                                                            >
                                                                <Pencil size={12} /> Rename
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDeleteTarget({ kind: "creative", item: creative })}
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
                                label={`${items.length} item${items.length === 1 ? "" : "s"} on this page`}
                                loading={activeQuery.isFetching}
                                hasPrev={hasPrev}
                                hasNext={hasNext}
                                onPrev={() => setCursorStack((s) => s.slice(0, -1))}
                                onNext={() => setCursorStack((s) => [...s, paging.cursors.after])}
                            />
                        )}
                    </SectionCard>
                </>
            )}

            {/* Rename creative — content itself is immutable in Meta's API */}
            <Modal
                open={Boolean(renameTarget)}
                title="Rename creative"
                subtitle="Only the name can be changed — ad content is fixed once created."
                onClose={() => setRenameTarget(null)}
            >
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

            {/* Permanent delete — mandatory acknowledgement */}
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title={deleteCopyValue.title}
                body={deleteCopyValue.body}
                warning={deleteCopyValue.warning}
                confirmLabel="Delete permanently"
                requireCheckbox
                checkboxLabel="I understand this will be permanently deleted and cannot be restored."
                busy={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate(deleteTarget)}
                onCancel={() => setDeleteTarget(null)}
            />
        </PageContainer>
    );
}
