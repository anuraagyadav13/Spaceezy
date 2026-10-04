"use client";
import { useState } from "react";
import Modal from "../../../../components/shared/Modal";
import { useScheduleLeadFollowUp } from "../../hooks/useLeadMutations";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

const defaultDueDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function ScheduleFollowUpModal({ lead, isOpen, onClose }) {
    const [dueDate, setDueDate] = useState(defaultDueDate());
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const scheduleFollowUp = useScheduleLeadFollowUp();

    if (!lead) return null;

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!dueDate) return;
        scheduleFollowUp.mutate(
            {
                id: lead.id,
                currentStatus: lead.status,
                dueDate: new Date(dueDate).toISOString(),
                title: title.trim() || "Follow-up",
                notes: notes.trim() || undefined
            },
            {
                onSuccess: () => onClose()
            }
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Schedule Follow-up">
            <p className="text-sm text-gray-500 mb-5">
                Schedule the next follow-up for <span className="font-bold text-gray-900">{lead.name}</span> to move the lead
                into the Follow-up stage.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Due date &amp; time *</label>
                    <input
                        type="datetime-local"
                        required
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className={inputClass}
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Title</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Call to discuss floor plan"
                        className={inputClass}
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Notes</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="Context for this follow-up"
                        className={inputClass}
                    />
                </div>

                <div className="flex gap-3 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={scheduleFollowUp.isPending}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {scheduleFollowUp.isPending ? "Scheduling..." : "Schedule"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
