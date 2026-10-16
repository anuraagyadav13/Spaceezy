"use client";
import { useState } from "react";
import { Plug, Phone, MessageSquare, Database, ShieldCheck, ShieldAlert, Save, RefreshCw, Trash2, KeyRound, Send } from "lucide-react";
import { useTelephonyStatus } from "../../../../features/communication/hooks/useCommunication";
import {
    useWhatsAppStatus,
    useWhatsappSettings,
    useSaveWhatsappSettings,
    useRotateWhatsappSecret,
    useRemoveWhatsappSecret,
    useTestWhatsappConnection,
    useTemplateLibrary,
    useWhatsAppTemplates,
    useLatestNotification,
    useTestNotify
} from "../../../../features/communication/hooks/useWhatsApp";
import { usePermissions } from "../../../../features/auth/hooks/usePermissions";
import { showToast } from "../../../../lib/toast";

const inputClass = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500";
const labelClass = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1";

const emptyForm = () => ({
    appId: "", wabaId: "", phoneNumberId: "", graphVersion: "", providerMode: "mock",
    accessToken: "", appSecret: "", verifyToken: "",
    notifyEnabled: false, notifyRecipients: [{ phone: "", label: "", enabled: true }], notifyTemplateName: "",
});

// Single source of truth for every WhatsApp status indicator on this page.
// Green "Connected" is reachable ONLY through a successful connection test in
// this session — never from saved values or environment flags alone.
const resolveConnectionState = ({ settings, status, testOk }) => {
    if (testOk) return { tone: "ok", label: "Connected" };
    const row = settings && settings.configured ? settings : null;
    const effective = row
        ? { mode: row.providerMode, creds: Boolean(row.hasAccessToken && row.phoneNumberId) }
        : (status?.configured
            ? { mode: status.simulated ? "mock" : "meta", creds: true }
            : { mode: null, creds: false });
    if (effective.mode === "meta" && effective.creds) return { tone: "warn", label: "meta · Untested" };
    if (effective.mode === "mock") return { tone: "warn", label: "mock · Simulated" };
    return { tone: "off", label: "Not configured" };
};

const StatusBadge = ({ tone, children }) => {
    const tones = {
        ok: "bg-emerald-50 text-emerald-700 border-emerald-100",
        warn: "bg-amber-50 text-amber-700 border-amber-100",
        off: "bg-red-50 text-red-700 border-red-100",
        info: "bg-blue-50 text-blue-700 border-blue-100"
    };
    return (
        <span className={`inline-flex items-center gap-1 border font-bold px-2.5 py-0.5 rounded text-[10px] ${tones[tone] || tones.info}`}>
            {tone === "ok" ? <ShieldCheck size={10} /> : tone === "off" ? <ShieldAlert size={10} /> : null}
            {children}
        </span>
    );
};

export default function IntegrationsPage() {
    const { data: telephony, isLoading: telephonyLoading } = useTelephonyStatus();
    const { data: whatsapp, isLoading: whatsappLoading } = useWhatsAppStatus();
    const { hasRole } = usePermissions();
    const isAdmin = hasRole(["SUPER_ADMIN", "ADMIN"]);
    const { data: settings } = useWhatsappSettings({ enabled: isAdmin });
    // Connection-test outcome lives here so every badge on the page derives
    // green "Connected" from the same verified result.
    const [testResult, setTestResult] = useState(null);
    const connection = resolveConnectionState({ settings, status: whatsapp, testOk: testResult?.ok === true });

    const telephonyBadge = telephonyLoading
        ? <StatusBadge tone="info">Checking...</StatusBadge>
        : !telephony
            ? <StatusBadge tone="off">Status unavailable</StatusBadge>
            : telephony.configured
                ? (
                    <StatusBadge tone={telephony.simulated ? "warn" : "ok"}>
                        {telephony.provider} · {telephony.simulated ? "Simulated (demo calls)" : "Connected"}
                    </StatusBadge>
                )
                : <StatusBadge tone="off">Not configured</StatusBadge>;

    const whatsappBadge = whatsappLoading
        ? <StatusBadge tone="info">Checking...</StatusBadge>
        : !whatsapp && !(settings && settings.configured)
            ? <StatusBadge tone="off">Status unavailable</StatusBadge>
            : <StatusBadge tone={connection.tone}>{connection.label}</StatusBadge>;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Integrations &amp; Telephony Provider Status</h1>
                <p className="text-sm text-gray-500">
                    Live provider status from the backend. Unconfigured integrations surface honest
                    &quot;not configured&quot; errors — never fake success.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                    <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                        <Phone size={20} />
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">Telephony Provider</h3>
                    <p className="text-xs text-gray-500">
                        CRM-initiated outbound calls via business number
                        {telephony?.businessNumber ? ` (${telephony.businessNumber})` : ""}
                    </p>
                    {telephonyBadge}
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                    <div className="w-10 h-10 rounded-2xl bg-green-100 text-green-600 flex items-center justify-center font-bold">
                        <MessageSquare size={20} />
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">WhatsApp Business API</h3>
                    <p className="text-xs text-gray-500">
                        Official Business API: conversations, HSM templates, signed webhooks
                    </p>
                    {whatsappBadge}
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                        <Database size={20} />
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">Express &amp; PostgreSQL API</h3>
                    <p className="text-xs text-gray-500">Prisma ORM with migration-managed schema</p>
                    <StatusBadge tone="ok">Connected</StatusBadge>
                </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                    <Plug size={14} /> Provider selection
                </h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                    Providers are selected with environment variables on the server
                    (<code className="bg-gray-100 px-1 rounded">TELEPHONY_PROVIDER</code> and{" "}
                    <code className="bg-gray-100 px-1 rounded">WHATSAPP_PROVIDER</code>, each{" "}
                    <code className="bg-gray-100 px-1 rounded">none | mock | generic | meta</code>).
                    A saved Meta WhatsApp configuration below overrides the environment default for
                    sending and webhooks; without one, the environment behavior applies. Secrets stay
                    server-side; the <code className="bg-gray-100 px-1 rounded">generic</code>{" "}
                    adapter sends traffic to any endpoint honoring the documented REST contract.
                    Webhooks are verified with HMAC-SHA256 signatures and are idempotent.
                    A green Connected badge appears only after a successful Test Connection in this session.
                </p>
            </div>

            {isAdmin && <WhatsappSettingsCard testResult={testResult} setTestResult={setTestResult} connection={connection} />}
        </div>
    );
}

const SECRET_FIELDS = [
    { key: "accessToken", label: "Access token", flag: "hasAccessToken" },
    { key: "appSecret", label: "Meta App Secret", flag: "hasAppSecret" },
    { key: "verifyToken", label: "Webhook verification token", flag: "hasVerifyToken" },
];

function WhatsappSettingsCard({ testResult, setTestResult, connection }) {
    const { data: settings, isLoading, isError, refetch } = useWhatsappSettings();
    const saveMutation = useSaveWhatsappSettings();
    const rotateMutation = useRotateWhatsappSecret();
    const removeMutation = useRemoveWhatsappSecret();
    const testMutation = useTestWhatsappConnection();
    const testNotifyMutation = useTestNotify();
    const { data: libraryData } = useTemplateLibrary();
    const { data: customTemplates } = useWhatsAppTemplates();
    const { data: latestNotify } = useLatestNotification();

    const [form, setForm] = useState(emptyForm());
    const [formSeed, setFormSeed] = useState(null);
    const [savedFlash, setSavedFlash] = useState(false);
    const [rotateField, setRotateField] = useState("accessToken");
    const [rotateValue, setRotateValue] = useState("");

    // Seed non-secret fields from the server record (secrets always start
    // blank so stored values are never echoed back into the form).
    const seedKey = settings ? String(settings.updatedAt || "loaded") : null;
    if (seedKey && seedKey !== formSeed) {
        setFormSeed(seedKey);
        setForm({
            appId: settings.appId || "",
            wabaId: settings.wabaId || "",
            phoneNumberId: settings.phoneNumberId || "",
            graphVersion: settings.graphVersion || "",
            providerMode: settings.providerMode || "mock",
            accessToken: "",
            appSecret: "",
            verifyToken: "",
            notifyEnabled: !!settings.notifyEnabled,
            notifyRecipients: Array.isArray(settings.notifyRecipients) && settings.notifyRecipients.length > 0
                ? settings.notifyRecipients.map((r) => ({ phone: r.phone || "", label: r.label || "", enabled: r.enabled !== false }))
                : [{ phone: "", label: "", enabled: true }],
            notifyTemplateName: settings.notifyTemplateName || "",
        });
    }

    const set = (key) => (e) => {
        setForm((f) => ({ ...f, [key]: e.target.value }));
        setSavedFlash(false);
        setTestResult(null);
    };

    const busy = saveMutation.isPending || rotateMutation.isPending || removeMutation.isPending || testMutation.isPending || testNotifyMutation.isPending;

    // Template options for notifications: predefined library first, then
    // active custom rows (deduped by name — the stored row wins at send).
    const libraryEntries = Array.isArray(libraryData) ? libraryData : (libraryData?.templates || []);
    const customRows = (Array.isArray(customTemplates) ? customTemplates : []).filter((t) => t && t.active !== false);
    const customNames = new Set(customRows.map((t) => t.name));
    const notifyTemplateOptions = [
        ...customRows.map((t) => ({ name: t.name, hint: "Custom" })),
        ...libraryEntries.filter((e) => e && e.name && !customNames.has(e.name)).map((e) => ({ name: e.name, hint: "Library" })),
    ];

    const handleSave = async (e) => {
        e.preventDefault();
        const payload = {
            appId: form.appId.trim() || null,
            wabaId: form.wabaId.trim() || null,
            phoneNumberId: form.phoneNumberId.trim() || null,
            graphVersion: form.graphVersion.trim() || null,
            providerMode: form.providerMode,
            notifyEnabled: !!form.notifyEnabled,
            notifyRecipients: (form.notifyRecipients || [])
                .filter((r) => r && String(r.phone || "").trim() !== "")
                .map((r) => ({ phone: String(r.phone).trim(), label: String(r.label || "").trim().slice(0, 100) || null, enabled: r.enabled !== false })),
            notifyTemplateName: form.notifyTemplateName.trim() || null,
        };
        for (const { key } of SECRET_FIELDS) {
            if (form[key] !== "") payload[key] = form[key];
        }
        try {
            await saveMutation.mutateAsync(payload);
            setSavedFlash(true);
            setTestResult(null);
            showToast("Configuration saved. Run Test Connection to verify it.", "success");
        } catch (err) {
            showToast(err?.message || "Failed to save configuration", "error");
        }
    };

    const handleRotate = async (e) => {
        e.preventDefault();
        if (!rotateValue.trim()) {
            showToast("Enter the new credential value first", "error");
            return;
        }
        try {
            await rotateMutation.mutateAsync({ field: rotateField, value: rotateValue.trim() });
            setRotateValue("");
            setSavedFlash(false);
            setTestResult(null);
            showToast("Credential rotated. Previous value is invalid.", "success");
        } catch (err) {
            showToast(err?.message || "Failed to rotate credential", "error");
        }
    };

    const handleRemove = async (key, label) => {
        if (!window.confirm(`Remove the saved ${label}? Messaging that needs it will stop working until a new value is saved.`)) return;
        try {
            await removeMutation.mutateAsync(key);
            setSavedFlash(false);
            setTestResult(null);
            showToast(`${label} removed`, "success");
        } catch (err) {
            showToast(err?.message || "Failed to remove credential", "error");
        }
    };

    const handleTest = async () => {
        try {
            const result = await testMutation.mutateAsync();
            setTestResult({ ok: true, result });
            setSavedFlash(false);
        } catch (err) {
            setTestResult({ ok: false, message: err?.message || "Connection test failed" });
        }
    };

    const updateRecipient = (idx, patch) => {
        setForm((f) => ({
            ...f,
            notifyRecipients: (f.notifyRecipients || []).map((r, i) => (i === idx ? { ...r, ...patch } : r)),
        }));
        setSavedFlash(false);
        setTestResult(null);
    };

    const handleTestNotify = async () => {
        if (!window.confirm("Send a labeled TEST notification to the first enabled recipient? In live mode this sends a real message.")) return;
        try {
            await testNotifyMutation.mutateAsync({});
            showToast("Test notification sent", "success");
        } catch (err) {
            showToast(err?.message || "Test notification failed", "error");
        }
    };

    return (
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-bold text-gray-900 flex items-center gap-2">
                        <KeyRound size={16} className="text-green-600" /> Meta WhatsApp Configuration
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                        Stored encrypted per organization. Secrets are never displayed — blank fields keep saved values.
                    </p>
                </div>
                <StatusBadge tone={connection.tone}>{connection.label}</StatusBadge>
            </div>

            {isLoading ? (
                <p className="text-sm text-gray-400">Loading saved configuration…</p>
            ) : isError ? (
                <div className="flex items-center gap-3">
                    <p className="text-sm text-red-600 font-semibold">Couldn’t load saved configuration.</p>
                    <button onClick={() => refetch()} className="text-sm font-bold text-gray-700 underline">Retry</button>
                </div>
            ) : (
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                            <label className={labelClass}>Meta App ID</label>
                            <input value={form.appId} onChange={set("appId")} inputMode="numeric" placeholder="e.g. 1547702967068886" className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>WABA ID</label>
                            <input value={form.wabaId} onChange={set("wabaId")} inputMode="numeric" placeholder="WhatsApp Business Account ID" className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Phone Number ID</label>
                            <input value={form.phoneNumberId} onChange={set("phoneNumberId")} inputMode="numeric" placeholder="Sender number ID" className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Graph API version</label>
                            <input value={form.graphVersion} onChange={set("graphVersion")} placeholder="v21.0" className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Provider mode</label>
                            <select value={form.providerMode} onChange={set("providerMode")} className={inputClass}>
                                <option value="mock">mock (simulated — default)</option>
                                <option value="meta">meta (live sending)</option>
                            </select>
                        </div>
                    </div>
                    <p className="text-[11px] text-gray-400">
                        Saving credentials never enables live messaging — switch Provider mode to <b>meta</b> explicitly to go live.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {SECRET_FIELDS.map(({ key, label, flag }) => (
                            <div key={key}>
                                <label className={labelClass}>
                                    {label}{" "}
                                    {settings?.[flag] && (
                                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 uppercase">Saved</span>
                                    )}
                                </label>
                                <input
                                    type="password"
                                    value={form[key]}
                                    onChange={set(key)}
                                    autoComplete="new-password"
                                    placeholder={settings?.[flag] ? "Credential saved — leave blank to retain" : `Enter ${label.toLowerCase()}`}
                                    className={inputClass}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-gray-100 pt-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">New-lead WhatsApp notifications</h3>
                            <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!form.notifyEnabled}
                                    onChange={(e) => {
                                        setForm((f) => ({ ...f, notifyEnabled: e.target.checked }));
                                        setSavedFlash(false);
                                        setTestResult(null);
                                    }}
                                    className="w-4 h-4 accent-purple-600"
                                />
                                Enabled
                            </label>
                        </div>
                        <p className="text-[11px] text-gray-400">
                            Alerts the configured owner numbers when a lead is created. Mock mode records simulated sends; live mode needs Meta credentials, an approved template, and explicit activation — saving never sends.
                        </p>
                        {(form.notifyRecipients || []).map((recipient, idx) => (
                            <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
                                <div>
                                    <label className={labelClass}>Recipient phone *</label>
                                    <input
                                        value={recipient.phone}
                                        onChange={(e) => updateRecipient(idx, { phone: e.target.value })}
                                        placeholder="e.g. 919876543210"
                                        inputMode="tel"
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Label</label>
                                    <input
                                        value={recipient.label}
                                        onChange={(e) => updateRecipient(idx, { label: e.target.value })}
                                        placeholder="Owner"
                                        className={inputClass}
                                    />
                                </div>
                                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 pb-2.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={recipient.enabled !== false}
                                        onChange={(e) => updateRecipient(idx, { enabled: e.target.checked })}
                                        className="w-4 h-4 accent-purple-600"
                                    />
                                    On
                                </label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setForm((f) => ({ ...f, notifyRecipients: (f.notifyRecipients || []).filter((_, i) => i !== idx) }));
                                        setSavedFlash(false);
                                        setTestResult(null);
                                    }}
                                    disabled={(form.notifyRecipients || []).length <= 1}
                                    className="px-3 py-2 text-xs font-bold text-gray-400 hover:text-red-500 disabled:opacity-30 h-[38px]"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                        <div className="flex flex-wrap gap-2 items-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setForm((f) => ({ ...f, notifyRecipients: [...(f.notifyRecipients || []), { phone: "", label: "", enabled: true }] }));
                                    setSavedFlash(false);
                                    setTestResult(null);
                                }}
                                className="px-3 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50"
                            >
                                + Add recipient
                            </button>
                            <div className="flex-1 min-w-[220px]">
                                <label className={labelClass}>Notification template</label>
                                <select
                                    value={form.notifyTemplateName}
                                    onChange={(e) => {
                                        setForm((f) => ({ ...f, notifyTemplateName: e.target.value }));
                                        setSavedFlash(false);
                                        setTestResult(null);
                                    }}
                                    className={inputClass}
                                >
                                    <option value="">Choose a template…</option>
                                    {notifyTemplateOptions.map((option) => (
                                        <option key={`${option.hint}:${option.name}`} value={option.name}>
                                            {option.name} ({option.hint})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-400">
                            Library templates provision a local row on first use. Live sending additionally requires Meta approval of the template name — unverified names fail safely without sending.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="submit"
                            disabled={busy}
                            className="px-5 py-2.5 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-2"
                        >
                            <Save size={15} /> {busy ? "Saving..." : "Save Configuration"}
                        </button>
                        <button
                            type="button"
                            onClick={handleTest}
                            disabled={busy}
                            className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-2"
                        >
                            <RefreshCw size={15} /> Test Connection
                        </button>
                        <button
                            type="button"
                            onClick={handleTestNotify}
                            disabled={busy}
                            className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-2"
                            title="Sends a labeled TEST notification to the first enabled recipient"
                        >
                            <Send size={14} /> Test Notify
                        </button>
                    </div>

                    {latestNotify && (
                        <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                            <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Latest notification</p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                <span className={`font-black px-2 py-0.5 rounded uppercase ${latestNotify.status === "FAILED" ? "bg-red-50 text-red-600" : latestNotify.status === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                                    {latestNotify.status}
                                </span>
                                <span className="text-gray-600">To <b>{latestNotify.recipient}</b></span>
                                {latestNotify.templateName && <span className="text-gray-600">Template <b>{latestNotify.templateName}</b></span>}
                                <span className="text-gray-600">Attempts <b>{latestNotify.attempts ?? 0}</b></span>
                                {latestNotify.error && <span className="text-red-600 font-semibold">{latestNotify.error}</span>}
                            </div>
                        </div>
                    )}

                    {savedFlash && (
                        <p className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 w-fit">
                            Saved but untested — run Test Connection to verify.
                        </p>
                    )}
                    {testResult?.ok && (
                        <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 w-fit">
                            Connected{testResult.result?.displayPhoneNumber ? ` · ${testResult.result.displayPhoneNumber}` : ""}{testResult.result?.verifiedName ? ` · ${testResult.result.verifiedName}` : ""}.
                        </p>
                    )}
                    {testResult && !testResult.ok && (
                        <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 w-fit">
                            Connection failed: {testResult.message}
                        </p>
                    )}
                </form>
            )}

            <div className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <div>
                    <label className={labelClass}>Rotate credential</label>
                    <select value={rotateField} onChange={(e) => setRotateField(e.target.value)} className={inputClass}>
                        {SECRET_FIELDS.map(({ key, label }) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelClass}>New value</label>
                    <input
                        type="password"
                        value={rotateValue}
                        onChange={(e) => setRotateValue(e.target.value)}
                        autoComplete="new-password"
                        placeholder="Paste the replacement value"
                        className={inputClass}
                    />
                </div>
                    <button
                        type="button"
                        onClick={handleRotate}
                        disabled={busy || !rotateValue.trim()}
                        className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50 h-[42px]"
                    >
                        Rotate
                    </button>
            </div>

            <div className="flex flex-wrap gap-2">
                {SECRET_FIELDS.map(({ key, label, flag }) => (
                    settings?.[flag] ? (
                        <button
                            key={key}
                            type="button"
                            onClick={() => handleRemove(key, label)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-xl hover:bg-red-50 disabled:opacity-50"
                        >
                            <Trash2 size={13} /> Remove {label}
                        </button>
                    ) : null
                ))}
            </div>
        </div>
    );
}
