"use client";
import Link from "next/link";
import { MessageSquare, ArrowRight } from "lucide-react";

export default function MessagesHistoryPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Email/SMS History</h1>
                <p className="text-sm text-gray-500">
                    Outbound messaging history for this organization.
                </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-dashed border-gray-300 text-center space-y-3">
                <MessageSquare size={28} className="mx-auto text-gray-300" />
                <p className="text-sm text-gray-500">
                    No email or SMS integration is configured for this organization.
                    Messaging is available through the WhatsApp Business Center, where every
                    conversation and delivery status is tracked.
                </p>
                <Link
                    href="/dashboard/calling/whatsapp"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700"
                >
                    Open WhatsApp Center <ArrowRight size={13} />
                </Link>
            </div>
        </div>
    );
}
