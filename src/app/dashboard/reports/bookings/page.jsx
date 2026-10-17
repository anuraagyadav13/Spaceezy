"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchBookings } from "../../../../lib/api/bookings";
import { showToast } from "../../../../lib/toast";

const formatRupees = (n) => {
    if (!n) return "₹0";
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    return `₹${Number(n).toLocaleString("en-IN")}`;
};

export default function BookingReportsPage() {
    const [bookings, setBookings] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchBookings({ limit: 500 });
                setBookings(data.bookings || data || []);
            } catch (err) {
                showToast(`Failed to load booking reports: ${err.message}`, "error");
            }
        };
        loadData();
    }, []);

    const stats = useMemo(() => {
        const amountOf = (b) => Number(b.amount) || 0;
        const byStatus = (status) => bookings.filter((b) => b.paymentStatus === status);
        const sum = (list) => list.reduce((acc, b) => acc + amountOf(b), 0);
        return {
            total: sum(bookings),
            completed: sum(byStatus("COMPLETED")),
            partial: sum(byStatus("PARTIAL")),
            pending: sum(byStatus("PENDING")),
            completedCount: byStatus("COMPLETED").length,
            totalCount: bookings.length
        };
    }, [bookings]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Booking & Agreement Revenue Analytics</h1>
                <p className="text-sm text-gray-500">Computed from live bookings — total agreement value vs payment collections.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-400 uppercase">Total Agreement Value</p>
                        <p className="text-3xl font-extrabold text-purple-700 mt-1">{formatRupees(stats.total)}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{stats.totalCount} booking{stats.totalCount === 1 ? "" : "s"}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-400 uppercase">Collected (Completed)</p>
                        <p className="text-3xl font-extrabold text-emerald-600 mt-1">{formatRupees(stats.completed)}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{stats.completedCount} completed payment{stats.completedCount === 1 ? "" : "s"}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-400 uppercase">Partially Collected</p>
                        <p className="text-3xl font-extrabold text-orange-500 mt-1">{formatRupees(stats.partial)}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-400 uppercase">Pending</p>
                        <p className="text-3xl font-extrabold text-gray-700 mt-1">{formatRupees(stats.pending)}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
