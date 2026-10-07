"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Modal from "../../../../components/shared/Modal";
import { useConvertLeadToBooking } from "../../hooks/useLeadMutations";
import { fetchProperties } from "../../../../lib/api/properties";
import { fetchQuotations } from "../../../../lib/api/quotations";
import { formatCurrency } from "../../helpers";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

export default function ConvertLeadToBookingModal({ lead, isOpen, onClose }) {
    const [manualPropertyId, setManualPropertyId] = useState("");
    const [manualAmount, setManualAmount] = useState("");
    const convert = useConvertLeadToBooking();

    const { data: quotations, isPending: quotationsPending } = useQuery({
        queryKey: ["quotations", "lead-conversion", lead?.id],
        queryFn: () => fetchQuotations({ leadId: lead.id, limit: 10 }),
        enabled: isOpen && Boolean(lead?.id),
        retry: 1
    });

    const acceptedQuotation = Array.isArray(quotations)
        ? quotations.find((q) => q.status === "ACCEPTED")
        : null;

    const { data: properties, isPending } = useQuery({
        queryKey: ["properties", "available", "booking-conversion", lead?.projectId || "all"],
        queryFn: () =>
            fetchProperties(lead?.projectId || null, { status: "AVAILABLE", limit: 200 }),
        staleTime: 60 * 1000,
        retry: 1,
        enabled: isOpen && Boolean(lead)
    });

    if (!lead) return null;

    // Quotation-derived values are the source of truth while an accepted
    // quotation exists (server revalidates all of it) — derived during
    // render, no effect needed.
    const propertyId = acceptedQuotation?.propertyId || manualPropertyId;
    const amount = acceptedQuotation?.totalAmount
        ? String(Number(acceptedQuotation.totalAmount))
        : manualAmount;

    const propertyList = Array.isArray(properties) ? properties : [];
    const amountValue = Number(amount);
    const lockedByQuotation = Boolean(acceptedQuotation && acceptedQuotation.propertyId);
    const canSubmit = Boolean(propertyId) && (Boolean(acceptedQuotation) || amountValue > 0);

    const handlePropertyChange = (value) => {
        if (lockedByQuotation) return;
        setManualPropertyId(value);
        const selected = propertyList.find((p) => p.id === value);
        if (selected && selected.price && !acceptedQuotation) {
            setManualAmount(String(selected.price));
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        convert.mutate(
            acceptedQuotation
                ? {
                      id: lead.id,
                      propertyId,
                      quotationId: acceptedQuotation.id,
                      paymentStatus: "PENDING"
                  }
                : {
                      id: lead.id,
                      propertyId,
                      amount: amountValue,
                      paymentStatus: "PENDING"
                  },
            {
                onSuccess: () => onClose()
            }
        );
    };

    const quotationUnitLabel = acceptedQuotation?.property
        ? `${acceptedQuotation.property.title}${acceptedQuotation.property.unitNumber ? ` • Unit ${acceptedQuotation.property.unitNumber}` : ""}`
        : "any available unit in the quoted project";

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Convert to Booking" maxWidth="max-w-lg">
            <p className="text-sm text-gray-500 mb-1">
                Confirm the unit and amount for <span className="font-bold text-gray-900">{lead.name}</span>.
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
                This creates a real booking from this lead and reserves the unit. The lead moves to Booking automatically.
            </p>

            {acceptedQuotation && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-4 font-medium">
                    Accepted quotation found: {formatCurrency(acceptedQuotation.totalAmount)} for {quotationUnitLabel}.
                    The booking will link to it and the server will use the quotation total as the booking amount.
                </div>
            )}

            {!acceptedQuotation && !quotationsPending && Array.isArray(quotations) && quotations.length > 0 && (
                <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 mb-4">
                    Quotations exist for this lead but none is ACCEPTED yet. Booking proceeds with the manual amount below.
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                        {acceptedQuotation ? "Quoted unit *" : lead.projectId ? "Available unit in lead's project *" : "Available unit *"}
                    </label>
                    <select
                        required
                        value={propertyId}
                        onChange={(e) => handlePropertyChange(e.target.value)}
                        className={inputClass}
                        disabled={isPending || lockedByQuotation}
                    >
                        <option value="">
                            {isPending ? "Loading available units..." : "Select a unit"}
                        </option>
                        {propertyList.map((property) => (
                            <option key={property.id} value={property.id}>
                                {property.title}
                                {property.unitNumber ? ` • Unit ${property.unitNumber}` : ""}
                                {property.configuration ? ` • ${property.configuration}` : ""}
                                {property.price ? ` — ${formatCurrency(property.price)}` : ""}
                            </option>
                        ))}
                        {lockedByQuotation && !propertyList.some((p) => p.id === propertyId) && (
                            <option value={propertyId}>{quotationUnitLabel}</option>
                        )}
                    </select>
                    {!isPending && propertyList.length === 0 && !lockedByQuotation && (
                        <p className="text-xs text-red-500 mt-1 font-semibold">
                            No available units found. Add or free up inventory first.
                        </p>
                    )}
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                        {acceptedQuotation ? "Quotation total (server enforced) *" : "Booking amount (₹) *"}
                    </label>
                    <input
                        type="number"
                        required
                        min="1"
                        value={amount}
                        onChange={(e) => setManualAmount(e.target.value)}
                        placeholder="e.g. 1500000"
                        readOnly={Boolean(acceptedQuotation)}
                        className={`${inputClass} ${acceptedQuotation ? "bg-gray-100 text-gray-600 font-bold cursor-not-allowed" : ""}`}
                    />
                    {amountValue > 0 && <p className="text-xs text-gray-500 mt-1 font-semibold">{formatCurrency(amountValue)}</p>}
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
                        disabled={!canSubmit || convert.isPending}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {convert.isPending ? "Confirming..." : "Confirm Booking"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
