"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Ban } from "lucide-react";
import { fetchBookings, cancelBooking } from "../../../../lib/api/bookings";
import { showToast } from "../../../../lib/toast";
import Modal from "../../../../components/shared/Modal";
import { PermissionGate } from "../../../../features/auth/components/PermissionGate";
import { formatCurrency } from "../../../../features/pipeline/helpers";

export default function CancellationsPage() {
    const queryClient = useQueryClient();
    const [target, setTarget] = useState(null);

    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ["bookings"],
        queryFn: () => fetchBookings({ limit: 200 }),
        retry: 1
    });

    const cancelMutation = useMutation({
        mutationFn: (id) => cancelBooking(id),
        onSuccess: () => {
            showToast("Booking cancelled and inventory released");
            setTarget(null);
        },
        onError: (err) => showToast(err.message || "Failed to cancel booking", "error"),
        onSettled: () =>
            queryClient.invalidateQueries({
                predicate: (q) =>
                    ["bookings", "leads", "pipeline", "properties", "inventory", "customers"].some((key) => q.queryKey[0] === key)
            })
    });

    const bookings = Array.isArray(data) ? data : data?.bookings || [];
    const active = bookings.filter((b) => b.paymentStatus === "PENDING" || b.paymentStatus === "PARTIAL");
    const cancelled = bookings.filter((b) => b.paymentStatus === "CANCELLED");

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Booking Cancellations</h1>
                <p className="text-sm text-gray-500">Cancel active reservations safely — sold units are never released automatically.</p>
            </div>

            {isLoading && (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />
                    ))}
                </div>
            )}

            {isError && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">Failed to load bookings</p>
                    <p className="text-xs text-red-500 mb-3">{error?.message || "Unknown error"}</p>
                    <button onClick={() => refetch()} className="text-xs font-bold text-red-600 underline">Retry</button>
                </div>
            )}

            {!isLoading && !isError && (
                <>
                    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold text-gray-900">Active reservations</h2>
                                <p className="text-xs text-gray-400">Cancelling returns a reserved unit to inventory and moves the lead back.</p>
                            </div>
                            <span className="text-[11px] font-bold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">{active.length}</span>
                        </div>
                        {active.length === 0 ? (
                            <div className="p-8 text-center">
                                <Ban size={24} className="mx-auto text-gray-300 mb-2" />
                                <p className="text-sm font-bold text-gray-700">No active bookings to cancel</p>
                            </div>
                        ) : (
                            active.map((b) => (
                                <div key={b.id} className="px-5 py-4 border-b border-gray-50 last:border-0 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">
                                            {b.customer?.name || "Unknown customer"}
                                            <span className="text-gray-400 font-medium ml-2">{b.project?.name} · {b.property ? (b.property.unitNumber || b.property.title) : "No unit"}</span>
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {formatCurrency(b.amount)} · {b.paymentStatus}
                                            {b.lead?.name ? ` · Lead: ${b.lead.name}` : ""}
                                        </p>
                                    </div>
                                    <PermissionGate permission="booking:update">
                                        <button
                                            onClick={() => setTarget(b)}
                                            className="px-3.5 py-2 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                                        >
                                            Cancel booking
                                        </button>
                                    </PermissionGate>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold text-gray-900">Cancellation history</h2>
                                <p className="text-xs text-gray-400">Previously cancelled reservations with their lead provenance.</p>
                            </div>
                            <span className="text-[11px] font-bold bg-red-50 text-red-500 px-2.5 py-1 rounded-full">{cancelled.length}</span>
                        </div>
                        {cancelled.length === 0 ? (
                            <div className="p-8 text-center">
                                <AlertCircle size={24} className="mx-auto text-gray-300 mb-2" />
                                <p className="text-sm font-bold text-gray-700">No cancellations yet</p>
                            </div>
                        ) : (
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                        <th className="p-4">Customer</th>
                                        <th className="p-4">Project / Unit</th>
                                        <th className="p-4">Lead</th>
                                        <th className="p-4 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {cancelled.map((b) => (
                                        <tr key={b.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-bold text-gray-900">{b.customer?.name || "Unknown"}</td>
                                            <td className="p-4 text-gray-600">{b.project?.name || "—"} · {b.property ? (b.property.unitNumber || b.property.title) : "—"}</td>
                                            <td className="p-4 text-gray-600">{b.lead?.name || "—"}</td>
                                            <td className="p-4 text-right font-extrabold text-gray-500">{formatCurrency(b.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            <Modal isOpen={Boolean(target)} onClose={() => setTarget(null)} title="Cancel booking" maxWidth="max-w-md">
                <div className="space-y-4">
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-xs text-red-700 font-medium">
                        This cancels the reservation for <span className="font-bold">{target?.customer?.name}</span> and releases the reserved unit
                        back to inventory. Fully paid (SOLD) bookings cannot be cancelled here.
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setTarget(null)}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                            Keep booking
                        </button>
                        <button
                            onClick={() => cancelMutation.mutate(target.id)}
                            disabled={cancelMutation.isPending}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60"
                        >
                            {cancelMutation.isPending ? "Cancelling..." : "Confirm cancel"}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
