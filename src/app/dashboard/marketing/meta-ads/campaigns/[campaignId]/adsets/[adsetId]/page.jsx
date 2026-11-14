"use client";
// Ad set detail — Phase 3+4: view, edit and status control for ONE ad set.
//
// The edit form is prefilled from Meta's live targeting spec; audience
// references are preserved as-is (selection UI is part of the create wizard
// and Ads Manager) while name, budget, schedule, delivery settings and core
// targeting are editable. Activation goes through the mandatory-acknowledge
// ConfirmDialog (server also requires confirm:true). Creation and activation
// are always separate, explicit user actions.
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertCircle, ChevronLeft, Layers, Loader2, Pencil, Play, RefreshCw,
    Settings2, Target,
} from "lucide-react";
import { usePermissions } from "../../../../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../../../../lib/toast";
import {
    BILLING_EVENTS,
    BILLING_EVENT_LABELS,
    OPTIMIZATION_GOALS,
    OPTIMIZATION_GOAL_LABELS,
    formatMinor,
    fromMinorUnits,
    parseCountryCodes,
    toMinorUnits,
} from "../../../../../../../../lib/metaAdsEnums";
import {
    fetchMetaStatus,
    fetchMetaAdSet,
    fetchMetaAdOptions,
    fetchMetaPages,
    updateMetaAdSet,
    setMetaAdSetStatus,
} from "../../../../../../../../lib/api/metaAds";
import {
    AdminId, ConfirmDialog, DisconnectedCard, ErrorBox, Field, LoadingRow, Notice,
    SectionCard, StatusBadge, inputClass, labelClass,
} from "../../../../_components/metaAdsUi";

// Meta targeting object → the edit form's camelCase shape. Unknown sections
// (audiences, lookalikes…) are carried through untouched so saving never
// silently drops them.
const targetingToForm = (targeting) => ({
    countries: (targeting?.geo_locations?.countries || []).join(", "),
    ageMin: targeting?.age_min !== undefined ? String(targeting.age_min) : "",
    ageMax: targeting?.age_max !== undefined ? String(targeting.age_max) : "",
    gender: Array.isArray(targeting?.genders) && targeting.genders.length === 1
        ? String(targeting.genders[0])
        : "",
    publisherPlatforms: targeting?.publisher_platforms || [],
    devicePlatforms: targeting?.device_platforms || [],
    facebookPositions: targeting?.facebook_positions || [],
    instagramPositions: targeting?.instagram_positions || [],
    customAudiences: (targeting?.custom_audiences || []).map((a) => String(a.id)),
    excludedCustomAudiences: (targeting?.excluded_custom_audiences || []).map((a) => String(a.id)),
});

export default function MetaAdSetDetailPage() {
    const params = useParams();
    const campaignId = String(params?.campaignId || "");
    const adsetId = String(params?.adsetId || "");
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");
    const queryClient = useQueryClient();

    const [editing, setEditing] = useState(false);
    const [formOverride, setFormOverride] = useState(null);
    const [formError, setFormError] = useState(null);
    const [activateOpen, setActivateOpen] = useState(false);

    const statusQuery = useQuery({
        queryKey: ["meta-ads", "status"],
        queryFn: fetchMetaStatus,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });
    const connected = statusQuery.data?.connected === true;

    const detailQuery = useQuery({
        queryKey: ["meta-ads", "adset", adsetId],
        queryFn: () => fetchMetaAdSet(adsetId),
        enabled: canView && connected && Boolean(adsetId),
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

    const adset = detailQuery.data || null;
    const isActive = String(adset?.effectiveStatus || adset?.status || "").toUpperCase() === "ACTIVE";

    // Derived form: shows Meta's live ad set while not editing; pressing
    // Edit snapshots into formOverride so background refetches can never
    // wipe the user's in-progress input (no state-resetting effect needed).
    const buildForm = (a) => {
        const hasDaily = a.dailyBudget !== null && a.dailyBudget !== undefined;
        const hasLifetime = a.lifetimeBudget !== null && a.lifetimeBudget !== undefined;
        const base = {
            name: a.name || "",
            budgetType: hasDaily || !hasLifetime ? "daily" : "lifetime",
            budgetAmount: hasDaily
                ? String(fromMinorUnits(a.dailyBudget) ?? "")
                : String(fromMinorUnits(a.lifetimeBudget) ?? ""),
            startTime: a.startTime || "",
            endTime: a.endTime && a.endTime !== "0" ? a.endTime : "",
            billingEvent: a.billingEvent || "IMPRESSIONS",
            optimizationGoal: a.optimizationGoal || "REACH",
            bidAmount: a.bidAmount !== null && a.bidAmount !== undefined
                ? String(fromMinorUnits(a.bidAmount) ?? "")
                : "",
            pageId: a.pageId || "",
        };
        return { ...base, ...targetingToForm(a.targeting) };
    };
    const form = editing && formOverride ? formOverride : adset ? buildForm(adset) : null;

    // Page picker for the Lead generation goal (edit mode) — plain-language
    // selection instead of a raw Facebook Page ID text box. Declared after
    // `form` because the query is gated on the chosen optimization goal.
    const pagesQuery = useQuery({
        queryKey: ["meta-ads", "pages", "picker"],
        queryFn: () => fetchMetaPages({ limit: 100 }),
        enabled: canView && connected && editing && form?.optimizationGoal === "LEAD_GENERATION",
        staleTime: 120_000,
        retry: 1,
    });
    const pageItems = pagesQuery.data?.items || [];

    const startEdit = () => {
        if (!adset) return;
        setFormOverride(buildForm(adset));
        setFormError(null);
        setEditing(true);
    };
    const exitEdit = () => {
        setEditing(false);
        setFormOverride(null);
        setFormError(null);
    };

    const updateMutation = useMutation({
        mutationFn: (payload) => updateMetaAdSet(adsetId, payload),
        onSuccess: () => {
            showToast("Ad set updated", "success");
            exitEdit();
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "adset", adsetId] });
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "adsets"] });
        },
        onError: (error) => setFormError(error),
    });

    const statusMutation = useMutation({
        mutationFn: (payload) => setMetaAdSetStatus(adsetId, payload),
        onSuccess: (data) => {
            showToast(data?.status === "ACTIVE" ? "Ad set activated" : "Ad set paused", "success");
            setActivateOpen(false);
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "adset", adsetId] });
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "adsets"] });
        },
        onError: (error) => {
            setActivateOpen(false);
            showToast(error.message || "Could not change ad set status", "error");
        },
    });

    const set = (key) => (value) =>
        setFormOverride((prev) => ({ ...(prev || (adset ? buildForm(adset) : {})), [key]: value }));

    const saveEdit = () => {
        setFormError(null);
        if (!form) return;
        if (!form.name.trim()) {
            setFormError(new Error("Ad set name is required"));
            return;
        }
        const minor = toMinorUnits(form.budgetAmount);
        if (minor === null || minor <= 0) {
            setFormError(new Error("Budget must be a positive amount, e.g. 3000"));
            return;
        }
        const countries = parseCountryCodes(form.countries);
        if (countries.length === 0) {
            setFormError(new Error("Enter at least one country, e.g. IN"));
            return;
        }
        const ageMin = form.ageMin === "" ? undefined : Number(form.ageMin);
        const ageMax = form.ageMax === "" ? undefined : Number(form.ageMax);
        if ((ageMin !== undefined) !== (ageMax !== undefined)) {
            setFormError(new Error("Provide both minimum and maximum age, or neither"));
            return;
        }
        if (ageMin !== undefined && (ageMin < 13 || ageMin > 65 || ageMax < 13 || ageMax > 65)) {
            setFormError(new Error("Ages must be between 13 and 65"));
            return;
        }
        if (ageMin !== undefined && ageMin > ageMax) {
            setFormError(new Error("Maximum age must be greater than or equal to minimum age"));
            return;
        }
        if (form.startTime && form.endTime && new Date(form.startTime) >= new Date(form.endTime)) {
            setFormError(new Error("End time must be after start time"));
            return;
        }

        const payload = {
            name: form.name.trim(),
            billingEvent: form.billingEvent,
            optimizationGoal: form.optimizationGoal,
            targeting: {
                countries,
                ...(ageMin !== undefined ? { ageMin, ageMax } : {}),
                ...(form.gender ? { genders: [Number(form.gender)] } : {}),
                publisherPlatforms: form.publisherPlatforms,
                devicePlatforms: form.devicePlatforms,
                facebookPositions: form.facebookPositions,
                instagramPositions: form.instagramPositions,
                customAudiences: form.customAudiences,
                excludedCustomAudiences: form.excludedCustomAudiences,
            },
        };
        if (form.budgetType === "daily") payload.dailyBudget = minor;
        else {
            payload.lifetimeBudget = minor;
            if (form.endTime) payload.endTime = new Date(form.endTime).toISOString();
        }
        if (form.startTime) payload.startTime = new Date(form.startTime).toISOString();
        if (form.bidAmount.trim() !== "") {
            const bid = toMinorUnits(form.bidAmount);
            if (bid === null || bid <= 0) {
                setFormError(new Error("Bid amount must be a positive amount"));
                return;
            }
            payload.bidAmount = bid;
        }
        if (form.optimizationGoal === "LEAD_GENERATION") {
            if (!form.pageId.trim()) {
                setFormError(new Error("Choose the Facebook Page that will run your lead form ads"));
                return;
            }
            payload.pageId = form.pageId.trim();
        }
        updateMutation.mutate(payload);
    };

    if (!canView) {
        return (
            <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Meta ad set management is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link
                        href={`/dashboard/marketing/meta-ads/campaigns/${campaignId}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-purple-600 mb-1"
                    >
                        <ChevronLeft size={13} /> Back to campaign
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        {adset?.name || "Ad set"}
                        {adset && <StatusBadge status={adset.effectiveStatus || adset.status} />}
                    </h1>
                    <p className="text-sm text-gray-500">Ad set for this campaign</p>
                    <AdminId value={adsetId} prefix="Ad set" />
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => detailQuery.refetch()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <RefreshCw size={14} className={detailQuery.isFetching ? "animate-spin" : ""} /> Refresh
                    </button>
                    {canManage && adset && (
                        <>
                            {isActive ? (
                                <button
                                    type="button"
                                    onClick={() => statusMutation.mutate({ status: "PAUSED" })}
                                    disabled={statusMutation.isPending}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                                >
                                    {statusMutation.isPending && statusMutation.variables?.status === "PAUSED" ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Settings2 size={14} />
                                    )} Pause ad set
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setActivateOpen(true)}
                                    disabled={statusMutation.isPending}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    <Play size={14} /> Activate ad set
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {statusQuery.isPending && <LoadingRow label="Checking Meta connection…" />}
            {!statusQuery.isPending && !connected && <DisconnectedCard title="Meta account not connected" />}
            {connected && detailQuery.isPending && <LoadingRow label="Loading ad set from Meta…" />}
            {connected && detailQuery.isError && (
                <ErrorBox error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
            )}

            {connected && adset && form && (
                <SectionCard
                    icon={Pencil}
                    title={editing ? "Edit ad set" : "Ad set settings"}
                    subtitle="Sent directly to Meta — this CRM stores no copy of the ad set"
                    action={
                        canManage && !editing && (
                            <button
                                type="button"
                                onClick={startEdit}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                            >
                                <Pencil size={13} /> Edit
                            </button>
                        )
                    }
                >
                    <ErrorBox error={updateMutation.isError ? updateMutation.error : formError} />

                    {!editing ? (
                        <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                            <div>
                                <dt className={labelClass}>Status</dt>
                                <dd><StatusBadge status={adset.effectiveStatus || adset.status} /></dd>
                            </div>
                            <div>
                                <dt className={labelClass}>Budget</dt>
                                <dd className="text-gray-700">
                                    {adset.dailyBudget
                                        ? `${formatMinor(adset.dailyBudget)} per day`
                                        : adset.lifetimeBudget
                                            ? `${formatMinor(adset.lifetimeBudget)} lifetime`
                                            : "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className={labelClass}>Bid amount</dt>
                                <dd className="text-gray-700">
                                    {adset.bidAmount !== null && adset.bidAmount !== undefined
                                        ? formatMinor(adset.bidAmount)
                                        : "Meta recommended"}
                                </dd>
                            </div>
                            <div>
                                <dt className={labelClass}>Billing event</dt>
                                <dd className="text-gray-700">
                                    {BILLING_EVENT_LABELS[adset.billingEvent] || adset.billingEvent || "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className={labelClass}>Optimization goal</dt>
                                <dd className="text-gray-700">
                                    {OPTIMIZATION_GOAL_LABELS[adset.optimizationGoal] || adset.optimizationGoal || "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className={labelClass}>Schedule</dt>
                                <dd className="text-gray-700 text-xs">
                                    {adset.startTime ? new Date(adset.startTime).toLocaleString("en-IN") : "Default start"}
                                    {" → "}
                                    {adset.endTime && adset.endTime !== "0"
                                        ? new Date(adset.endTime).toLocaleString("en-IN")
                                        : "Ongoing"}
                                </dd>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                                <dt className={labelClass}>Targeting</dt>
                                <dd className="text-gray-700">
                                    {(adset.targeting?.geo_locations?.countries || []).join(", ") || "—"}
                                    {adset.targeting?.age_min ? ` · ages ${adset.targeting.age_min}–${adset.targeting.age_max}` : ""}
                                    {Array.isArray(adset.targeting?.genders) && adset.targeting.genders.length > 0
                                        ? ` · gender ${adset.targeting.genders.map((g) => (g === 1 ? "male" : g === 2 ? "female" : g)).join("/")}`
                                        : ""}
                                    {Array.isArray(adset.targeting?.publisher_platforms) && adset.targeting.publisher_platforms.length > 0
                                        ? ` · ${adset.targeting.publisher_platforms.join(", ")}`
                                        : ""}
                                    {(adset.targeting?.custom_audiences || []).length > 0
                                        ? ` · ${(adset.targeting.custom_audiences || []).length} included audience(s)`
                                        : ""}
                                    {(adset.targeting?.excluded_custom_audiences || []).length > 0
                                        ? ` · ${(adset.targeting.excluded_custom_audiences || []).length} excluded audience(s)`
                                        : ""}
                                </dd>
                            </div>
                        </dl>
                    ) : (
                        <div className="space-y-4">
                            <Field label="Ad set name">
                                <input
                                    type="text"
                                    maxLength={400}
                                    value={form.name}
                                    onChange={(e) => set("name")(e.target.value)}
                                    className={inputClass}
                                />
                            </Field>
                            <div className="grid sm:grid-cols-3 gap-3">
                                <Field label="Budget type" hint="Switching budget type is not supported in this release.">
                                    <select value={form.budgetType} disabled className={inputClass}>
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
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Bid amount (₹)" hint="Blank = Meta recommended.">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={form.bidAmount}
                                        onChange={(e) => set("bidAmount")(e.target.value)}
                                        className={inputClass}
                                    />
                                </Field>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <Field label="Start">
                                    <input
                                        type="datetime-local"
                                        value={form.startTime}
                                        onChange={(e) => set("startTime")(e.target.value)}
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="End" hint="Blank = ongoing.">
                                    <input
                                        type="datetime-local"
                                        value={form.endTime}
                                        onChange={(e) => set("endTime")(e.target.value)}
                                        className={inputClass}
                                    />
                                </Field>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <Field label="Billing event">
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
                                <Field label="Optimization goal">
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
                                <Field label="Facebook Page" hint="The Page that runs your lead form ads.">
                                    {pagesQuery.isPending ? (
                                        <LoadingRow label="Loading your Pages…" />
                                    ) : pagesQuery.isError ? (
                                        <ErrorBox error={pagesQuery.error} onRetry={() => pagesQuery.refetch()} />
                                    ) : pageItems.length === 0 ? (
                                        <p className="text-xs text-gray-500">
                                            No Pages are visible yet — an administrator can select them in Meta
                                            connection settings.
                                        </p>
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
                            <div className="grid sm:grid-cols-3 gap-3">
                                <Field label="Countries" hint="Which countries to reach — e.g. IN, AE">
                                    <input
                                        type="text"
                                        value={form.countries}
                                        onChange={(e) => set("countries")(e.target.value)}
                                        className={inputClass}
                                    />
                                </Field>
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
                                <Field label="Gender">
                                    <select
                                        value={form.gender}
                                        onChange={(e) => set("gender")(e.target.value)}
                                        className={inputClass}
                                    >
                                        <option value="">All genders</option>
                                        <option value="1">Male</option>
                                        <option value="2">Female</option>
                                    </select>
                                </Field>
                            </div>
                            <Notice tone="gray" icon={Target}>
                                Placements and audience selections are preserved exactly as they are in Meta.
                                To change them, review the ad set in Meta Ads Manager or recreate it here.
                            </Notice>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={exitEdit}
                                    disabled={updateMutation.isPending}
                                    className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={saveEdit}
                                    disabled={updateMutation.isPending}
                                    className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
                                >
                                    {updateMutation.isPending && <Loader2 size={14} className="animate-spin inline mr-1.5" />}
                                    Save changes
                                </button>
                            </div>
                        </div>
                    )}
                </SectionCard>
            )}

            {connected && adset && !isActive && (
                <Notice tone="amber" icon={Layers}>
                    This ad set is paused — no ads under it are delivering and nothing is being spent.
                    Activation requires the explicit, confirmed action above, and ad creatives are
                    never uploaded or published from this application.
                </Notice>
            )}

            <ConfirmDialog
                open={activateOpen}
                title="Activate this ad set?"
                body={`Ad set “${adset?.name || adsetId}” will start delivering its ads.`}
                warning="Activation may start ad spend immediately. Charges appear in your Meta ad account."
                confirmLabel="Activate ad set"
                requireCheckbox
                checkboxLabel="I understand that activating this ad set may start ad spend."
                busy={statusMutation.isPending}
                onConfirm={() => statusMutation.mutate({ status: "ACTIVE", confirm: true })}
                onCancel={() => setActivateOpen(false)}
            />
        </div>
    );
}
