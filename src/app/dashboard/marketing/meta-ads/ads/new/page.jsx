"use client";
// Advertisement creation wizard — Phase 5. Plain-language steps:
//   1. Choose where it runs (campaign → ad set)
//   2. Choose what people see (creative) — pre-selected via ?creativeId=
//   3. Name it → Validate with Meta (dry run) → Create paused
//
// Safety chain (mirrors the ad set wizard):
// - The Create button unlocks ONLY after the server-confirmed validate_only
//   dry-run succeeds for the exact payload; the server re-runs its own
//   dry-run before writing and ALWAYS forces status=PAUSED. Nothing here can
//   publish an ad or start spend — activation is a separate confirmed action
//   on the ad detail screen.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
    PlayCircle, AlertCircle, ChevronLeft, ChevronRight, SearchCheck,
    RefreshCw, CheckCircle2, Target, Layers, Image as ImageIcon,
} from "lucide-react";
import { usePermissions } from "../../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../../lib/toast";
import {
    fetchMetaStatus,
    fetchMetaCampaigns,
    fetchMetaAdSets,
    fetchMetaCreatives,
    validateMetaAd,
    createMetaAd,
} from "../../../../../../lib/api/metaAds";
import { CTA_LABELS } from "../../../../../../lib/metaAdsEnums";
import {
    AdminId, EmptyState, ErrorBox, LoadingRow, Notice, PageContainer,
    PageHeader, SectionCard, Stepper, btnPrimaryClass, btnSecondaryClass,
    inputClass, labelClass,
} from "../../_components/metaAdsUi";

const STEPS = [
    { key: "placement", label: "Choose ad set", icon: Target },
    { key: "creative", label: "Choose creative", icon: ImageIcon },
    { key: "review", label: "Validate & create", icon: CheckCircle2 },
];

export default function NewAdPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselectedCreative = searchParams?.get("creativeId") || "";
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");

    const [step, setStep] = useState(preselectedCreative ? 1 : 0);
    const [campaignId, setCampaignId] = useState("");
    const [adsetId, setAdsetId] = useState("");
    const [creativeId, setCreativeId] = useState(preselectedCreative);
    const [name, setName] = useState("");
    const [stepError, setStepError] = useState(null);
    const [validatedJson, setValidatedJson] = useState(null);

    const statusQuery = useQuery({
        queryKey: ["meta-ads", "status"],
        queryFn: fetchMetaStatus,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });
    const connected = statusQuery.data?.connected === true;
    const enabled = canView && connected;

    const campaignsQuery = useQuery({
        queryKey: ["meta-ads", "campaigns", "picker"],
        queryFn: () => fetchMetaCampaigns({ limit: 100 }),
        enabled,
        retry: 1,
    });

    const adsetsQuery = useQuery({
        queryKey: ["meta-ads", "adsets", "picker", campaignId],
        queryFn: () => fetchMetaAdSets({ campaignId, limit: 100 }),
        enabled: enabled && Boolean(campaignId),
        retry: 1,
    });

    const creativesQuery = useQuery({
        queryKey: ["meta-ads", "creatives", "picker"],
        queryFn: () => fetchMetaCreatives({ limit: 100 }),
        enabled,
        retry: 1,
    });

    const payload = useMemo(
        () => ({ name: name.trim(), adsetId, creativeId }),
        [name, adsetId, creativeId]
    );
    const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);
    const alreadyValidated = validatedJson !== null && validatedJson === payloadJson;

    const validateStep = (index) => {
        if (index === 0) {
            if (!campaignId) return "Choose the campaign this ad belongs to";
            if (!adsetId) return "Choose an ad set — new ads need an existing ad set to run in";
            return null;
        }
        if (index === 1) {
            if (!creativeId) return "Choose the creative people will see";
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

    const validateMutation = useMutation({
        mutationFn: () => validateMetaAd(payload),
        onSuccess: () => {
            setValidatedJson(payloadJson);
            showToast("Meta validated this advertisement — nothing was saved yet", "success");
        },
        onError: (error) => showToast(error.message || "Validation failed", "error"),
    });

    const createMutation = useMutation({
        mutationFn: () => createMetaAd(payload),
        onSuccess: (ad) => {
            showToast("Advertisement created — it is paused until you activate it", "success");
            if (ad?.id) router.push(`/dashboard/marketing/meta-ads/ads/${ad.id}`);
            else router.push("/dashboard/marketing/meta-ads/ads");
        },
        onError: (error) => showToast(error.message || "Could not create the advertisement", "error"),
    });

    if (!canView) {
        return (
            <PageContainer>
                <PageHeader icon={PlayCircle} title="New advertisement" subtitle="Create an ad." />
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">This area is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </PageContainer>
        );
    }

    const campaigns = campaignsQuery.data?.items || [];
    const adsets = adsetsQuery.data?.items || [];
    const creatives = creativesQuery.data?.items || [];
    const selectedAdset = adsets.find((adset) => String(adset.id) === String(adsetId));
    const selectedCreative = creatives.find((creative) => String(creative.id) === String(creativeId));
    const selectedCampaign = campaigns.find((campaign) => String(campaign.id) === String(campaignId));

    return (
        <PageContainer>
            <PageHeader
                backHref="/dashboard/marketing/meta-ads/ads"
                backLabel="Advertisements"
                icon={PlayCircle}
                title="Create an advertisement"
                subtitle="Pick where it runs, what people see, then validate with Meta before saving — always paused."
            />

            {statusQuery.isPending && <LoadingRow label="Checking your Meta connection…" />}
            {!statusQuery.isPending && !connected && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center space-y-3">
                    <p className="font-bold text-gray-900">Meta account not connected</p>
                    <p className="text-sm text-gray-500">Connect your Meta account before creating advertisements.</p>
                    <Link href="/dashboard/marketing/meta-ads/settings" className={btnPrimaryClass}>
                        Open Meta connection settings
                    </Link>
                </div>
            )}

            {connected && canManage && (
                <>
                    <Stepper steps={STEPS} activeIndex={step} onSelect={(index) => { setStep(index); setStepError(null); }} />

                    <ErrorBox error={stepError || (createMutation.isError ? createMutation.error : null)} />

                    {/* ---------------- Step 1: ad set ---------------- */}
                    {step === 0 && (
                        <SectionCard icon={Target} title="Where should this ad run?" subtitle="Choose a campaign and one of its ad sets">
                            <div className="space-y-4">
                                <div>
                                    <label className={labelClass}>Campaign *</label>
                                    {campaignsQuery.isPending ? (
                                        <LoadingRow label="Loading campaigns…" />
                                    ) : campaignsQuery.isError ? (
                                        <ErrorBox error={campaignsQuery.error} onRetry={() => campaignsQuery.refetch()} />
                                    ) : campaigns.length === 0 ? (
                                        <Notice tone="amber" icon={AlertCircle}>
                                            No campaigns yet —{" "}
                                            <Link href="/dashboard/marketing/meta-ads/campaigns" className="underline font-semibold">
                                                create a campaign first
                                            </Link>
                                            , then add an ad set to it.
                                        </Notice>
                                    ) : (
                                        <select
                                            value={campaignId}
                                            onChange={(e) => {
                                                setCampaignId(e.target.value);
                                                setAdsetId("");
                                            }}
                                            className={inputClass}
                                        >
                                            <option value="">Choose a campaign…</option>
                                            {campaigns.map((campaign) => (
                                                <option key={campaign.id} value={campaign.id}>
                                                    {campaign.name || `Campaign ${campaign.id}`}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                <div>
                                    <label className={labelClass}>Ad set *</label>
                                    {!campaignId ? (
                                        <p className="text-xs text-gray-400">Choose a campaign first.</p>
                                    ) : adsetsQuery.isPending ? (
                                        <LoadingRow label="Loading ad sets…" />
                                    ) : adsetsQuery.isError ? (
                                        <ErrorBox error={adsetsQuery.error} onRetry={() => adsetsQuery.refetch()} />
                                    ) : adsets.length === 0 ? (
                                        <Notice tone="amber" icon={AlertCircle}>
                                            This campaign has no ad sets yet —{" "}
                                            <Link
                                                href={`/dashboard/marketing/meta-ads/campaigns/${campaignId}/adsets/new`}
                                                className="underline font-semibold"
                                            >
                                                create an ad set
                                            </Link>{" "}
                                            to define who sees your ads.
                                        </Notice>
                                    ) : (
                                        <select value={adsetId} onChange={(e) => setAdsetId(e.target.value)} className={inputClass}>
                                            <option value="">Choose an ad set…</option>
                                            {adsets.map((adset) => (
                                                <option key={adset.id} value={adset.id}>
                                                    {adset.name || `Ad set ${adset.id}`}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        The ad set decides the audience, placements and budget.
                                    </p>
                                </div>
                            </div>
                        </SectionCard>
                    )}

                    {/* ---------------- Step 2: creative ---------------- */}
                    {step === 1 && (
                        <SectionCard
                            icon={ImageIcon}
                            title="What will people see?"
                            subtitle="Pick a saved creative — or build one in the Creative Studio"
                            action={
                                <Link href="/dashboard/marketing/meta-ads/creatives/new" className={btnSecondaryClass}>
                                    Build a new creative
                                </Link>
                            }
                        >
                            {creativesQuery.isPending ? (
                                <LoadingRow label="Loading your creatives…" />
                            ) : creativesQuery.isError ? (
                                <ErrorBox error={creativesQuery.error} onRetry={() => creativesQuery.refetch()} />
                            ) : creatives.length === 0 ? (
                                <EmptyState
                                    icon={ImageIcon}
                                    title="No ad creatives yet"
                                    hint="An ad creative combines a photo or video with your ad copy and a button."
                                    action={
                                        <Link href="/dashboard/marketing/meta-ads/creatives/new" className={`${btnPrimaryClass} mt-2`}>
                                            Create a creative
                                        </Link>
                                    }
                                />
                            ) : (
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {creatives.map((creative) => {
                                        const isSelected = String(creative.id) === String(creativeId);
                                        return (
                                            <button
                                                key={creative.id}
                                                type="button"
                                                onClick={() => { setCreativeId(creative.id); setStepError(null); }}
                                                className={`text-left rounded-2xl border p-3.5 bg-white transition ${
                                                    isSelected
                                                        ? "border-purple-500 ring-2 ring-purple-200"
                                                        : "border-gray-200 hover:border-purple-300"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-gray-900 truncate">
                                                            {creative.name || "Untitled creative"}
                                                        </p>
                                                        <p className="text-xs text-gray-500 truncate mt-0.5">
                                                            {creative.headline || creative.title || ""}
                                                        </p>
                                                        <p className="text-[11px] text-gray-400 truncate">
                                                            {creative.body || ""}
                                                        </p>
                                                        <p className="text-[11px] text-purple-600 font-bold mt-1">
                                                            {CTA_LABELS[creative.callToActionType] || creative.callToActionType || ""}
                                                        </p>
                                                    </div>
                                                    {isSelected && (
                                                        <CheckCircle2 size={18} className="text-purple-600 shrink-0" />
                                                    )}
                                                </div>
                                                <AdminId value={creative.id} prefix="Creative" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {preselectedCreative && step === 1 && !selectedCreative && !creativesQuery.isPending && (
                                <Notice tone="blue">
                                    Pre-selected creative from your library — if it is missing, it may have been deleted.
                                </Notice>
                            )}
                        </SectionCard>
                    )}

                    {/* ---------------- Step 3: review & create ---------------- */}
                    {step === 2 && (
                        <div className="space-y-5">
                            <SectionCard icon={Layers} title="Review" subtitle="Check everything, then validate with Meta">
                                <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                                    <div>
                                        <dt className={labelClass}>Advertisement name</dt>
                                        <dd>
                                            <input
                                                type="text"
                                                maxLength={200}
                                                value={name}
                                                onChange={(e) => { setName(e.target.value); setValidatedJson(null); }}
                                                placeholder="e.g. Weekend visit push"
                                                className={inputClass}
                                            />
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className={labelClass}>Campaign</dt>
                                        <dd className="text-gray-800 font-semibold">{selectedCampaign?.name || "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className={labelClass}>Ad set</dt>
                                        <dd className="text-gray-800 font-semibold">{selectedAdset?.name || "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className={labelClass}>Creative</dt>
                                        <dd className="text-gray-800 font-semibold">{selectedCreative?.name || "—"}</dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <dt className={labelClass}>Headline</dt>
                                        <dd className="text-gray-700">{selectedCreative?.headline || selectedCreative?.title || "—"}</dd>
                                    </div>
                                </dl>

                                <Notice tone="amber" icon={AlertCircle}>
                                    The ad will be created <strong>paused</strong> and sent to Meta for review. It will not
                                    appear anywhere or spend money until you explicitly activate it.
                                </Notice>

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-xs font-semibold">
                                        {alreadyValidated ? (
                                            <span className="text-emerald-600 inline-flex items-center gap-1">
                                                <SearchCheck size={14} /> Validated by Meta — ready to create
                                            </span>
                                        ) : (
                                            <span className="text-amber-600 inline-flex items-center gap-1">
                                                <AlertCircle size={14} /> Validate to unlock creation
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => validateMutation.mutate()}
                                            disabled={validateMutation.isPending || createMutation.isPending || !name.trim()}
                                            className="px-4 py-2 rounded-xl border border-purple-200 bg-purple-50 text-sm font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                                        >
                                            {validateMutation.isPending && <RefreshCw size={14} className="animate-spin inline mr-1.5" />}
                                            Validate with Meta
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => createMutation.mutate()}
                                            disabled={!alreadyValidated || createMutation.isPending || validateMutation.isPending || !name.trim()}
                                            className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {createMutation.isPending && <RefreshCw size={14} className="animate-spin inline mr-1.5" />}
                                            Create paused advertisement
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[11px] text-gray-400">
                                    Validation is Meta&apos;s own dry-run — full provider checks, nothing saved. Editing after
                                    validating locks creation until you validate again.
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
                            <button
                                type="button"
                                onClick={goNext}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700"
                            >
                                Next <ChevronRight size={15} />
                            </button>
                        )}
                        {step === STEPS.length - 1 && (
                            <Link
                                href="/dashboard/marketing/meta-ads/ads"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </Link>
                        )}
                    </div>
                </>
            )}

            {connected && !canManage && (
                <Notice tone="gray" icon={AlertCircle}>
                    View-only access — creating advertisements requires marketing management permission. Ask an administrator.
                </Notice>
            )}
        </PageContainer>
    );
}
