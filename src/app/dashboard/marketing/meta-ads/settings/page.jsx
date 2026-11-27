"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Megaphone, AlertCircle, CheckCircle2, Loader2, RefreshCw, Save,
    ShieldCheck, XCircle, ChevronRight, PlugZap, Layers, Globe, AtSign, Clock3,
    KeyRound, Webhook, Trash2, Activity, Copy, Link2, AlertTriangle,
} from "lucide-react";
import { usePermissions } from "../../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../../lib/toast";
import {
    fetchMetaStatus,
    fetchMetaAdAccounts,
    fetchMetaSettings,
    saveMetaSettings,
    rotateMetaSecret,
    removeMetaSecret,
    testMetaConnection,
    testMetaToken,
    testMetaPermissions,
    testMetaWebhook,
    subscribeMetaWebhook,
    syncMetaAssets,
    fetchMetaPages,
    fetchMetaInstagramAccounts,
    fetchMetaOauthDiagnostics,
    startMetaOAuth,
} from "../../../../../lib/api/metaAds";
import { isMetaDiscoveryEnabled } from "../../../../../lib/metaAdsEnums";
import { SyncResultPanel } from "../_components/metaAdsUi";

// Meta connection settings (Sections A–E of the credential-management UI):
// - Viewers (marketing:view) can SEE masked status (boolean flags only);
//   only ADMIN/SUPER_ADMIN may enter, rotate or remove credentials —
//   mirroring the WhatsApp settings architecture.
// - Stored secrets never reach this page: the API only returns display-safe
//   booleans (hasAccessToken / hasAppSecret / hasWebhookVerifyToken), the
//   plain Meta App ID (public OAuth metadata) and the callback URL.
// - Blank secret inputs mean "keep the saved value"; removal only ever
//   happens through the explicit Remove action with confirmation.
// - No token is ever written to localStorage; the OAuth redirect comes back
//   with a safe ?oauth=<flag> that is consumed and stripped immediately.

const PAGE_SIZE = 100;

const REASON_LABELS = {
    MISSING_CONFIG: "Not configured",
    NO_AD_ACCOUNT_SELECTED: "No ad account selected",
    TOKEN_EXPIRED: "Token expired",
    PERMISSION_DENIED: "Missing Meta permissions",
    META_TOKEN_INVALID: "Token rejected by Meta",
    META_RATE_LIMITED: "Meta rate limit reached",
    META_PERMISSION_DENIED: "Meta denied the request",
    API_ERROR: "Meta API unreachable",
};

const OAUTH_NOTICES = {
    connected: {
        tone: "emerald",
        icon: CheckCircle2,
        title: "Meta connected",
        body: "Authorization succeeded. Review the selections below and run a sync.",
    },
    denied: {
        tone: "amber",
        icon: XCircle,
        title: "Authorization cancelled",
        body: "You cancelled inside Meta. Nothing was changed.",
    },
    failed: {
        tone: "red",
        icon: AlertCircle,
        title: "Connection failed",
        body: "Meta did not complete the authorization. Please try connecting again.",
    },
    login_required: {
        tone: "amber",
        icon: AlertCircle,
        title: "Session required",
        body: "Your login session was not available during the redirect. Sign in and connect again.",
    },
    forbidden: {
        tone: "red",
        icon: ShieldCheck,
        title: "Not allowed",
        body: "Your role cannot change the Meta connection. Ask an administrator.",
    },
};

const formatDateTime = (iso) => {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const normalizeId = (id) => String(id ?? "").replace(/^act_/, "");

const sameIds = (a = [], b = []) =>
    JSON.stringify([...a].map(String).sort()) === JSON.stringify([...b].map(String).sort());

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
            <div className="flex-1">
                <p className="text-sm text-red-700">
                    {error.message || "Something went wrong while talking to the server."}
                </p>
                {error.code === "META_PERMISSION_DENIED" && (
                    <p className="text-xs text-red-600 mt-1">
                        Meta denied this request — the connection is missing a required permission (ad accounts
                        need ads_read, Instagram discovery needs instagram_basic). An administrator can grant it
                        in the Meta App Dashboard (Permissions and Features), then reconnect.
                    </p>
                )}
            </div>
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

const CheckRow = ({ checked, disabled, onChange, title, meta, hint }) => (
    <label
        className={`flex items-start gap-3 p-3 rounded-2xl border transition ${
            disabled
                ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                : "border-gray-200 hover:border-purple-300 hover:bg-purple-50/40 cursor-pointer"
        }`}
    >
        <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
        />
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gray-900 truncate">{title}</span>
            {meta && <span className="block text-xs text-gray-500 truncate">{meta}</span>}
            {hint && <span className="block text-xs text-amber-600 mt-0.5">{hint}</span>}
        </span>
    </label>
);

const Pager = ({ onPrev, onNext, hasPrev, hasNext, loading, label }) => (
    <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{label}</span>
        <div className="flex items-center gap-2">
            <button
                onClick={onPrev}
                disabled={!hasPrev || loading}
                className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold disabled:opacity-40 hover:bg-gray-50"
            >
                Previous
            </button>
            <button
                onClick={onNext}
                disabled={!hasNext || loading}
                className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold disabled:opacity-40 hover:bg-gray-50"
            >
                Next
            </button>
        </div>
    </div>
);

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-60";
const labelClass = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1";

// Masked credential input: the stored value is never available here, only
// its boolean flag. Blank means "keep the saved value" (server contract).
const SecretInput = ({ label, saved, value, onChange, placeholder, disabled, hint }) => (
    <div>
        <label className={labelClass}>
            {label}
            <span
                className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                    saved ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"
                }`}
            >
                {saved ? "Saved" : "Not set"}
            </span>
        </label>
        <input
            type="password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={saved ? "••••••••  (blank keeps the saved value)" : placeholder}
            disabled={disabled}
            autoComplete="new-password"
            className={inputClass}
        />
        {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
);

// One connection-test result row (Section D). Provider failures come back
// as { ok:false, code, message } — rendered verbatim, never swallowed.
const TestResult = ({ result }) => {
    if (!result) return null;
    if (result.pending) {
        return (
            <p className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" /> Running test…
            </p>
        );
    }
    const tone = result.ok ? "emerald" : "red";
    return (
        <div
            className={`flex items-start gap-2 rounded-2xl border p-3 ${
                tone === "emerald" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
            }`}
        >
            {result.ok ? (
                <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
            ) : (
                <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${tone === "emerald" ? "text-emerald-800" : "text-red-700"}`}>
                    {result.message || (result.ok ? "Test passed" : "Test failed")}
                </p>
                {!result.ok && result.code && (
                    <p className="text-[11px] font-bold uppercase text-red-400 mt-0.5">{result.code}</p>
                )}
                {Array.isArray(result.granted) && result.granted.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {result.granted.map((permission) => (
                            <span
                                key={permission}
                                className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-700"
                            >
                                {permission}
                            </span>
                        ))}
                    </div>
                )}
                {Array.isArray(result.missingRequired) && result.missingRequired.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {result.missingRequired.map((permission) => (
                            <span
                                key={permission}
                                className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-white border border-red-200 text-red-700"
                            >
                                missing: {permission}
                            </span>
                        ))}
                    </div>
                )}
                {result.subscription && (
                    <p className="text-xs text-gray-600 mt-1.5">
                        Subscription:{" "}
                        {result.subscription.status === "active"
                            ? "active for this callback"
                            : result.subscription.status === "not_subscribed"
                            ? "not subscribed (use \"Subscribe webhook in Meta\" above)"
                            : result.subscription.status === "callback_mismatch"
                            ? `saved, but Meta delivers to ${result.subscription.metaCallbackUrl}`
                            : result.subscription.status === "inactive"
                            ? "registered but inactive in Meta"
                            : result.subscription.reason || "unknown"}
                    </p>
                )}
                {result.expiresAt && (
                    <p className="text-xs text-gray-600 mt-1.5">Token expires: {formatDateTime(result.expiresAt)}</p>
                )}
            </div>
        </div>
    );
};

function MetaAdsSettingsContent() {
    const { hasPermission, hasRole } = usePermissions();
    const canView = hasPermission("marketing:view");
    const canManage = hasPermission("marketing:manage");
    // Sensitive credential gates (server enforces the same rule with
    // adminOnly()): only ADMIN/SUPER_ADMIN may enter or change secrets.
    const isAdmin = hasRole(["SUPER_ADMIN", "ADMIN"]);
    const queryClient = useQueryClient();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Paging cursors (one stack per discovery list, same pattern as the
    // Meta Ads reporting page). Multi-page selections survive paging because
    // selected IDs live in `selection`, not in the visible rows.
    const [adCursorStack, setAdCursorStack] = useState([]);
    const [pageCursorStack, setPageCursorStack] = useState([]);
    const [igCursorStack, setIgCursorStack] = useState([]);

    // Local edits are stored as an OVERRIDE on top of the server's saved
    // selections (null = "follow the server"). This keeps the UI in sync
    // without any effect-driven setState, and unsaved edits naturally
    // survive background refetches — see the Selections block below.
    const [overrides, setOverrides] = useState(null);
    const [lastSyncResult, setLastSyncResult] = useState(null);

    // ---- Queries -------------------------------------------------------
    const settingsQuery = useQuery({
        queryKey: ["meta-ads", "settings"],
        queryFn: fetchMetaSettings,
        enabled: canView,
        staleTime: 60_000,
        retry: 1,
    });

    const statusQuery = useQuery({
        queryKey: ["meta-ads", "status"],
        queryFn: fetchMetaStatus,
        enabled: canView,
        staleTime: 30_000,
        retry: 1,
    });

    // Admin-only OAuth configuration diagnostic (App Domain / redirect URI
    // / consistency). Never fetched for non-admins — the API would 403 it.
    const oauthDiagQuery = useQuery({
        queryKey: ["meta-ads", "oauth-diagnostics"],
        queryFn: fetchMetaOauthDiagnostics,
        enabled: isAdmin,
        staleTime: 60_000,
        retry: 1,
    });

    const statusData = statusQuery.data || null;
    // Discovery needs a usable token — nothing else. Ad-account selection
    // is NOT a prerequisite (the old gate made discovery depend on a
    // selection that discovery itself was meant to produce). Only a missing,
    // expired or rejected token keeps the queries off; a missing selection
    // or a permission gap still queries Meta and shows its honest answer.
    const discoveryEnabled = isMetaDiscoveryEnabled(statusData, canView);

    const adAfter = adCursorStack.length > 0 ? adCursorStack[adCursorStack.length - 1] : undefined;
    const pageAfter = pageCursorStack.length > 0 ? pageCursorStack[pageCursorStack.length - 1] : undefined;
    const igAfter = igCursorStack.length > 0 ? igCursorStack[igCursorStack.length - 1] : undefined;

    const adAccountsQuery = useQuery({
        queryKey: ["meta-ads", "ad-accounts", adAfter ?? "first"],
        queryFn: () => fetchMetaAdAccounts({ limit: PAGE_SIZE, after: adAfter }),
        enabled: discoveryEnabled,
        staleTime: 5 * 60_000,
        retry: 1,
    });

    const pagesQuery = useQuery({
        queryKey: ["meta-ads", "pages", pageAfter ?? "first"],
        queryFn: () => fetchMetaPages({ limit: PAGE_SIZE, after: pageAfter }),
        enabled: discoveryEnabled,
        staleTime: 5 * 60_000,
        retry: 1,
    });

    const instagramQuery = useQuery({
        queryKey: ["meta-ads", "instagram-accounts", igAfter ?? "first"],
        queryFn: () => fetchMetaInstagramAccounts({ limit: PAGE_SIZE, after: igAfter }),
        enabled: discoveryEnabled,
        staleTime: 5 * 60_000,
        retry: 1,
    });

    // ---- OAuth return (?oauth=flag) ------------------------------------
    // Captured once at mount (before the URL is stripped below), so the
    // notice survives the history replacement and a refresh can't replay it.
    const [oauthNotice, setOauthNotice] = useState(() => {
        const flag = searchParams.get("oauth");
        return flag && OAUTH_NOTICES[flag] ? flag : null;
    });

    // Strip the flag from the URL (external navigation — not component
    // state), and on a successful connect refetch everything cached.
    useEffect(() => {
        const flag = searchParams.get("oauth");
        if (!flag) return;
        router.replace(pathname);
        if (flag === "connected") {
            queryClient.invalidateQueries({ queryKey: ["meta-ads"] });
        }
    }, [searchParams, router, pathname, queryClient]);

    // ---- Selections ----------------------------------------------------
    const settings = settingsQuery.data || null;
    const savedSelection = useMemo(
        () => ({
            adAccounts: settings?.selectedAdAccountIds || [],
            pages: settings?.pageIds || [],
            instagram: settings?.instagramAccountIds || [],
        }),
        [settings]
    );
    const selection = overrides || savedSelection;
    const dirty = useMemo(
        () =>
            !!overrides &&
            (!sameIds(overrides.adAccounts, savedSelection.adAccounts) ||
                !sameIds(overrides.pages, savedSelection.pages) ||
                !sameIds(overrides.instagram, savedSelection.instagram)),
        [overrides, savedSelection]
    );

    const toggleId = (group, id) => {
        const key = String(id);
        const current = selection[group];
        const next = current.includes(key)
            ? current.filter((value) => value !== key)
            : [...current, key];
        setOverrides({ ...selection, [group]: next });
    };

    const setSelected = (group, ids) =>
        setOverrides({ ...selection, [group]: ids.map(String) });

    // ---- Mutations -----------------------------------------------------
    const saveMutation = useMutation({
        mutationFn: (payload) => saveMetaSettings(payload),
        onSuccess: () => {
            showToast("Meta settings saved", "success");
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "settings"] });
            queryClient.invalidateQueries({ queryKey: ["meta-ads", "status"] });
        },
        onError: (error) => showToast(error.message || "Could not save settings", "error"),
    });

    const syncMutation = useMutation({
        mutationFn: () => syncMetaAssets(),
        onSuccess: (data) => {
            setLastSyncResult(data);
            setAdCursorStack([]);
            setPageCursorStack([]);
            setIgCursorStack([]);
            queryClient.invalidateQueries({ queryKey: ["meta-ads"] });
            // Partial syncs are not successes: say so instead of toasting
            // "refreshed" while a category silently failed.
            if (data?.partial) {
                showToast("Sync finished with errors — some categories failed (details below)", "error");
            } else {
                showToast("Meta assets refreshed", "success");
            }
        },
        onError: (error) => showToast(error.message || "Sync failed", "error"),
    });

    const oauthMutation = useMutation({
        mutationFn: () => startMetaOAuth(),
        onSuccess: (data) => {
            // Full navigation to Meta's dialog. The URL carries a signed,
            // short-lived state — never a token or secret.
            if (data && data.authorizeUrl) window.location.assign(data.authorizeUrl);
        },
        onError: (error) => showToast(error.message || "Could not start the Meta connection", "error"),
    });

    // ---- Credential forms (Sections A/B) --------------------------------
    // Blank secret inputs are OMITTED from the payload so the server keeps
    // the saved value; only explicitly filled fields are sent.
    const emptyCreds = { metaAppId: "", graphVersion: "", accessToken: "", appSecret: "", webhookVerifyToken: "" };
    const [credForm, setCredForm] = useState(emptyCreds);
    const setCred = (key) => (value) => setCredForm((form) => ({ ...form, [key]: value }));

    const credSaveMutation = useMutation({
        mutationFn: (payload) => saveMetaSettings(payload),
        onSuccess: () => {
            showToast("Meta credentials saved", "success");
            setCredForm(emptyCreds);
            queryClient.invalidateQueries({ queryKey: ["meta-ads"] });
        },
        onError: (error) => showToast(error.message || "Could not save credentials", "error"),
    });

    const handleCredSave = (e) => {
        e.preventDefault();
        const payload = {};
        if (credForm.metaAppId.trim() !== "") payload.metaAppId = credForm.metaAppId.trim();
        if (credForm.graphVersion.trim() !== "") payload.graphVersion = credForm.graphVersion.trim();
        // Blank → omitted → server retains the stored credential.
        if (credForm.accessToken !== "") payload.accessToken = credForm.accessToken;
        if (credForm.appSecret !== "") payload.appSecret = credForm.appSecret;
        if (credForm.webhookVerifyToken !== "") payload.webhookVerifyToken = credForm.webhookVerifyToken;
        if (Object.keys(payload).length === 0) {
            showToast("Nothing to save — leave a field blank to keep its saved value", "info");
            return;
        }
        credSaveMutation.mutate(payload);
    };

    // ---- Rotate / remove (Section E) ------------------------------------
    const [rotateField, setRotateField] = useState("accessToken");
    const [rotateValue, setRotateValue] = useState("");

    const rotateMutation = useMutation({
        mutationFn: (payload) => rotateMetaSecret(payload),
        onSuccess: () => {
            showToast("Credential rotated", "success");
            setRotateValue("");
            queryClient.invalidateQueries({ queryKey: ["meta-ads"] });
        },
        onError: (error) => showToast(error.message || "Could not rotate the credential", "error"),
    });

    const removeMutation = useMutation({
        mutationFn: (field) => removeMetaSecret(field),
        onSuccess: () => {
            showToast("Credential removed", "success");
            queryClient.invalidateQueries({ queryKey: ["meta-ads"] });
        },
        onError: (error) => showToast(error.message || "Could not remove the credential", "error"),
    });

    // In-page confirmation instead of window.confirm: an explicit second
    // click naming the credential (removal is irreversible until re-saved).
    const [confirmRemove, setConfirmRemove] = useState(null); // field being confirmed
    const handleRemove = (field) => {
        if (confirmRemove !== field) {
            setConfirmRemove(field);
            return;
        }
        setConfirmRemove(null);
        removeMutation.mutate(field);
    };

    // ---- Connection tests (Section D) -----------------------------------
    // Each result is the raw server envelope ({ ok, code, message, ... });
    // provider failures are HTTP 200 with ok:false (409 = not configured).
    const [testResults, setTestResults] = useState({});
    const runTest = async (key, fn) => {
        setTestResults((prev) => ({ ...prev, [key]: { pending: true } }));
        try {
            const data = await fn();
            setTestResults((prev) => ({ ...prev, [key]: data }));
        } catch (error) {
            setTestResults((prev) => ({
                ...prev,
                [key]: { ok: false, code: error.code || "REQUEST_FAILED", message: error.message },
            }));
        }
    };

    // "Subscribe webhook in Meta": an explicit write (app-level leadgen
    // subscription + selected Page subscriptions). The status shown afterwards
    // is Meta's read-back, not the write's own 200.
    const [subscribeState, setSubscribeState] = useState(null);
    const subscribeWebhook = async () => {
        setSubscribeState({ pending: true });
        try {
            const data = await subscribeMetaWebhook();
            setSubscribeState(data);
            if (data.ok) {
                showToast("Webhook subscribed in Meta", "success");
                setTestResults((prev) => ({ ...prev, webhook: data }));
            } else {
                showToast(data.message || "Meta did not confirm the subscription", "error");
            }
        } catch (error) {
            setSubscribeState({ ok: false, code: error.code || "REQUEST_FAILED", message: error.message });
            showToast(error.message || "Webhook subscription failed", "error");
        }
    };

    if (!canView) {
        return (
            <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
                    <AlertCircle size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">Meta connection settings are restricted</p>
                    <p className="text-sm text-gray-500 mt-1">Ask an administrator for marketing access.</p>
                </div>
            </div>
        );
    }

    const notice = oauthNotice ? OAUTH_NOTICES[oauthNotice] : null;
    const adItems = adAccountsQuery.data?.items || [];
    const pageItems = pagesQuery.data?.items || [];
    const igItems = instagramQuery.data?.items || [];

    // Category-specific hints: ads_read is only needed for ad accounts;
    // instagram_basic is only needed for Instagram accounts. One missing
    // permission must never disable unrelated discovery.
    const discoveryHint = (what) => {
        if (!statusData) return "Checking the connection…";
        const category = String(what || "").toLowerCase();
        if (category.includes("ad account") && statusData.adsReadMissing) {
            return "Connect Meta and grant ads_read permission to discover ad accounts.";
        }
        if (category.includes("instagram") && statusData.instagramBasicMissing) {
            return "Connect Meta and grant instagram_basic permission to discover Instagram accounts.";
        }
        return `Connect Meta to discover ${what}.`;
    };

    // "Assets discovered" summary for the Connection card — separate from
    // the Connected badge on purpose: connection health and discovery state
    // are different facts (discovery can succeed while permissions are
    // still being fixed, and vice versa). Counts come from the live queries
    // only — nothing here is ever fabricated.
    const discoverySummary = !discoveryEnabled
        ? "—"
        : adAccountsQuery.isPending || pagesQuery.isPending || instagramQuery.isPending
        ? "Discovering…"
        : [adAccountsQuery, pagesQuery, instagramQuery].some((query) => query.error)
        ? "Some lists failed — see the sections below"
        : `${adItems.length} ad accounts · ${pageItems.length} Pages · ${igItems.length} Instagram`;

    const listStates = (query) => {
        if (!discoveryEnabled) return "disabled";
        if (query.isPending) return "loading";
        if (query.error) return "error";
        return "ready";
    };

    const selectShown = (group, ids) =>
        setOverrides({
            ...selection,
            [group]: [...new Set([...selection[group], ...ids.map(String)])],
        });

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Megaphone size={22} className="text-purple-600" /> Meta Connection
                    </h1>
                    <p className="text-sm text-gray-500">
                        Connect the company&apos;s Meta account, pick the assets this workspace uses, and keep lead sync healthy.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {!canManage && (
                        <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full border bg-gray-100 text-gray-500 border-gray-200">
                            View only
                        </span>
                    )}
                    <Link
                        href="/dashboard/marketing/meta-ads"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        View reporting <ChevronRight size={14} />
                    </Link>
                </div>
            </div>

            {/* OAuth return banner (flag consumed + stripped above) */}
            {notice && (
                <div
                    className={`flex items-start gap-3 rounded-3xl border p-4 ${
                        notice.tone === "emerald"
                            ? "bg-emerald-50 border-emerald-200"
                            : notice.tone === "amber"
                            ? "bg-amber-50 border-amber-200"
                            : "bg-red-50 border-red-200"
                    }`}
                >
                    <notice.icon
                        size={18}
                        className={`mt-0.5 shrink-0 ${
                            notice.tone === "emerald"
                                ? "text-emerald-600"
                                : notice.tone === "amber"
                                ? "text-amber-600"
                                : "text-red-500"
                        }`}
                    />
                    <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">{notice.title}</p>
                        <p className="text-sm text-gray-600 mt-0.5">{notice.body}</p>
                    </div>
                    <button
                        onClick={() => setOauthNotice(null)}
                        className="text-xs font-bold text-gray-400 hover:text-gray-600"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Connection */}
            <SectionCard
                icon={PlugZap}
                title="Connection"
                subtitle="Status, token health and Meta permissions for this workspace."
                action={
                    statusData && (
                        <span
                            className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-full border ${
                                statusData.connected
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                        >
                            {statusData.connected ? "Connected" : REASON_LABELS[statusData.reason] || "Disconnected"}
                        </span>
                    )
                }
            >
                {statusQuery.isPending ? (
                    <div className="py-6 text-center text-gray-400">
                        <Loader2 size={22} className="animate-spin mx-auto mb-2" />
                        <p className="text-sm">Checking the Meta connection…</p>
                    </div>
                ) : statusQuery.error ? (
                    <ErrorBox error={statusQuery.error} onRetry={() => statusQuery.refetch()} />
                ) : statusData ? (
                    <div className="space-y-4">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            <div>
                                <dt className="text-[11px] font-black uppercase text-gray-400">Signed in as</dt>
                                <dd className="font-semibold text-gray-900">{statusData.user?.name || "—"}</dd>
                            </div>
                            <div>
                                <dt className="text-[11px] font-black uppercase text-gray-400">Ad account</dt>
                                <dd className="font-semibold text-gray-900">
                                    {statusData.adAccount
                                        ? `${statusData.adAccount.name || "Unnamed"}${isAdmin ? ` (${statusData.adAccount.id})` : ""}`
                                        : statusData.reason === "NO_AD_ACCOUNT_SELECTED"
                                        ? "None selected yet"
                                        : "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[11px] font-black uppercase text-gray-400">
                                    Assets discovered
                                </dt>
                                <dd className="font-semibold text-gray-900">{discoverySummary}</dd>
                            </div>
                            {isAdmin && (
                                <div>
                                    <dt className="text-[11px] font-black uppercase text-gray-400">Configuration source</dt>
                                    <dd className="font-semibold text-gray-900">
                                        {statusData.configSource === "db"
                                            ? "CRM settings (encrypted at rest)"
                                            : "Server environment (legacy)"}
                                    </dd>
                                </div>
                            )}
                            <div>
                                <dt className="text-[11px] font-black uppercase text-gray-400">Token expires</dt>
                                <dd
                                    className={`font-semibold ${
                                        statusData.tokenExpired ? "text-red-600" : "text-gray-900"
                                    }`}
                                >
                                    {statusData.tokenExpiresAt
                                        ? `${formatDateTime(statusData.tokenExpiresAt)}${statusData.tokenExpired ? " (expired)" : ""}`
                                        : "—"}
                                </dd>
                            </div>
                        </dl>

                        {statusData.reauthRequired && (
                            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-amber-800">
                                    Meta rejected the stored token — reconnect the account to restore reporting and lead sync.
                                </p>
                            </div>
                        )}

                        {statusData.reason === "NO_AD_ACCOUNT_SELECTED" && (
                            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-amber-800">
                                    Connected — no ad account selected yet. Page and Instagram discovery work
                                    without one; pick an ad account below to enable ad-account reporting and sync.
                                </p>
                            </div>
                        )}

                        {Array.isArray(statusData.missingPermissions) && statusData.missingPermissions.length > 0 && (
                            isAdmin ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                                    <p className="text-[11px] font-black uppercase text-red-600 mb-1.5">
                                        Required permissions missing
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {statusData.missingPermissions.map((permission) => (
                                            <span
                                                key={permission}
                                                className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-white border border-red-200 text-red-700"
                                            >
                                                {permission}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-xs text-red-600 mt-2">
                                        Action: open the Meta App Dashboard → Permissions and Features, grant the
                                        missing permissions, then reconnect the account. <strong>ads_read</strong>
                                        {" "}unlocks ad-account discovery; Page and Instagram discovery use their own
                                        permissions and keep working in the meantime.
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                                    <p className="text-sm font-semibold text-red-700">
                                        Some required Meta permissions are missing. An administrator must review the
                                        connection — reporting and lead sync may be limited until then.
                                    </p>
                                </div>
                            )
                        )}

                        {statusData.adsReadMissing && isAdmin && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <p className="text-[11px] font-black uppercase text-amber-700 mb-1.5">
                                    ads_read is not granted
                                </p>
                                <p className="text-sm text-amber-800">
                                    Ad-account discovery calls <code className="font-medium">me/adaccounts</code> and
                                    returns Meta error <strong>#200 (Missing Permissions)</strong> until{" "}
                                    <code className="font-medium">ads_read</code> is granted. If Meta shows it as
                                    “Pending App Review”, the permission cannot be used by non-test users yet — this is
                                    handled by Meta, not by the CRM. Reconnect after approval.
                                </p>
                            </div>
                        )}

                        {statusData.instagramBasicMissing && isAdmin && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <p className="text-[11px] font-black uppercase text-amber-700 mb-1.5">
                                    instagram_basic is not granted
                                </p>
                                <p className="text-sm text-amber-800">
                                    Instagram account discovery needs <code className="font-medium">instagram_basic</code>.
                                    Grant it in the Meta App Dashboard and reconnect Meta. Already-saved Instagram
                                    selections are kept and remain visible, but new accounts cannot be discovered
                                    until the permission is available.
                                </p>
                            </div>
                        )}

                        {Array.isArray(statusData.missingRecommendedPermissions) &&
                            statusData.missingRecommendedPermissions.length > 0 &&
                            isAdmin && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                    <p className="text-[11px] font-black uppercase text-amber-600 mb-1.5">
                                        Optional permissions not granted — Page/Instagram discovery may be limited
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {statusData.missingRecommendedPermissions.map((permission) => (
                                            <span
                                                key={permission}
                                                className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-white border border-amber-200 text-amber-700"
                                            >
                                                {permission}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                        {isAdmin &&
                            Array.isArray(statusData.grantedPermissions) && statusData.grantedPermissions.length > 0 && (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                                <p className="text-[11px] font-black uppercase text-emerald-600 mb-1.5">
                                    Granted permissions
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {statusData.grantedPermissions.map((permission) => (
                                        <span
                                            key={permission}
                                            className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-700"
                                        >
                                            {permission}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {canManage ? (
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={() => oauthMutation.mutate()}
                                    disabled={oauthMutation.isPending}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold disabled:opacity-60"
                                >
                                    {oauthMutation.isPending ? (
                                        <Loader2 size={15} className="animate-spin" />
                                    ) : (
                                        <PlugZap size={15} />
                                    )}
                                    {statusData.connected || settings?.source === "db"
                                        ? "Reconnect Meta"
                                        : "Connect Meta"}
                                </button>
                                {settings && settings.source === "env" && (
                                    <p className="text-xs text-gray-500">
                                        {isAdmin
                                            ? "Connecting stores the connection in the CRM (encrypted). After that, the legacy environment configuration stops being used for this workspace."
                                            : "Connecting Meta saves the connection securely in the CRM."}
                                    </p>
                                )}
                                <ErrorBox error={oauthMutation.error} />
                            </div>
                        ) : (
                            <p className="text-xs text-gray-500">
                                View-only access — ask an administrator to change or reconnect the Meta account.
                            </p>
                        )}
                    </div>
                ) : null}
            </SectionCard>

            {/* Advanced configuration — administrators only (App credentials,
                webhook, connection diagnostics, credential management). Client
                users get business settings below without any technical detail. */}
            {!isAdmin && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 flex items-start gap-3">
                    <ShieldCheck size={18} className="text-purple-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-gray-900">Advanced configuration</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                            App credentials, webhook setup and connection diagnostics are managed by administrators.
                            Everything you need to run your campaigns is on this page.
                        </p>
                    </div>
                </div>
            )}

            {/* Section A: Meta App Credentials */}
            {isAdmin && (
            <SectionCard
                icon={KeyRound}
                title="Meta App credentials"
                subtitle="App ID, App Secret, Access Token and Graph API version — stored encrypted (AES-256-GCM), never returned by the API."
                action={
                    settings && (
                        <span
                            className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-full border ${
                                settings.source === "db"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : "bg-gray-100 text-gray-500 border-gray-200"
                            }`}
                        >
                            {settings.source === "db" ? "CRM managed" : "Environment (legacy)"}
                        </span>
                    )
                }
            >
                {(
                    <form onSubmit={handleCredSave} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className={labelClass}>Meta App ID</label>
                                <input
                                    value={credForm.metaAppId}
                                    onChange={(e) => setCred("metaAppId")(e.target.value)}
                                    inputMode="numeric"
                                    placeholder={settings?.metaAppId || "e.g. 1547702967068886"}
                                    className={inputClass}
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Public OAuth identifier — shown as saved: {settings?.metaAppId || "not set"}.
                                </p>
                            </div>
                            <div>
                                <label className={labelClass}>Graph API version</label>
                                <input
                                    value={credForm.graphVersion}
                                    onChange={(e) => setCred("graphVersion")(e.target.value)}
                                    placeholder={settings?.graphVersion || "v22.0"}
                                    className={inputClass}
                                />
                            </div>
                            <SecretInput
                                label="App Secret"
                                saved={!!settings?.hasAppSecret}
                                value={credForm.appSecret}
                                onChange={setCred("appSecret")}
                                placeholder="Paste the Meta App Secret"
                                disabled={credSaveMutation.isPending}
                                hint="Also used for webhook signature (HMAC-SHA256) verification."
                            />
                            <SecretInput
                                label="Access Token"
                                saved={!!settings?.hasAccessToken}
                                value={credForm.accessToken}
                                onChange={setCred("accessToken")}
                                placeholder="Paste a long-lived Meta access token"
                                disabled={credSaveMutation.isPending}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={credSaveMutation.isPending}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold disabled:opacity-60"
                            >
                                {credSaveMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                Save credentials
                            </button>
                            <p className="text-xs text-gray-500">
                                Blank fields keep the saved values. Secrets are encrypted with META_ADS_SETTINGS_KEY on the
                                server and are never readable here.
                            </p>
                        </div>
                        <ErrorBox error={credSaveMutation.error} />
                    </form>
                )}
            </SectionCard>
            )}

            {/* Section A2: OAuth configuration diagnostic (admin-only).
                Shows the exact values to register in the Meta Developer
                Console (App Domains + Valid OAuth Redirect URIs) and flags
                internal inconsistencies. URLs only — no secrets. */}
            {isAdmin && (
            <SectionCard
                icon={Link2}
                title="OAuth configuration diagnostic"
                subtitle="Exact values to register in the Meta Developer Console. Read-only — SpaceEzy never changes these automatically."
                action={
                    oauthDiagQuery.data && (
                        <span
                            className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-full border ${
                                oauthDiagQuery.data.consistent
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                        >
                            {oauthDiagQuery.data.consistent ? "Internally consistent" : "Needs review"}
                        </span>
                    )
                }
            >
                {oauthDiagQuery.isLoading ? (
                    <p className="text-sm text-gray-500 flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Loading diagnostics…
                    </p>
                ) : oauthDiagQuery.error ? (
                    <ErrorBox error={oauthDiagQuery.error} onRetry={() => oauthDiagQuery.refetch()} />
                ) : oauthDiagQuery.data ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                                ["App Domain", oauthDiagQuery.data.appDomain, "Meta app → Settings → Basic → App Domains"],
                                ["OAuth Redirect URI", oauthDiagQuery.data.oauthRedirectUri, "Facebook Login → Settings → Valid OAuth Redirect URIs"],
                                ["FB Login for Business Config ID", oauthDiagQuery.data.oauthConfigId, "Server env META_OAUTH_CONFIG_ID (public — it appears in the authorize URL)"],
                                ["Frontend URL", oauthDiagQuery.data.frontendUrl, "Public origin of this app"],
                                ["Backend URL", oauthDiagQuery.data.backendUrl, "Origin the redirect_uri is built from"],
                            ].map(([label, value, hint]) => (
                                <div key={label}>
                                    <label className={labelClass}>{label}</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            readOnly
                                            value={value || "Not configured"}
                                            onFocus={(e) => e.target.select()}
                                            className={`${inputClass} font-mono text-xs`}
                                        />
                                        {value && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard?.writeText(value);
                                                    showToast(`${label} copied`, "success");
                                                }}
                                                className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 shrink-0"
                                                title={`Copy ${label}`}
                                            >
                                                <Copy size={15} />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-1">{hint}</p>
                                </div>
                            ))}
                        </div>

                        {!oauthDiagQuery.data.consistent && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <p className="text-sm font-bold text-amber-800 mb-1 flex items-center gap-2">
                                    <AlertTriangle size={15} className="shrink-0" /> Configuration issues
                                </p>
                                <ul className="list-disc pl-5 space-y-0.5 text-sm text-amber-800">
                                    {oauthDiagQuery.data.issues.map((issue) => (
                                        <li key={issue}>{issue}</li>
                                    ))}
                                </ul>
                                <p className="text-[11px] text-amber-700 mt-2">
                                    Fix these in the server environment (BACKEND_URL / FRONTEND_URL). SpaceEzy will not
                                    change production URLs for you.
                                </p>
                            </div>
                        )}
                    </div>
                ) : null}
            </SectionCard>
            )}

            {/* Section B: Webhook Configuration */}
            {isAdmin && (
            <SectionCard
                icon={Webhook}
                title="Webhook configuration"
                subtitle="Verify token, signature secret and the leadgen callback Meta delivers to."
            >
                <div className="space-y-4">
                    <div>
                        <label className={labelClass}>Webhook callback URL (read-only)</label>
                        <div className="flex items-center gap-2">
                            <input
                                readOnly
                                value={settings?.webhookCallbackUrl || "BACKEND_URL is not configured"}
                                onFocus={(e) => e.target.select()}
                                className={`${inputClass} font-mono text-xs`}
                            />
                            {settings?.webhookCallbackUrl && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard?.writeText(settings.webhookCallbackUrl);
                                        showToast("Callback URL copied", "success");
                                    }}
                                    className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 shrink-0"
                                    title="Copy callback URL"
                                >
                                    <Copy size={15} />
                                </button>
                            )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">
                            Generated from the server&apos;s BACKEND_URL — paste it into the Meta app&apos;s webhook settings.
                        </p>
                    </div>

                    {isAdmin ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <SecretInput
                                label="Webhook verify token"
                                saved={!!settings?.hasWebhookVerifyToken}
                                value={credForm.webhookVerifyToken}
                                onChange={setCred("webhookVerifyToken")}
                                placeholder="Create a random verification string"
                                disabled={credSaveMutation.isPending}
                                hint="Meta echoes this on the GET verification handshake."
                            />
                            <div>
                                <label className={labelClass}>App Secret for signatures</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        readOnly
                                        value={settings?.hasAppSecret ? "Saved (encrypted)" : "Not set"}
                                        className={`${inputClass} font-semibold`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRotateField("appSecret");
                                            document.getElementById("meta-rotate-panel")?.scrollIntoView({ behavior: "smooth" });
                                        }}
                                        className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 shrink-0"
                                    >
                                        Rotate
                                    </button>
                                </div>
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Shared with Section A — the stored value signs inbound webhook payloads.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            <div>
                                <dt className="text-[11px] font-black uppercase text-gray-400">Verify token</dt>
                                <dd className="font-semibold text-gray-900">
                                    {settings?.hasWebhookVerifyToken ? "Saved (encrypted)" : "Not set"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[11px] font-black uppercase text-gray-400">Signature secret</dt>
                                <dd className="font-semibold text-gray-900">
                                    {settings?.hasAppSecret ? "Saved (encrypted)" : "Not set"}
                                </dd>
                            </div>
                        </div>
                    )}

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm">
                        <p className="text-[11px] font-black uppercase text-gray-400 mb-1">Subscription status</p>
                        {testResults.webhook?.pending ? (
                            <p className="text-gray-500">Checking…</p>
                        ) : testResults.webhook?.subscription ? (
                            <>
                                <p className="font-semibold text-gray-900">
                                    {testResults.webhook.subscription.status === "active"
                                        ? "Active — Meta reports an active leadgen subscription for this callback."
                                        : testResults.webhook.subscription.status === "not_subscribed"
                                        ? "Not subscribed — Meta has no leadgen webhook registered for this app."
                                        : testResults.webhook.subscription.status === "callback_mismatch"
                                        ? "Subscribed, but Meta delivers to a different callback URL."
                                        : testResults.webhook.subscription.status === "inactive"
                                        ? "Registered but inactive in Meta — re-subscribe to reactivate it."
                                        : testResults.webhook.subscription.reason || "Not verifiable from the CRM."}
                                </p>
                                {testResults.webhook.subscription.status === "callback_mismatch"
                                    && testResults.webhook.subscription.metaCallbackUrl && (
                                    <p className="text-xs text-gray-500 mt-1 font-mono break-all">
                                        Meta callback: {testResults.webhook.subscription.metaCallbackUrl}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="text-gray-500">
                                Run &quot;Test webhook&quot; in Connection testing to check the subscription with Meta.
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={subscribeWebhook}
                            disabled={!!subscribeState?.pending}
                            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 disabled:opacity-50"
                        >
                            {subscribeState?.pending ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Webhook size={14} />
                            )}
                            Subscribe webhook in Meta
                        </button>
                        <p className="text-[11px] text-gray-500 mt-1">
                            Registers the leadgen webhook and subscribes the selected Pages — the same change as
                            Meta&apos;s App Dashboard → Webhooks → Page → leadgen, done from here.
                        </p>
                        {subscribeState && !subscribeState.pending && (
                            <div className="mt-2">
                                <p className={`text-xs font-semibold ${subscribeState.ok ? "text-emerald-700" : "text-red-600"}`}>
                                    {subscribeState.message || (subscribeState.ok ? "Subscribed" : "Subscription failed")}
                                </p>
                                {Array.isArray(subscribeState.pages) && subscribeState.pages.some((page) => !page.ok) && (
                                    <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                                        {subscribeState.pages.filter((page) => !page.ok).map((page, index) => (
                                            <li key={`${page.pageId || "none"}-${index}`}>
                                                {page.pageId ? `Page ${page.pageId}: ` : ""}
                                                {page.message || "not subscribed"}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </SectionCard>
            )}

            {/* Section D: Connection testing */}
            {isAdmin && (
            <SectionCard
                icon={Activity}
                title="Connection testing"
                subtitle="Verify the stored credentials against Meta without changing anything."
            >
                {!isAdmin ? (
                    <p className="text-sm text-gray-500">
                        View-only access — ask an administrator to run connection tests.
                    </p>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            {[
                                ["connection", "Test Meta API connection", testMetaConnection],
                                ["token", "Test access token", testMetaToken],
                                ["permissions", "Check permissions", testMetaPermissions],
                                ["webhook", "Test webhook", testMetaWebhook],
                            ].map(([key, label, fn]) => (
                                <button
                                    key={key}
                                    onClick={() => runTest(key, fn)}
                                    disabled={!!testResults[key]?.pending}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    {testResults[key]?.pending ? (
                                        <Loader2 size={15} className="animate-spin" />
                                    ) : (
                                        <Activity size={15} />
                                    )}
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="space-y-3">
                            {["connection", "token", "permissions", "webhook"].map((key) => (
                                <div key={key}>
                                    <p className="text-[11px] font-black uppercase text-gray-400 mb-1">
                                        {{
                                            connection: "Meta API connection",
                                            token: "Access token",
                                            permissions: "Permissions",
                                            webhook: "Webhook configuration",
                                        }[key]}
                                    </p>
                                    <TestResult result={testResults[key]} />
                                </div>
                            ))}
                            {!Object.keys(testResults).length && (
                                <p className="text-xs text-gray-500">
                                    No tests run yet. Each test only reads state — nothing is published or spent.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </SectionCard>
            )}

            {/* Section E: Credential management */}
            {isAdmin && (
            <SectionCard
                icon={ShieldCheck}
                title="Credential management"
                subtitle="Rotate or remove individual stored credentials. Removal is explicit and confirmed."
            >
                {!isAdmin ? (
                    <p className="text-sm text-gray-500">
                        View-only access — ask an administrator to rotate or remove credentials.
                    </p>
                ) : (
                    <div className="space-y-5">
                        {/* Stored credential list */}
                        <div className="grid gap-2">
                            {[
                                ["accessToken", "Access Token", settings?.hasAccessToken],
                                ["appSecret", "App Secret", settings?.hasAppSecret],
                                ["webhookVerifyToken", "Webhook Verify Token", settings?.hasWebhookVerifyToken],
                            ].map(([field, label, saved]) => (
                                <div
                                    key={field}
                                    className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-gray-200"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-900">{label}</p>
                                        <p className="text-xs text-gray-500">
                                            {saved ? "Stored encrypted in the CRM" : "Not stored — configure it to use this feature"}
                                        </p>
                                    </div>
                                    <span
                                        className={`text-[11px] font-black uppercase px-2.5 py-1 rounded-full border ${
                                            saved
                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                : "bg-gray-100 text-gray-400 border-gray-200"
                                        }`}
                                    >
                                        {saved ? "Saved" : "Not set"}
                                    </span>
                                    <button
                                        onClick={() => handleRemove(field)}
                                        disabled={!saved || removeMutation.isPending}
                                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold disabled:opacity-40 ${
                                            confirmRemove === field
                                                ? "border-red-300 bg-red-50 text-red-600"
                                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                                        }`}
                                    >
                                        <Trash2 size={13} />
                                        {confirmRemove === field ? `Confirm remove ${label}?` : "Remove"}
                                    </button>
                                </div>
                            ))}
                        </div>
                        {confirmRemove && (
                            <p className="text-xs text-red-600">
                                Click the highlighted Confirm button again to remove this credential permanently, or
                                choose another action to cancel.
                            </p>
                        )}

                        {/* Rotate panel */}
                        <div id="meta-rotate-panel" className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                            <p className="text-[11px] font-black uppercase text-gray-400">Rotate a credential</p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <select
                                    value={rotateField}
                                    onChange={(e) => setRotateField(e.target.value)}
                                    className={`${inputClass} sm:w-56`}
                                >
                                    <option value="accessToken">Access Token</option>
                                    <option value="appSecret">App Secret</option>
                                    <option value="webhookVerifyToken">Webhook Verify Token</option>
                                </select>
                                <input
                                    type="password"
                                    value={rotateValue}
                                    onChange={(e) => setRotateValue(e.target.value)}
                                    placeholder="Enter the new value"
                                    autoComplete="new-password"
                                    className={`${inputClass} flex-1`}
                                />
                                <button
                                    onClick={() =>
                                        rotateMutation.mutate({ field: rotateField, value: rotateValue.trim() })
                                    }
                                    disabled={rotateMutation.isPending || rotateValue.trim() === ""}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold disabled:opacity-50 shrink-0"
                                >
                                    {rotateMutation.isPending ? (
                                        <Loader2 size={15} className="animate-spin" />
                                    ) : (
                                        <RefreshCw size={15} />
                                    )}
                                    Rotate
                                </button>
                            </div>
                            <p className="text-xs text-gray-500">
                                Rotation replaces the stored value immediately and is recorded in the audit log (field
                                name only — never the value).
                            </p>
                            <ErrorBox error={rotateMutation.error} />
                            <ErrorBox error={removeMutation.error} />
                        </div>

                        {/* Reconnect */}
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={() => oauthMutation.mutate()}
                                disabled={oauthMutation.isPending}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                            >
                                {oauthMutation.isPending ? (
                                    <Loader2 size={15} className="animate-spin" />
                                ) : (
                                    <PlugZap size={15} />
                                )}
                                Reconnect Meta account
                            </button>
                            <p className="text-xs text-gray-500 max-w-md">
                                Reconnecting refreshes the Access Token through Meta&apos;s OAuth dialog — the exchanged
                                token is stored encrypted before it reaches this page.
                            </p>
                        </div>
                    </div>
                )}
            </SectionCard>
            )}

            {/* Ad accounts multi-select */}
            <SectionCard
                icon={Layers}
                title="Ad accounts"
                subtitle="Which Meta ad accounts this workspace reports on."
                action={
                    canManage &&
                    listStates(adAccountsQuery) === "ready" &&
                    adItems.length > 0 && (
                        <div className="flex items-center gap-3 text-xs">
                            <button
                                onClick={() => selectShown("adAccounts", adItems.map((item) => normalizeId(item.id)))}
                                className="font-bold text-purple-600 hover:underline"
                            >
                                Select shown
                            </button>
                            <button
                                onClick={() => setSelected("adAccounts", [])}
                                className="font-bold text-gray-400 hover:underline"
                            >
                                Clear
                            </button>
                        </div>
                    )
                }
            >
                {listStates(adAccountsQuery) === "disabled" ? (
                    <p className="text-sm text-gray-500">{discoveryHint("ad accounts")}</p>
                ) : listStates(adAccountsQuery) === "loading" ? (
                    <div className="py-6 text-center text-gray-400">
                        <Loader2 size={20} className="animate-spin mx-auto" />
                    </div>
                ) : listStates(adAccountsQuery) === "error" ? (
                    <ErrorBox error={adAccountsQuery.error} onRetry={() => adAccountsQuery.refetch()} />
                ) : adItems.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        No ad accounts are visible to this connection. Check that the token holder has access to
                        the ad account in Meta Business Manager.
                    </p>
                ) : (
                    <div className="space-y-3">
                        <div className="grid gap-2">
                            {adItems.map((item) => {
                                const id = normalizeId(item.id);
                                return (
                                    <CheckRow
                                        key={id}
                                        checked={selection.adAccounts.includes(id)}
                                        disabled={!canManage}
                                        onChange={() => toggleId("adAccounts", id)}
                                        title={item.name || id}
                                        meta={[
                                            item.currency,
                                            item.status === 1
                                                ? "Active"
                                                : item.status != null && isAdmin
                                                ? `Status ${item.status}`
                                                : null,
                                            isAdmin ? `ID ${id}` : null,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    />
                                );
                            })}
                        </div>
                        <Pager
                            hasPrev={adCursorStack.length > 0}
                            hasNext={!!adAccountsQuery.data?.paging?.cursors?.after}
                            onPrev={() => setAdCursorStack((stack) => stack.slice(0, -1))}
                            onNext={() => {
                                const next = adAccountsQuery.data?.paging?.cursors?.after;
                                if (next) setAdCursorStack((stack) => [...stack, next]);
                            }}
                            loading={adAccountsQuery.isFetching}
                            label={`${adItems.length} shown${
                                selection.adAccounts.length > 0
                                    ? ` · ${selection.adAccounts.length} selected in total`
                                    : ""
                            }`}
                        />
                    </div>
                )}
            </SectionCard>

            {/* Pages multi-select */}
            <SectionCard
                icon={Globe}
                title="Facebook Pages"
                subtitle="Leads are accepted only from the selected Pages (multi-Page webhook allow-list)."
                action={
                    canManage &&
                    listStates(pagesQuery) === "ready" &&
                    pageItems.length > 0 && (
                        <div className="flex items-center gap-3 text-xs">
                            <button
                                onClick={() => selectShown("pages", pageItems.map((item) => item.id))}
                                className="font-bold text-purple-600 hover:underline"
                            >
                                Select shown
                            </button>
                            <button
                                onClick={() => setSelected("pages", [])}
                                className="font-bold text-gray-400 hover:underline"
                            >
                                Clear
                            </button>
                        </div>
                    )
                }
            >
                {listStates(pagesQuery) === "disabled" ? (
                    <p className="text-sm text-gray-500">{discoveryHint("Facebook Pages")}</p>
                ) : listStates(pagesQuery) === "loading" ? (
                    <div className="py-6 text-center text-gray-400">
                        <Loader2 size={20} className="animate-spin mx-auto" />
                    </div>
                ) : listStates(pagesQuery) === "error" ? (
                    <ErrorBox error={pagesQuery.error} onRetry={() => pagesQuery.refetch()} />
                ) : pageItems.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        No Pages are visible to this connection.
                        {isAdmin
                            ? " The Pages_show_list permission and page admin access in Meta Business Manager are required."
                            : " An administrator must grant Page access in Meta Business Manager."}
                    </p>
                ) : (
                    <div className="space-y-3">
                        <div className="grid gap-2">
                            {pageItems.map((item) => (
                                <CheckRow
                                    key={item.id}
                                    checked={selection.pages.includes(String(item.id))}
                                    disabled={!canManage}
                                    onChange={() => toggleId("pages", item.id)}
                                    title={item.name || `Page ${item.id}`}
                                    meta={[item.category, isAdmin ? `ID ${item.id}` : null].filter(Boolean).join(" · ")}
                                />
                            ))}
                        </div>
                        <Pager
                            hasPrev={pageCursorStack.length > 0}
                            hasNext={!!pagesQuery.data?.paging?.cursors?.after}
                            onPrev={() => setPageCursorStack((stack) => stack.slice(0, -1))}
                            onNext={() => {
                                const next = pagesQuery.data?.paging?.cursors?.after;
                                if (next) setPageCursorStack((stack) => [...stack, next]);
                            }}
                            loading={pagesQuery.isFetching}
                            label={`${pageItems.length} shown${
                                selection.pages.length > 0
                                    ? ` · ${selection.pages.length} selected in total`
                                    : ""
                            }`}
                        />
                    </div>
                )}
            </SectionCard>

            {/* Instagram multi-select */}
            <SectionCard
                icon={AtSign}
                title="Instagram accounts"
                subtitle="Instagram professional accounts assigned to this connection and linked to your Pages — reported exactly as Meta returns them."
            >
                {listStates(instagramQuery) === "disabled" ? (
                    <p className="text-sm text-gray-500">{discoveryHint("Instagram accounts")}</p>
                ) : listStates(instagramQuery) === "loading" ? (
                    <div className="py-6 text-center text-gray-400">
                        <Loader2 size={20} className="animate-spin mx-auto" />
                    </div>
                ) : listStates(instagramQuery) === "error" ? (
                    <ErrorBox error={instagramQuery.error} onRetry={() => instagramQuery.refetch()} />
                ) : (
                    <div className="space-y-3">
                        {statusData.instagramBasicMissing && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <p className="text-sm font-semibold text-amber-800">
                                    instagram_basic is not granted for this connection.
                                </p>
                                <p className="text-xs text-amber-700 mt-1">
                                    {isAdmin
                                        ? "Grant instagram_basic in the Meta App Dashboard, then reconnect Meta. Saved selections remain visible, but new Instagram accounts cannot be discovered or selected."
                                        : "An administrator must grant instagram_basic and reconnect Meta."}
                                </p>
                            </div>
                        )}
                        {igItems.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                No Instagram accounts are visible to this connection. Check that the token holder has an
                                Instagram professional account assigned in Meta Business Manager.
                            </p>
                        ) : (
                            <>
                                <div className="grid gap-2">
                                    {igItems.map((item) => {
                                        const id = item.instagramAccountId;
                                        const selectable = !!id;
                                        return (
                                            <CheckRow
                                                key={`${item.pageId || "assigned"}-${id || "none"}`}
                                                checked={selectable && selection.instagram.includes(String(id))}
                                                disabled={!canManage || !selectable}
                                                onChange={() => toggleId("instagram", id)}
                                                title={
                                                    selectable
                                                        ? `@${item.username || item.name || id}`
                                                        : `${item.pageName || `Page ${item.pageId}`} — no Instagram linked`
                                                }
                                                meta={
                                                    selectable
                                                        ? item.pageId
                                                            ? `Page: ${item.pageName || item.pageId}`
                                                            : "Shared directly at connection"
                                                        : `Page: ${item.pageName || item.pageId}${isAdmin ? ` · ID ${item.pageId}` : ""}`
                                                }
                                                hint={
                                                    !selectable
                                                        ? item.reason === "NOT_CONNECTED"
                                                            ? "Not connected to an Instagram professional account"
                                                            : isAdmin
                                                            ? `Unavailable (${item.reason || "unknown reason"})`
                                                            : "Not available for this Page"
                                                        : null
                                                }
                                            />
                                        );
                                    })}
                                </div>
                                <Pager
                                    hasPrev={igCursorStack.length > 0}
                                    hasNext={!!instagramQuery.data?.paging?.cursors?.after}
                                    onPrev={() => setIgCursorStack((stack) => stack.slice(0, -1))}
                                    onNext={() => {
                                        const next = instagramQuery.data?.paging?.cursors?.after;
                                        if (next) setIgCursorStack((stack) => [...stack, next]);
                                    }}
                                    loading={instagramQuery.isFetching}
                                    label={`${igItems.length} shown${
                                        selection.instagram.length > 0
                                            ? ` · ${selection.instagram.length} selected in total`
                                            : ""
                                    }`}
                                />
                            </>
                        )}
                    </div>
                )}
            </SectionCard>

            {/* Save bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
                <p className="text-sm text-gray-500">
                    {!canManage
                        ? "View-only access — your role cannot change these selections."
                        : settingsQuery.isPending
                        ? "Loading saved selections…"
                        : dirty
                        ? "You have unsaved selections."
                        : "Selections are saved."}
                </p>
                {canManage && (
                    <div className="flex items-center gap-2">
                        {dirty && (
                            <button
                                onClick={() => setOverrides(null)}
                                disabled={saveMutation.isPending}
                                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Discard
                            </button>
                        )}
                        <button
                            onClick={() =>
                                saveMutation.mutate({
                                    selectedAdAccountIds: selection.adAccounts,
                                    pageIds: selection.pages,
                                    instagramAccountIds: selection.instagram,
                                })
                            }
                            disabled={!dirty || saveMutation.isPending}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 disabled:opacity-50"
                        >
                            {saveMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                            Save selections
                        </button>
                    </div>
                )}
                {saveMutation.error && (
                    <p className="w-full text-sm text-red-600">{saveMutation.error.message}</p>
                )}
            </div>

            {/* Sync */}
            <SectionCard
                icon={RefreshCw}
                title="Sync & refresh"
                subtitle="Re-read ad accounts, Pages and Instagram connections from Meta."
                action={
                    canManage && (
                        <button
                            onClick={() => syncMutation.mutate()}
                            disabled={syncMutation.isPending || !discoveryEnabled}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            {syncMutation.isPending ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : (
                                <RefreshCw size={15} />
                            )}
                            {syncMutation.isPending ? "Syncing…" : "Refresh now"}
                        </button>
                    )
                }
            >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                        <p className="text-[11px] font-black uppercase text-gray-400">Last sync</p>
                        <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                            <Clock3 size={13} className="text-gray-400" />
                            {settingsQuery.isPending ? "…" : formatDateTime(settings?.syncedAt)}
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] font-black uppercase text-gray-400">Configuration</p>
                        <p className="font-semibold text-gray-900">
                            {settingsQuery.isPending
                                ? "…"
                                : settings?.source === "db"
                                ? "Saved in the CRM"
                                : isAdmin
                                ? "Server environment (legacy)"
                                : "Saved in the CRM"}
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] font-black uppercase text-gray-400">Connection</p>
                        <p className="font-semibold text-gray-900">
                            {statusQuery.isPending
                                ? "…"
                                : statusData?.connected
                                ? statusData?.reason === "NO_AD_ACCOUNT_SELECTED"
                                    ? "Connected · no ad account"
                                    : "Connected"
                                : REASON_LABELS[statusData?.reason] || "Disconnected"}
                        </p>
                    </div>
                </div>

                {settings && settings.source === "env" && (
                    <p className="text-xs text-gray-500">
                        {isAdmin
                            ? "Environment-managed connection — sync timestamps start being recorded once you connect through this page."
                            : "Sync timestamps start being recorded once you connect Meta through this page."}
                    </p>
                )}
                {!discoveryEnabled && (
                    <p className="text-xs text-gray-500">
                        Connect Meta first — syncing needs a working connection.
                    </p>
                )}
                <ErrorBox error={syncMutation.error} />
                <SyncResultPanel result={lastSyncResult} formatTime={formatDateTime} />
            </SectionCard>
        </div>
    );
}

export default function MetaAdsSettingsPage() {
    return (
        <Suspense
            fallback={
                <div className="flex flex-col h-full items-center justify-center bg-gray-50/50 p-8">
                    <Loader2 size={24} className="animate-spin text-purple-600 mb-2" />
                    <p className="text-sm font-medium text-gray-500">Loading Meta connection settings…</p>
                </div>
            }
        >
            <MetaAdsSettingsContent />
        </Suspense>
    );
}
