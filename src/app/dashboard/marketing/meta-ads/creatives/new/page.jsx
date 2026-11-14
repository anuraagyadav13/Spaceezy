"use client";
// Creative Studio (builder) — Phase 5. Three plain steps: pick your media,
// write the ad, preview and save.
//
// Safety / honesty notes:
// - Saving runs Meta's validate_only dry-run FIRST (the explicit Validate
//   button); Create stays locked until that exact payload passes, and the
//   server re-runs its own dry-run before writing. A creative is content
//   only — it never delivers or spends until attached to an ad, which is
//   itself created PAUSED.
// - Two clearly labelled previews: the DRAFT preview is composed locally
//   from what the user typed (never presented as Meta's rendering), and the
//   ACTUAL Meta preview is fetched from generatepreviews and rendered in a
//   sandboxed iframe from the extracted src — provider HTML is never
//   injected into the DOM.
// - Page / Instagram selection uses real account data (names shown), never
//   raw numeric ID typing where a picker will do.
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
    Image as ImageIcon, Film, Type, Eye, Save, SearchCheck, AlertCircle,
    ChevronLeft, ChevronRight, RefreshCw, Upload, CheckCircle2, Monitor, X,
} from "lucide-react";
import { usePermissions } from "../../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../../lib/toast";
import {
    fetchMetaStatus,
    fetchMetaImages,
    fetchMetaVideos,
    fetchMetaPages,
    fetchMetaInstagramAccounts,
    uploadMetaImage,
    validateMetaCreative,
    createMetaCreative,
    previewMetaCreativeSpec,
} from "../../../../../../lib/api/metaAds";
import {
    CTA_LABELS,
    CTA_TYPES,
    CREATIVE_LIMITS,
    IMAGE_MIME_TYPES,
    MAX_IMAGE_BYTES,
    MAX_VIDEO_BYTES,
    PREVIEW_FORMAT_INFO,
    extractPreviewFrameSrc,
} from "../../../../../../lib/metaAdsEnums";
import {
    ErrorBox, LoadingRow, Notice, PageContainer, PageHeader, SectionCard,
    Stepper, Tabs, btnPrimaryClass, btnSecondaryClass, inputClass, labelClass,
} from "../../_components/metaAdsUi";

const STEPS = [
    { key: "media", label: "Choose media", icon: ImageIcon },
    { key: "copy", label: "Write your ad", icon: Type },
    { key: "review", label: "Preview & save", icon: Eye },
];

const DEFAULT_FORMATS = ["DESKTOP_FEED_STANDARD", "MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD", "INSTAGRAM_STORY"];

const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read the selected file"));
        reader.readAsDataURL(file);
    });

const isHttpUrl = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
};

const INITIAL = {
    name: "",
    mediaType: "image",
    imageHash: "",
    imagePreviewUrl: "",
    videoId: "",
    videoTitle: "",
    pageId: "",
    instagramUserId: "",
    link: "",
    message: "",
    headline: "",
    description: "",
    ctaType: "LEARN_MORE",
    ctaLink: "",
};

export default function CreativeStudioPage() {
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");

    const [step, setStep] = useState(0);
    const [form, setForm] = useState(INITIAL);
    const [mediaTab, setMediaTab] = useState("images");
    const [stepError, setStepError] = useState(null);
    const [validatedJson, setValidatedJson] = useState(null);
    const [uploadError, setUploadError] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [metaPreviews, setMetaPreviews] = useState(null); // { loading, items, error }
    const fileInputRef = useRef(null);

    const statusQuery = useQuery({
        queryKey: ["meta-ads", "status"],
        queryFn: fetchMetaStatus,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });
    const connected = statusQuery.data?.connected === true;
    const enabled = canView && connected;

    const imagesQuery = useQuery({
        queryKey: ["meta-ads", "creative", "images"],
        queryFn: () => fetchMetaImages({ limit: 50 }),
        enabled: enabled && step === 0 && mediaTab === "images",
        retry: 1,
    });
    const videosQuery = useQuery({
        queryKey: ["meta-ads", "creative", "videos"],
        queryFn: () => fetchMetaVideos({ limit: 50 }),
        enabled: enabled && step === 0 && mediaTab === "videos",
        retry: 1,
    });
    const pagesQuery = useQuery({
        queryKey: ["meta-ads", "pages"],
        queryFn: () => fetchMetaPages({ limit: 50 }),
        enabled,
        retry: 1,
    });
    const instagramQuery = useQuery({
        queryKey: ["meta-ads", "instagram-accounts"],
        queryFn: () => fetchMetaInstagramAccounts({ limit: 50 }),
        enabled,
        retry: 1,
    });

    const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

    // The exact server-shaped payload — also the string whose change
    // invalidates a previous dry-run result.
    const payload = useMemo(() => {
        const body = {
            name: form.name.trim(),
            mediaType: form.mediaType,
            pageId: form.pageId,
            link: form.link.trim(),
            message: form.message.trim(),
            headline: form.headline.trim(),
            ctaType: form.ctaType,
        };
        if (form.mediaType === "image") body.imageHash = form.imageHash;
        else body.videoId = form.videoId;
        if (form.description.trim()) body.description = form.description.trim();
        if (form.ctaLink.trim()) body.ctaLink = form.ctaLink.trim();
        if (form.instagramUserId) body.instagramUserId = form.instagramUserId;
        return body;
    }, [form]);

    const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);
    const alreadyValidated = validatedJson !== null && validatedJson === payloadJson;

    // Client-side gates → actionable plain-language errors (the server
    // re-validates everything regardless).
    const validateStep = (index) => {
        if (index === 0) {
            if (form.mediaType === "image" && !form.imageHash) return "Choose a photo for your ad";
            if (form.mediaType === "video" && !form.videoId) return "Choose a video for your ad";
            return null;
        }
        if (index === 1) {
            if (!form.pageId) return "Choose the Facebook Page that will run this ad";
            if (!form.link.trim()) return "Enter the web page people go to when they click your ad";
            if (!isHttpUrl(form.link.trim())) return "The link must start with http:// or https://";
            if (!form.message.trim()) return "Write the main text of your ad";
            if (form.message.trim().length > CREATIVE_LIMITS.message) {
                return `Main text must be ${CREATIVE_LIMITS.message} characters or fewer (currently ${form.message.trim().length})`;
            }
            if (!form.headline.trim()) return "Write a short headline";
            if (form.headline.trim().length > CREATIVE_LIMITS.headline) {
                return `Headline must be ${CREATIVE_LIMITS.headline} characters or fewer (currently ${form.headline.trim().length})`;
            }
            if (form.ctaLink.trim() && !isHttpUrl(form.ctaLink.trim())) {
                return "The button link must start with http:// or https://";
            }
            if (!form.name.trim()) return "Give this creative a name so you can find it later";
            return null;
        }
        return null;
    };

    const goNext = () => {
        const error = validateStep(step);
        if (error) {
            setStepError(new Error(error));
            return;
        }
        setStepError(null);
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };

    // ---------------- Upload ----------------
    const uploadMutation = useMutation({
        mutationFn: (payloadBody) => uploadMetaImage(payloadBody),
        onSuccess: (image) => {
            setUploading(false);
            setUploadError(null);
            setForm((prev) => ({
                ...prev,
                mediaType: "image",
                imageHash: image.hash,
                imagePreviewUrl: image.url128 || image.url || "",
            }));
            showToast("Photo uploaded — selected for this ad", "success");
            imagesQuery.refetch();
        },
        onError: (error) => {
            setUploading(false);
            setUploadError(error);
            showToast(error.message || "Upload failed", "error");
        },
    });

    const handleFile = async (file) => {
        if (!file) return;
        setUploadError(null);
        if (!IMAGE_MIME_TYPES.includes(file.type)) {
            setUploadError(new Error("Please choose a JPEG, PNG or GIF image."));
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setUploadError(new Error(`That image is larger than ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`));
            return;
        }
        setUploading(true);
        try {
            const dataBase64 = await readFileAsBase64(file);
            uploadMutation.mutate({ fileName: file.name, mimeType: file.type, dataBase64 });
        } catch (error) {
            setUploading(false);
            setUploadError(error);
        }
    };

    // ---------------- Validate / create ----------------
    const validateMutation = useMutation({
        mutationFn: () => validateMetaCreative(payload),
        onSuccess: () => {
            setValidatedJson(payloadJson);
            showToast("Meta validated this creative — nothing was saved yet", "success");
        },
        onError: (error) => showToast(error.message || "Validation failed", "error"),
    });

    const createMutation = useMutation({
        mutationFn: () => createMetaCreative(payload),
        onSuccess: (creative) => {
            showToast("Creative saved to your library", "success");
            if (creative?.id) router.push(`/dashboard/marketing/meta-ads/creatives/${creative.id}`);
            else router.push("/dashboard/marketing/meta-ads/creatives");
        },
        onError: (error) => showToast(error.message || "Could not save the creative", "error"),
    });

    // ---------------- Actual Meta preview ----------------
    const loadMetaPreviews = async () => {
        setMetaPreviews({ loading: true, items: [], error: null });
        try {
            const data = await previewMetaCreativeSpec(payload, { formats: DEFAULT_FORMATS });
            setMetaPreviews({ loading: false, items: data?.previews || [], error: null });
        } catch (error) {
            setMetaPreviews({ loading: false, items: [], error });
        }
    };

    if (!canView) {
        return (
            <PageContainer>
                <PageHeader icon={ImageIcon} title="Creative Studio" subtitle="Build your ad content." />
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Creative Studio is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </PageContainer>
        );
    }

    const pages = pagesQuery.data?.items || [];
    const instagramAccounts = instagramQuery.data?.items || [];
    const images = imagesQuery.data?.items || [];
    const videos = videosQuery.data?.items || [];
    const selectedImage = images.find((img) => img.hash === form.imageHash);
    const selectedPage = pages.find((page) => String(page.id) === String(form.pageId));

    const mediaPicker = mediaTab === "images" ? images : videos;
    const mediaQuery = mediaTab === "images" ? imagesQuery : videosQuery;

    return (
        <PageContainer>
            <PageHeader
                backHref="/dashboard/marketing/meta-ads/creatives"
                backLabel="Creative Studio"
                icon={ImageIcon}
                title="Create an ad creative"
                subtitle="Pick a photo or video, write your message and choose the button — then preview exactly what people will see."
            />

            {statusQuery.isPending && <LoadingRow label="Checking your Meta connection…" />}
            {!statusQuery.isPending && !connected && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center space-y-3">
                    <p className="font-bold text-gray-900">Meta account not connected</p>
                    <p className="text-sm text-gray-500">Connect your Meta account before building ad creatives.</p>
                    <Link href="/dashboard/marketing/meta-ads/settings" className={btnPrimaryClass}>
                        Open Meta connection settings
                    </Link>
                </div>
            )}

            {connected && canManage && (
                <>
                    <Stepper steps={STEPS} activeIndex={step} onSelect={(index) => { setStep(index); setStepError(null); }} />

                    <ErrorBox error={stepError || uploadError || (createMutation.isError ? createMutation.error : null)} />

                    {/* ---------------- Step 1: media ---------------- */}
                    {step === 0 && (
                        <SectionCard
                            icon={ImageIcon}
                            title="Choose your media"
                            subtitle="Photos and videos already in your Meta ad library — or upload a new one"
                            action={
                                <Tabs
                                    tabs={[
                                        { value: "images", label: "Photos", icon: ImageIcon },
                                        { value: "videos", label: "Videos", icon: Film },
                                    ]}
                                    active={mediaTab}
                                    ariaLabel="Media type"
                                    onChange={(value) => {
                                        setMediaTab(value);
                                        setForm((prev) => ({ ...prev, mediaType: value === "images" ? "image" : "video" }));
                                    }}
                                />
                            }
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={IMAGE_MIME_TYPES.join(",")}
                                className="hidden"
                                onChange={(e) => {
                                    handleFile(e.target.files?.[0]);
                                    e.target.value = "";
                                }}
                            />
                            <div className="flex flex-wrap items-center gap-3">
                                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className={btnSecondaryClass}>
                                    {uploading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                                    {uploading ? "Uploading…" : `Upload a new photo (max ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB)`}
                                </button>
                                <p className="text-[11px] text-gray-400">
                                    Videos up to {Math.floor(MAX_VIDEO_BYTES / (1024 * 1024))} MB can be uploaded from the
                                    {" "}<Link href="/dashboard/marketing/meta-ads/creatives" className="underline font-semibold">Creative Library</Link>.
                                </p>
                            </div>

                            {mediaQuery.isPending ? (
                                <LoadingRow label="Loading your media…" />
                            ) : mediaQuery.isError ? (
                                <ErrorBox error={mediaQuery.error} onRetry={() => mediaQuery.refetch()} />
                            ) : mediaPicker.length === 0 ? (
                                <Notice tone="amber" icon={AlertCircle}>
                                    No {mediaTab === "images" ? "photos" : "videos"} in your library yet — upload a photo
                                    above (or add videos in the Creative Library) to continue.
                                </Notice>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                    {mediaPicker.map((item) => {
                                        const isSelected = mediaTab === "images"
                                            ? form.imageHash === item.hash
                                            : form.videoId === item.id;
                                        return (
                                            <button
                                                key={item.hash || item.id}
                                                type="button"
                                                onClick={() =>
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        mediaType: mediaTab === "images" ? "image" : "video",
                                                        imageHash: mediaTab === "images" ? item.hash : "",
                                                        imagePreviewUrl: mediaTab === "images" ? (item.url128 || item.url || "") : "",
                                                        videoId: mediaTab === "videos" ? item.id : "",
                                                        videoTitle: mediaTab === "videos" ? (item.title || "") : "",
                                                    }))
                                                }
                                                className={`text-left rounded-2xl border overflow-hidden bg-white transition ${
                                                    isSelected ? "border-purple-500 ring-2 ring-purple-200" : "border-gray-200 hover:border-purple-300"
                                                }`}
                                            >
                                                <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                                                    {mediaTab === "images" && (item.url128 || item.url) ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={item.url128 || item.url} alt="" className="w-full h-full object-cover" />
                                                    ) : mediaTab === "videos" ? (
                                                        <Film size={22} className="text-gray-300" />
                                                    ) : (
                                                        <ImageIcon size={22} className="text-gray-300" />
                                                    )}
                                                </div>
                                                <div className="p-2">
                                                    <p className="text-xs font-semibold text-gray-800 truncate">
                                                        {item.name || item.title || "Untitled"}
                                                    </p>
                                                    {isSelected && (
                                                        <p className="text-[11px] font-bold text-purple-600 inline-flex items-center gap-1 mt-0.5">
                                                            <CheckCircle2 size={11} /> Selected
                                                        </p>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </SectionCard>
                    )}

                    {/* ---------------- Step 2: copy ---------------- */}
                    {step === 1 && (
                        <div className="grid lg:grid-cols-2 gap-5 items-start">
                            <SectionCard icon={Type} title="Write your ad" subtitle="Short, clear and honest converts best">
                                <div className="space-y-4">
                                    <div>
                                        <label className={labelClass}>Facebook Page *</label>
                                        {pagesQuery.isPending ? (
                                            <LoadingRow label="Loading your Pages…" />
                                        ) : pagesQuery.isError ? (
                                            <ErrorBox error={pagesQuery.error} onRetry={() => pagesQuery.refetch()} />
                                        ) : pages.length === 0 ? (
                                            <Notice tone="amber" icon={AlertCircle}>
                                                No Facebook Pages found on this connection — select your Pages on the{" "}
                                                <Link href="/dashboard/marketing/meta-ads/settings" className="underline font-semibold">
                                                    Meta Connection
                                                </Link>{" "}
                                                screen, then refresh.
                                            </Notice>
                                        ) : (
                                            <select value={form.pageId} onChange={(e) => set("pageId")(e.target.value)} className={inputClass}>
                                                <option value="">Choose a Page…</option>
                                                {pages.map((page) => (
                                                    <option key={page.id} value={String(page.id)}>
                                                        {page.name || `Page ${page.id}`}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            The Page whose name and picture appear on the ad.
                                        </p>
                                    </div>

                                    {instagramAccounts.length > 0 && (
                                        <div>
                                            <label className={labelClass}>Also place on Instagram (optional)</label>
                                            <select
                                                value={form.instagramUserId}
                                                onChange={(e) => set("instagramUserId")(e.target.value)}
                                                className={inputClass}
                                            >
                                                <option value="">Facebook only</option>
                                                {instagramAccounts.map((account) => (
                                                    <option key={account.id} value={String(account.id)}>
                                                        {account.username ? `@${account.username}` : account.name || `Instagram ${account.id}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className={labelClass}>Main text *</label>
                                        <textarea
                                            rows={3}
                                            maxLength={CREATIVE_LIMITS.message}
                                            value={form.message}
                                            onChange={(e) => set("message")(e.target.value)}
                                            placeholder="e.g. Book a site visit this weekend at Wave City — 2 & 3 BHK homes from ₹75 Lakh."
                                            className={inputClass}
                                        />
                                        <p className={`text-[11px] mt-1 ${form.message.length > CREATIVE_LIMITS.message ? "text-red-600" : "text-gray-400"}`}>
                                            {form.message.length}/{CREATIVE_LIMITS.message} characters
                                        </p>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelClass}>Headline *</label>
                                            <input
                                                type="text"
                                                maxLength={CREATIVE_LIMITS.headline}
                                                value={form.headline}
                                                onChange={(e) => set("headline")(e.target.value)}
                                                placeholder="e.g. 2 & 3 BHK Homes"
                                                className={inputClass}
                                            />
                                            <p className="text-[11px] text-gray-400 mt-1">{form.headline.length}/{CREATIVE_LIMITS.headline}</p>
                                        </div>
                                        <div>
                                            <label className={labelClass}>Description (optional)</label>
                                            <input
                                                type="text"
                                                maxLength={CREATIVE_LIMITS.description}
                                                value={form.description}
                                                onChange={(e) => set("description")(e.target.value)}
                                                placeholder="e.g. RERA approved · Possession 2027"
                                                className={inputClass}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Website link *</label>
                                        <input
                                            type="url"
                                            value={form.link}
                                            onChange={(e) => set("link")(e.target.value)}
                                            placeholder="https://yourwebsite.com/project"
                                            className={inputClass}
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1">Where people land after clicking the ad.</p>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelClass}>Button *</label>
                                            <select value={form.ctaType} onChange={(e) => set("ctaType")(e.target.value)} className={inputClass}>
                                                {CTA_TYPES.map((type) => (
                                                    <option key={type} value={type}>{CTA_LABELS[type] || type}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClass}>Button link (optional)</label>
                                            <input
                                                type="url"
                                                value={form.ctaLink}
                                                onChange={(e) => set("ctaLink")(e.target.value)}
                                                placeholder="Defaults to the website link"
                                                className={inputClass}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Creative name *</label>
                                        <input
                                            type="text"
                                            maxLength={CREATIVE_LIMITS.name}
                                            value={form.name}
                                            onChange={(e) => set("name")(e.target.value)}
                                            placeholder="e.g. Wave City — Weekend visit push"
                                            className={inputClass}
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1">Only you see this name — it helps you find the creative later.</p>
                                    </div>
                                </div>
                            </SectionCard>

                            {/* Sticky draft preview */}
                            <div className="lg:sticky lg:top-4 space-y-4">
                                <SectionCard icon={Eye} title="Draft preview" subtitle="Composed from your text — not Meta's rendering">
                                    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white max-w-sm mx-auto">
                                        <div className="flex items-center gap-2 p-3 border-b border-gray-100">
                                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xs">
                                                {(selectedPage?.name || "P").charAt(0)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-900 truncate">{selectedPage?.name || "Your Page"}</p>
                                                <p className="text-[10px] text-gray-400">Sponsored</p>
                                            </div>
                                        </div>
                                        <p className="px-3 pt-2 text-sm text-gray-800 whitespace-pre-wrap">
                                            {form.message || "Your main text will appear here…"}
                                        </p>
                                        <div className="mx-3 mt-2 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                                            {form.mediaType === "image" && (form.imagePreviewUrl || selectedImage?.url128) ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={form.imagePreviewUrl || selectedImage.url128 || selectedImage.url}
                                                    alt=""
                                                    className="w-full h-44 object-cover"
                                                />
                                            ) : form.mediaType === "video" ? (
                                                <div className="h-44 flex items-center justify-center">
                                                    <Film size={28} className="text-gray-300" />
                                                    <span className="ml-2 text-xs text-gray-400">
                                                        {form.videoTitle || "Selected video"}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="h-44 flex items-center justify-center text-xs text-gray-400">
                                                    No media selected
                                                </div>
                                            )}
                                        </div>
                                        <div className="px-3 py-2">
                                            <p className="text-[11px] text-gray-500 truncate">{form.link || "yourwebsite.com"}</p>
                                            <p className="text-sm font-bold text-gray-900">{form.headline || "Your headline"}</p>
                                            <p className="text-[11px] text-gray-500">{form.description}</p>
                                        </div>
                                        <div className="px-3 pb-3">
                                            <span className="block text-center px-3 py-2 rounded-lg bg-gray-100 text-sm font-bold text-gray-700">
                                                {CTA_LABELS[form.ctaType] || form.ctaType}
                                            </span>
                                        </div>
                                    </div>
                                </SectionCard>
                            </div>
                        </div>
                    )}

                    {/* ---------------- Step 3: preview & save ---------------- */}
                    {step === 2 && (
                        <div className="space-y-5">
                            <SectionCard
                                icon={Eye}
                                title="Preview & save"
                                subtitle="Check the real Meta rendering, then validate and save"
                                action={
                                    <button type="button" onClick={loadMetaPreviews} disabled={metaPreviews?.loading} className={btnSecondaryClass}>
                                        {metaPreviews?.loading
                                            ? <RefreshCw size={14} className="animate-spin" />
                                            : <Monitor size={14} />}
                                        {metaPreviews?.loading ? "Asking Meta…" : "Load actual Meta preview"}
                                    </button>
                                }
                            >
                                {metaPreviews?.error && <ErrorBox error={metaPreviews.error} />}
                                {metaPreviews?.loading && <LoadingRow label="Meta is rendering your preview…" />}
                                {metaPreviews && !metaPreviews.loading && metaPreviews.items.length > 0 && (
                                    <div className="space-y-3">
                                        <Notice tone="blue">
                                            <strong>Actual Meta preview</strong> — rendered by Meta from your draft. Preview
                                            links are valid for 24 hours.
                                        </Notice>
                                        <div className="grid sm:grid-cols-2 gap-4">
                                            {metaPreviews.items.map((entry) => {
                                                const src = extractPreviewFrameSrc(entry.html);
                                                const info = PREVIEW_FORMAT_INFO.find((f) => f.format === entry.format);
                                                return (
                                                    <div key={entry.format} className="rounded-2xl border border-gray-200 overflow-hidden">
                                                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                                                            <p className="text-xs font-bold text-gray-700">{info?.label || entry.format}</p>
                                                            {entry.error && (
                                                                <span className="text-[10px] font-bold text-amber-600">Unavailable</span>
                                                            )}
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
                                    </div>
                                )}
                                {!metaPreviews && (
                                    <Notice tone="gray" icon={Eye}>
                                        Press <strong>Load actual Meta preview</strong> to see how Meta renders this ad in the
                                        Facebook feed, mobile feed, Instagram feed and Instagram story. Until then only the
                                        draft preview (previous step) is shown — nothing is invented.
                                    </Notice>
                                )}
                            </SectionCard>

                            <SectionCard icon={Save} title="Save to your library" subtitle="A saved creative does not deliver or spend — it is only content">
                                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                                    <div><p className={labelClass}>Name</p><p className="text-gray-800 font-semibold">{payload.name || "—"}</p></div>
                                    <div><p className={labelClass}>Page</p><p className="text-gray-800">{selectedPage?.name || "—"}</p></div>
                                    <div><p className={labelClass}>Headline</p><p className="text-gray-800">{payload.headline || "—"}</p></div>
                                    <div><p className={labelClass}>Button</p><p className="text-gray-800">{CTA_LABELS[payload.ctaType] || payload.ctaType}</p></div>
                                    <div className="sm:col-span-2"><p className={labelClass}>Link</p><p className="text-gray-800 break-all">{payload.link || "—"}</p></div>
                                    <div className="sm:col-span-2"><p className={labelClass}>Main text</p><p className="text-gray-800 whitespace-pre-wrap">{payload.message || "—"}</p></div>
                                </div>

                                <Notice tone="amber" icon={AlertCircle}>
                                    Saving stores this creative in your Meta ad library. It will not appear anywhere until you
                                    attach it to an ad — and new ads are always created <strong>paused</strong>.
                                </Notice>

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-xs font-semibold">
                                        {alreadyValidated ? (
                                            <span className="text-emerald-600 inline-flex items-center gap-1">
                                                <SearchCheck size={14} /> Validated by Meta — ready to save
                                            </span>
                                        ) : (
                                            <span className="text-amber-600 inline-flex items-center gap-1">
                                                <AlertCircle size={14} /> Validate to unlock saving
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => validateMutation.mutate()}
                                            disabled={validateMutation.isPending || createMutation.isPending}
                                            className="px-4 py-2 rounded-xl border border-purple-200 bg-purple-50 text-sm font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                                        >
                                            {validateMutation.isPending && <RefreshCw size={14} className="animate-spin inline mr-1.5" />}
                                            Validate with Meta
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => createMutation.mutate()}
                                            disabled={!alreadyValidated || createMutation.isPending || validateMutation.isPending}
                                            className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {createMutation.isPending && <RefreshCw size={14} className="animate-spin inline mr-1.5" />}
                                            Save creative
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[11px] text-gray-400">
                                    Validation is Meta&apos;s own dry-run — full provider checks, nothing saved. Editing after
                                    validating locks saving until you validate again.
                                </p>
                            </SectionCard>
                        </div>
                    )}

                    {/* ---------------- Navigation ---------------- */}
                    <div className="flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => { setStep((s) => Math.max(s - 1, 0)); setStepError(null); }}
                            disabled={step === 0}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        >
                            <ChevronLeft size={15} /> Back
                        </button>
                        {step < STEPS.length - 1 && (
                            <button type="button" onClick={goNext} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700">
                                Next <ChevronRight size={15} />
                            </button>
                        )}
                        {step === STEPS.length - 1 && (
                            <Link href="/dashboard/marketing/meta-ads/creatives" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50">
                                <X size={15} /> Cancel
                            </Link>
                        )}
                    </div>
                </>
            )}

            {connected && !canManage && (
                <Notice tone="gray" icon={AlertCircle}>
                    View-only access — creating ad creatives requires marketing management permission. Ask an administrator.
                </Notice>
            )}
        </PageContainer>
    );
}
