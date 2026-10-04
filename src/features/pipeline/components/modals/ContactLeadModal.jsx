"use client";
import { useState } from "react";
import Modal from "../../../../components/shared/Modal";
import { useContactLead } from "../../hooks/useLeadMutations";
import { CONTACT_CHANNELS } from "../../helpers";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

export default function ContactLeadModal({ lead, advanceToContacted = true, isOpen, onClose }) {
    const [channel, setChannel] = useState("CALL");
    const [notes, setNotes] = useState("");
    const contactLead = useContactLead();

    if (!lead) return null;

    const handleSubmit = (event) => {
        event.preventDefault();
        contactLead.mutate(
            { id: lead.id, channel, notes: notes.trim() || undefined, advanceToContacted },
            {
                onSuccess: () => {
                    setNotes("");
                    onClose();
                }
            }
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Log Contact">
            <p className="text-sm text-gray-500 mb-5">
                Logging a contact for <span className="font-bold text-gray-900">{lead.name}</span>
                {advanceToContacted && lead.status !== "CONTACTED" && lead.status !== "BOOKED"
                    ? " will move the lead to Contacted."
                    : " records the interaction on this lead."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Channel</label>
                    <div className="grid grid-cols-2 gap-2">
                        {CONTACT_CHANNELS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setChannel(option.value)}
                                className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                                    channel === option.value
                                        ? "bg-purple-50 border-purple-400 text-purple-700"
                                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Notes</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="What was discussed?"
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
                        disabled={contactLead.isPending}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {contactLead.isPending ? "Saving..." : "Log Contact"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
