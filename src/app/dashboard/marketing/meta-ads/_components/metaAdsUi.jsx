"use client";
// src/app/dashboard/marketing/meta-ads/_components/metaAdsUi.jsx
// Shared building blocks for the entire Meta Ads workspace (Phases 0–6:
// dashboard, campaigns, ad sets, audiences, creatives, ads, analytics).
// Visual language mirrors the existing Meta settings page (rounded cards,
// purple accents, uppercase micro-labels) so every screen feels native to
// this CRM.
//
// Safety-critical pieces live here:
// - DisconnectedCard renders the EXACT Phase 2.5A disconnected string —
//   a disconnected workspace must never look like it has data.
// - ConfirmDialog supports a mandatory acknowledgement checkbox; every
//   activation ("may start ad spend") and permanent deletion uses it.
import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, Loader2, PlugZap, X } from "lucide-react";
import { META_DISCONNECTED_MESSAGE } from "../../../../../lib/metaAdsEnums";
import { statusBadgeClass, statusLabel } from "../../../../../lib/metaAdsEnums";
import { usePermissions } from "../../../../../features/auth/hooks/usePermissions";

export const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-60";
export const labelClass = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1";

export const SectionCard = ({ icon: Icon, title, subtitle, action, children }) => (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
                {Icon && (
                    <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                        <Icon size={16} />
                    </div>
                )}
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

// Label + control wrapper used by every form on these screens.
export const Field = ({ label, hint, error, children }) => (
    <div>
        <label className={labelClass}>{label}</label>
        {children}
        {hint && !error && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
);

// Provider/server failure — message rendered verbatim (server messages are
// operational, never credential-bearing), with optional retry.
export const ErrorBox = ({ error, onRetry }) => {
    if (!error) return null;
    return (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3" role="alert">
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

const NOTICE_TONES = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    gray: "border-gray-200 bg-gray-50 text-gray-600",
};

// Inline informational banner (safety notes, read-only explanations…).
export const Notice = ({ tone = "blue", icon: Icon, children }) => (
    <div className={`flex items-start gap-2 rounded-2xl border p-3 text-sm ${NOTICE_TONES[tone] || NOTICE_TONES.blue}`}>
        {Icon && <Icon size={15} className="mt-0.5 shrink-0" />}
        <div className="flex-1">{children}</div>
    </div>
);

export const Pager = ({ onPrev, onNext, hasPrev, hasNext, loading, label }) => (
    <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{label}</span>
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev || loading}
                className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold disabled:opacity-40 hover:bg-gray-50"
            >
                Previous
            </button>
            <button
                type="button"
                onClick={onNext}
                disabled={!hasNext || loading}
                className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold disabled:opacity-40 hover:bg-gray-50"
            >
                Next
            </button>
        </div>
    </div>
);

export const LoadingRow = ({ label = "Loading…" }) => (
    <p className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
        <Loader2 size={15} className="animate-spin" /> {label}
    </p>
);

export const EmptyState = ({ icon: Icon, title, hint, action }) => (
    <div className="text-center py-10 space-y-2">
        {Icon && (
            <div className="mx-auto w-10 h-10 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center">
                <Icon size={18} />
            </div>
        )}
        <p className="font-semibold text-gray-700">{title}</p>
        {hint && <p className="text-sm text-gray-500 max-w-md mx-auto">{hint}</p>}
        {action}
    </div>
);

// Disconnected workspace card. Renders the exact contract string and never
// any campaign/audience content — disconnected ≠ demo data.
export const DisconnectedCard = ({ title = "Meta account not connected" }) => (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center">
            <PlugZap size={20} />
        </div>
        <p className="font-bold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500 max-w-lg mx-auto">{META_DISCONNECTED_MESSAGE}</p>
        <Link
            href="/dashboard/marketing/meta-ads/settings"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700"
        >
            Open Meta connection settings
        </Link>
    </div>
);

// Status pill for Meta effective_status / status values.
export const StatusBadge = ({ status }) => (
    <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${statusBadgeClass(status)}`}
    >
        {statusLabel(status)}
    </span>
);

// Modal shell (in-page dialog — never window.confirm, so the dangerous
// action and its consequences are visible together).
export const Modal = ({ open, title, subtitle, onClose, children, wide = false }) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:p-8">
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`bg-white rounded-3xl border border-gray-200 shadow-xl w-full ${wide ? "max-w-3xl" : "max-w-xl"} max-h-[90vh] overflow-y-auto custom-scrollbar`}
            >
                <div className="flex items-start justify-between gap-3 p-6 pb-0">
                    <div>
                        <p className="font-bold text-gray-900">{title}</p>
                        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
};

// Confirmation dialog for irreversible / spend-starting actions.
//
// requireCheckbox forces the user to actively acknowledge the warning
// (e.g. "this may start ad spend") before Confirm unlocks — activation of
// campaigns/ad sets and permanent audience deletion always use it.
//
// Structure: the exported component only gates on `open` and renders the
// body as a fresh mount each time, so the acknowledgement checkbox always
// starts unchecked without a state-resetting effect.
export const ConfirmDialog = ({
    open,
    title,
    body,
    warning,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    requireCheckbox = false,
    checkboxLabel = "I understand the consequences of this action.",
    tone = "red",
    busy = false,
    onConfirm,
    onCancel,
}) => {
    if (!open) return null;

    return (
        <ConfirmDialogBody
            title={title}
            body={body}
            warning={warning}
            confirmLabel={confirmLabel}
            cancelLabel={cancelLabel}
            requireCheckbox={requireCheckbox}
            checkboxLabel={checkboxLabel}
            tone={tone}
            busy={busy}
            onConfirm={onConfirm}
            onCancel={onCancel}
        />
    );
};

const ConfirmDialogBody = ({
    title,
    body,
    warning,
    confirmLabel,
    cancelLabel,
    requireCheckbox,
    checkboxLabel,
    tone,
    busy,
    onConfirm,
    onCancel,
}) => {
    const [checked, setChecked] = useState(false);
    const disabled = busy || (requireCheckbox && !checked);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="bg-white rounded-3xl border border-gray-200 shadow-xl w-full max-w-md p-6 space-y-4"
            >
                <div>
                    <p className="font-bold text-gray-900">{title}</p>
                    {body && <p className="text-sm text-gray-600 mt-1">{body}</p>}
                </div>
                {warning && (
                    <div
                        className={`flex items-start gap-2 rounded-2xl border p-3 text-sm ${
                            tone === "red"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                    >
                        <AlertCircle size={15} className="mt-0.5 shrink-0" />
                        <p>{warning}</p>
                    </div>
                )}
                {requireCheckbox && (
                    <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setChecked(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span>{checkboxLabel}</span>
                    </label>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={disabled}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                            tone === "red" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                        }`}
                    >
                        {busy ? <Loader2 size={14} className="animate-spin inline mr-1.5" /> : null}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ===========================================================================
// Design-system additions — one visual language for every Meta Ads screen
// (Phases 0–6). Pure presentational building blocks: no data fetching and
// no business rules, safe to reuse anywhere in the workspace.
// ===========================================================================

// Standard page shell — identical padding, background and scroll behaviour
// on every screen so switching pages never shifts the layout.
export const PageContainer = ({ children }) => (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-4 sm:p-6 lg:p-8 space-y-5 custom-scrollbar">
        {children}
    </div>
);

// Consistent page title block: optional back link, icon, title, subtitle,
// status badge and right-aligned action buttons. Wraps on tablet/mobile.
export const PageHeader = ({ icon: Icon, title, subtitle, backHref, backLabel = "Back", actions, badge }) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
            {backHref && (
                <Link
                    href={backHref}
                    className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-purple-600 mb-1"
                >
                    <ChevronLeft size={13} /> {backLabel}
                </Link>
            )}
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                {Icon && <Icon size={22} className="text-purple-600 shrink-0" />}
                <span className="min-w-0 break-words">{title}</span>
                {badge}
            </h1>
            {subtitle && <p className="text-sm text-gray-500 mt-1 max-w-3xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
);

// Permission-restricted state in plain language — never shows permission
// codes (e.g. "marketing:manage") to the user.
export const RestrictedCard = ({ title = "This area is restricted", hint = "Ask an administrator for marketing access." }) => (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
        <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
        <p className="font-bold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500 mt-1">{hint}</p>
    </div>
);

// Business metric card. `value` is a preformatted string; unknown metrics
// pass "—" (never coerced to 0). `tone` tints the icon chip only.
export const StatCard = ({ icon: Icon, label, value, hint, tone = "purple", loading = false }) => {
    const tones = {
        purple: "bg-purple-50 text-purple-600",
        emerald: "bg-emerald-50 text-emerald-600",
        amber: "bg-amber-50 text-amber-600",
        blue: "bg-blue-50 text-blue-600",
        gray: "bg-gray-50 text-gray-500",
        red: "bg-red-50 text-red-600",
    };
    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-start gap-3">
            {Icon && (
                <div className={`p-2 rounded-xl shrink-0 ${tones[tone] || tones.purple}`}>
                    <Icon size={16} />
                </div>
            )}
            <div className="min-w-0">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5 break-words">
                    {loading ? <Loader2 size={16} className="animate-spin inline text-gray-300" /> : value}
                </p>
                {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
            </div>
        </div>
    );
};

// Consistent tab strip (lead sync, creative library, analytics sections).
export const Tabs = ({ tabs, active, onChange, ariaLabel = "Sections" }) => (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
            const value = typeof tab === "string" ? tab : tab.value;
            const label = typeof tab === "string" ? tab : tab.label;
            const Icon = typeof tab === "string" ? null : tab.icon;
            const isActive = active === value;
            return (
                <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onChange(value)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                        isActive
                            ? "border-purple-500 bg-purple-50 text-purple-700"
                            : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                >
                    {Icon && <Icon size={13} />}{label}
                </button>
            );
        })}
    </div>
);

// Wizard step indicator — shared by the ad set and ad creation flows.
// Completed steps are clickable, future steps are locked (no silent jumps).
export const Stepper = ({ steps, activeIndex, onSelect }) => (
    <div className="flex flex-wrap gap-2">
        {steps.map((step, index) => {
            const Icon = step.icon;
            const active = index === activeIndex;
            const done = index < activeIndex;
            return (
                <button
                    key={step.key || step.label}
                    type="button"
                    onClick={() => {
                        if (index < activeIndex && onSelect) onSelect(index);
                    }}
                    disabled={index > activeIndex}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition ${
                        active
                            ? "border-purple-500 bg-purple-50 text-purple-700"
                            : done
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "border-gray-200 bg-white text-gray-400 cursor-not-allowed"
                    }`}
                >
                    {Icon && <Icon size={13} />} {index + 1}. {step.label}
                </button>
            );
        })}
    </div>
);

// Technical identifier (Meta object IDs). Hidden for ordinary client users —
// administrators keep it for support. Never the only way to find something:
// every ID here sits next to a human-readable name.
export const AdminId = ({ value, prefix = "ID" }) => {
    const { hasRole } = usePermissions();
    const isAdmin = hasRole(["SUPER_ADMIN", "ADMIN"]);
    if (!isAdmin || !value) return null;
    return (
        <span className="block text-[11px] text-gray-400 font-mono select-all">
            {prefix} {value}
        </span>
    );
};

// Shared action-button classes so primary/secondary/destructive actions look
// identical on every screen.
export const btnPrimaryClass =
    "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed";
export const btnSecondaryClass =
    "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50";
export const btnDangerClass =
    "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50";

// Consistent "—" for unknown values in table cells (never coerced to 0).
export const formatCell = (value) =>
    value === null || value === undefined || value === "" ? "—" : String(value);
