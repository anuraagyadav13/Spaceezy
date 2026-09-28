// src/app/property/page.jsx
"use client";

import { useState } from "react";
import Link from "next/link";
import PropertyCard from "../../components/ui/PropertyCard";

export default function PropertiesPage() {
    const allProperties = [
        {
            id: 1,
            title: "Luxury Sky Villa",
            location: "South Delhi, Delhi",
            price: "₹4.5 Cr",
            bhk: "4",
            area: "3,200",
            type: "Residential",
            availability: "Ready-to-move",
            furnished: "Furnished",
            image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=800&auto=format&fit=crop"
        },
        {
            id: 2,
            title: "Premium Office Space",
            location: "Connaught Place, Delhi",
            price: "₹1.2 L/mo",
            bhk: "N/A",
            area: "1,500",
            type: "Commercial",
            availability: "Under-construction",
            furnished: "Unfurnished",
            image: "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800&auto=format&fit=crop"
        },
        {
            id: 3,
            title: "Greenwood Residency",
            location: "Gurugram, Haryana",
            price: "₹1.8 Cr",
            bhk: "3",
            area: "1,850",
            type: "Residential",
            availability: "Ready-to-move",
            furnished: "Semi-furnished",
            image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?q=80&w=800&auto=format&fit=crop"
        }
    ];

    const [locationInput, setLocationInput] = useState("");
    const [selectedType, setSelectedType] = useState("");
    const [selectedBhk, setSelectedBhk] = useState("");
    const [selectedAvailability, setSelectedAvailability] = useState("Any Status");
    const [filteredProperties, setFilteredProperties] = useState(allProperties);

    const handleApplyFilters = () => {
        let result = allProperties;
        if (locationInput.trim() !== "") {
            result = result.filter(item =>
                item.location.toLowerCase().includes(locationInput.toLowerCase())
            );
        }
        if (selectedType !== "") {
            result = result.filter(item => item.type.toLowerCase() === selectedType.toLowerCase());
        }
        if (selectedBhk !== "") {
            result = result.filter(item => item.bhk === selectedBhk);
        }
        if (selectedAvailability !== "Any Status") {
            result = result.filter(item => item.availability.toLowerCase() === selectedAvailability.toLowerCase());
        }
        setFilteredProperties(result);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <Link href="/" className="font-bold text-2xl tracking-tight text-gray-900">
                        SpaceEzy
                    </Link>

                    <nav className="hidden md:flex gap-8 text-sm font-medium text-gray-600 items-center mx-auto">
                        <Link href="/" className="hover:text-purple-600 transition-colors">Home</Link>
                    </nav>

                    <div className="flex items-center gap-4">
                        <Link href="/property/post" className="bg-black text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors">
                            Post Property Free
                        </Link>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex flex-col lg:flex-row gap-8">
                    <aside className="w-full lg:w-72 shrink-0">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-6">
                            <h2 className="text-lg font-bold mb-6">Search Filters</h2>
                            <div className="space-y-6">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">Location</label>
                                    <input
                                        type="text"
                                        placeholder="Search city, locality..."
                                        value={locationInput}
                                        onChange={(e) => setLocationInput(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">Property Type</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['Residential', 'Commercial', 'Apartment', 'Villa'].map(type => (
                                            <button
                                                key={type}
                                                onClick={() => setSelectedType(selectedType === type ? "" : type)}
                                                className={`px-3 py-1.5 border rounded-lg text-sm transition-colors ${selectedType === type
                                                        ? "border-purple-600 bg-purple-50 text-purple-600 font-medium"
                                                        : "border-gray-200 text-gray-600 hover:border-purple-600 hover:text-purple-600"
                                                    }`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">BHK</label>
                                    <div className="flex gap-2">
                                        {['1', '2', '3', '4+'].map(bhk => (
                                            <button
                                                key={bhk}
                                                onClick={() => setSelectedBhk(selectedBhk === bhk ? "" : bhk)}
                                                className={`flex-1 py-1.5 border rounded-lg text-sm transition-colors ${selectedBhk === bhk
                                                        ? "border-purple-600 bg-purple-50 text-purple-600 font-medium"
                                                        : "border-gray-200 text-gray-600 hover:bg-purple-50 hover:border-purple-200"
                                                    }`}
                                            >
                                                {bhk}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">Availability</label>
                                    <select
                                        value={selectedAvailability}
                                        onChange={(e) => setSelectedAvailability(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option>Any Status</option>
                                        <option>Ready-to-move</option>
                                        <option>Under-construction</option>
                                    </select>
                                </div>
                                <button
                                    onClick={handleApplyFilters}
                                    className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
                                >
                                    Apply Filters
                                </button>
                            </div>
                        </div>
                    </aside>
                    <main className="flex-1">
                        <div className="flex justify-between items-center mb-6">
                            <h1 className="text-2xl font-bold text-gray-900">Properties for Sale</h1>
                            <span className="text-gray-500 text-sm">Showing {filteredProperties.length} results</span>
                        </div>
                        {filteredProperties.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {filteredProperties.map(property => (
                                    <PropertyCard key={property.id} property={property} />
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
                                <p className="text-gray-500 text-lg mb-2">No properties found matching your criteria.</p>
                                <button
                                    onClick={() => {
                                        setLocationInput("");
                                        setSelectedType("");
                                        setSelectedBhk("");
                                        setSelectedAvailability("Any Status");
                                        setFilteredProperties(allProperties);
                                    }}
                                    className="text-purple-600 font-medium text-sm underline hover:text-purple-800"
                                >
                                    Reset all filters
                                </button>
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}