"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Modal from "../../../../components/shared/Modal";
import { useCreateQuotation } from "../../hooks/useLeadMutations";
import { fetchProjects } from "../../../../lib/api/projects";
import { fetchProperties } from "../../../../lib/api/properties";
import { formatCurrency } from "../../helpers";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

export default function CreateQuotationModal({ lead, isOpen, onClose }) {
    const [projectId, setProjectId] = useState("");
    const [propertyId, setPropertyId] = useState("");
    const [totalAmount, setTotalAmount] = useState(lead?.budget ? String(lead.budget) : "");
    const [amountTouched, setAmountTouched] = useState(Boolean(lead?.budget));
    const [notes, setNotes] = useState("");
    const createQuotation = useCreateQuotation();

    const { data: projects } = useQuery({
        queryKey: ["projects", "filter-options"],
        queryFn: () => fetchProjects({ limit: 200 }),
        staleTime: 5 * 60 * 1000,
        retry: 1,
        enabled: isOpen
    });

    const effectiveProjectId = projectId || lead?.projectId || "";

    const { data: units, isLoading: unitsLoading } = useQuery({
        queryKey: ["properties", "for-project", effectiveProjectId, "quotation"],
        queryFn: () => fetchProperties(effectiveProjectId, { limit: 200 }),
        enabled: isOpen && Boolean(effectiveProjectId),
        staleTime: 60 * 1000,
        retry: 1
    });

    if (!lead) return null;

    const projectList = Array.isArray(projects) ? projects : [];
    const unitList = Array.isArray(units) ? units : [];
    const selectedUnit = unitList.find((unit) => unit.id === propertyId);
    const amount = Number(totalAmount);
    const canSubmit = effectiveProjectId && amount > 0;

    const submit = (status) => {
        if (!canSubmit) return;
        createQuotation.mutate(
            {
                leadId: lead.id,
                projectId: effectiveProjectId,
                ...(propertyId ? { propertyId } : {}),
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
                {lead.project?.name ? ` Currently interested in ${lead.project.name}.` : ""}
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
                        value={effectiveProjectId}
                        onChange={(e) => { setProjectId(e.target.value); setPropertyId(""); }}
                        className={inputClass}
                    >
                        <option value="">Select a project</option>
                        {projectList.map((project) => (
                            <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Unit (optional)</label>
                    <select
                        value={propertyId}
                        onChange={(e) => {
                            const id = e.target.value;
                            setPropertyId(id);
                            const unit = unitList.find((u) => u.id === id);
                            if (unit?.price && !amountTouched) {
                                setTotalAmount(String(unit.price));
                            }
                        }}
                        disabled={!effectiveProjectId || unitsLoading}
                        className={`${inputClass} disabled:opacity-60`}
                    >
                        <option value="">{!effectiveProjectId ? "Select a project first" : unitsLoading ? "Loading units..." : "Whole project quotation"}</option>
                        {unitList.map((unit) => (
                            <option key={unit.id} value={unit.id} disabled={unit.status === "SOLD"}>
                                {unit.unitNumber ? `Unit ${unit.unitNumber}` : unit.title}
                                {unit.status === "SOLD" ? " (SOLD)" : unit.price ? ` — ₹${Number(unit.price).toLocaleString("en-IN")}` : ""}
                            </option>
                        ))}
                    </select>
                    {selectedUnit?.price && (
                        <p className="text-xs text-gray-500 mt-1 font-semibold">List price {formatCurrency(Number(selectedUnit.price))}</p>
                    )}
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Quotation amount (₹) *</label>
                    <input
                        type="number"
                        required
                        min="1"
                        value={totalAmount}
                        onChange={(e) => { setTotalAmount(e.target.value); setAmountTouched(true); }}
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
