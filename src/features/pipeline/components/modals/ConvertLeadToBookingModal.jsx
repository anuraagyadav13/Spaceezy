"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Modal from "../../../../components/shared/Modal";
import { useConvertLeadToBooking } from "../../hooks/useLeadMutations";
import { fetchProperties } from "../../../../lib/api/properties";
import { formatCurrency } from "../../helpers";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

export default function ConvertLeadToBookingModal({ lead, isOpen, onClose }) {
    const [propertyId, setPropertyId] = useState("");
    const [amount, setAmount] = useState("");
    const convert = useConvertLeadToBooking();

    const { data: properties, isPending } = useQuery({
        queryKey: ["properties", "available", "booking-conversion"],
        queryFn: () => fetchProperties(null, { status: "AVAILABLE", limit: 200 }),
        staleTime: 60 * 1000,
        retry: 1,
        enabled: isOpen
    });

    if (!lead) return null;

    const propertyList = Array.isArray(properties) ? properties : [];
    const amountValue = Number(amount);
    const canSubmit = propertyId && amountValue > 0;

    const handlePropertyChange = (value) => {
        setPropertyId(value);
        const selected = propertyList.find((p) => p.id === value);
        if (selected && selected.price) {
            setAmount(String(selected.price));
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        convert.mutate(
            {
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

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Convert to Booking" maxWidth="max-w-lg">
            <p className="text-sm text-gray-500 mb-1">
                Confirm the unit and amount for <span className="font-bold text-gray-900">{lead.name}</span>.
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
                This creates a real booking from this lead and reserves the unit. The lead moves to Booking automatically.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Available unit *</label>
                    <select
                        required
                        value={propertyId}
                        onChange={(e) => handlePropertyChange(e.target.value)}
                        className={inputClass}
                        disabled={isPending}
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
                    </select>
                    {!isPending && propertyList.length === 0 && (
                        <p className="text-xs text-red-500 mt-1 font-semibold">
                            No available units found. Add or free up inventory first.
                        </p>
                    )}
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Booking amount (₹) *</label>
                    <input
                        type="number"
                        required
                        min="1"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="e.g. 1500000"
                        className={inputClass}
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
