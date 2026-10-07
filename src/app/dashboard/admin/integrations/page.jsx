"use client";
import { Plug, Phone, MessageSquare, Database, ShieldCheck, ShieldAlert } from "lucide-react";
import { useTelephonyStatus } from "../../../../features/communication/hooks/useCommunication";
import { useWhatsAppStatus } from "../../../../features/communication/hooks/useWhatsApp";

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
        : !whatsapp
            ? <StatusBadge tone="off">Status unavailable</StatusBadge>
            : whatsapp.configured
                ? (
                    <StatusBadge tone={whatsapp.simulated ? "warn" : "ok"}>
                        {whatsapp.provider} · {whatsapp.simulated ? "Simulated (demo messages)" : "Connected"}
                    </StatusBadge>
                )
                : <StatusBadge tone="off">Not configured</StatusBadge>;

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
                    <code className="bg-gray-100 px-1 rounded">none | mock | generic</code>).
                    Secrets stay server-side; the <code className="bg-gray-100 px-1 rounded">generic</code>{" "}
                    adapter sends traffic to any endpoint honoring the documented REST contract.
                    Webhooks are verified with HMAC-SHA256 signatures and are idempotent.
                </p>
            </div>
        </div>
    );
}
