"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff, Loader2 } from "lucide-react";
import { useHangupCall } from "../hooks/useCommunication";
import { showToast } from "../../../lib/toast";

const TERMINAL = ["COMPLETED", "MISSED", "FAILED"];

export default function CallPanel({ call, lead, onEnded }) {
    const hangup = useHangupCall();
    const [elapsed, setElapsed] = useState(0);

    const terminal = TERMINAL.includes(call?.status);

    useEffect(() => {
        if (!call?.startedAt || terminal) return undefined;
        const start = new Date(call.startedAt).getTime();
        const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [call?.startedAt, terminal]);

    if (!call) return null;

    const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

    const handleHangup = async () => {
        try {
            const updated = await hangup.mutateAsync(call.id);
            onEnded?.(updated);
        } catch (err) {
            showToast(err?.message || "Failed to end the call", "error");
        }
    };

    return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                        {hangup.isPending || call.status === "INITIATED" ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Phone className="h-5 w-5" />
                        )}
                    </span>
                    <div>
                        <p className="text-sm font-semibold text-emerald-900">
                            {lead?.name || call.lead?.name || "Call in progress"}
                        </p>
                        <p className="text-xs text-emerald-700">
                            {call.toNumber} &middot; {String(call.status).toLowerCase()}
                            {!terminal && ` &middot; ${mmss}`}
                        </p>
                    </div>
                </div>
                {!terminal && (
                    <button
                        onClick={handleHangup}
                        disabled={hangup.isPending}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                        <PhoneOff className="h-4 w-4" />
                        {hangup.isPending ? "Ending..." : "Hang up"}
                    </button>
                )}
            </div>
            <p className="mt-2 text-[11px] text-emerald-700">
                Calls are placed through the business telephony provider{" "}
                {call.provider === "mock" ? "(mock provider - simulated line)" : `(${call.provider})`}.
                Record the outcome after hanging up.
            </p>
        </div>
    );
}
