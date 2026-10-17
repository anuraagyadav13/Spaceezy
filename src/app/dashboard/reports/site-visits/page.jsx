"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchSiteVisits } from "../../../../lib/api/siteVisits";
import { fetchBookings } from "../../../../lib/api/bookings";
import { showToast } from "../../../../lib/toast";

export default function SiteVisitReportsPage() {
    const [visits, setVisits] = useState([]);
    const [bookings, setBookings] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [visitsData, bookingsData] = await Promise.all([
                    fetchSiteVisits({ limit: 500 }),
                    fetchBookings({ limit: 500 })
                ]);
                setVisits(visitsData.siteVisits || visitsData.visits || visitsData || []);
                setBookings(bookingsData.bookings || bookingsData || []);
            } catch (err) {
                showToast(`Failed to load site visit reports: ${err.message}`, "error");
            }
        };
        loadData();
    }, []);

    const stats = useMemo(() => {
        const byStatus = (status) => visits.filter((v) => v.status === status);
        const bookedLeadIds = new Set(bookings.map((b) => b.leadId).filter(Boolean));
        const converted = visits.filter((v) => v.leadId && bookedLeadIds.has(v.leadId)).length;
        return {
            scheduled: byStatus("SCHEDULED").length,
            conducted: byStatus("COMPLETED").length,
            noShow: byStatus("NO_SHOW").length,
            cancelled: byStatus("CANCELLED").length,
            converted
        };
    }, [visits, bookings]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Site Visit Analytics & Conversion</h1>
                <p className="text-sm text-gray-500">Computed from live site visits and bookings — no fabricated numbers.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">Site Visits Summary</h2>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-center">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-2xl font-black text-gray-900">{stats.scheduled}</p>
                        <p className="text-xs font-bold text-gray-500">Scheduled</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-2xl font-black text-emerald-600">{stats.conducted}</p>
                        <p className="text-xs font-bold text-gray-500">Conducted</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-2xl font-black text-purple-700">{stats.converted}</p>
                        <p className="text-xs font-bold text-gray-500">Converted to Booking</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-2xl font-black text-orange-500">{stats.noShow}</p>
                        <p className="text-xs font-bold text-gray-500">No Show</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-2xl font-black text-gray-400">{stats.cancelled}</p>
                        <p className="text-xs font-bold text-gray-500">Cancelled</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
