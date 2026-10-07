"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "../../../components/shared/Modal";
import { useRecordCallOutcome } from "../hooks/useCommunication";
import { showToast } from "../../../lib/toast";

export const DISPOSITIONS = [
    { value: "INTERESTED", label: "Interested" },
    { value: "NOT_INTERESTED", label: "Not Interested" },
    { value: "CALL_BACK", label: "Call Back Requested" },
    { value: "FOLLOW_UP_REQUIRED", label: "Follow-up Required" },
    { value: "NO_ANSWER", label: "No Answer" },
    { value: "BUSY", label: "Busy" },
    { value: "WRONG_NUMBER", label: "Wrong Number" },
    { value: "SITE_VISIT_INTERESTED", label: "Site Visit Interest" },
    { value: "QUOTATION_INTERESTED", label: "Quotation Interest" },
    { value: "OTHER", label: "Other" }
];

const NEXT_ACTIONS = [
    { value: "NONE", label: "No Next Action" },
    { value: "CALL_BACK", label: "Schedule Callback" },
    { value: "FOLLOW_UP", label: "Create Follow-up" },
    { value: "TASK", label: "Create Task" },
    { value: "WHATSAPP", label: "Send WhatsApp" },
    { value: "SITE_VISIT", label: "Schedule Site Visit" },
    { value: "QUOTATION", label: "Prepare Quotation" }
];

const defaultFutureTime = () => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 0, 0, 0);
    if (d.getMinutes() === 0) d.setHours(d.getHours() + 1);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function OutcomeForm({ call, lead, leadName, onClose, onRecorded }) {
    const router = useRouter();
    const recordOutcome = useRecordCallOutcome();

    const [disposition, setDisposition] = useState("INTERESTED");
    const [nextActionType, setNextActionType] = useState("NONE");
    const [notes, setNotes] = useState("");
    const [scheduledAt, setScheduledAt] = useState(defaultFutureTime);
    const [title, setTitle] = useState(`Follow-up: ${leadName}`);
    const [reason, setReason] = useState("");

    const needsSchedule = nextActionType === "CALL_BACK" || nextActionType === "FOLLOW_UP";
    const needsTitle = nextActionType === "TASK";
    const canSubmit =
        (!needsSchedule || Boolean(scheduledAt)) && (!needsTitle || title.trim().length > 0);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!canSubmit) return;

        const nextAction = { type: nextActionType };
        if (needsSchedule) nextAction.scheduledAt = new Date(scheduledAt).toISOString();
        if (needsTitle) {
            nextAction.title = title.trim();
            nextAction.dueDate = new Date(scheduledAt).toISOString();
        }
        if (reason.trim()) nextAction.reason = reason.trim();

        try {
            const result = await recordOutcome.mutateAsync({
                id: call.id,
                disposition,
                notes: notes.trim() || undefined,
                nextAction
            });
            showToast("Call outcome recorded", "success");
            if (nextActionType === "WHATSAPP") {
                router.push(`/dashboard/calling/whatsapp?leadId=${call.leadId || lead?.id || ""}`);
            } else if (nextActionType === "SITE_VISIT") {
                router.push(`/dashboard/site-visits/schedule?leadId=${call.leadId || lead?.id || ""}`);
            }
            onRecorded?.(result);
            onClose?.();
        } catch (err) {
            const map = {
                CALL_NOT_ENDED: "End the call before recording an outcome.",
                OUTCOME_ALREADY_RECORDED: "An outcome was already recorded for this call."
            };
            showToast(map[err?.code] || err?.message || "Failed to record outcome", "error");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Disposition for {leadName}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                    {DISPOSITIONS.map((d) => (
                        <button
                            key={d.value}
                            type="button"
                            onClick={() => setDisposition(d.value)}
                            className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                                disposition === d.value
                                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next Action</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {NEXT_ACTIONS.map((a) => (
                        <button
                            key={a.value}
                            type="button"
                            onClick={() => setNextActionType(a.value)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                nextActionType === a.value
                                    ? "border-sky-600 bg-sky-50 text-sky-700"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                        >
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>

            {needsSchedule && (
                <label className="block">
                    <span className="text-xs font-medium text-slate-600">
                        {nextActionType === "CALL_BACK" ? "Callback time" : "Follow-up due at"}
                    </span>
                    <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        required
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                </label>
            )}

            {needsTitle && (
                <label className="block">
                    <span className="text-xs font-medium text-slate-600">Task title</span>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        maxLength={200}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                </label>
            )}

            {(needsSchedule || needsTitle) && (
                <label className="block">
                    <span className="text-xs font-medium text-slate-600">Reason (optional)</span>
                    <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={500}
                        placeholder="Why this next step?"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                </label>
            )}

            <label className="block">
                <span className="text-xs font-medium text-slate-600">Call notes (optional)</span>
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="What was discussed?"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
            </label>

            <div className="flex justify-end gap-2 pt-1">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!canSubmit || recordOutcome.isPending}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {recordOutcome.isPending ? "Saving..." : "Save Outcome"}
                </button>
            </div>
        </form>
    );
}

export default function CallOutcomePopup({ call, lead, isOpen, onClose, onRecorded }) {
    const leadName = lead?.name || call?.lead?.name || "this lead";

    if (!call) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Call Outcome" maxWidth="max-w-lg">
            {isOpen ? (
                <OutcomeForm
                    key={call.id}
                    call={call}
                    lead={lead}
                    leadName={leadName}
                    onClose={onClose}
                    onRecorded={onRecorded}
                />
            ) : null}
        </Modal>
    );
}
