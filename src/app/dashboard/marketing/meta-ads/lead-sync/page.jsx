"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Megaphone, AlertCircle, CheckCircle2, Loader2, RefreshCw, Save,
    ChevronRight, ClipboardList, GitMerge, History, Info, Filter, XCircle,
} from "lucide-react";
import { usePermissions } from "../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../lib/toast";
import {
    fetchMetaLeadForms,
    fetchMetaLeadFormQuestions,
    saveMetaLeadFormConfig,
    saveMetaLeadFormMapping,
    fetchMetaLeadSyncHistory,
    runMetaLeadBackfill,
    retryMetaLeadSync,
} from "../../../../../lib/api/metaAds";
import {
    CRM_FIELDS,
    UNMAPPED_OPTION,
    SYNC_SOURCES,
    RUN_STATUSES,
    SYNC_SOURCE_LABELS,
    RUN_STATUS_STYLES,
    labelForField,
    missingMandatoryFields,
} from "../../../../../lib/metaLeadMapping";

// Meta Instant Forms & lead sync (Phase 2, tab 2H of the Meta Ads area):
// - Lead Forms: discovery from Meta (honest per-Page errors, never invented
//   statuses) + per-form enable/disable (ADMIN only, same adminOnly() gate
//   as the server routes).
// - Field Mapping: one dropdown per Meta question → standard CRM field.
//   Unmapped answers are preserved on the lead in metaAnswers — never lost.
// - Lead Sync: bounded historical backfill (marketing:manage).
// - Sync History: run metadata only (counts/status/error codes) — no lead
//   PII, no credentials, ever rendered or logged here.

const TABS = [
    { id: "forms", label: "Lead Forms", icon: ClipboardList },
    { id: "mapping", label: "Field Mapping", icon: GitMerge },
    { id: "sync", label: "Lead Sync", icon: RefreshCw },
    { id: "history", label: "Sync History", icon: History },
];

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-60";
const labelClass = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1";

const formatDateTime = (iso) => {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const SectionCard = ({ icon: Icon, title, subtitle, action, children }) => (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                    <Icon size={16} />
                </div>
                <div>
                    <p className="font-bold text-gray-900">{title}</p>
                    {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
                </div>
            </div>
            {action}
        </div>
        {children}
    </div>
);

const ErrorBox = ({ error, onRetry }) => {
    if (!error) return null;
    return (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3">
            <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="flex-1 text-sm text-red-700">
                {error.message || "Something went wrong while talking to the server."}
            </p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="text-xs font-bold text-red-600 underline shrink-0"
                >
                    Retry
                </button>
            )}
        </div>
    );
};

const Notice = ({ tone = "amber", icon: Icon, children }) => {
    const tones = {
        amber: "border-amber-200 bg-amber-50 text-amber-700",
        blue: "border-blue-200 bg-blue-50 text-blue-700",
        gray: "border-gray-200 bg-gray-50 text-gray-600",
    };
    return (
        <div className={`flex items-start gap-2 rounded-2xl border p-3 ${tones[tone] || tones.gray}`}>
            <Icon size={15} className="mt-0.5 shrink-0" />
            <div className="text-sm flex-1">{children}</div>
        </div>
    );
};

const RunStatusBadge = ({ status }) => (
    <span
        className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-full border ${
            RUN_STATUS_STYLES[status] || "bg-gray-100 text-gray-500 border-gray-200"
        }`}
    >
        {status || "—"}
    </span>
);

// Counts grid shared by the backfill and retry result panels. The server
// returns finished-run counts only — never lead rows.
const RunResultPanel = ({ result, showDetails = false }) => {
    if (!result) return null;
    const counts = [
        ["Fetched", result.fetched],
        ["Imported", result.imported],
        ["Duplicates", result.duplicates],
        ["Skipped", result.skipped],
        ["Failed", result.failed],
    ];
    return (
        <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-gray-900">
                    {result.kind === "retry" ? "Retry run" : "Backfill run"} finished
                </p>
                <RunStatusBadge status={result.status} />
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {counts.map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-[11px] font-black uppercase text-gray-400">{label}</dt>
                        <dd className="text-lg font-bold text-gray-900">
                            {value === null || value === undefined ? "—" : Number(value).toLocaleString("en-IN")}
                        </dd>
                    </div>
                ))}
            </dl>
            {result.truncated && (
                <Notice tone="amber" icon={Info}>
                    The result is truncated — Meta returned more history than this run&apos;s bound.
                    Run again with a narrower date range to continue.
                </Notice>
            )}
            {Array.isArray(result.failures) && result.failures.length > 0 && showDetails && (
                <div className="space-y-1.5">
                    <p className="text-[11px] font-black uppercase text-gray-400">Failures (code only)</p>
                    <ul className="space-y-1">
                        {result.failures.map((failure, index) => (
                            <li
                                key={`${failure.metaLeadId || "list"}-${index}`}
                                className="flex items-center justify-between gap-3 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5"
                            >
                                <span className="font-mono">{failure.metaLeadId || "listing"}</span>
                                <span className="font-bold text-red-500">{failure.code}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {Array.isArray(result.failures) && result.failures.length > 0 && !showDetails && (
                <p className="text-xs text-red-600 font-semibold">
                    {result.failures.length} lead{result.failures.length === 1 ? "" : "s"} could not be imported — an
                    administrator can view the details.
                </p>
            )}
        </div>
    );
};

// Shared form picker (Field Mapping + Lead Sync tabs). Options come from
// the discovery query — only real Meta forms are ever selectable. Raw form
// IDs are appended for administrators only (support/debugging aid).
const FormPicker = ({ items, value, onChange, loading, showIds = false }) => (
    <div className="sm:max-w-md">
        <label className={labelClass}>Instant Form</label>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={loading || items.length === 0}
            className={inputClass}
        >
            {items.length === 0 && <option value="">No forms discovered yet</option>}
            {items.map((form) => (
                <option key={form.formId} value={form.formId}>
                    {(form.formName || "Untitled form") + (showIds ? ` · ${form.formId}` : "")}
                </option>
            ))}
        </select>
    </div>
);

function MetaLeadSyncContent() {
    const { hasPermission, hasRole } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");
    // Config/mapping changes sit behind the same adminOnly() gate server-side.
    const isAdmin = hasRole(["SUPER_ADMIN", "ADMIN"]);
    const queryClient = useQueryClient();

    const [tab, setTab] = useState("forms");
    const [selectedFormId, setSelectedFormId] = useState(null);
    // Per-form mapping drafts keyed by formId (no effect-driven state):
    // an unsaved edit survives tab switches and background refetches.
    const [mappingDrafts, setMappingDrafts] = useState({});
    const [lastRunResult, setLastRunResult] = useState(null);
    const [backfillRange, setBackfillRange] = useState({ since: "", until: "" });
    const [historyFilters, setHistoryFilters] = useState({ source: "", status: "", formId: "" });

    // ---- Queries -------------------------------------------------------
    const formsQuery = useQuery({
        queryKey: ["meta-ads", "lead-forms"],
        queryFn: fetchMetaLeadForms,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });

    const formItems = useMemo(() => formsQuery.data?.items || [], [formsQuery.data]);
    // Explicit selection falls back to the first discovered form — never a
    // fabricated one (empty list renders an empty state instead).
    const selectedForm =
        formItems.find((form) => String(form.formId) === String(selectedFormId)) ||
        formItems[0] ||
        null;
    const selectedFormIdValue = selectedForm ? String(selectedForm.formId) : "";

    const questionsQuery = useQuery({
        queryKey: ["meta-ads", "lead-form-questions", selectedFormIdValue],
        queryFn: () => fetchMetaLeadFormQuestions(selectedFormIdValue),
        enabled: canView && tab === "mapping" && !!selectedFormIdValue,
        staleTime: 60_000,
        retry: 1,
    });

    const historyQuery = useQuery({
        queryKey: ["meta-ads", "lead-sync-history", historyFilters],
        queryFn: () =>
            fetchMetaLeadSyncHistory({
                ...(historyFilters.formId ? { formId: historyFilters.formId } : {}),
                ...(historyFilters.source ? { source: historyFilters.source } : {}),
                ...(historyFilters.status ? { status: historyFilters.status } : {}),
            }),
        enabled: canView && tab === "history",
        staleTime: 30_000,
        retry: 1,
    });

    // ---- Mutations -----------------------------------------------------
    const invalidateMeta = () => queryClient.invalidateQueries({ queryKey: ["meta-ads"] });

    const configMutation = useMutation({
        mutationFn: ({ formId, payload }) => saveMetaLeadFormConfig(formId, payload),
        onSuccess: () => {
            showToast("Lead form sync setting saved", "success");
            invalidateMeta();
        },
        onError: (error) => showToast(error.message || "Could not save the sync setting", "error"),
    });

    const mappingMutation = useMutation({
        mutationFn: ({ formId, payload }) => saveMetaLeadFormMapping(formId, payload),
        onSuccess: (data) => {
            showToast("Field mapping saved", "success");
            if (data && data.formId) {
                setMappingDrafts((prev) => {
                    const next = { ...prev };
                    delete next[String(data.formId)];
                    return next;
                });
            }
            invalidateMeta();
        },
        onError: (error) => showToast(error.message || "Could not save the field mapping", "error"),
    });

    const backfillMutation = useMutation({
        mutationFn: (payload) => runMetaLeadBackfill(payload),
        onSuccess: (data) => {
            setLastRunResult({ ...data, kind: "backfill" });
            showToast(
                data.failed > 0
                    ? `Backfill finished with ${data.failed} failure(s)`
                    : `Backfill finished — ${data.imported} imported`,
                data.failed > 0 || data.status === "FAILED" ? "error" : "success"
            );
            invalidateMeta();
        },
        onError: (error) => showToast(error.message || "Backfill failed", "error"),
    });

    const retryMutation = useMutation({
        mutationFn: (payload) => retryMetaLeadSync(payload),
        onSuccess: (data) => {
            setLastRunResult({ ...data, kind: "retry" });
            showToast(
                data.failed > 0
                    ? `Retry finished with ${data.failed} failure(s)`
                    : `Retry finished — ${data.imported} imported`,
                data.failed > 0 || data.status === "FAILED" ? "error" : "success"
            );
            invalidateMeta();
        },
        onError: (error) => showToast(error.message || "Retry failed", "error"),
    });

    // ---- Mapping draft helpers ----------------------------------------
    const questions = questionsQuery.data?.questions || [];
    const initialDraft = useMemo(() => {
        const rows = (questionsQuery.data && questionsQuery.data.fieldMapping) || [];
        return Object.fromEntries(
            rows
                .filter((row) => row && row.questionKey)
                .map((row) => [row.questionKey, row.crmField || ""])
        );
    }, [questionsQuery.data]);
    const draft = mappingDrafts[selectedFormIdValue] ?? initialDraft;

    const setDraftValue = (key, value) =>
        setMappingDrafts((prev) => ({
            ...prev,
            [selectedFormIdValue]: { ...(prev[selectedFormIdValue] ?? initialDraft), [key]: value },
        }));

    // Two questions mapped to the same CRM field would silently drop one
    // answer — reject client-side before the server does.
    const duplicateTargets = useMemo(() => {
        const seen = new Map();
        for (const value of Object.values(draft)) {
            if (!value) continue;
            seen.set(value, (seen.get(value) || 0) + 1);
        }
        return [...seen.entries()].filter(([, count]) => count > 1).map(([value]) => labelForField(value) || value);
    }, [draft]);

    const unmappedMandatory = useMemo(() => missingMandatoryFields(
        Object.entries(draft).map(([questionKey, crmField]) => ({ questionKey, crmField }))
    ), [draft]);

    // ---- Backfill helpers ---------------------------------------------
    const datesPaired = !!backfillRange.since === !!backfillRange.until;
    const datesOrdered =
        !backfillRange.since ||
        !backfillRange.until ||
        backfillRange.since <= backfillRange.until;
    const backfillReady =
        canManage && !!selectedForm?.pageId && datesPaired && datesOrdered && !backfillMutation.isPending;

    const runBackfill = (event) => {
        event.preventDefault();
        if (!backfillReady) return;
        backfillMutation.mutate({
            pageId: String(selectedForm.pageId),
            formId: selectedFormIdValue,
            ...(backfillRange.since ? { since: backfillRange.since, until: backfillRange.until } : {}),
        });
    };

    const saveMapping = () => {
        if (!selectedFormIdValue || duplicateTargets.length > 0) return;
        const payload = {
            mappings: questions
                .filter((question) => question.key)
                .map((question) => ({
                    questionKey: question.key,
                    ...(question.label ? { questionLabel: question.label } : {}),
                    crmField: draft[question.key] || null,
                })),
        };
        // pageId is required only when no config row exists yet; including it
        // when known also keeps the saved row's Page accurate.
        if (selectedForm?.pageId) payload.pageId = String(selectedForm.pageId);
        if (selectedForm?.formName) payload.formName = selectedForm.formName;
        mappingMutation.mutate({ formId: selectedFormIdValue, payload });
    };

    if (!canView) {
        return (
            <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Meta lead sync is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </div>
        );
    }

    const openTabForForm = (form, nextTab) => {
        if (form && form.formId) setSelectedFormId(String(form.formId));
        setTab(nextTab);
    };

    const discoveryErrors = formsQuery.data?.errors || [];

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Megaphone size={22} className="text-purple-600" /> Meta Lead Sync
                    </h1>
                    <p className="text-sm text-gray-500">
                        Discover Instant Forms, map their questions to CRM fields, backfill history and watch every sync run.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {!canManage && (
                        <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full border bg-gray-100 text-gray-500 border-gray-200">
                            View only
                        </span>
                    )}
                    <Link
                        href="/dashboard/marketing/meta-ads/settings"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Connection settings <ChevronRight size={14} />
                    </Link>
                    <Link
                        href="/dashboard/marketing/meta-ads"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Reporting <ChevronRight size={14} />
                    </Link>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
                {TABS.map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setTab(item.id)}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
                                active
                                    ? "bg-purple-600 text-white"
                                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                        >
                            <Icon size={15} /> {item.label}
                        </button>
                    );
                })}
            </div>

            {/* ------------------------------------------------------- */}
            {/* Tab 1: Lead Forms                                        */}
            {/* ------------------------------------------------------- */}
            {tab === "forms" && (
                <SectionCard
                    icon={ClipboardList}
                    title="Lead Forms"
                    subtitle="Instant Forms discovered on the connected Meta Pages. Sync On means new leads from this form are imported; forms without a saved setting still ingest (default On)."
                    action={
                        <button
                            onClick={() => formsQuery.refetch()}
                            disabled={formsQuery.isFetching}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                            {formsQuery.isFetching ? (
                                <Loader2 size={13} className="animate-spin" />
                            ) : (
                                <RefreshCw size={13} />
                            )}
                            Refresh
                        </button>
                    }
                >
                    {formsQuery.isPending ? (
                        <div className="py-8 text-center text-gray-400">
                            <Loader2 size={22} className="animate-spin mx-auto mb-2" />
                            <p className="text-sm">Discovering Instant Forms…</p>
                        </div>
                    ) : formsQuery.error ? (
                        <ErrorBox error={formsQuery.error} onRetry={() => formsQuery.refetch()} />
                    ) : (
                        <div className="space-y-4">
                            {discoveryErrors.length > 0 && (
                                <Notice tone="amber" icon={AlertCircle}>
                                    <p className="font-bold">Some Pages could not be read:</p>
                                    <ul className="mt-1 space-y-0.5">
                                        {discoveryErrors.map((entry) => (
                                            <li key={entry.pageId}>
                                                {isAdmin ? (
                                                    <>
                                                        Page {entry.pageId}: {entry.message}{" "}
                                                        <span className="font-mono text-[11px]">({entry.code})</span>
                                                    </>
                                                ) : (
                                                    entry.message
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </Notice>
                            )}
                            {formsQuery.data?.statusUnavailable && (
                                <Notice tone="gray" icon={Info}>
                                    Meta did not provide a status for these forms — they show “—” instead of a
                                    guessed value.
                                </Notice>
                            )}
                            {formsQuery.data?.truncated && (
                                <Notice tone="amber" icon={Info}>
                                    Discovery hit its bound — there may be more forms than shown. Refresh to check for
                                    missing forms.
                                </Notice>
                            )}
                            {!isAdmin && (
                                <Notice tone="gray" icon={Info}>
                                    View-only access — an administrator can enable/disable forms and save field
                                    mappings.
                                </Notice>
                            )}

                            {formItems.length === 0 ? (
                                <div className="py-8 text-center">
                                    <p className="text-sm font-semibold text-gray-600">No Instant Forms found</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {isAdmin
                                            ? "Check that Pages are selected in Meta Connection settings and that the token can read leadgen forms."
                                            : "Your Meta Pages may not have any lead forms yet, or an administrator must grant Page access in Meta connection settings."}
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[11px] font-black uppercase text-gray-400 border-b border-gray-200">
                                                <th className="py-2 pr-4">Form</th>
                                                <th className="py-2 pr-4">Page</th>
                                                <th className="py-2 pr-4">Status</th>
                                                <th className="py-2 pr-4">Sync</th>
                                                <th className="py-2 pr-4">Mapped</th>
                                                <th className="py-2 pr-4">Last synced</th>
                                                <th className="py-2 pr-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {formItems.map((form) => (
                                                <tr key={form.formId} className="border-b border-gray-100 align-top">
                                                    <td className="py-3 pr-4">
                                                        <p className="font-semibold text-gray-900">
                                                            {form.formName || "Untitled form"}
                                                        </p>
                                                        {isAdmin && (
                                                            <p className="text-[11px] text-gray-400 font-mono">
                                                                {form.formId}
                                                            </p>
                                                        )}
                                                        {form.missingFromMeta && (
                                                            <span className="inline-block mt-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
                                                                No longer in Meta
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 pr-4 text-xs text-gray-500">
                                                        {isAdmin ? (
                                                            <span className="font-mono">{form.pageId || "—"}</span>
                                                        ) : (
                                                            form.pageId ? "Meta Page" : "—"
                                                        )}
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-full border bg-gray-100 text-gray-500 border-gray-200">
                                                            {form.status || "—"}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        {isAdmin ? (
                                                            <label className="inline-flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={form.isEnabled !== false}
                                                                    disabled={
                                                                        !form.pageId ||
                                                                        (configMutation.isPending &&
                                                                            configMutation.variables?.formId ===
                                                                                form.formId)
                                                                    }
                                                                    onChange={(e) =>
                                                                        configMutation.mutate({
                                                                            formId: String(form.formId),
                                                                            payload: {
                                                                                isEnabled: e.target.checked,
                                                                                pageId: String(form.pageId),
                                                                                ...(form.formName
                                                                                    ? { formName: form.formName }
                                                                                    : {}),
                                                                            },
                                                                        })
                                                                    }
                                                                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                                />
                                                                <span className="text-xs font-bold text-gray-700">
                                                                    {form.isEnabled !== false ? "On" : "Off"}
                                                                </span>
                                                            </label>
                                                        ) : (
                                                            <span className="text-xs font-bold text-gray-700">
                                                                {form.isEnabled !== false ? "On" : "Off"}
                                                            </span>
                                                        )}
                                                        {!form.pageId && (
                                                            <p className="text-[10px] text-amber-600 mt-1">
                                                                Page unknown — refresh discovery
                                                            </p>
                                                        )}
                                                    </td>
                                                    <td className="py-3 pr-4 text-xs text-gray-600">
                                                        {form.mappingCount || 0} question
                                                        {form.mappingCount === 1 ? "" : "s"}
                                                    </td>
                                                    <td className="py-3 pr-4 text-xs text-gray-600">
                                                        {formatDateTime(form.lastSyncedAt)}
                                                    </td>
                                                    <td className="py-3 pr-4 text-right">
                                                        <div className="inline-flex gap-2">
                                                            <button
                                                                onClick={() => openTabForForm(form, "mapping")}
                                                                className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"
                                                            >
                                                                Map fields
                                                            </button>
                                                            {canManage && (
                                                                <button
                                                                    onClick={() => openTabForForm(form, "sync")}
                                                                    className="px-2.5 py-1.5 rounded-lg border border-purple-200 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100"
                                                                >
                                                                    Backfill
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </SectionCard>
            )}

            {/* ------------------------------------------------------- */}
            {/* Tab 2: Field Mapping                                     */}
            {/* ------------------------------------------------------- */}
            {tab === "mapping" && (
                <SectionCard
                    icon={GitMerge}
                    title="Field Mapping"
                    subtitle="Map each Meta question to a standard CRM field. Unmapped answers are still preserved on the lead in Meta Answers — never discarded."
                    action={
                        isAdmin ? (
                            <button
                                onClick={saveMapping}
                                disabled={
                                    !selectedFormIdValue ||
                                    questionsQuery.isPending ||
                                    duplicateTargets.length > 0 ||
                                    mappingMutation.isPending
                                }
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold disabled:opacity-60"
                            >
                                {mappingMutation.isPending ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Save size={14} />
                                )}
                                Save mapping
                            </button>
                        ) : (
                            <span className="text-xs text-gray-500">View-only — administrators save mappings.</span>
                        )
                    }
                >
                    <div className="space-y-4">
                        <FormPicker
                            items={formItems}
                            value={selectedFormIdValue}
                            onChange={(value) => setSelectedFormId(value)}
                            loading={formsQuery.isPending}
                            showIds={isAdmin}
                        />
                        {selectedForm && (
                            <p className="text-xs text-gray-500">
                                {isAdmin ? (
                                    <>
                                        Page <span className="font-mono">{selectedForm.pageId || "unknown"}</span>
                                    </>
                                ) : (
                                    "From your connected Meta Page"
                                )}
                                {selectedForm.configured
                                    ? " · saved configuration found"
                                    : " · no saved configuration yet (form ingests by default)"}
                            </p>
                        )}

                        {questionsQuery.isPending ? (
                            <div className="py-8 text-center text-gray-400">
                                <Loader2 size={22} className="animate-spin mx-auto mb-2" />
                                <p className="text-sm">Loading form questions…</p>
                            </div>
                        ) : questionsQuery.error ? (
                            <ErrorBox error={questionsQuery.error} onRetry={() => questionsQuery.refetch()} />
                        ) : questionsQuery.data && !questionsQuery.data.available ? (
                            <Notice tone="amber" icon={AlertCircle}>
                                Meta did not return the question list for this form, so there is nothing to map yet.
                                Incoming answers will still be imported and preserved on the lead.
                            </Notice>
                        ) : (
                            <div className="space-y-3">
                                {unmappedMandatory.length > 0 && (
                                    <Notice tone="blue" icon={Info}>
                                        Not mapped yet: <strong>{unmappedMandatory.join(", ")}</strong>. The import
                                        still picks up the form&apos;s name and phone answers automatically when
                                        present, so this is a hint — not a blocker.
                                    </Notice>
                                )}
                                {duplicateTargets.length > 0 && (
                                    <Notice tone="amber" icon={XCircle}>
                                        Each CRM field can be used once — currently duplicated:{" "}
                                        <strong>{duplicateTargets.join(", ")}</strong>.
                                    </Notice>
                                )}

                                {questions.map((question) => {
                                    const key = question.key || "";
                                    const value = key ? draft[key] || "" : "";
                                    const mappedField = CRM_FIELDS.find((field) => field.value === value);
                                    return (
                                        <div
                                            key={question.questionId || key || question.label}
                                            className="p-3 rounded-2xl border border-gray-200 bg-white space-y-2"
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900">
                                                        {question.label || key || "Unnamed question"}
                                                    </p>
                                                    {isAdmin && (
                                                        <p className="text-[11px] text-gray-400 font-mono">
                                                            {key || "no key"}
                                                            {question.type ? ` · ${question.type}` : ""}
                                                        </p>
                                                    )}
                                                </div>
                                                {mappedField && (
                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                                                        {mappedField.label}
                                                        {mappedField.mandatory ? " · required" : ""}
                                                    </span>
                                                )}
                                            </div>
                                            <select
                                                value={value}
                                                disabled={!isAdmin || !key}
                                                onChange={(e) => setDraftValue(key, e.target.value)}
                                                className={inputClass}
                                            >
                                                <option value="">{UNMAPPED_OPTION.label}</option>
                                                {CRM_FIELDS.map((field) => (
                                                    <option key={field.value} value={field.value}>
                                                        {field.label}
                                                        {field.mandatory ? " (required CRM field)" : ""}
                                                    </option>
                                                ))}
                                            </select>
                                            {!key && (
                                                <p className="text-[11px] text-amber-600">
                                                    Meta returned this question without a key — it cannot be mapped, but
                                                    its answer is still preserved.
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}

                                <p className="text-[11px] text-gray-400">
                                    Answers are written to CRM columns only when mapped. Everything else lands on the
                                    lead under Meta Answers with the original question label and answer.
                                </p>
                            </div>
                        )}
                    </div>
                </SectionCard>
            )}

            {/* ------------------------------------------------------- */}
            {/* Tab 3: Lead Sync (backfill)                              */}
            {/* ------------------------------------------------------- */}
            {tab === "sync" && (
                <SectionCard
                    icon={RefreshCw}
                    title="Historical backfill"
                    subtitle="Import past leads for one form over an optional date range. Runs are bounded (500 leads per run) and idempotent — a lead already in the CRM counts as a duplicate, never a second row."
                >
                    <form onSubmit={runBackfill} className="space-y-4">
                        <FormPicker
                            items={formItems}
                            value={selectedFormIdValue}
                            onChange={(value) => setSelectedFormId(value)}
                            loading={formsQuery.isPending}
                            showIds={isAdmin}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:max-w-md">
                            <div>
                                <label className={labelClass}>From (optional)</label>
                                <input
                                    type="date"
                                    value={backfillRange.since}
                                    onChange={(e) =>
                                        setBackfillRange((prev) => ({ ...prev, since: e.target.value }))
                                    }
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>To (optional)</label>
                                <input
                                    type="date"
                                    value={backfillRange.until}
                                    onChange={(e) => setBackfillRange((prev) => ({ ...prev, until: e.target.value }))
                                    }
                                    className={inputClass}
                                />
                            </div>
                        </div>
                        {!datesPaired && (
                            <p className="text-xs text-red-600">Both dates are required together.</p>
                        )}
                        {datesPaired && !datesOrdered && (
                            <p className="text-xs text-red-600">The From date must not be after the To date.</p>
                        )}
                        {!canManage ? (
                            <Notice tone="gray" icon={Info}>
                                View-only access — backfill and retry require marketing management permission.
                            </Notice>
                        ) : (
                            !selectedForm?.pageId && (
                                <Notice tone="amber" icon={AlertCircle}>
                                    This form has no known Meta Page — refresh discovery on the Lead Forms tab first.
                                </Notice>
                            )
                        )}
                        <div className="flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={!backfillReady}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold disabled:opacity-60"
                            >
                                {backfillMutation.isPending ? (
                                    <Loader2 size={15} className="animate-spin" />
                                ) : (
                                    <RefreshCw size={15} />
                                )}
                                {backfillMutation.isPending ? "Backfilling…" : "Run backfill"}
                            </button>
                            <p className="text-xs text-gray-400 max-w-md">
                                Without dates, Meta&apos;s available history for the form is imported (bounded per run).
                            </p>
                        </div>
                        <ErrorBox error={backfillMutation.error} />
                    </form>

                    {lastRunResult && <RunResultPanel result={lastRunResult} showDetails={isAdmin} />}
                </SectionCard>
            )}

            {/* ------------------------------------------------------- */}
            {/* Tab 4: Sync History                                      */}
            {/* ------------------------------------------------------- */}
            {tab === "history" && (
                <SectionCard
                    icon={History}
                    title="Sync History"
                    subtitle="Every webhook, backfill and retry run with its counts and status. Run metadata only — no lead details are stored or shown here."
                    action={
                        <button
                            onClick={() => historyQuery.refetch()}
                            disabled={historyQuery.isFetching}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                            {historyQuery.isFetching ? (
                                <Loader2 size={13} className="animate-spin" />
                            ) : (
                                <RefreshCw size={13} />
                            )}
                            Refresh
                        </button>
                    }
                >
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className={labelClass}>
                                    <Filter size={10} className="inline mr-1" /> Type
                                </label>
                                <select
                                    value={historyFilters.source}
                                    onChange={(e) =>
                                        setHistoryFilters((prev) => ({ ...prev, source: e.target.value }))
                                    }
                                    className={inputClass}
                                >
                                    <option value="">All types</option>
                                    {SYNC_SOURCES.map((source) => (
                                        <option key={source} value={source}>
                                            {SYNC_SOURCE_LABELS[source] || source}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Status</label>
                                <select
                                    value={historyFilters.status}
                                    onChange={(e) =>
                                        setHistoryFilters((prev) => ({ ...prev, status: e.target.value }))
                                    }
                                    className={inputClass}
                                >
                                    <option value="">All statuses</option>
                                    {RUN_STATUSES.map((status) => (
                                        <option key={status} value={status}>
                                            {status}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Form</label>
                                <select
                                    value={historyFilters.formId}
                                    onChange={(e) =>
                                        setHistoryFilters((prev) => ({ ...prev, formId: e.target.value }))
                                    }
                                    className={inputClass}
                                >
                                    <option value="">All forms</option>
                                    {formItems.map((form) => (
                                        <option key={form.formId} value={form.formId}>
                                            {(form.formName || "Untitled form") + (isAdmin ? ` · ${form.formId}` : "")}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {historyQuery.isPending ? (
                            <div className="py-8 text-center text-gray-400">
                                <Loader2 size={22} className="animate-spin mx-auto mb-2" />
                                <p className="text-sm">Loading sync history…</p>
                            </div>
                        ) : historyQuery.error ? (
                            <ErrorBox error={historyQuery.error} onRetry={() => historyQuery.refetch()} />
                        ) : (historyQuery.data?.items || []).length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-sm font-semibold text-gray-600">No sync runs yet</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Webhook leads and backfills appear here as soon as they run.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-xs text-gray-500">
                                    {historyQuery.data.total} run
                                    {historyQuery.data.total === 1 ? "" : "s"}
                                    {historyQuery.data.failedEvents > 0 && (
                                        <>
                                            {" · "}
                                            <span className="font-bold text-red-500">
                                                {historyQuery.data.failedEvents} failed import
                                                {historyQuery.data.failedEvents === 1 ? "" : "s"} pending retry
                                            </span>
                                        </>
                                    )}
                                </p>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[11px] font-black uppercase text-gray-400 border-b border-gray-200">
                                                <th className="py-2 pr-4">Started</th>
                                                <th className="py-2 pr-4">Type</th>
                                                <th className="py-2 pr-4">Status</th>
                                                <th className="py-2 pr-4">Form</th>
                                                <th className="py-2 pr-4">Fetched</th>
                                                <th className="py-2 pr-4">Imported</th>
                                                <th className="py-2 pr-4">Duplicates</th>
                                                <th className="py-2 pr-4">Skipped</th>
                                                <th className="py-2 pr-4">Failed</th>
                                                <th className="py-2 pr-4">Error</th>
                                                <th className="py-2 pr-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(historyQuery.data.items || []).map((run) => (
                                                <tr key={run.id} className="border-b border-gray-100">
                                                    <td className="py-3 pr-4 text-xs text-gray-600 whitespace-nowrap">
                                                        {formatDateTime(run.startedAt)}
                                                    </td>
                                                    <td className="py-3 pr-4 text-xs font-semibold text-gray-700">
                                                        {SYNC_SOURCE_LABELS[run.source] || run.source}
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <RunStatusBadge status={run.status} />
                                                    </td>
                                                    <td className="py-3 pr-4 text-xs text-gray-500">
                                                        {run.formId
                                                            ? isAdmin
                                                                ? <span className="font-mono">{run.formId}</span>
                                                                : (formItems.find((f) => String(f.formId) === String(run.formId))?.formName || "Form")
                                                            : "—"}
                                                    </td>
                                                    <td className="py-3 pr-4">{run.fetched}</td>
                                                    <td className="py-3 pr-4 font-semibold text-gray-900">
                                                        {run.imported}
                                                    </td>
                                                    <td className="py-3 pr-4">{run.duplicates}</td>
                                                    <td className="py-3 pr-4">{run.skipped}</td>
                                                    <td className={`py-3 pr-4 ${run.failed ? "text-red-500 font-bold" : ""}`}>
                                                        {run.failed}
                                                    </td>
                                                    <td className="py-3 pr-4 font-mono text-[11px] text-gray-500">
                                                        {run.errorCode ? (isAdmin ? run.errorCode : "See admin") : "—"}
                                                    </td>
                                                    <td className="py-3 pr-4 text-right">
                                                        {canManage && run.failed > 0 ? (
                                                            <button
                                                                onClick={() => retryMutation.mutate({ runId: run.id })}
                                                                disabled={
                                                                    retryMutation.isPending &&
                                                                    retryMutation.variables?.runId === run.id
                                                                }
                                                                className="px-2.5 py-1.5 rounded-lg border border-purple-200 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-60"
                                                            >
                                                                {retryMutation.isPending &&
                                                                retryMutation.variables?.runId === run.id
                                                                    ? "Retrying…"
                                                                    : "Retry failed"}
                                                            </button>
                                                        ) : (
                                                            <span className="text-[11px] text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <ErrorBox error={retryMutation.error} />
                                {lastRunResult && lastRunResult.kind === "retry" && (
                                    <RunResultPanel result={lastRunResult} showDetails={isAdmin} />
                                )}
                            </div>
                        )}
                    </div>
                </SectionCard>
            )}

            {/* Shared footnote: where leads actually land */}
            <div className="flex items-start gap-2 text-xs text-gray-400 pb-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                <p>
                    Imported leads land in the regular Leads pipeline with source “Meta” — same assignment, claim
                    limits and WhatsApp notifications as any other lead. Configure the connection on{" "}
                    <Link href="/dashboard/marketing/meta-ads/settings" className="underline font-semibold">
                        Meta Connection
                    </Link>
                    .
                </p>
            </div>
        </div>
    );
}

export default function MetaLeadSyncPage() {
    return <MetaLeadSyncContent />;
}
