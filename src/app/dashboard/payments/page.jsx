"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Wallet, ArrowRight } from "lucide-react";
import { fetchBookings } from "../../../lib/api/bookings";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";
import { formatCurrency } from "../../../features/pipeline/helpers";

const STATUS_STYLES = {
    PENDING: "bg-gray-100 text-gray-500",
    PARTIAL: "bg-orange-100 text-orange-600",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-red-100 text-red-600"
};

const Denied = (
    <div className="p-8 h-full flex flex-col justify-center items-center text-center">
        <Wallet size={36} className="text-gray-300 mb-3" />
        <p className="text-sm font-bold text-gray-700">You do not have permission to view payments.</p>
        <p className="text-xs text-gray-400 mt-1">Ask your administrator for payment access.</p>
    </div>
);

export default function DashboardPaymentsPage() {
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ["bookings", "payments"],
        queryFn: () => fetchBookings({ limit: 200 }),
        retry: 1
    });

    const bookings = Array.isArray(data) ? data : data?.bookings || [];
    const active = bookings.filter((b) => b.paymentStatus === "PENDING" || b.paymentStatus === "PARTIAL");
    const collected = bookings.filter((b) => b.paymentStatus === "COMPLETED");
    const cancelled = bookings.filter((b) => b.paymentStatus === "CANCELLED");

    const sum = (list) => list.reduce((acc, b) => acc + Number(b.amount || 0), 0);

    return (
        <PermissionGate permission="booking:view" fallback={Denied}>
            <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Payments Module</h1>
                        <p className="text-sm text-gray-500">Payment status and totals collected from live booking records.</p>
                    </div>
                    <Link href="/dashboard/bookings" className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-purple-700">
                        Manage bookings <ArrowRight size={14} />
                    </Link>
                </div>

                {isLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
                        ))}
                    </div>
                )}

                {isError && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
                        <p className="text-sm font-bold text-red-600 mb-2">Failed to load payments</p>
                        <p className="text-xs text-red-500 mb-3">{error?.message || "Unknown error"}</p>
                        <button onClick={() => refetch()} className="text-xs font-bold text-red-600 underline">Retry</button>
                    </div>
                )}

                {!isLoading && !isError && (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Collected (Paid)</p>
                                <p className="text-xl font-extrabold text-emerald-600 mt-1">{formatCurrency(sum(collected))}</p>
                                <p className="text-[11px] text-gray-400 mt-1">{collected.length} booking(s) fully paid</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Outstanding</p>
                                <p className="text-xl font-extrabold text-orange-600 mt-1">{formatCurrency(sum(active))}</p>
                                <p className="text-[11px] text-gray-400 mt-1">{active.length} booking(s) pending or partial</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cancelled</p>
                                <p className="text-xl font-extrabold text-red-500 mt-1">{formatCurrency(sum(cancelled))}</p>
                                <p className="text-[11px] text-gray-400 mt-1">{cancelled.length} booking(s) cancelled</p>
                            </div>
                        </div>

                        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                        <th className="p-4">Customer</th>
                                        <th className="p-4">Project / Unit</th>
                                        <th className="p-4">Amount</th>
                                        <th className="p-4">Booking Date</th>
                                        <th className="p-4 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {bookings.map((b) => (
                                        <tr key={b.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-bold text-gray-900">{b.customer?.name || "Unknown"}</td>
                                            <td className="p-4 text-gray-600">
                                                {b.project?.name || "—"} · {b.property ? (b.property.unitNumber || b.property.title) : "No unit"}
                                            </td>
                                            <td className="p-4 font-extrabold text-purple-700">{formatCurrency(b.amount)}</td>
                                            <td className="p-4 text-gray-400">{b.bookingDate ? new Date(b.bookingDate).toLocaleDateString() : "—"}</td>
                                            <td className="p-4 text-right">
                                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_STYLES[b.paymentStatus] || ""}`}>
                                                    {b.paymentStatus}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {bookings.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-10 text-center">
                                                <p className="text-sm font-bold text-gray-700">No payment records yet</p>
                                                <p className="text-xs text-gray-400 mt-1">Payments appear here once bookings are created.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </PermissionGate>
    );
}
