"use client";
import { useState, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
    PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed,
    Play, Pause, Mic, ShieldCheck, Filter, ChevronLeft,
    ChevronRight, RefreshCw, Loader2, PhoneForwarded
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

const TABS = [
    { id: "history", label: "Call History", icon: PhoneCall },
    { id: "recordings", label: "Call Recordings", icon: Mic },
    { id: "missed", label: "Missed Calls", icon: PhoneMissed }
];

function CallsPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const rawTab = searchParams.get("tab");
    const activeTab = TABS.some((t) => t.id === rawTab) ? rawTab : "history";

    const handleTabChange = (tabId) => {
        const params = new URLSearchParams(window.location.search);
        params.set("tab", tabId);
        router.replace(`/dashboard/calling/calls?${params.toString()}`, { scroll: false });
    };

    // Global audio player state
    const [playingId, setPlayingId] = useState(null);

    // Filters for Call History
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState("");
    const [direction, setDirection] = useState("");

    // Query for History Tab
    const historyQuery = useQuery({
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

    // Query for Recordings Tab
    const recordingsQuery = useQuery({
        queryKey: ["calls", "recordings"],
        queryFn: () => fetchCalls({ limit: 100 }),
        retry: 1
    });

    // Query for Missed Calls Tab
    const [missedPage, setMissedPage] = useState(1);
    const missedQuery = useQuery({
        queryKey: ["calls", "missed", missedPage],
        queryFn: () => fetchCalls({ status: "MISSED", page: missedPage, limit: 20 }),
        retry: 1
    });

    const calls = historyQuery.data?.calls || [];
    const totalCalls = historyQuery.data?.total ?? 0;
    const pages = historyQuery.data?.pages ?? 1;

    const allRecordings = useMemo(() => {
        return (recordingsQuery.data?.calls || []).filter((c) => c.recordingUrl);
    }, [recordingsQuery.data]);

    const missedCalls = missedQuery.data?.calls || [];
    const missedTotal = missedQuery.data?.total ?? 0;
    const missedPages = missedQuery.data?.pages ?? 1;

    const handleRefreshAll = () => {
        historyQuery.refetch();
        recordingsQuery.refetch();
        missedQuery.refetch();
        showToast("Call records refreshed");
    };

    const togglePlayAudio = async (call) => {
        if (playingId === call.id) {
            const el = document.getElementById(`audio-player-${call.id}`);
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
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 py-5 shrink-0 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-purple-100 text-purple-700 rounded-lg">
                            <PhoneCall size={20} />
                        </span>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Calls</h1>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        Unified calling center: call history logs, audio recordings vault, and missed call queue.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefreshAll}
                        disabled={historyQuery.isFetching || recordingsQuery.isFetching || missedQuery.isFetching}
                        className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 shadow-xs transition-colors disabled:opacity-50"
                        title="Reload call logs"
                    >
                        <RefreshCw
                            size={14}
                            className={
                                historyQuery.isFetching || recordingsQuery.isFetching || missedQuery.isFetching
                                    ? "animate-spin text-purple-600"
                                    : ""
                            }
                        />
                        <span>Refresh</span>
                    </button>
                    <Link
                        href="/dashboard/calling/softphone"
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:opacity-90 shadow-sm transition-opacity"
                    >
                        <PhoneForwarded size={14} />
                        <span>Open Softphone</span>
                    </Link>
                </div>
            </div>

            {/* Top Metric Cards */}
            <div className="bg-white/80 border-b border-gray-100 px-4 sm:px-8 py-3 shrink-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                            <PhoneCall size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Total Calls</p>
                            <p className="text-lg font-black text-gray-900">{totalCalls}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <PhoneOutgoing size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Active / Completed</p>
                            <p className="text-lg font-black text-emerald-600">
                                {calls.filter((c) => c.status === "COMPLETED").length}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                            <PhoneMissed size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Missed Calls</p>
                            <p className="text-lg font-black text-red-600">{missedTotal}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <Mic size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Recordings Available</p>
                            <p className="text-lg font-black text-blue-600">{allRecordings.length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs Pill Navigation */}
            <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-2 shrink-0 overflow-x-auto custom-scrollbar">
                <div className="flex items-center gap-2 min-w-max">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                    isActive
                                        ? "bg-purple-600 text-white shadow-xs"
                                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                                }`}
                            >
                                <Icon size={15} />
                                <span>{tab.label}</span>
                                {tab.id === "missed" && missedTotal > 0 && (
                                    <span
                                        className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                            isActive ? "bg-white text-red-600" : "bg-red-100 text-red-700"
                                        }`}
                                    >
                                        {missedTotal}
                                    </span>
                                )}
                                {tab.id === "recordings" && allRecordings.length > 0 && (
                                    <span
                                        className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                            isActive ? "bg-white text-blue-600" : "bg-blue-100 text-blue-700"
                                        }`}
                                    >
                                        {allRecordings.length}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar space-y-6">
                {/* ================= CALL HISTORY TAB ================= */}
                {activeTab === "history" && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                            <div>
                                <h2 className="text-sm font-bold text-gray-900">Call Logs</h2>
                                <p className="text-xs text-gray-500">
                                    Displaying {calls.length} of {totalCalls} recorded calls
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                <span className="flex items-center gap-1 text-gray-400">
                                    <Filter size={13} /> Filter:
                                </span>
                                <select
                                    value={status}
                                    onChange={(e) => {
                                        setStatus(e.target.value);
                                        setPage(1);
                                    }}
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700"
                                >
                                    <option value="">All statuses</option>
                                    <option value="COMPLETED">Completed</option>
                                    <option value="IN_PROGRESS">In progress</option>
                                    <option value="MISSED">Missed</option>
                                    <option value="FAILED">Failed</option>
                                </select>
                                <select
                                    value={direction}
                                    onChange={(e) => {
                                        setDirection(e.target.value);
                                        setPage(1);
                                    }}
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700"
                                >
                                    <option value="">All directions</option>
                                    <option value="OUTBOUND">Outbound</option>
                                    <option value="INBOUND">Inbound</option>
                                </select>
                            </div>
                        </div>

                        {historyQuery.error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm flex items-center justify-between gap-3">
                                <span>
                                    {historyQuery.error?.status === 403
                                        ? "You do not have permission to view call history"
                                        : historyQuery.error?.status === 401
                                            ? "Session expired. Please sign in again."
                                            : `Failed to load calls: ${historyQuery.error?.message}`}
                                </span>
                                <button onClick={() => historyQuery.refetch()} className="font-bold underline shrink-0">
                                    Retry
                                </button>
                            </div>
                        )}

                        <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
                            {historyQuery.isLoading ? (
                                <div className="p-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                                    <Loader2 size={16} className="animate-spin text-purple-600" />
                                    <span>Loading call history...</span>
                                </div>
                            ) : calls.length === 0 ? (
                                <p className="p-8 text-center text-sm text-gray-400">No calls match the current filters.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50/70 border-b border-gray-100 font-bold text-gray-500 uppercase">
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
                                        <tbody className="divide-y divide-gray-100 font-medium">
                                            {calls.map((c) => (
                                                <tr key={c.id} className="hover:bg-gray-50 align-top">
                                                    <td className="p-4 font-bold flex items-center gap-2 whitespace-nowrap">
                                                        {c.direction === "OUTBOUND" ? (
                                                            <PhoneOutgoing size={14} className="text-purple-600 shrink-0" />
                                                        ) : (
                                                            <PhoneIncoming size={14} className="text-emerald-600 shrink-0" />
                                                        )}
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
                                                        <span
                                                            className={`px-2 py-0.5 rounded-lg border font-bold whitespace-nowrap ${
                                                                STATUS_TONES[c.status] || "bg-gray-100 text-gray-600 border-gray-200"
                                                            }`}
                                                        >
                                                            {String(c.status || "").replace(/_/g, " ")}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-gray-600 whitespace-nowrap">
                                                        {c.disposition ? String(c.disposition).replace(/_/g, " ").toLowerCase() : "—"}
                                                    </td>
                                                    <td className="p-4 font-semibold text-gray-800 whitespace-nowrap">{formatDuration(c)}</td>
                                                    <td className="p-4 text-gray-400 whitespace-nowrap">
                                                        {new Date(c.createdAt).toLocaleString([], {
                                                            day: "numeric",
                                                            month: "short",
                                                            hour: "2-digit",
                                                            minute: "2-digit"
                                                        })}
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        {c.recordingUrl ? (
                                                            <div className="flex flex-col items-end gap-1">
                                                                <button
                                                                    onClick={() => togglePlayAudio(c)}
                                                                    className="px-3 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg text-xs hover:bg-purple-100 inline-flex items-center gap-1"
                                                                >
                                                                    {playingId === c.id ? <Pause size={12} /> : <Play size={12} />}
                                                                    {playingId === c.id ? "Stop" : "Play"}
                                                                </button>
                                                                <audio
                                                                    id={`audio-player-${c.id}`}
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
                                </div>
                            )}
                        </div>

                        {pages > 1 && (
                            <div className="flex items-center justify-center gap-3 text-xs font-bold pt-2">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="text-gray-500">
                                    Page {page} of {pages}
                                </span>
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
                )}

                {/* ================= RECORDINGS TAB ================= */}
                {activeTab === "recordings" && (
                    <div className="space-y-4">
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-bold text-gray-900">Audio Recordings Vault</h2>
                                    <p className="text-xs text-gray-500">
                                        Secure, permission-gated playback. Audio files are proxied server-side after audit verification.
                                    </p>
                                </div>
                                <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                                    <ShieldCheck size={12} /> RBAC-gated · audit-logged
                                </span>
                            </div>

                            {recordingsQuery.isLoading ? (
                                <div className="p-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                                    <Loader2 size={16} className="animate-spin text-purple-600" />
                                    <span>Loading audio recordings...</span>
                                </div>
                            ) : allRecordings.length === 0 ? (
                                <div className="p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-center">
                                    <Mic size={24} className="mx-auto text-gray-300 mb-2" />
                                    <p className="text-sm text-gray-500">
                                        No recordings available yet. Completed telephony calls will populate here automatically.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {allRecordings.map((call) => (
                                        <div
                                            key={call.id}
                                            className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-wrap items-center justify-between gap-3 hover:bg-purple-50/30 transition-colors"
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
                                                    <p className="text-xs text-gray-500">
                                                        {call.direction} · {formatDuration(call)} · {new Date(call.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {call.leadId && (
                                                    <Link
                                                        href={`/dashboard/leads/${call.leadId}`}
                                                        className="text-xs font-bold text-purple-700 hover:underline"
                                                    >
                                                        View Lead
                                                    </Link>
                                                )}
                                                <button
                                                    onClick={() => togglePlayAudio(call)}
                                                    className="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl text-xs hover:bg-purple-700 flex items-center gap-1.5 shadow-xs"
                                                >
                                                    {playingId === call.id ? <Pause size={14} /> : <Play size={14} />}
                                                    {playingId === call.id ? "Pause" : "Listen"}
                                                </button>
                                                <audio
                                                    id={`audio-player-${call.id}`}
                                                    src={`${API_BASE}/calls/${call.id}/recording/stream`}
                                                    className="hidden"
                                                    controls={playingId === call.id}
                                                    autoPlay={playingId === call.id}
                                                    onEnded={() => setPlayingId(null)}
                                                    onError={() => {
                                                        if (playingId === call.id) {
                                                            setPlayingId(null);
                                                            showToast("Recording could not be played", "error");
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ================= MISSED CALLS TAB ================= */}
                {activeTab === "missed" && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
                            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-base font-bold text-gray-900">Missed Calls Queue</h2>
                                    <p className="text-xs text-gray-500">
                                        Inbound calls requiring callback follow-up — {missedTotal} total in queue
                                    </p>
                                </div>
                                <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg">
                                    {missedTotal} pending
                                </span>
                            </div>

                            {missedQuery.isLoading ? (
                                <div className="p-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                                    <Loader2 size={16} className="animate-spin text-purple-600" />
                                    <span>Loading missed calls...</span>
                                </div>
                            ) : missedCalls.length === 0 ? (
                                <div className="p-8 text-center text-sm text-gray-400">
                                    <PhoneMissed size={24} className="mx-auto text-gray-300 mb-2" />
                                    <p>No missed calls. The callback queue is all clear!</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50/70 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                                <th className="p-4">Caller Number</th>
                                                <th className="p-4">Lead Match</th>
                                                <th className="p-4">Direction</th>
                                                <th className="p-4">Time Received</th>
                                                <th className="p-4">Status</th>
                                                <th className="p-4 text-right">Callback Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 font-medium">
                                            {missedCalls.map((c) => (
                                                <tr key={c.id} className="hover:bg-gray-50">
                                                    <td className="p-4 font-black text-red-600 flex items-center gap-2 font-mono whitespace-nowrap">
                                                        <PhoneMissed size={14} className="shrink-0" />
                                                        {c.toNumber || c.fromNumber || "—"}
                                                        {c.piiMasked && (
                                                            <span className="text-[9px] font-sans font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1 py-0.5 rounded">
                                                                masked
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 font-bold text-gray-900">
                                                        {c.lead ? (
                                                            <Link href={`/dashboard/leads/${c.leadId}`} className="text-purple-700 hover:underline">
                                                                {c.lead.name}
                                                            </Link>
                                                        ) : (
                                                            <span className="text-gray-400 font-medium">No lead match</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-gray-600">{c.direction === "OUTBOUND" ? "Outbound" : "Inbound"}</td>
                                                    <td className="p-4 text-gray-500">
                                                        {new Date(c.createdAt).toLocaleString([], {
                                                            day: "numeric",
                                                            month: "short",
                                                            hour: "2-digit",
                                                            minute: "2-digit"
                                                        })}
                                                    </td>
                                                    <td className="p-4">
                                                        <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-lg border border-amber-100">
                                                            Callback Pending
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        {c.leadId ? (
                                                            <Link
                                                                href={`/dashboard/leads/${c.leadId}`}
                                                                className="px-3.5 py-1.5 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 inline-block shadow-xs"
                                                            >
                                                                Call Back Now
                                                            </Link>
                                                        ) : (
                                                            <span className="text-gray-400 text-[10px]">Unmatched caller</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {missedPages > 1 && (
                            <div className="flex items-center justify-center gap-3 text-xs font-bold pt-2">
                                <button
                                    onClick={() => setMissedPage((p) => Math.max(1, p - 1))}
                                    disabled={missedPage <= 1}
                                    className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="text-gray-500">
                                    Page {missedPage} of {missedPages}
                                </span>
                                <button
                                    onClick={() => setMissedPage((p) => Math.min(missedPages, p + 1))}
                                    disabled={missedPage >= missedPages}
                                    className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                                    aria-label="Next page"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CallsDashboardPage() {
    return (
        <Suspense
            fallback={
                <div className="flex flex-col h-full items-center justify-center bg-gray-50/50 p-8">
                    <Loader2 size={24} className="animate-spin text-purple-600 mb-2" />
                    <p className="text-sm font-medium text-gray-500">Loading Calls...</p>
                </div>
            }
        >
            <CallsPageContent />
        </Suspense>
    );
}
