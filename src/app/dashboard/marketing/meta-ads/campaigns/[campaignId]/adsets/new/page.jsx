"use client";
// Ad set creation wizard — Phase 3+4, 4 steps:
//   1. Budget & delivery (name, budget, schedule, billing event, optimization)
//   2. Targeting (location, age, gender, placements)
//   3. Audiences (include / exclude saved custom audiences)
//   4. Review → "Validate targeting" (Meta validate_only dry-run, no mutation)
//      → "Create paused ad set"
//
// Safety chain: the Create button unlocks ONLY after the server-confirmed
// dry-run succeeds (and the payload hasn't changed since); the server
// independently re-runs validate_only before the real create and always
// creates status=PAUSED. Nothing here can publish ads or start spend.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
    AlertCircle, ChevronLeft, ChevronRight, ClipboardCheck, Loader2, MapPin,
    SearchCheck, Settings2, Target, Users,
} from "lucide-react";
import { usePermissions } from "../../../../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../../../../lib/toast";
import {
    BILLING_EVENTS,
    BILLING_EVENT_LABELS,
    DEVICE_PLATFORMS,
    FACEBOOK_POSITIONS,
    INSTAGRAM_POSITIONS,
    OPTIMIZATION_GOALS,
    OPTIMIZATION_GOAL_LABELS,
    PLATFORM_LABELS,
    POSITION_LABELS,
    PUBLISHER_PLATFORMS,
    GENDER_OPTIONS,
    parseCountryCodes,
    toMinorUnits,
} from "../../../../../../../../lib/metaAdsEnums";
import {
    fetchMetaStatus,
    fetchMetaCampaignDetail,
    fetchMetaAdOptions,
    fetchMetaAudiences,
    fetchMetaPages,
    validateMetaAdSet,
    createMetaAdSet,
} from "../../../../../../../../lib/api/metaAds";
import {
    DisconnectedCard, ErrorBox, Field, LoadingRow, Notice, SectionCard,
    StatusBadge, inputClass, labelClass,
} from "../../../../_components/metaAdsUi";

const STEPS = [
    { key: "delivery", label: "Budget & delivery", icon: Settings2 },
    { key: "targeting", label: "Targeting", icon: Target },
    { key: "audiences", label: "Audiences", icon: Users },
    { key: "review", label: "Review", icon: ClipboardCheck },
];

const INITIAL = {
    name: "",
    budgetType: "daily",
    budgetAmount: "",
    startTime: "", // datetime-local
    endTime: "",   // datetime-local
    billingEvent: "IMPRESSIONS",
    optimizationGoal: "LEAD_GENERATION",
    bidAmount: "",
    pageId: "",
    countries: "IN",
    ageMin: "18",
    ageMax: "65",
    gender: "",
    publisherPlatforms: ["facebook"],
    devicePlatforms: [],
    facebookPositions: ["feed"],
    instagramPositions: [],
    customAudiences: [],
    excludedCustomAudiences: [],
};

const toIso = (local) => (local ? new Date(local).toISOString() : undefined);

export default function NewAdSetPage() {
    const params = useParams();
    const router = useRouter();
    const campaignId = String(params?.campaignId || "");
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");

    const [step, setStep] = useState(0);
    const [form, setForm] = useState(INITIAL);
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

    const campaignQuery = useQuery({
        queryKey: ["meta-ads", "campaign", campaignId],
        queryFn: () => fetchMetaCampaignDetail(campaignId),
        enabled: canView && connected && Boolean(campaignId),
        retry: 1,
    });

    const optionsQuery = useQuery({
        queryKey: ["meta-ads", "options"],
        queryFn: fetchMetaAdOptions,
        enabled: canView && connected,
        staleTime: 30 * 60_000,
        retry: 1,
    });
    const opt = optionsQuery.data || {};
    const billingEvents = opt.billingEvents?.length ? opt.billingEvents : BILLING_EVENTS;
    const optimizationGoals = opt.optimizationGoals?.length ? opt.optimizationGoals : OPTIMIZATION_GOALS;
    const publishers = opt.publisherPlatforms?.length ? opt.publisherPlatforms : PUBLISHER_PLATFORMS;
    const devices = opt.devicePlatforms?.length ? opt.devicePlatforms : DEVICE_PLATFORMS;
    const fbPositions = opt.facebookPositions?.length ? opt.facebookPositions : FACEBOOK_POSITIONS;
    const igPositions = opt.instagramPositions?.length ? opt.instagramPositions : INSTAGRAM_POSITIONS;

    const audiencesQuery = useQuery({
        queryKey: ["meta-ads", "audiences", "custom"],
        queryFn: () => fetchMetaAudiences({ type: "custom", limit: 100 }),
        enabled: canView && connected && step === 2,
        retry: 1,
    });
    const customAudiences = audiencesQuery.data?.custom?.items || [];

    // Page picker for the Lead generation goal — plain-language selection
    // instead of asking the user for a raw Facebook Page ID.
    const pagesQuery = useQuery({
        queryKey: ["meta-ads", "pages", "picker"],
        queryFn: () => fetchMetaPages({ limit: 100 }),
        enabled: canView && connected && form.optimizationGoal === "LEAD_GENERATION",
        staleTime: 120_000,
        retry: 1,
    });
    const pageItems = pagesQuery.data?.items || [];

    const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));
    const toggleIn = (key) => (value) =>
        setForm((prev) => ({
            ...prev,
            [key]: prev[key].includes(value)
                ? prev[key].filter((v) => v !== value)
                : [...prev[key], value],
        }));

    // The full server-shaped payload for steps 3 (review) — also the string
    // whose change invalidates a previous dry-run result.
    const payload = useMemo(() => {
        const countries = parseCountryCodes(form.countries);
        const targeting = { countries };
        const ageMin = Number(form.ageMin);
        const ageMax = Number(form.ageMax);
        if (form.ageMin !== "" && Number.isFinite(ageMin)) targeting.ageMin = ageMin;
        if (form.ageMax !== "" && Number.isFinite(ageMax)) targeting.ageMax = ageMax;
        if (form.gender) targeting.genders = [Number(form.gender)];
        if (form.customAudiences.length > 0) targeting.customAudiences = form.customAudiences;
        if (form.excludedCustomAudiences.length > 0) {
            targeting.excludedCustomAudiences = form.excludedCustomAudiences;
        }
        if (form.publisherPlatforms.length > 0) targeting.publisherPlatforms = form.publisherPlatforms;
        if (form.devicePlatforms.length > 0) targeting.devicePlatforms = form.devicePlatforms;
        if (form.facebookPositions.length > 0) targeting.facebookPositions = form.facebookPositions;
        if (form.instagramPositions.length > 0) targeting.instagramPositions = form.instagramPositions;

        const body = {
            name: form.name.trim(),
            campaignId,
            billingEvent: form.billingEvent,
            optimizationGoal: form.optimizationGoal,
            targeting,
        };
        if (form.budgetType === "daily") {
            body.dailyBudget = toMinorUnits(form.budgetAmount);
        } else {
            body.lifetimeBudget = toMinorUnits(form.budgetAmount);
            if (form.endTime) body.endTime = toIso(form.endTime);
        }
        if (form.startTime) body.startTime = toIso(form.startTime);
        if (form.bidAmount.trim() !== "") {
            const bid = toMinorUnits(form.bidAmount);
            body.bidAmount = bid === null ? NaN : bid;
        }
        if (form.optimizationGoal === "LEAD_GENERATION" && form.pageId.trim() !== "") {
            body.pageId = form.pageId.trim();
        }
        return body;
    }, [form, campaignId]);

    const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);
    // Derived validation gate: the dry-run result only counts while the
    // payload is byte-identical to what was validated — ANY edit locks the
    // Create button again until the user re-validates (no effect needed).
    const alreadyValidated = validatedJson !== null && validatedJson === payloadJson;

    const validateMutation = useMutation({
        mutationFn: () => validateMetaAdSet(payload),
        onSuccess: () => {
            setValidatedJson(payloadJson);
            showToast("Meta validated the targeting — no changes were made", "success");
        },
        onError: (error) => showToast(error.message || "Validation failed", "error"),
    });

    const createMutation = useMutation({
        mutationFn: () => createMetaAdSet(payload),
        onSuccess: () => {
            showToast("Ad set created in PAUSED state", "success");
            router.push(`/dashboard/marketing/meta-ads/campaigns/${campaignId}`);
        },
        onError: (error) => showToast(error.message || "Could not create the ad set", "error"),
    });

    // Per-step gate: returns an error string (blocking) or null.
    const validateStep = (index) => {
        if (index === 0) {
            if (!form.name.trim()) return "Ad set name is required";
            if (toMinorUnits(form.budgetAmount) === null || toMinorUnits(form.budgetAmount) <= 0) {
                return "Enter a positive budget, e.g. 3000 or 3000.50";
            }
            if (form.budgetType === "lifetime" && !form.endTime) {
                return "A lifetime budget needs an end date";
            }
            if (form.startTime && form.endTime && new Date(form.startTime) >= new Date(form.endTime)) {
                return "End date must be after the start date";
            }
            if (form.bidAmount.trim() !== "" && toMinorUnits(form.bidAmount) === null) {
                return "Bid amount must be a positive amount";
            }
            if (form.optimizationGoal === "LEAD_GENERATION" && !form.pageId.trim()) {
                return "Choose the Facebook Page that will run your lead form ads";
            }
            return null;
        }
        if (index === 1) {
            const countries = parseCountryCodes(form.countries);
            if (countries.length === 0) return "Enter at least one country, e.g. IN";
            const ageMin = Number(form.ageMin);
            const ageMax = Number(form.ageMax);
            if (form.ageMin !== "" && (ageMin < 13 || ageMin > 65)) return "Minimum age must be between 13 and 65";
            if (form.ageMax !== "" && (ageMax < 13 || ageMax > 65)) return "Maximum age must be between 13 and 65";
            if (form.ageMin !== "" && form.ageMax !== "" && ageMin > ageMax) {
                return "Maximum age must be greater than or equal to minimum age";
            }
            if (form.publisherPlatforms.includes("audience_network") && form.publisherPlatforms.length === 1) {
                return "Audience Network cannot be used alone — pair it with another platform";
            }
            if (form.publisherPlatforms.includes("threads") && !form.publisherPlatforms.includes("instagram")) {
                return "Threads delivery requires Instagram to also be selected";
            }
            if (form.facebookPositions.length > 0 && !form.publisherPlatforms.includes("facebook")) {
                return "Facebook placements require the Facebook platform to be selected";
            }
            if (form.instagramPositions.length > 0 && !form.publisherPlatforms.includes("instagram")) {
                return "Instagram placements require the Instagram platform to be selected";
            }
            if (
                form.facebookPositions.includes("story") &&
                !form.facebookPositions.includes("feed") &&
                !form.instagramPositions.includes("story")
            ) {
                return "The story placement must be combined with Facebook feed or Instagram story";
            }
            for (const dep of ["marketplace", "search", "profile_feed", "notification"]) {
                if (form.facebookPositions.includes(dep) && !form.facebookPositions.includes("feed")) {
                    return `The ${POSITION_LABELS[dep] || dep} placement must be combined with feed`;
                }
            }
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

    const campaign = campaignQuery.data || null;

    if (!canView || !canManage) {
        return (
            <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Ad set creation is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">
                        Creating ad sets requires marketing management access. Ask an administrator.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar">
            <div>
                <Link
                    href={`/dashboard/marketing/meta-ads/campaigns/${campaignId}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-purple-600 mb-1"
                >
                    <ChevronLeft size={13} /> Back to campaign
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">New ad set</h1>
                <p className="text-sm text-gray-500">
                    For campaign {campaign ? (
                        <span className="font-semibold text-gray-700">
                            {campaign.name || campaignId} <StatusBadge status={campaign.effectiveStatus || campaign.status} />
                        </span>
                    ) : (
                        campaignId
                    )} — created PAUSED, never auto-activated.
                </p>
            </div>

            {statusQuery.isPending && <LoadingRow label="Checking Meta connection…" />}
            {!statusQuery.isPending && !connected && <DisconnectedCard title="Meta account not connected" />}

            {connected && (
                <>
                    {/* Step indicator */}
                    <div className="flex flex-wrap gap-2">
                        {STEPS.map((s, index) => {
                            const Icon = s.icon;
                            const active = index === step;
                            const done = index < step;
                            return (
                                <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => {
                                        if (index < step) {
                                            setStep(index);
                                            setStepError(null);
                                        }
                                    }}
                                    disabled={index > step}
                                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition ${
                                        active
                                            ? "border-purple-500 bg-purple-50 text-purple-700"
                                            : done
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                : "border-gray-200 bg-white text-gray-400 cursor-not-allowed"
                                    }`}
                                >
                                    <Icon size={13} /> {index + 1}. {s.label}
                                </button>
                            );
                        })}
                    </div>

                    <ErrorBox
                        error={stepError || validateMutation.error || (createMutation.isError ? createMutation.error : null)}
                    />

                    {/* ---- Step 1: budget & delivery ---- */}
                    {step === 0 && (
                        <SectionCard icon={Settings2} title="Budget & delivery" subtitle="How much this ad set spends and how Meta optimizes it">
                            <div className="space-y-4">
                                <Field label="Ad set name" hint="Required, max 400 characters.">
                                    <input
                                        type="text"
                                        maxLength={400}
                                        value={form.name}
                                        onChange={(e) => set("name")(e.target.value)}
                                        placeholder="e.g. Wave — IN leads 25-45"
                                        className={inputClass}
                                    />
                                </Field>
                                <div className="grid sm:grid-cols-3 gap-3">
                                    <Field label="Budget type">
                                        <select
                                            value={form.budgetType}
                                            onChange={(e) => set("budgetType")(e.target.value)}
                                            className={inputClass}
                                        >
                                            <option value="daily">Daily</option>
                                            <option value="lifetime">Lifetime</option>
                                        </select>
                                    </Field>
                                    <Field
                                        label={form.budgetType === "daily" ? "Daily budget (₹)" : "Lifetime budget (₹)"}
                                        hint="Enter the amount in rupees (e.g. 5000)."
                                    >
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={form.budgetAmount}
                                            onChange={(e) => set("budgetAmount")(e.target.value)}
                                            placeholder="e.g. 3000"
                                            className={inputClass}
                                        />
                                    </Field>
                                    <Field label="Bid amount (₹)" hint="Optional — leave blank for Meta's recommended bid.">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={form.bidAmount}
                                            onChange={(e) => set("bidAmount")(e.target.value)}
                                            placeholder="auto"
                                            className={inputClass}
                                        />
                                    </Field>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <Field label="Start (optional)" hint="Blank means the schedule Meta applies by default.">
                                        <input
                                            type="datetime-local"
                                            value={form.startTime}
                                            onChange={(e) => set("startTime")(e.target.value)}
                                            className={inputClass}
                                        />
                                    </Field>
                                    <Field
                                        label="End (optional)"
                                        hint={form.budgetType === "lifetime" ? "Required for lifetime budgets." : "Blank = ongoing."}
                                    >
                                        <input
                                            type="datetime-local"
                                            value={form.endTime}
                                            onChange={(e) => set("endTime")(e.target.value)}
                                            className={inputClass}
                                        />
                                    </Field>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <Field label="Billing event" hint="What Meta charges for.">
                                        <select
                                            value={form.billingEvent}
                                            onChange={(e) => set("billingEvent")(e.target.value)}
                                            className={inputClass}
                                        >
                                            {billingEvents.map((b) => (
                                                <option key={b} value={b}>{BILLING_EVENT_LABELS[b] || b}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field label="Optimization goal" hint="What Meta optimizes delivery for.">
                                        <select
                                            value={form.optimizationGoal}
                                            onChange={(e) => set("optimizationGoal")(e.target.value)}
                                            className={inputClass}
                                        >
                                            {optimizationGoals.map((g) => (
                                                <option key={g} value={g}>{OPTIMIZATION_GOAL_LABELS[g] || g}</option>
                                            ))}
                                        </select>
                                    </Field>
                                </div>
                                {form.optimizationGoal === "LEAD_GENERATION" && (
                                    <Field
                                        label="Facebook Page"
                                        hint="The Page that runs your lead form ads — required by Meta for the Lead generation goal."
                                    >
                                        {pagesQuery.isPending ? (
                                            <LoadingRow label="Loading your Pages…" />
                                        ) : pagesQuery.isError ? (
                                            <ErrorBox error={pagesQuery.error} onRetry={() => pagesQuery.refetch()} />
                                        ) : pageItems.length === 0 ? (
                                            <Notice tone="amber" icon={AlertCircle}>
                                                No Pages are visible to this connection yet. Select your Pages in{" "}
                                                <Link
                                                    href="/dashboard/marketing/meta-ads/settings"
                                                    className="underline font-semibold"
                                                >
                                                    Meta connection settings
                                                </Link>{" "}
                                                and try again.
                                            </Notice>
                                        ) : (
                                            <select
                                                value={form.pageId}
                                                onChange={(e) => set("pageId")(e.target.value)}
                                                className={inputClass}
                                            >
                                                <option value="">Choose a Page…</option>
                                                {pageItems.map((page) => (
                                                    <option key={page.id} value={String(page.id)}>
                                                        {page.name || `Page ${page.id}`}
                                                    </option>
                                                ))}
                                                {form.pageId &&
                                                    !pageItems.some((page) => String(page.id) === String(form.pageId)) && (
                                                        <option value={form.pageId}>Previously selected Page</option>
                                                    )}
                                            </select>
                                        )}
                                    </Field>
                                )}
                            </div>
                        </SectionCard>
                    )}

                    {/* ---- Step 2: targeting ---- */}
                    {step === 1 && (
                        <SectionCard icon={Target} title="Targeting" subtitle="Location, age, gender and placements — validated by Meta before anything is created">
                            <div className="space-y-4">
                                <div className="grid sm:grid-cols-3 gap-3">
                                    <div className="sm:col-span-1">
                                        <Field label="Countries" hint="Which countries to reach — e.g. IN, AE">
                                            <input
                                                type="text"
                                                value={form.countries}
                                                onChange={(e) => set("countries")(e.target.value)}
                                                placeholder="IN, AE"
                                                className={inputClass}
                                            />
                                        </Field>
                                    </div>
                                    <Field label="Min age">
                                        <input
                                            type="number"
                                            min={13}
                                            max={65}
                                            value={form.ageMin}
                                            onChange={(e) => set("ageMin")(e.target.value)}
                                            className={inputClass}
                                        />
                                    </Field>
                                    <Field label="Max age">
                                        <input
                                            type="number"
                                            min={13}
                                            max={65}
                                            value={form.ageMax}
                                            onChange={(e) => set("ageMax")(e.target.value)}
                                            className={inputClass}
                                        />
                                    </Field>
                                </div>
                                <div className="w-56">
                                    <Field label="Gender" hint="Who should see your ads.">
                                        <select
                                            value={form.gender}
                                            onChange={(e) => set("gender")(e.target.value)}
                                            className={inputClass}
                                        >
                                            {GENDER_OPTIONS.map((g) => (
                                                <option key={g.value || "all"} value={g.value}>{g.label}</option>
                                            ))}
                                        </select>
                                    </Field>
                                </div>

                                <div>
                                    <label className={labelClass}>Publisher platforms</label>
                                    <div className="flex flex-wrap gap-2">
                                        {publishers.map((p) => (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() => toggleIn("publisherPlatforms")(p)}
                                                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                                                    form.publisherPlatforms.includes(p)
                                                        ? "border-purple-500 bg-purple-50 text-purple-700"
                                                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                                }`}
                                            >
                                                {PLATFORM_LABELS[p] || p}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Audience Network cannot run alone; Threads requires Instagram.
                                    </p>
                                </div>

                                <div>
                                    <label className={labelClass}>Device platforms (optional)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {devices.map((d) => (
                                            <button
                                                key={d}
                                                type="button"
                                                onClick={() => toggleIn("devicePlatforms")(d)}
                                                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                                                    form.devicePlatforms.includes(d)
                                                        ? "border-purple-500 bg-purple-50 text-purple-700"
                                                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                                }`}
                                            >
                                                {d === "mobile" ? "Mobile" : "Desktop"}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {form.publisherPlatforms.includes("facebook") && (
                                    <div>
                                        <label className={labelClass}>Facebook placements</label>
                                        <div className="flex flex-wrap gap-2">
                                            {fbPositions.map((p) => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => toggleIn("facebookPositions")(p)}
                                                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                                                        form.facebookPositions.includes(p)
                                                            ? "border-purple-500 bg-purple-50 text-purple-700"
                                                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                                    }`}
                                                >
                                                    {POSITION_LABELS[p] || p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {form.publisherPlatforms.includes("instagram") && (
                                    <div>
                                        <label className={labelClass}>Instagram placements</label>
                                        <div className="flex flex-wrap gap-2">
                                            {igPositions.map((p) => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => toggleIn("instagramPositions")(p)}
                                                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                                                        form.instagramPositions.includes(p)
                                                            ? "border-purple-500 bg-purple-50 text-purple-700"
                                                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                                    }`}
                                                >
                                                    {POSITION_LABELS[p] || p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </SectionCard>
                    )}

                    {/* ---- Step 3: audiences ---- */}
                    {step === 2 && (
                        <SectionCard icon={Users} title="Audiences" subtitle="Attach saved custom audiences — pulled live from Meta, nothing is pre-filled">
                            <ErrorBox error={audiencesQuery.error} onRetry={() => audiencesQuery.refetch()} />
                            {audiencesQuery.isPending ? (
                                <LoadingRow label="Loading your custom audiences…" />
                            ) : customAudiences.length === 0 ? (
                                <Notice tone="gray" icon={MapPin}>
                                    No custom audiences exist on this ad account yet. You can continue without any —
                                    or create one on the Audiences page.
                                </Notice>
                            ) : (
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Include (target these people)</label>
                                        <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                                            {customAudiences.map((a) => (
                                                <label
                                                    key={a.id}
                                                    className="flex items-center gap-2 p-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={form.customAudiences.includes(a.id)}
                                                        onChange={() => toggleIn("customAudiences")(a.id)}
                                                    />
                                                    <span className="flex-1 text-gray-700">{a.name || a.id}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Exclude (never show to these people)</label>
                                        <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                                            {customAudiences.map((a) => (
                                                <label
                                                    key={a.id}
                                                    className="flex items-center gap-2 p-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={form.excludedCustomAudiences.includes(a.id)}
                                                        onChange={() => toggleIn("excludedCustomAudiences")(a.id)}
                                                    />
                                                    <span className="flex-1 text-gray-700">{a.name || a.id}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </SectionCard>
                    )}

                    {/* ---- Step 4: review → validate → create ---- */}
                    {step === 3 && (
                        <SectionCard
                            icon={ClipboardCheck}
                            title="Review & validate"
                            subtitle="Nothing is created until Meta's own dry-run validation passes"
                        >
                            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                                <div>
                                    <p className={labelClass}>Name</p>
                                    <p className="text-gray-800 font-semibold">{payload.name || "—"}</p>
                                </div>
                                <div>
                                    <p className={labelClass}>Campaign</p>
                                    <p className="text-gray-800">{campaign?.name || campaignId}</p>
                                </div>
                                <div>
                                    <p className={labelClass}>Budget</p>
                                    <p className="text-gray-800">
                                        {form.budgetType === "daily" ? "Daily" : "Lifetime"} ₹
                                        {form.budgetAmount || "—"}
                                    </p>
                                </div>
                                <div>
                                    <p className={labelClass}>Schedule</p>
                                    <p className="text-gray-800">
                                        {form.startTime ? new Date(form.startTime).toLocaleString("en-IN") : "Start: default"}
                                        {" → "}
                                        {form.endTime ? new Date(form.endTime).toLocaleString("en-IN") : "Ongoing"}
                                    </p>
                                </div>
                                <div>
                                    <p className={labelClass}>Billing / optimization</p>
                                    <p className="text-gray-800">
                                        {BILLING_EVENT_LABELS[form.billingEvent] || form.billingEvent} ·{" "}
                                        {OPTIMIZATION_GOAL_LABELS[form.optimizationGoal] || form.optimizationGoal}
                                    </p>
                                </div>
                                <div>
                                    <p className={labelClass}>Bid</p>
                                    <p className="text-gray-800">{form.bidAmount ? `₹${form.bidAmount}` : "Meta recommended"}</p>
                                </div>
                                <div className="sm:col-span-2">
                                    <p className={labelClass}>Targeting summary</p>
                                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                                        <div>
                                            <p className="text-[11px] font-black uppercase text-gray-400">Countries</p>
                                            <p className="text-gray-800">
                                                {parseCountryCodes(form.countries).join(", ") || "—"}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black uppercase text-gray-400">Age</p>
                                            <p className="text-gray-800">
                                                {form.ageMin || "13"} – {form.ageMax || "65"} years
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black uppercase text-gray-400">Gender</p>
                                            <p className="text-gray-800">
                                                {GENDER_OPTIONS.find((g) => String(g.value) === String(form.gender))?.label || "All genders"}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black uppercase text-gray-400">Where ads appear</p>
                                            <p className="text-gray-800">
                                                {form.publisherPlatforms.map((p) => PLATFORM_LABELS[p] || p).join(", ") || "—"}
                                            </p>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <p className="text-[11px] font-black uppercase text-gray-400">Placements</p>
                                            <p className="text-gray-800">
                                                {[
                                                    ...form.facebookPositions.map((p) => POSITION_LABELS[p] || p),
                                                    ...form.instagramPositions.map((p) => POSITION_LABELS[p] || p),
                                                ].join(", ") || "Automatic placements"}
                                            </p>
                                        </div>
                                        {form.devicePlatforms.length > 0 && (
                                            <div className="sm:col-span-2">
                                                <p className="text-[11px] font-black uppercase text-gray-400">Devices</p>
                                                <p className="text-gray-800 capitalize">{form.devicePlatforms.join(", ")}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <p className={labelClass}>Audiences included</p>
                                    <p className="text-gray-800">
                                        {form.customAudiences.length > 0
                                            ? customAudiences
                                                .filter((a) => form.customAudiences.includes(a.id))
                                                .map((a) => a.name || a.id)
                                                .join(", ")
                                            : "None"}
                                    </p>
                                </div>
                                <div>
                                    <p className={labelClass}>Audiences excluded</p>
                                    <p className="text-gray-800">
                                        {form.excludedCustomAudiences.length > 0
                                            ? customAudiences
                                                .filter((a) => form.excludedCustomAudiences.includes(a.id))
                                                .map((a) => a.name || a.id)
                                                .join(", ")
                                            : "None"}
                                    </p>
                                </div>
                            </div>

                            <Notice tone="amber" icon={AlertCircle}>
                                The ad set will be created <strong>PAUSED</strong>. Activation is a separate,
                                confirmed action on the ad set page and can start ad spend.
                            </Notice>

                            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                <div className="text-xs font-semibold">
                                    {alreadyValidated ? (
                                        <span className="text-emerald-600 inline-flex items-center gap-1">
                                            <SearchCheck size={14} /> Targeting validated by Meta — ready to create
                                        </span>
                                    ) : (
                                        <span className="text-amber-600 inline-flex items-center gap-1">
                                            <AlertCircle size={14} /> Validate the targeting to unlock creation
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
                                        {validateMutation.isPending && <Loader2 size={14} className="animate-spin inline mr-1.5" />}
                                        Validate targeting
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => createMutation.mutate()}
                                        disabled={!alreadyValidated || createMutation.isPending || validateMutation.isPending}
                                        className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {createMutation.isPending && <Loader2 size={14} className="animate-spin inline mr-1.5" />}
                                        Create paused ad set
                                    </button>
                                </div>
                            </div>
                            <p className="text-[11px] text-gray-400">
                                Validation runs Meta&apos;s validate_only dry-run: full provider checks, zero mutation.
                                Editing anything after validating locks creation until you validate again.
                            </p>
                        </SectionCard>
                    )}

                    {/* Navigation */}
                    <div className="flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => {
                                setStep((s) => Math.max(s - 1, 0));
                                setStepError(null);
                            }}
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
                    </div>
                </>
            )}
        </div>
    );
}
