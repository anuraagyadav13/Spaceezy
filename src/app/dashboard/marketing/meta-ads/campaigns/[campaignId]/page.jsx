"use client";
// Campaign detail — Phase 3+4: view, edit and status control for ONE Meta
// campaign, plus its ad set list.
//
// Safety: activation only ever happens through the ConfirmDialog with a
// mandatory acknowledgement checkbox (the server additionally requires
// confirm:true). Pausing is one click (it reduces risk, never spend).
// Budget type is locked to what the campaign already has — clearing or
// switching budget types uses Meta sentinel values this phase does not ship.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertCircle, ChevronLeft, ChevronRight, Layers, Loader2, Pencil, Play, Plus,
    RefreshCw, Settings2, Target,
} from "lucide-react";
import { usePermissions } from "../../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../../lib/toast";
import {
    CAMPAIGN_OBJECTIVES,
    OBJECTIVE_LABELS,
    OPTIMIZATION_GOAL_LABELS,
    BILLING_EVENT_LABELS,
    formatMinor,
    fromMinorUnits,
    toMinorUnits,
} from "../../../../../../lib/metaAdsEnums";
import {
    fetchMetaStatus,
    fetchMetaCampaignDetail,
    fetchMetaAdSets,
    fetchMetaAdOptions,
    updateMetaCampaign,
    setMetaCampaignStatus,
} from "../../../../../../lib/api/metaAds";
import {
    AdminId, ConfirmDialog, DisconnectedCard, EmptyState, ErrorBox, Field, LoadingRow,
    Notice, SectionCard, StatusBadge, inputClass, labelClass,
} from "../../_components/metaAdsUi";

const formatDateTime = (iso) => {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

export default function MetaCampaignDetailPage() {
    const params = useParams();
    const campaignId = String(params?.campaignId || "");
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
        initialData: () => ({ campaignObjectives: CAMPAIGN_OBJECTIVES }),
    });
    const objectives = optionsQuery.data?.campaignObjectives?.length
        ? optionsQuery.data.campaignObjectives
        : CAMPAIGN_OBJECTIVES;

    const adsetsQuery = useQuery({
        queryKey: ["meta-ads", "adsets", "by-campaign", campaignId],
        queryFn: () => fetchMetaAdSets({ campaignId, limit: 50 }),
        enabled: canView && connected && Boolean(campaignId),
        retry: 1,
    });

    const campaign = detailQuery.data || null;
    const isActive = String(campaign?.effectiveStatus || campaign?.status || "").toUpperCase() === "ACTIVE";

    // The edit form is DERIVED from Meta's live campaign whenever we are not
    // editing — no prefill effect needed, and a background refetch can never
    // clobber an in-progress edit (pressing Edit snapshots into formOverride).
    const buildForm = (c) => {
        const hasDaily = c.dailyBudget !== null && c.dailyBudget !== undefined;
        const hasLifetime = c.lifetimeBudget !== null && c.lifetimeBudget !== undefined;
        return {
            name: c.name || "",
            objective: c.objective || "OUTCOME_LEADS",
            budgetType: hasDaily ? "daily" : hasLifetime ? "lifetime" : "none",
            budgetAmount: hasDaily
                ? String(fromMinorUnits(c.dailyBudget) ?? "")
                : hasLifetime
                    ? String(fromMinorUnits(c.lifetimeBudget) ?? "")
                    : "",
            spendCap: c.spendCap !== null && c.spendCap !== undefined
                ? String(fromMinorUnits(c.spendCap) ?? "")
                : "",
        };
    };
    const form = editing && formOverride ? formOverride : campaign ? buildForm(campaign) : null;
    const startEdit = () => {
        if (!campaign) return;
        setFormOverride(buildForm(campaign));
        setFormError(null);
        setEditing(true);
    };
    const exitEdit = () => {
        setEditing(false);
        setFormOverride(null);
        setFormError(null);
    };
    const updateForm = (patch) =>
        setFormOverride((prev) => ({ ...(prev || (campaign ? buildForm(campaign) : {})), ...patch }));

    const updateMutation = useMutation({
        mutationFn: (payload) => updateMetaCampaign(campaignId, payload),
        onSuccess: () => {
            showToast("Campaign updated", "success");
            exitEdit();
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "campaign", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "campaigns"] });
        },
        onError: (error) => setFormError(error),
    });

    const statusMutation = useMutation({
        mutationFn: (payload) => setMetaCampaignStatus(campaignId, payload),
        onSuccess: (data) => {
            showToast(
                data?.status === "ACTIVE" ? "Campaign activated" : "Campaign paused",
                "success"
            );
            setActivateOpen(false);
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "campaign", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "campaigns"] });
        },
        onError: (error) => {
            setActivateOpen(false);
            showToast(error.message || "Could not change campaign status", "error");
        },
    });

    const saveEdit = () => {
        setFormError(null);
        if (!form) return;
        if (!form.name.trim()) {
            setFormError(new Error("Campaign name is required"));
            return;
        }
        const payload = { name: form.name.trim(), objective: form.objective };
        if (form.budgetType !== "none" && form.budgetAmount.trim() !== "") {
            const minor = toMinorUnits(form.budgetAmount);
            if (minor === null || minor <= 0) {
                setFormError(new Error("Budget must be a positive amount, e.g. 5000"));
                return;
            }
            if (form.budgetType === "daily") payload.dailyBudget = minor;
            else payload.lifetimeBudget = minor;
        }
        if (form.spendCap.trim() !== "") {
            const cap = toMinorUnits(form.spendCap);
            if (cap === null || cap <= 0) {
                setFormError(new Error("Spend cap must be a positive amount"));
                return;
            }
            payload.spendCap = cap;
        }
        updateMutation.mutate(payload);
    };

    const budgetSummary = useMemo(() => {
        if (!campaign) return "—";
        if (campaign.dailyBudget !== null && campaign.dailyBudget !== undefined) {
            return `${formatMinor(campaign.dailyBudget)} per day`;
        }
        if (campaign.lifetimeBudget !== null && campaign.lifetimeBudget !== undefined) {
            return `${formatMinor(campaign.lifetimeBudget)} lifetime`;
        }
        return "No campaign budget (ad set budgets apply)";
    }, [campaign]);

    if (!canView) {
        return (
            <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Meta campaign management is restricted</p>
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
                        href="/dashboard/marketing/meta-ads/campaigns"
                        className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-purple-600 mb-1"
                    >
                        <ChevronLeft size={13} /> All campaigns
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        {campaign?.name || "Campaign"}
                        {campaign && <StatusBadge status={campaign.effectiveStatus || campaign.status} />}
                    </h1>
                    <p className="text-sm text-gray-500">
                        {OBJECTIVE_LABELS[campaign?.objective] || campaign?.objective || "—"}
                    </p>
                    <AdminId value={campaignId} prefix="Campaign" />
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => detailQuery.refetch()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <RefreshCw size={14} className={detailQuery.isFetching ? "animate-spin" : ""} /> Refresh
                    </button>
                    {canManage && campaign && (
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
                                    )} Pause campaign
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setActivateOpen(true)}
                                    disabled={statusMutation.isPending}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    <Play size={14} /> Activate campaign
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {statusQuery.isPending && <LoadingRow label="Checking Meta connection…" />}
            {!statusQuery.isPending && !connected && <DisconnectedCard title="Meta account not connected" />}

            {connected && detailQuery.isPending && <LoadingRow label="Loading campaign from Meta…" />}
            {connected && detailQuery.isError && (
                <ErrorBox error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
            )}

            {connected && campaign && (
                <>
                    <SectionCard
                        icon={Pencil}
                        title="Campaign settings"
                        subtitle="Edits are sent directly to Meta — no local copy exists"
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

                        {editing && form ? (
                            <div className="space-y-4">
                                <Field label="Campaign name">
                                    <input
                                        type="text"
                                        maxLength={400}
                                        value={form.name}
                                        onChange={(e) => updateForm({ name: e.target.value })}
                                        className={inputClass}
                                    />
                                </Field>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <Field label="Objective">
                                        <select
                                            value={form.objective}
                                            onChange={(e) => updateForm({ objective: e.target.value })}
                                            className={inputClass}
                                        >
                                            {objectives.map((o) => (
                                                <option key={o} value={o}>{OBJECTIVE_LABELS[o] || o}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field
                                        label="Budget type"
                                        hint="Switching between daily/lifetime budgets is not supported in this release."
                                    >
                                        <select
                                            value={form.budgetType}
                                            disabled
                                            className={inputClass}
                                        >
                                            <option value="daily">Daily budget</option>
                                            <option value="lifetime">Lifetime budget</option>
                                            <option value="none">No campaign budget</option>
                                        </select>
                                    </Field>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    {form.budgetType !== "none" && (
                                        <Field
                                            label={form.budgetType === "daily" ? "Daily budget (₹)" : "Lifetime budget (₹)"}
                                            hint="Enter the amount in rupees (e.g. 5000)."
                                        >
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={form.budgetAmount}
                                                onChange={(e) => updateForm({ budgetAmount: e.target.value })}
                                                className={inputClass}
                                            />
                                        </Field>
                                    )}
                                    <Field label="Lifetime spend cap (₹)" hint="Leave blank to keep the current value.">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={form.spendCap}
                                            onChange={(e) => updateForm({ spendCap: e.target.value })}
                                            className={inputClass}
                                        />
                                    </Field>
                                </div>
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
                        ) : (
                            <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                                <div>
                                    <dt className={labelClass}>Status</dt>
                                    <dd><StatusBadge status={campaign.effectiveStatus || campaign.status} /></dd>
                                </div>
                                <div>
                                    <dt className={labelClass}>Objective</dt>
                                    <dd className="text-gray-700">{OBJECTIVE_LABELS[campaign.objective] || campaign.objective || "—"}</dd>
                                </div>
                                <div>
                                    <dt className={labelClass}>Budget</dt>
                                    <dd className="text-gray-700">{budgetSummary}</dd>
                                </div>
                                <div>
                                    <dt className={labelClass}>Spend cap</dt>
                                    <dd className="text-gray-700">
                                        {campaign.spendCap !== null && campaign.spendCap !== undefined
                                            ? formatMinor(campaign.spendCap)
                                            : "—"}
                                    </dd>
                                </div>
                                <div>
                                    <dt className={labelClass}>Special ad categories</dt>
                                    <dd className="text-gray-700">
                                        {(campaign.specialAdCategories || []).length > 0
                                            ? campaign.specialAdCategories.join(", ")
                                            : "—"}
                                    </dd>
                                </div>
                                <div>
                                    <dt className={labelClass}>Created / updated</dt>
                                    <dd className="text-gray-700 text-xs">
                                        {formatDateTime(campaign.createdTime)} · {formatDateTime(campaign.updatedTime)}
                                    </dd>
                                </div>
                            </dl>
                        )}
                    </SectionCard>

                    <SectionCard
                        icon={Layers}
                        title="Ad sets"
                        subtitle="Ad sets inside this campaign (live from Meta)"
                        action={
                            canManage && (
                                <Link
                                    href={`/dashboard/marketing/meta-ads/campaigns/${campaignId}/adsets/new`}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700"
                                >
                                    <Plus size={13} /> New ad set
                                </Link>
                            )
                        }
                    >
                        <ErrorBox error={adsetsQuery.error} onRetry={() => adsetsQuery.refetch()} />
                        {adsetsQuery.isPending ? (
                            <LoadingRow label="Loading ad sets…" />
                        ) : adsetsQuery.isError ? null : (adsetsQuery.data?.items || []).length === 0 ? (
                            <EmptyState
                                icon={Layers}
                                title="No ad sets yet"
                                hint="Ad sets hold the targeting, budget and schedule for your ads."
                            />
                        ) : (
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                            <th className="py-2 pr-3 font-bold">Ad set</th>
                                            <th className="py-2 pr-3 font-bold">Status</th>
                                            <th className="py-2 pr-3 font-bold">Budget</th>
                                            <th className="py-2 pr-3 font-bold">Optimization</th>
                                            <th className="py-2 pr-3 font-bold">Billing event</th>
                                            <th className="py-2 pr-3 font-bold" aria-label="Open" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(adsetsQuery.data?.items || []).map((adset) => (
                                            <tr key={adset.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                                                <td className="py-2.5 pr-3">
                                                    <Link
                                                        href={`/dashboard/marketing/meta-ads/campaigns/${campaignId}/adsets/${adset.id}`}
                                                        className="font-semibold text-gray-900 hover:text-purple-600"
                                                    >
                                                        {adset.name || `Ad set ${adset.id}`}
                                                    </Link>
                                                    <AdminId value={adset.id} />
                                                </td>
                                                <td className="py-2.5 pr-3">
                                                    <StatusBadge status={adset.effectiveStatus || adset.status} />
                                                </td>
                                                <td className="py-2.5 pr-3 text-gray-600">
                                                    {adset.dailyBudget
                                                        ? `${formatMinor(adset.dailyBudget)}/day`
                                                        : adset.lifetimeBudget
                                                            ? `${formatMinor(adset.lifetimeBudget)} lifetime`
                                                            : "—"}
                                                </td>
                                                <td className="py-2.5 pr-3 text-gray-600">
                                                    {OPTIMIZATION_GOAL_LABELS[adset.optimizationGoal] || adset.optimizationGoal || "—"}
                                                </td>
                                                <td className="py-2.5 pr-3 text-gray-600">
                                                    {BILLING_EVENT_LABELS[adset.billingEvent] || adset.billingEvent || "—"}
                                                </td>
                                                <td className="py-2.5 pr-3 text-right">
                                                    <Link
                                                        href={`/dashboard/marketing/meta-ads/campaigns/${campaignId}/adsets/${adset.id}`}
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
                    </SectionCard>

                    {!isActive && (
                        <Notice tone="amber" icon={Target}>
                            This campaign is paused — its ad sets and ads are not delivering and nothing is
                            being spent. Activation requires the explicit, confirmed action above.
                        </Notice>
                    )}
                </>
            )}

            <ConfirmDialog
                open={activateOpen}
                title="Activate this campaign?"
                body={`Campaign “${campaign?.name || campaignId}” will start delivering its ads.`}
                warning="Activation may start ad spend immediately. Charges appear in your Meta ad account."
                confirmLabel="Activate campaign"
                requireCheckbox
                checkboxLabel="I understand that activating this campaign may start ad spend."
                busy={statusMutation.isPending}
                onConfirm={() => statusMutation.mutate({ status: "ACTIVE", confirm: true })}
                onCancel={() => setActivateOpen(false)}
            />
        </div>
    );
}
