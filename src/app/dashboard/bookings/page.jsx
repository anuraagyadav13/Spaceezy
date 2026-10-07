"use client";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBookings, updatePaymentStatus } from "../../../lib/api/bookings";
import { showToast } from "../../../lib/toast";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";
import { formatCurrency } from "../../../features/pipeline/helpers";

const PAYMENT_STYLES = {
    PENDING: "bg-gray-100 text-gray-500",
    PARTIAL: "bg-orange-100 text-orange-600",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-red-100 text-red-600"
};

// Server-enforced transitions: PENDING <-> PARTIAL -> COMPLETED.
// COMPLETED and CANCELLED are terminal for this control.
const NEXT_STATUS = {
    PENDING: "PARTIAL",
    PARTIAL: "COMPLETED"
};

export default function DashboardBookingsPage() {
    const queryClient = useQueryClient();

    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ["bookings"],
        queryFn: () => fetchBookings({ limit: 100 }),
        retry: 1
    });

    const paymentMutation = useMutation({
        mutationFn: ({ id, paymentStatus }) => updatePaymentStatus(id, paymentStatus),
        onSuccess: () => showToast("Payment status updated"),
        onError: (err) => showToast(err.message || "Failed to update payment status", "error"),
        onSettled: () =>
            queryClient.invalidateQueries({
                predicate: (q) =>
                    ["bookings", "properties", "inventory", "leads", "pipeline", "customers"].some((key) =>
                        q.queryKey[0] === key
                    )
            })
    });

    const bookings = Array.isArray(data) ? data : data?.bookings || [];

    const cyclePayment = (booking) => {
        const next = NEXT_STATUS[booking.paymentStatus];
        if (!next) return;
        paymentMutation.mutate({ id: booking.id, paymentStatus: next });
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
                    <p className="text-sm text-gray-500 mt-1">Confirmed sales and their payment status. Click a status to update it.</p>
                </div>
                <PermissionGate permission="booking:create">
                    <Link
                        href="/dashboard/bookings/wizard"
                        className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200"
                    >
                        + New Booking
                    </Link>
                </PermissionGate>
            </div>

            <div className="px-4 sm:px-8 pb-8">
                {isLoading && (
                    <div className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                        ))}
                    </div>
                )}

                {isError && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
                        <p className="text-sm font-bold text-red-600 mb-2">Failed to load bookings</p>
                        <p className="text-xs text-red-500 mb-3">{error?.message || "Unknown error"}</p>
                        <button onClick={() => refetch()} className="text-xs font-bold text-red-600 underline">
                            Retry
                        </button>
                    </div>
                )}

                {!isLoading && !isError && (
                    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                        <div className="hidden md:grid grid-cols-6 gap-4 px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                            <span className="col-span-2">Client</span>
                            <span>Property / Unit</span>
                            <span>Amount</span>
                            <span>Sales Exec</span>
                            <span className="text-right">Payment</span>
                        </div>
                        {bookings.map((b) => {
                            const nextStatus = NEXT_STATUS[b.paymentStatus];
                            return (
                                <div key={b.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 md:gap-4 px-6 py-4 border-b border-gray-50 last:border-0 items-center">
                                    <div className="md:col-span-2">
                                        <p className="text-sm font-bold text-gray-900">{b.customer?.name || "Unknown customer"}</p>
                                        <p className="text-xs text-gray-400">
                                            {b.bookingDate ? new Date(b.bookingDate).toLocaleDateString() : "—"}
                                            {b.lead?.name ? ` · Lead: ${b.lead.name}` : ""}
                                        </p>
                                    </div>
                                    <p className="text-sm text-gray-700">
                                        {b.project?.name || "—"} · {b.property ? (b.property.unitNumber || b.property.title) : "No unit"}
                                    </p>
                                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(b.amount)}</p>
                                    <p className="text-sm text-gray-500">{b.assignedTo?.name || "Unassigned"}</p>
                                    <div className="md:text-right">
                                        <PermissionGate permission="booking:update" fallback={
                                            <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full ${PAYMENT_STYLES[b.paymentStatus] || ""}`}>
                                                {b.paymentStatus}
                                            </span>
                                        }>
                                            {nextStatus && !paymentMutation.isPending ? (
                                                <button
                                                    onClick={() => cyclePayment(b)}
                                                    className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-transform hover:scale-105 ${PAYMENT_STYLES[b.paymentStatus] || ""}`}
                                                    title={`Update to ${nextStatus}`}
                                                >
                                                    {b.paymentStatus}
                                                </button>
                                            ) : (
                                                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full ${PAYMENT_STYLES[b.paymentStatus] || ""}`}>
                                                    {b.paymentStatus}
                                                </span>
                                            )}
                                        </PermissionGate>
                                    </div>
                                </div>
                            );
                        })}
                        {bookings.length === 0 && (
                            <div className="px-6 py-10 text-center">
                                <p className="text-sm font-bold text-gray-700">No bookings yet</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Convert an accepted quotation or use the booking wizard to reserve a unit.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
