"use client";
// Meta Campaigns — Phase 3+4 campaign dashboard/list with create form.
//
// Contract notes:
// - Everything rendered comes from live GET /meta-ads/campaigns (Meta is the
//   source of truth). When the workspace is not connected we show the exact
//   Phase 2.5A disconnected message and ZERO campaign content — there is no
//   demo/sample data anywhere on this page.
// - Create always lands PAUSED (enforced server-side too); the form says so
//   and never offers an "activate" choice.
// - Mutations require marketing:manage; viewers get a read-only surface.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Megaphone, AlertCircle, ChevronRight, Loader2, Megaphone as CampaignIcon, Plus, RefreshCw,
} from "lucide-react";
import { usePermissions } from "../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../lib/toast";
import {
    CAMPAIGN_OBJECTIVES,
    OBJECTIVE_LABELS,
    SPECIAL_AD_CATEGORIES,
    SPECIAL_AD_CATEGORY_LABELS,
    formatMinor,
    toMinorUnits,
    META_LIVE_DATA_NOTE,
} from "../../../../../lib/metaAdsEnums";
import {
    fetchMetaStatus,
    fetchMetaCampaigns,
    fetchMetaAdOptions,
    createMetaCampaign,
} from "../../../../../lib/api/metaAds";
import {
    AdminId, DisconnectedCard, EmptyState, ErrorBox, Field, LoadingRow, Modal, Notice,
    Pager, SectionCard, StatusBadge, inputClass, labelClass,
} from "../_components/metaAdsUi";

const PAGE_SIZE = 25;

const budgetOf = (campaign) => {
    if (campaign.dailyBudget !== null && campaign.dailyBudget !== undefined) {
        return `${formatMinor(campaign.dailyBudget)}/day`;
    }
    if (campaign.lifetimeBudget !== null && campaign.lifetimeBudget !== undefined) {
        return `${formatMinor(campaign.lifetimeBudget)} lifetime`;
    }
    return "—";
};

const formatDateTime = (iso) => {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const INITIAL_CREATE = {
    name: "",
    objective: "OUTCOME_LEADS",
    budgetType: "daily", // daily | lifetime | none
    budgetAmount: "",
    spendCap: "",
    specialAdCategories: ["NONE"],
};

export default function MetaCampaignsPage() {
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");
    const queryClient = useQueryClient();

    const [statusFilter, setStatusFilter] = useState("");
    const [objectiveFilter, setObjectiveFilter] = useState("");
    const [cursorStack, setCursorStack] = useState([]);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState(INITIAL_CREATE);
    const [formError, setFormError] = useState(null);

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

    // Options: server enums are the source of truth; the local copy is only
    // an initialData fallback so the first render matches the API contract.
    const optionsQuery = useQuery({
        queryKey: ["meta-ads", "options"],
        queryFn: fetchMetaAdOptions,
        enabled: canView && connected,
        staleTime: 30 * 60_000,
        retry: 1,
        initialData: () => ({
            campaignObjectives: CAMPAIGN_OBJECTIVES,
            specialAdCategories: SPECIAL_AD_CATEGORIES,
        }),
    });
    const objectives = optionsQuery.data?.campaignObjectives?.length
        ? optionsQuery.data.campaignObjectives
        : CAMPAIGN_OBJECTIVES;

    const campaignsQuery = useQuery({
        queryKey: ["meta-ads", "campaigns", "manage", statusFilter, objectiveFilter, after],
        queryFn: () => fetchMetaCampaigns({
            limit: PAGE_SIZE,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(objectiveFilter ? { objective: objectiveFilter } : {}),
            ...(after ? { after } : {}),
        }),
        enabled: canView && connected,
        retry: 1,
    });

    const items = campaignsQuery.data?.items || [];
    const paging = campaignsQuery.data?.paging || null;
    const hasNext = Boolean(paging?.cursors?.after);
    const hasPrev = cursorStack.length > 0;

    const createMutation = useMutation({
        mutationFn: (payload) => createMetaCampaign(payload),
        onSuccess: (campaign) => {
            showToast("Campaign created in PAUSED state", "success");
            setCreateOpen(false);
            setForm(INITIAL_CREATE);
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "campaigns"] });
            if (campaign?.id) router.push(`/dashboard/marketing/meta-ads/campaigns/${campaign.id}`);
        },
        onError: (error) => setFormError(error),
    });

    const validateAndCreate = () => {
        setFormError(null);
        if (!form.name.trim()) {
            setFormError(new Error("Campaign name is required"));
            return;
        }
        const payload = {
            name: form.name.trim(),
            objective: form.objective,
            specialAdCategories: form.specialAdCategories.length > 0 ? form.specialAdCategories : ["NONE"],
        };
        if (form.budgetType !== "none") {
            const minor = toMinorUnits(form.budgetAmount);
            if (minor === null || minor <= 0) {
                setFormError(new Error("Budget must be a positive amount, e.g. 5000 or 5000.50"));
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
        createMutation.mutate(payload);
    };

    const toggleCategory = (value) => {
        setForm((prev) => {
            let next;
            if (value === "NONE") {
                next = prev.specialAdCategories.includes("NONE") ? [] : ["NONE"];
            } else {
                const withoutNone = prev.specialAdCategories.filter((c) => c !== "NONE");
                next = withoutNone.includes(value)
                    ? withoutNone.filter((c) => c !== value)
                    : [...withoutNone, value];
                if (next.length === 0) next = ["NONE"];
            }
            return { ...prev, specialAdCategories: next };
        });
    };

    const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

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
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Megaphone size={22} className="text-purple-600" /> Meta Campaigns
                    </h1>
                    <p className="text-sm text-gray-500">
                        Create, edit and pause campaigns. Every new campaign starts PAUSED.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/dashboard/marketing/meta-ads/audiences"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Audiences <ChevronRight size={14} />
                    </Link>
                    <Link
                        href="/dashboard/marketing/meta-ads"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Overview
                    </Link>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => {
                                setForm(INITIAL_CREATE);
                                setFormError(null);
                                setCreateOpen(true);
                            }}
                            disabled={!connected}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus size={15} /> New campaign
                        </button>
                    )}
                </div>
            </div>

            {statusQuery.isPending && <LoadingRow label="Checking Meta connection…" />}

            {!statusQuery.isPending && !connected && <DisconnectedCard title="Meta account not connected" />}

            {connected && (
                <>
                    <Notice tone="blue" icon={Megaphone}>
                        {META_LIVE_DATA_NOTE}
                        {statusQuery.data?.missingRecommendedPermissions?.includes("ads_management") && (
                            <span className="block mt-1 font-semibold">
                                Note: this connection is missing the ads_management permission — reads work,
                                but campaign writes will be denied by Meta until the account is reconnected with that scope.
                            </span>
                        )}
                    </Notice>

                    <SectionCard
                        icon={CampaignIcon}
                        title="Campaigns"
                        subtitle="Live campaigns from your connected Meta ad account"
                        action={
                            <button
                                type="button"
                                onClick={() => campaignsQuery.refetch()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                            >
                                <RefreshCw size={13} className={campaignsQuery.isFetching ? "animate-spin" : ""} /> Refresh
                            </button>
                        }
                    >
                        <div className="flex flex-wrap gap-3">
                            <div className="w-44">
                                <label className={labelClass}>Status</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => {
                                        setStatusFilter(e.target.value);
                                        resetPaging();
                                    }}
                                    className={inputClass}
                                >
                                    <option value="">All statuses</option>
                                    <option value="ACTIVE">Active</option>
                                    <option value="PAUSED">Paused</option>
                                    <option value="ARCHIVED">Archived</option>
                                </select>
                            </div>
                            <div className="w-64">
                                <label className={labelClass}>Objective</label>
                                <select
                                    value={objectiveFilter}
                                    onChange={(e) => {
                                        setObjectiveFilter(e.target.value);
                                        resetPaging();
                                    }}
                                    className={inputClass}
                                >
                                    <option value="">All objectives</option>
                                    {objectives.map((o) => (
                                        <option key={o} value={o}>{OBJECTIVE_LABELS[o] || o}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <ErrorBox error={campaignsQuery.error} onRetry={() => campaignsQuery.refetch()} />

                        {campaignsQuery.isPending ? (
                            <LoadingRow label="Loading campaigns from Meta…" />
                        ) : campaignsQuery.isError ? null : items.length === 0 ? (
                            <EmptyState
                                icon={CampaignIcon}
                                title="No campaigns match these filters"
                                hint="Meta returned no campaigns for the current account and filters. This page never shows sample campaigns."
                                action={
                                    canManage ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setForm(INITIAL_CREATE);
                                                setFormError(null);
                                                setCreateOpen(true);
                                            }}
                                            className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700"
                                        >
                                            <Plus size={15} /> Create the first campaign
                                        </button>
                                    ) : null
                                }
                            />
                        ) : (
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                            <th className="py-2 pr-3 font-bold">Campaign</th>
                                            <th className="py-2 pr-3 font-bold">Objective</th>
                                            <th className="py-2 pr-3 font-bold">Status</th>
                                            <th className="py-2 pr-3 font-bold">Budget</th>
                                            <th className="py-2 pr-3 font-bold">Updated</th>
                                            <th className="py-2 pr-3 font-bold" aria-label="Open" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((campaign) => (
                                            <tr key={campaign.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                                                <td className="py-2.5 pr-3">
                                                    <Link
                                                        href={`/dashboard/marketing/meta-ads/campaigns/${campaign.id}`}
                                                        className="font-semibold text-gray-900 hover:text-purple-600"
                                                    >
                                                        {campaign.name || `Campaign ${campaign.id}`}
                                                    </Link>
                                                    <AdminId value={campaign.id} />
                                                </td>
                                                <td className="py-2.5 pr-3 text-gray-600">
                                                    {OBJECTIVE_LABELS[campaign.objective] || campaign.objective || "—"}
                                                </td>
                                                <td className="py-2.5 pr-3">
                                                    <StatusBadge status={campaign.effectiveStatus || campaign.status} />
                                                </td>
                                                <td className="py-2.5 pr-3 text-gray-600">{budgetOf(campaign)}</td>
                                                <td className="py-2.5 pr-3 text-gray-500 text-xs">
                                                    {formatDateTime(campaign.updatedTime)}
                                                </td>
                                                <td className="py-2.5 pr-3 text-right">
                                                    <Link
                                                        href={`/dashboard/marketing/meta-ads/campaigns/${campaign.id}`}
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

                        {(hasNext || hasPrev) && (
                            <Pager
                                label={`${items.length} campaign${items.length === 1 ? "" : "s"} on this page`}
                                loading={campaignsQuery.isFetching}
                                hasPrev={hasPrev}
                                hasNext={hasNext}
                                onPrev={() => setCursorStack((s) => s.slice(0, -1))}
                                onNext={() => setCursorStack((s) => [...s, paging.cursors.after])}
                            />
                        )}
                    </SectionCard>
                </>
            )}

            {/* Create campaign — always PAUSED, no activation choice here. */}
            <Modal
                open={createOpen}
                title="New campaign"
                subtitle="The campaign is created PAUSED — it will not deliver or spend until you activate it explicitly."
                onClose={() => setCreateOpen(false)}
            >
                <div className="space-y-4">
                    <ErrorBox error={createMutation.isError ? createMutation.error : formError} />

                    <Field label="Campaign name" hint="Required. Visible only inside your Meta account.">
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => set("name")(e.target.value)}
                            maxLength={400}
                            placeholder="e.g. Q4 lead-gen campaign"
                            className={inputClass}
                        />
                    </Field>

                    <Field label="Objective">
                        <select
                            value={form.objective}
                            onChange={(e) => set("objective")(e.target.value)}
                            className={inputClass}
                        >
                            {objectives.map((o) => (
                                <option key={o} value={o}>{OBJECTIVE_LABELS[o] || o}</option>
                            ))}
                        </select>
                    </Field>

                    <div className="grid sm:grid-cols-2 gap-3">
                        <Field label="Budget type">
                            <select
                                value={form.budgetType}
                                onChange={(e) => set("budgetType")(e.target.value)}
                                className={inputClass}
                            >
                                <option value="daily">Daily budget</option>
                                <option value="lifetime">Lifetime budget</option>
                                <option value="none">No campaign budget</option>
                            </select>
                        </Field>
                        {form.budgetType !== "none" && (
                            <Field
                                label={form.budgetType === "daily" ? "Daily budget (₹)" : "Lifetime budget (₹)"}
                                hint="Enter the amount in rupees (e.g. 5000)."
                            >
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={form.budgetAmount}
                                    onChange={(e) => set("budgetAmount")(e.target.value)}
                                    placeholder="e.g. 5000"
                                    className={inputClass}
                                />
                            </Field>
                        )}
                    </div>

                    <Field label="Lifetime spend cap (₹)" hint="Optional. Caps total campaign spend.">
                        <input
                            type="text"
                            inputMode="decimal"
                            value={form.spendCap}
                            onChange={(e) => set("spendCap")(e.target.value)}
                            placeholder="e.g. 50000"
                            className={inputClass}
                        />
                    </Field>

                    <div>
                        <label className={labelClass}>Special ad categories</label>
                        <div className="flex flex-wrap gap-2">
                            {SPECIAL_AD_CATEGORIES.map((cat) => {
                                const active = form.specialAdCategories.includes(cat);
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => toggleCategory(cat)}
                                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                                            active
                                                ? "border-purple-500 bg-purple-50 text-purple-700"
                                                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                        }`}
                                    >
                                        {SPECIAL_AD_CATEGORY_LABELS[cat] || cat}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">
                            Required by Meta — leave as &quot;None&quot; unless your ads fall into a regulated category.
                        </p>
                    </div>

                    <Notice tone="amber" icon={AlertCircle}>
                        This campaign will be created <strong>PAUSED</strong>. Activation is a separate,
                        confirmed action on the campaign page and can start ad spend.
                    </Notice>

                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => setCreateOpen(false)}
                            disabled={createMutation.isPending}
                            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={validateAndCreate}
                            disabled={createMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
                        >
                            {createMutation.isPending && <Loader2 size={14} className="animate-spin inline mr-1.5" />}
                            Create paused campaign
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
