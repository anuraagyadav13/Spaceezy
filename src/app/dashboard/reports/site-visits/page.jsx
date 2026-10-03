"use client";
import { useEffect, useState } from "react";
import { CalendarCheck, MapPin } from "lucide-react";
import { fetchSiteVisits } from "../../../../lib/api/siteVisits";
import { showToast } from "../../../../lib/toast";

export default function SiteVisitReportsPage() {
    const [visits, setVisits] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchSiteVisits({ limit: 100 });
                setVisits(data.siteVisits || data || []);
            } catch (err) {
                showToast(`Failed to load site visits: ${err.message}`, "error");
            }
        };
        loadData();
    }, []);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Site Visit Analytics & Conversion</h1>
                <p className="text-sm text-gray-500">Track site visits initiated, scheduled, conducted, and converted to bookings.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <h2 className="text-sm font-extrabold text-gray-400 uppercase tracking-wider">Site Visits Summary</h2>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-2xl font-black text-gray-900">{visits.length}</p>
                        <p className="text-xs font-bold text-gray-500">Scheduled</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-2xl font-black text-emerald-600">12</p>
                        <p className="text-xs font-bold text-gray-500">Conducted</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-2xl font-black text-purple-700">4</p>
                        <p className="text-xs font-bold text-gray-500">Converted to Booking</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
