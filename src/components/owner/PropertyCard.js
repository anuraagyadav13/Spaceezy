// src/components/owner/PropertyCard.js
// The whole card is now a link into the property's detail page —
// "Manage" used to be a dead button, this replaces it with a real
// destination.
import Link from "next/link";
import PropertyImage from "../shared/PropertyImage";

export default function PropertyCard({ property }) {
    const occupancyPct = property.totalUnits
        ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
        : 0;

    const statusStyles = {
        "Fully Occupied": "bg-emerald-50 text-emerald-700",
        "Renovating": "bg-orange-50 text-orange-700",
        "Pre-Launch": "bg-blue-50 text-blue-700",
        "Available": "bg-purple-50 text-purple-700",
    };
    const badgeClass = statusStyles[property.status] || "bg-gray-100 text-gray-700";

    return (
        <Link
            href={`/owner/properties/${property.id}`}
            className="block bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:border-purple-200 transition-all group"
        >
            <div className="relative h-44 overflow-hidden">
                <PropertyImage
                    src={property.image}
                    alt={property.name}
                    className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                />
                <span className={`absolute top-3 left-3 text-[11px] font-bold px-3 py-1 rounded-full ${badgeClass}`}>
                    {property.status}
                </span>
            </div>

            <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-1">{property.name}</h3>
                <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                    {property.address}
                </p>
                {property.description && (
                    <p className="text-xs text-gray-400 mb-4 line-clamp-1">{property.description}</p>
                )}

                <div className="flex justify-between text-xs text-gray-500 mb-2">
                    <span>{property.occupiedUnits ?? 0} of {property.totalUnits ?? 0} units occupied</span>
                    <span className="font-medium text-gray-700">{occupancyPct}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-5">
                    <div className="h-full bg-gray-900 rounded-full" style={{ width: `${occupancyPct}%` }} />
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-50">
                    <span className="text-xs font-medium text-gray-500">{property.type}</span>
                    <span className="text-xs font-bold text-purple-600 group-hover:underline">View details →</span>
                </div>
            </div>
        </Link>
    );
}