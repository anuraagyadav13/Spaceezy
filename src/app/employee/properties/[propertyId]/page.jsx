// src/app/employee/properties/[propertyId]/page.jsx  (/employee/properties/:propertyId)
// Read-only version of the property detail view, scoped to the
// signed-in employee's own leads, visits and bookings for it.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getCurrentEmployeeId } from "../../../../lib/auth";
import { getPropertyById, getLeadsForProperty, getSiteVisitsForProperty, getBookingsForProperty } from "../../../../lib/store";
import PropertyGallery from "../../../../components/shared/PropertyGallery";
import { ArrowLeft, MapPin, Calendar, Users as UsersIcon, FileText } from "lucide-react";

const STATUS_STYLES = {
    "Fully Occupied": "bg-emerald-50 text-emerald-700",
    "Renovating": "bg-orange-50 text-orange-700",
    "Pre-Launch": "bg-blue-50 text-blue-700",
    "Available": "bg-purple-50 text-purple-700",
};
const VISIT_STYLES = {
    Scheduled: "bg-purple-100 text-purple-700",
    Completed: "bg-emerald-100 text-emerald-700",
    Cancelled: "bg-gray-100 text-gray-500",
};
const PAYMENT_STYLES = {
    Paid: "bg-emerald-100 text-emerald-700",
    Partial: "bg-orange-100 text-orange-600",
    Pending: "bg-gray-100 text-gray-500",
};

export default function EmployeePropertyDetailPage() {
    const params = useParams();
    const [property, setProperty] = useState(null);
    const [leads, setLeads] = useState([]);
    const [visits, setVisits] = useState([]);
    const [bookings, setBookings] = useState([]);

    useEffect(() => {
        const employeeId = getCurrentEmployeeId();
        const p = getPropertyById(params.propertyId);
        setProperty(p);
        if (p && employeeId) {
            setLeads(getLeadsForProperty(p.name).filter((l) => l.assignedTo === employeeId));
            setVisits(getSiteVisitsForProperty(p.name).filter((v) => v.assignedTo === employeeId));
            setBookings(getBookingsForProperty(p.name).filter((b) => b.assignedTo === employeeId));
        }
    }, [params.propertyId]);

    if (!property) return <div className="p-8">Loading...</div>;

    const occupancyPct = property.totalUnits ? Math.round((property.occupiedUnits / property.totalUnits) * 100) : 0;

    return (
        <div className="flex flex-col h-full overflow-y-auto pt-16 md:pt-0">
            <div className="px-4 sm:px-8 py-6">
                <Link href="/employee/properties" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600 mb-4">
                    <ArrowLeft size={16} /> Back to properties
                </Link>
            </div>

            <div className="px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-3 gap-6 pb-8">
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <PropertyGallery images={property.gallery?.length ? property.gallery : [property.image]} alt={property.name} />

                    <div className="bg-white rounded-[24px] p-6 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                            <div>
                                <span className={`inline-block text-[11px] font-bold px-3 py-1 rounded-full mb-2 ${STATUS_STYLES[property.status] || "bg-gray-100 text-gray-700"}`}>{property.status}</span>
                                <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
                                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin size={14} /> {property.address}</p>
                            </div>
                            {property.price && (
                                <div className="text-right shrink-0">
                                    <p className="text-xs text-gray-400">Value</p>
                                    <p className="text-xl font-bold text-purple-600">{property.price}</p>
                                </div>
                            )}
                        </div>

                        {property.description && <p className="text-sm text-gray-600 leading-relaxed mb-6">{property.description}</p>}

                        {property.amenities?.length > 0 && (
                            <div className="mb-6">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Amenities</p>
                                <div className="flex flex-wrap gap-2">
                                    {property.amenities.map((a, i) => (
                                        <span key={i} className="text-xs font-medium text-gray-700 bg-gray-50 px-3 py-1.5 rounded-full">{a}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-50">
                            <div><p className="text-xs text-gray-400 mb-1">Type</p><p className="text-sm font-medium text-gray-800">{property.type}</p></div>
                            {property.yearBuilt && <div><p className="text-xs text-gray-400 mb-1">Built</p><p className="text-sm font-medium text-gray-800">{property.yearBuilt}</p></div>}
                            {property.floors && <div><p className="text-xs text-gray-400 mb-1">Floors</p><p className="text-sm font-medium text-gray-800">{property.floors}</p></div>}
                            {property.parkingSpots && <div><p className="text-xs text-gray-400 mb-1">Parking</p><p className="text-sm font-medium text-gray-800">{property.parkingSpots} spots</p></div>}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="bg-white rounded-[24px] p-6 shadow-sm">
                        <h3 className="font-medium text-[15px] text-gray-900 mb-4">Occupancy</h3>
                        <div className="flex justify-between text-xs text-gray-500 mb-2">
                            <span>{property.occupiedUnits} of {property.totalUnits} units occupied</span>
                            <span className="font-medium text-gray-700">{occupancyPct}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                            <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${occupancyPct}%` }} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-center">
                            <div className="bg-gray-50 rounded-xl py-3"><p className="text-lg font-bold text-gray-900">{property.occupiedUnits}</p><p className="text-[11px] text-gray-500">Occupied</p></div>
                            <div className="bg-gray-50 rounded-xl py-3"><p className="text-lg font-bold text-gray-900">{property.totalUnits - property.occupiedUnits}</p><p className="text-[11px] text-gray-500">Vacant</p></div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[24px] p-6 shadow-sm">
                        <h3 className="font-medium text-[15px] text-gray-900 mb-4">Your Activity Here</h3>
                        <div className="flex flex-col gap-3 text-sm">
                            <div className="flex justify-between"><span className="text-gray-500">Your Leads</span><span className="font-bold text-gray-900">{leads.length}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Your Site Visits</span><span className="font-bold text-gray-900">{visits.length}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Your Bookings</span><span className="font-bold text-gray-900">{bookings.length}</span></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4"><UsersIcon size={16} className="text-purple-500" /><h3 className="font-medium text-[15px] text-gray-900">Your Leads Here</h3></div>
                    <div className="flex flex-col gap-3">
                        {leads.map((l) => (
                            <div key={l.id} className="flex items-center justify-between text-sm">
                                <div><p className="font-medium text-gray-800">{l.name}</p><p className="text-xs text-gray-400">{l.budget} · {l.stage}</p></div>
                            </div>
                        ))}
                        {leads.length === 0 && <p className="text-sm text-gray-400">None of your leads are tied to this property yet.</p>}
                    </div>
                </div>

                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4"><Calendar size={16} className="text-purple-500" /><h3 className="font-medium text-[15px] text-gray-900">Your Site Visits</h3></div>
                    <div className="flex flex-col gap-3">
                        {visits.map((v) => (
                            <div key={v.id} className="flex items-center justify-between text-sm">
                                <div><p className="font-medium text-gray-800">{v.leadName}</p><p className="text-xs text-gray-400">{v.date} · {v.time}</p></div>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${VISIT_STYLES[v.status]}`}>{v.status}</span>
                            </div>
                        ))}
                        {visits.length === 0 && <p className="text-sm text-gray-400">No visits scheduled.</p>}
                    </div>
                </div>
            </div>

            <div className="px-4 sm:px-8 pb-8">
                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4"><FileText size={16} className="text-purple-500" /><h3 className="font-medium text-[15px] text-gray-900">Your Bookings</h3></div>
                    <div className="flex flex-col gap-3">
                        {bookings.map((b) => (
                            <div key={b.id} className="flex items-center justify-between text-sm">
                                <div><p className="font-medium text-gray-800">{b.clientName}</p><p className="text-xs text-gray-400">{b.unit} · {b.amount}</p></div>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${PAYMENT_STYLES[b.paymentStatus]}`}>{b.paymentStatus}</span>
                            </div>
                        ))}
                        {bookings.length === 0 && <p className="text-sm text-gray-400">No bookings yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}