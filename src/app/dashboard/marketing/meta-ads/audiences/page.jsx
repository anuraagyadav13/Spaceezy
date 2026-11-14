"use client";
// Audiences — Phase 3+4: discovery of saved (Meta read-only) and custom
// (manageable) audiences, with create / rename / delete for custom ones.
//
// Safety: deletion is PERMANENT in Meta's API, so it runs through the
// mandatory-acknowledge ConfirmDialog and the client sends ?confirm=true
// (also enforced server-side). Saved audiences are listed but never
// editable — Meta documents that edge as read-only.
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertCircle, ChevronLeft, Loader2, Pencil, Plus, RefreshCw, Trash2, Users,
} from "lucide-react";
import { usePermissions } from "../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../lib/toast";
import { META_LIVE_DATA_NOTE } from "../../../../../lib/metaAdsEnums";
import {
    fetchMetaStatus,
    fetchMetaAudiences,
    createMetaAudience,
    updateMetaAudience,
    deleteMetaAudience,
} from "../../../../../lib/api/metaAds";
import {
    AdminId, ConfirmDialog, DisconnectedCard, EmptyState, ErrorBox, Field, LoadingRow,
    Modal, Notice, Pager, SectionCard, inputClass,
} from "../_components/metaAdsUi";

const TYPE_TABS = [
    { value: "all", label: "All" },
    { value: "saved", label: "Saved (read-only)" },
    { value: "custom", label: "Custom" },
];

export default function MetaAudiencesPage() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");
    const queryClient = useQueryClient();

    const [type, setType] = useState("all");
    const [cursorStack, setCursorStack] = useState([]);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ name: "", description: "" });
    const [formError, setFormError] = useState(null);
    const [renameTarget, setRenameTarget] = useState(null);
    const [renameValue, setRenameValue] = useState("");
    const [deleteTarget, setDeleteTarget] = useState(null);

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

    const audiencesQuery = useQuery({
        queryKey: ["meta-ads", "audiences", type, after],
        queryFn: () => fetchMetaAudiences({
            type,
            limit: 100,
            ...(after ? { after } : {}),
        }),
        enabled: canView && connected,
        retry: 1,
    });

    const savedItems = audiencesQuery.data?.saved?.items || [];
    const customItems = audiencesQuery.data?.custom?.items || [];
    const paging = type === "saved"
        ? audiencesQuery.data?.saved?.paging
        : type === "custom"
            ? audiencesQuery.data?.custom?.paging
            : null;
    const hasNext = Boolean(paging?.cursors?.after);
    const hasPrev = cursorStack.length > 0;

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ["meta-ads", "audiences"] });

    const createMutation = useMutation({
        mutationFn: (payload) => createMetaAudience(payload),
        onSuccess: () => {
            showToast("Custom audience created (empty — add members in Meta)", "success");
            setCreateOpen(false);
            setForm({ name: "", description: "" });
            setFormError(null);
            invalidate();
        },
        onError: (error) => setFormError(error),
    });

    const renameMutation = useMutation({
        mutationFn: ({ id, payload }) => updateMetaAudience(id, payload),
        onSuccess: () => {
            showToast("Audience renamed", "success");
            setRenameTarget(null);
            setFormError(null);
            invalidate();
        },
        onError: (error) => setFormError(error),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => deleteMetaAudience(id),
        onSuccess: () => {
            showToast("Audience deleted permanently", "success");
            setDeleteTarget(null);
            invalidate();
        },
        onError: (error) => {
            setDeleteTarget(null);
            showToast(error.message || "Could not delete the audience", "error");
        },
    });

    if (!canView) {
        return (
            <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Audience management is restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </div>
        );
    }

    const audienceRow = (audience, kind) => (
        <tr key={`${kind}-${audience.id}`} className="border-b border-gray-50 hover:bg-gray-50/60">
            <td className="py-2.5 pr-3">
                <span className="font-semibold text-gray-900">{audience.name || `Audience ${audience.id}`}</span>
                <AdminId value={audience.id} prefix="Audience" />
            </td>
            <td className="py-2.5 pr-3 text-gray-600 text-xs">
                {kind === "saved"
                    ? "Saved (Meta read-only)"
                    : audience.subtype || "Custom"}
            </td>
            <td className="py-2.5 pr-3 text-gray-500 text-xs">
                {audience.description || "—"}
            </td>
            <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                {kind === "custom" && canManage && (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setFormError(null);
                                setRenameTarget(audience);
                                setRenameValue(audience.name || "");
                            }}
                            className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline mr-3"
                        >
                            <Pencil size={12} /> Rename
                        </button>
                        <button
                            type="button"
                            onClick={() => setDeleteTarget(audience)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:underline"
                        >
                            <Trash2 size={12} /> Delete
                        </button>
                    </>
                )}
            </td>
        </tr>
    );

    const table = (items, kind) => (
        <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                        <th className="py-2 pr-3 font-bold">Audience</th>
                        <th className="py-2 pr-3 font-bold">Type</th>
                        <th className="py-2 pr-3 font-bold">Description</th>
                        <th className="py-2 pr-3 font-bold text-right" aria-label="Actions" />
                    </tr>
                </thead>
                <tbody>{items.map((a) => audienceRow(a, kind))}</tbody>
            </table>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link
                        href="/dashboard/marketing/meta-ads/campaigns"
                        className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-purple-600 mb-1"
                    >
                        <ChevronLeft size={13} /> Meta Campaigns
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Users size={22} className="text-purple-600" /> Audiences
                    </h1>
                    <p className="text-sm text-gray-500">
                        Saved and custom audiences from your Meta ad account. Attach them to ad sets during creation.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => audiencesQuery.refetch()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <RefreshCw size={14} className={audiencesQuery.isFetching ? "animate-spin" : ""} /> Refresh
                    </button>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => {
                                setFormError(null);
                                setForm({ name: "", description: "" });
                                setCreateOpen(true);
                            }}
                            disabled={!connected}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus size={15} /> New custom audience
                        </button>
                    )}
                </div>
            </div>

            {statusQuery.isPending && <LoadingRow label="Checking Meta connection…" />}
            {!statusQuery.isPending && !connected && <DisconnectedCard title="Meta account not connected" />}

            {connected && (
                <>
                    <Notice tone="blue" icon={Users}>
                        {META_LIVE_DATA_NOTE} Custom audiences start empty — add members in Meta Ads Manager.
                        Saved audiences are listed read-only (Meta&apos;s API does not allow editing them).
                    </Notice>

                    <SectionCard
                        icon={Users}
                        title="Audience library"
                        subtitle="Live from your connected Meta ad account"
                        action={
                            <div className="flex gap-1.5">
                                {TYPE_TABS.map((tab) => (
                                    <button
                                        key={tab.value}
                                        type="button"
                                        onClick={() => {
                                            setType(tab.value);
                                            resetPaging();
                                        }}
                                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                                            type === tab.value
                                                ? "border-purple-500 bg-purple-50 text-purple-700"
                                                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        <ErrorBox error={audiencesQuery.error} onRetry={() => audiencesQuery.refetch()} />
                        {audiencesQuery.isPending ? (
                            <LoadingRow label="Loading audiences from Meta…" />
                        ) : audiencesQuery.isError ? null : savedItems.length === 0 && customItems.length === 0 ? (
                            <EmptyState
                                icon={Users}
                                title="No audiences on this ad account"
                                hint="Meta returned no saved or custom audiences. Nothing is faked here — create a custom audience to get started."
                                action={
                                    canManage ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormError(null);
                                                setForm({ name: "", description: "" });
                                                setCreateOpen(true);
                                            }}
                                            className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700"
                                        >
                                            <Plus size={15} /> Create a custom audience
                                        </button>
                                    ) : null
                                }
                            />
                        ) : (
                            <div className="space-y-6">
                                {(type === "all" || type === "saved") && savedItems.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                            Saved audiences — read-only
                                        </p>
                                        {table(savedItems, "saved")}
                                    </div>
                                )}
                                {(type === "all" || type === "custom") && customItems.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                            Custom audiences — manageable
                                        </p>
                                        {table(customItems, "custom")}
                                    </div>
                                )}
                                {type !== "all" && (type === "saved" ? savedItems : customItems).length === 0 && (
                                    <EmptyState
                                        icon={Users}
                                        title={`No ${type} audiences`}
                                        hint="None found for this type yet — create a custom audience to get started."
                                    />
                                )}
                            </div>
                        )}

                        {(hasNext || hasPrev) && (
                            <Pager
                                label={`Page ${cursorStack.length + 1} · 100 audiences per page`}
                                loading={audiencesQuery.isFetching}
                                hasPrev={hasPrev}
                                hasNext={hasNext}
                                onPrev={() => setCursorStack((s) => s.slice(0, -1))}
                                onNext={() => setCursorStack((s) => [...s, paging.cursors.after])}
                            />
                        )}
                    </SectionCard>
                </>
            )}

            {/* Create custom audience */}
            <Modal
                open={createOpen}
                title="New custom audience"
                subtitle="Creates an empty CUSTOM container — add members in Meta Ads Manager afterwards."
                onClose={() => setCreateOpen(false)}
            >
                <div className="space-y-4">
                    <ErrorBox error={createMutation.isError ? createMutation.error : formError} />
                    <Field label="Audience name" hint="Required, max 250 characters.">
                        <input
                            type="text"
                            maxLength={250}
                            value={form.name}
                            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                            placeholder="e.g. Site visitors — 30 days"
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Description (optional)">
                        <textarea
                            rows={3}
                            maxLength={1000}
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                    <div className="flex justify-end gap-2">
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
                            onClick={() => {
                                setFormError(null);
                                if (!form.name.trim()) {
                                    setFormError(new Error("Audience name is required"));
                                    return;
                                }
                                createMutation.mutate({
                                    name: form.name.trim(),
                                    ...(form.description.trim() ? { description: form.description.trim() } : {}),
                                });
                            }}
                            disabled={createMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
                        >
                            {createMutation.isPending && <Loader2 size={14} className="animate-spin inline mr-1.5" />}
                            Create audience
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Rename custom audience */}
            <Modal
                open={Boolean(renameTarget)}
                title="Rename audience"
                subtitle={renameTarget ? `Audience ${renameTarget.id}` : ""}
                onClose={() => setRenameTarget(null)}
            >
                <div className="space-y-4">
                    <ErrorBox error={renameMutation.isError ? renameMutation.error : formError} />
                    <Field label="Audience name">
                        <input
                            type="text"
                            maxLength={250}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className={inputClass}
                        />
                    </Field>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setRenameTarget(null)}
                            disabled={renameMutation.isPending}
                            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setFormError(null);
                                if (!renameValue.trim()) {
                                    setFormError(new Error("Audience name cannot be empty"));
                                    return;
                                }
                                renameMutation.mutate({
                                    id: renameTarget.id,
                                    payload: { name: renameValue.trim() },
                                });
                            }}
                            disabled={renameMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
                        >
                            {renameMutation.isPending && <Loader2 size={14} className="animate-spin inline mr-1.5" />}
                            Save name
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete = permanent */}
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title="Delete this audience permanently?"
                body={deleteTarget ? `“${deleteTarget.name || deleteTarget.id}” will be deleted from Meta.` : ""}
                warning="Deletion is permanent in Meta's API. Ads using this audience stop delivering, and the audience cannot be restored."
                confirmLabel="Delete permanently"
                requireCheckbox
                checkboxLabel="I understand this audience will be permanently deleted and cannot be restored."
                busy={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
}
