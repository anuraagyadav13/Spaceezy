// src/app/employee/properties/page.jsx  (/employee/properties)
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentEmployeeId } from "../../../lib/auth";
import { getPropertiesByEmployee } from "../../../lib/store";
import PropertyImage from "../../../components/shared/PropertyImage";

export default function EmployeePropertiesPage() {
    const [properties, setProperties] = useState([]);

    useEffect(() => {
        const id = getCurrentEmployeeId();
        if (id) setProperties(getPropertiesByEmployee(id));
    }, []);

    return (
        <div className="flex flex-col h-full overflow-y-auto pt-16 md:pt-0">
            <div className="px-4 sm:px-8 py-6">
                <h1 className="text-2xl font-bold text-gray-900">My Properties</h1>
                <p className="text-sm text-gray-500 mt-1">Properties you manage or are actively selling.</p>
            </div>
            <div className="px-4 sm:px-8 pb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {properties.map((p) => (
                    <Link
                        key={p.id}
                        href={`/employee/properties/${p.id}`}
                        className="block bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:border-purple-200 transition-all group"
                    >
                        <div className="h-36 overflow-hidden">
                            <PropertyImage src={p.image} alt={p.name} className="w-full h-full group-hover:scale-105 transition-transform duration-500" />
                        </div>
                        <div className="p-5">
                            <h3 className="text-lg font-bold text-gray-900 mb-1">{p.name}</h3>
                            <p className="text-xs text-gray-500 mb-3">{p.address}</p>
                            <div className="flex items-center justify-between">
                                <span className="inline-block bg-purple-50 text-purple-700 text-xs font-bold px-3 py-1 rounded-full">{p.status}</span>
                                <span className="text-xs font-bold text-purple-600 group-hover:underline">View →</span>
                            </div>
                        </div>
                    </Link>
                ))}
                {properties.length === 0 && <p className="text-sm text-gray-400">No properties assigned yet.</p>}
            </div>
        </div>
    );
}