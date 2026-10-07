"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Play, Pause, Mic, ShieldCheck } from "lucide-react";
import { fetchCalls, fetchCallRecording } from "../../../../lib/api/calls";
import { showToast } from "../../../../lib/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function CallRecordingsPage() {
    const [playingId, setPlayingId] = useState(null);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["calls", "recordings"],
        queryFn: () => fetchCalls({ limit: 100 }),
        retry: 1
    });

    const recordings = (data?.calls || []).filter((c) => c.recordingUrl);

    const togglePlay = async (call) => {
        if (playingId === call.id) {
            const el = document.getElementById(`vault-audio-${call.id}`);
            if (el) el.pause();
            setPlayingId(null);
            return;
        }
        try {
            await fetchCallRecording(call.id);
            setPlayingId(call.id);
        } catch (err) {
            showToast(
                err?.status === 403
                    ? "You do not have permission to access recordings"
                    : err?.status === 404
                        ? "No recording available for this call"
                        : err?.message || "Unable to access recording",
                "error"
            );
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Call Recordings Audit Vault</h1>
                <p className="text-sm text-gray-500">
                    Secure, permission-gated playback. Recording bytes are proxied server-side after an
                    access audit — provider URLs are never exposed to the browser.
                </p>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm flex items-center justify-between gap-3">
                    <span>
                        {error?.status === 403
                            ? "You do not have permission to view recordings"
                            : error?.status === 401
                                ? "Session expired. Please sign in again."
                                : `Failed to load recordings: ${error?.message}`}
                    </span>
                    <button onClick={() => refetch()} className="font-bold underline shrink-0">Retry</button>
                </div>
            )}

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">
                        Available Recordings ({recordings.length})
                    </h2>
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                        <ShieldCheck size={12} /> RBAC-gated · audit-logged
                    </span>
                </div>

                {isLoading ? (
                    <p className="text-sm text-gray-400 py-4">Loading recordings...</p>
                ) : recordings.length === 0 ? (
                    <div className="p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-center">
                        <Mic size={24} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-sm text-gray-500">
                            No recordings yet. Recordings appear here after completed calls with the telephony provider.
                        </p>
                    </div>
                ) : (
                    recordings.map((call) => (
                        <div
                            key={call.id}
                            className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-wrap items-center justify-between gap-3"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold shrink-0">
                                    <Mic size={18} />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-gray-900 text-sm truncate">
                                        {call.lead?.name || "Lead"} — {call.status}
                                        {call.disposition ? ` · ${String(call.disposition).replace(/_/g, " ").toLowerCase()}` : ""}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                        {call.user?.name ? `Agent: ${call.user.name} · ` : ""}
                                        {new Date(call.createdAt).toLocaleString([], {
                                            day: "numeric", month: "short", year: "numeric",
                                            hour: "2-digit", minute: "2-digit"
                                        })}
                                        {call.toNumber ? ` · ${call.toNumber}` : ""}
                                        {call.piiMasked ? " (masked)" : ""}
                                    </p>
                                    {playingId === call.id && (
                                        <audio
                                            id={`vault-audio-${call.id}`}
                                            src={`${API_BASE}/calls/${call.id}/recording/stream`}
                                            className="mt-2 w-64"
                                            controls
                                            autoPlay
                                            onEnded={() => setPlayingId(null)}
                                            onError={() => {
                                                setPlayingId(null);
                                                showToast("Recording could not be played", "error");
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Link
                                    href={call.leadId ? `/dashboard/leads/${call.leadId}` : "#"}
                                    className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 font-bold text-xs rounded-xl hover:bg-gray-100"
                                >
                                    Open lead
                                </Link>
                                <button
                                    onClick={() => togglePlay(call)}
                                    className="px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl hover:bg-purple-700 inline-flex items-center gap-1.5"
                                >
                                    {playingId === call.id ? <Pause size={14} /> : <Play size={14} />}
                                    {playingId === call.id ? "Stop" : "Listen Audio"}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
