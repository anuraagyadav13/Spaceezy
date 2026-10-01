"use client";
import { Plug, Phone, MessageSquare, Database } from "lucide-react";

export default function IntegrationsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Integrations & Telephony Provider Status</h1>
                <p className="text-sm text-gray-500">Status of telephony providers, WhatsApp Business API, and database connectors.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                    <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                        <Phone size={20} />
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">Indian Telephony Provider</h3>
                    <p className="text-xs text-gray-500">Inbound IVR & Agent Mobile Bridging</p>
                    <span className="inline-block bg-amber-50 text-amber-700 font-bold px-2.5 py-0.5 rounded text-[10px]">Simulated Mock Ready</span>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                    <div className="w-10 h-10 rounded-2xl bg-green-100 text-green-600 flex items-center justify-center font-bold">
                        <MessageSquare size={20} />
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">WhatsApp Business API</h3>
                    <p className="text-xs text-gray-500">HSM Template Delivery & Media Links</p>
                    <span className="inline-block bg-amber-50 text-amber-700 font-bold px-2.5 py-0.5 rounded text-[10px]">Simulated Sandbox</span>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                        <Database size={20} />
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">Express & PostgreSQL API</h3>
                    <p className="text-xs text-gray-500">Prisma Database Service Abstraction</p>
                    <span className="inline-block bg-purple-50 text-purple-700 font-bold px-2.5 py-0.5 rounded text-[10px]">Mock Repository Layer</span>
                </div>
            </div>
        </div>
    );
}
