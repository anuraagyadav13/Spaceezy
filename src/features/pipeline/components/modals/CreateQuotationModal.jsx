"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Modal from "../../../../components/shared/Modal";
import { useCreateQuotation } from "../../hooks/useLeadMutations";
import { fetchProjects } from "../../../../lib/api/projects";
import { formatCurrency } from "../../helpers";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

export default function CreateQuotationModal({ lead, isOpen, onClose }) {
    const [projectId, setProjectId] = useState("");
    const [totalAmount, setTotalAmount] = useState(lead?.budget ? String(lead.budget) : "");
    const [notes, setNotes] = useState("");
    const createQuotation = useCreateQuotation();

    const { data: projects } = useQuery({
        queryKey: ["projects", "filter-options"],
        queryFn: () => fetchProjects({ limit: 200 }),
        staleTime: 5 * 60 * 1000,
        retry: 1,
        enabled: isOpen
    });

    if (!lead) return null;

    const projectList = Array.isArray(projects) ? projects : [];
    const amount = Number(totalAmount);
    const canSubmit = projectId && amount > 0;

    const submit = (status) => {
        if (!canSubmit) return;
        createQuotation.mutate(
            {
                leadId: lead.id,
                projectId,
                totalAmount: amount,
                status,
                notes: notes.trim() || undefined
            },
            {
                onSuccess: () => onClose()
            }
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Quotation" maxWidth="max-w-lg">
            <p className="text-sm text-gray-500 mb-5">
                Prepare a quotation for <span className="font-bold text-gray-900">{lead.name}</span>.
                {lead.project ? ` Currently interested in ${lead.project}.` : ""}
            </p>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submit("SENT");
                }}
                className="space-y-4"
            >
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Project *</label>
                    <select
                        required
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        className={inputClass}
                    >
                        <option value="">Select a project</option>
                        {projectList.map((project) => (
                            <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Quotation amount (₹) *</label>
                    <input
                        type="number"
                        required
                        min="1"
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value)}
                        placeholder="e.g. 8500000"
                        className={inputClass}
                    />
                    {amount > 0 && <p className="text-xs text-gray-500 mt-1 font-semibold">{formatCurrency(amount)}</p>}
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Notes</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="Payment plan, offers, validity..."
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
                        type="button"
                        disabled={!canSubmit || createQuotation.isPending}
                        onClick={() => submit("DRAFT")}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-60"
                    >
                        Save Draft
                    </button>
                    <button
                        type="submit"
                        disabled={!canSubmit || createQuotation.isPending}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {createQuotation.isPending ? "Saving..." : "Send Quotation"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
