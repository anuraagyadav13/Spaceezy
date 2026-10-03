"use client";
import { useEffect, useState } from "react";
import { fetchBookings } from "../../../../lib/api/bookings";
import { showToast } from "../../../../lib/toast";

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

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Booking & Agreement Revenue Analytics</h1>
                <p className="text-sm text-gray-500">Track total agreement value vs payment collections.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-400 uppercase">Total Agreement Value</p>
                        <p className="text-3xl font-extrabold text-purple-700 mt-1">₹3.2 Cr</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-400 uppercase">Actual Tokens Collected</p>
                        <p className="text-3xl font-extrabold text-emerald-600 mt-1">₹35.0 L</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
