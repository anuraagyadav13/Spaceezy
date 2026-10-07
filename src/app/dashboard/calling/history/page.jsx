"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
    PhoneIncoming, PhoneOutgoing, Play, Pause,
    ChevronLeft, ChevronRight, Filter
} from "lucide-react";
import { fetchCalls, fetchCallRecording } from "../../../../lib/api/calls";
import { showToast } from "../../../../lib/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const STATUS_TONES = {
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-100",
    IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-100",
    RINGING: "bg-amber-50 text-amber-700 border-amber-100",
    INITIATED: "bg-gray-100 text-gray-600 border-gray-200",
    MISSED: "bg-red-50 text-red-700 border-red-100",
    FAILED: "bg-red-50 text-red-700 border-red-100"
};

const formatDuration = (call) => {
    if (call.startedAt && call.endedAt) {
        const seconds = Math.max(
            0,
            Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
        );
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    }
    if (call.durationSeconds != null) return `${call.durationSeconds}s`;
    return "—";
};

export default function CallHistoryPage() {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState("");
    const [direction, setDirection] = useState("");
    const [playingId, setPlayingId] = useState(null);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["calls", "history", page, status, direction],
        queryFn: () =>
            fetchCalls({
                page,
                limit: 20,
                ...(status ? { status } : {}),
                ...(direction ? { direction } : {})
            }),
        retry: 1,
        placeholderData: (prev) => prev
    });

    const calls = data?.calls || [];
    const total = data?.total ?? 0;
    const pages = data?.pages ?? 1;

    const playRecording = async (call) => {
        if (playingId === call.id) {
            const el = document.getElementById(`rec-audio-${call.id}`);
            if (el) el.pause();
            setPlayingId(null);
            return;
        }
        try {
            await fetchCallRecording(call.id);
            setPlayingId(call.id);
        } catch (err) {
            showToast(
                err?.status === 404
                    ? "No recording available for this call"
                    : err?.message || "Unable to access recording",
                "error"
            );
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Call History Logs</h1>
                    <p className="text-sm text-gray-500">
                        Real call records from the telephony provider — {total} call{total === 1 ? "" : "s"} in scope.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="flex items-center gap-1 text-gray-400"><Filter size={13} /> Filter:</span>
                    <select
                        value={status}
                        onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                        className="bg-white border border-gray-200 rounded-xl px-3 py-2"
                    >
                        <option value="">All statuses</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="IN_PROGRESS">In progress</option>
                        <option value="MISSED">Missed</option>
                        <option value="FAILED">Failed</option>
                    </select>
                    <select
                        value={direction}
                        onChange={(e) => { setDirection(e.target.value); setPage(1); }}
                        className="bg-white border border-gray-200 rounded-xl px-3 py-2"
                    >
                        <option value="">All directions</option>
                        <option value="OUTBOUND">Outbound</option>
                        <option value="INBOUND">Inbound</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm flex items-center justify-between gap-3">
                    <span>
                        {error?.status === 403
                            ? "You do not have permission to view call history"
                            : error?.status === 401
                                ? "Session expired. Please sign in again."
                                : `Failed to load calls: ${error?.message}`}
                    </span>
                    <button onClick={() => refetch()} className="font-bold underline shrink-0">Retry</button>
                </div>
            )}

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                {isLoading ? (
                    <p className="p-8 text-center text-sm text-gray-400">Loading call history...</p>
                ) : calls.length === 0 ? (
                    <p className="p-8 text-center text-sm text-gray-400">
                        No calls match the current filters.
                    </p>
                ) : (
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                <th className="p-4">Type</th>
                                <th className="p-4">Lead</th>
                                <th className="p-4">Number</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Outcome</th>
                                <th className="p-4">Duration</th>
                                <th className="p-4">Time</th>
                                <th className="p-4 text-right">Recording</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {calls.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50 align-top">
                                    <td className="p-4 font-bold flex items-center gap-2 whitespace-nowrap">
                                        {c.direction === "OUTBOUND"
                                            ? <PhoneOutgoing size={14} className="text-purple-600 shrink-0" />
                                            : <PhoneIncoming size={14} className="text-emerald-600 shrink-0" />}
                                        {c.direction === "OUTBOUND" ? "Outbound" : "Inbound"}
                                    </td>
                                    <td className="p-4 font-bold text-gray-900">
                                        {c.lead ? (
                                            <Link href={`/dashboard/leads/${c.leadId}`} className="text-purple-700 hover:underline">
                                                {c.lead.name}
                                            </Link>
                                        ) : (
                                            <span className="text-gray-400 font-medium">—</span>
                                        )}
                                        {c.user?.name && (
                                            <span className="block text-[11px] font-medium text-gray-500">{c.user.name}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-gray-600 font-mono whitespace-nowrap">
                                        {c.toNumber || "—"}
                                        {c.piiMasked && (
                                            <span className="ml-1.5 text-[9px] font-sans font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1 py-0.5 rounded">
                                                masked
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-0.5 rounded-lg border font-bold whitespace-nowrap ${STATUS_TONES[c.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                            {String(c.status || "").replace(/_/g, " ")}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-600 whitespace-nowrap">
                                        {c.disposition ? String(c.disposition).replace(/_/g, " ").toLowerCase() : "—"}
                                    </td>
                                    <td className="p-4 font-semibold text-gray-800 whitespace-nowrap">{formatDuration(c)}</td>
                                    <td className="p-4 text-gray-400 whitespace-nowrap">
                                        {new Date(c.createdAt).toLocaleString([], {
                                            day: "numeric", month: "short",
                                            hour: "2-digit", minute: "2-digit"
                                        })}
                                    </td>
                                    <td className="p-4 text-right">
                                        {c.recordingUrl ? (
                                            <div className="flex flex-col items-end gap-1">
                                                <button
                                                    onClick={() => playRecording(c)}
                                                    className="px-3 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg text-xs hover:bg-purple-100 inline-flex items-center gap-1"
                                                >
                                                    {playingId === c.id ? <Pause size={12} /> : <Play size={12} />}
                                                    {playingId === c.id ? "Stop" : "Play"}
                                                </button>
                                                <audio
                                                    id={`rec-audio-${c.id}`}
                                                    src={`${API_BASE}/calls/${c.id}/recording/stream`}
                                                    className="hidden"
                                                    controls={playingId === c.id}
                                                    autoPlay={playingId === c.id}
                                                    onEnded={() => setPlayingId(null)}
                                                    onError={() => {
                                                        if (playingId === c.id) {
                                                            setPlayingId(null);
                                                            showToast("Recording could not be played", "error");
                                                        }
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 text-[10px]">N/A</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {pages > 1 && (
                <div className="flex items-center justify-center gap-3 text-xs font-bold">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <span className="text-gray-500">Page {page} of {pages}</span>
                    <button
                        onClick={() => setPage((p) => Math.min(pages, p + 1))}
                        disabled={page >= pages}
                        className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                        aria-label="Next page"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}
