// src/app/owner/properties/page.jsx  (/owner/properties — redesigned)
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AddPropertyForm from "../../../components/owner/AddPropertyForm";
import PropertyCard from "../../../components/owner/PropertyCard";
import { getProperties, addProperty } from "../../../lib/store";
import { showToast } from "../../../lib/toast";

export default function OwnerPropertiesPage() {
    const [showAddForm, setShowAddForm] = useState(false);
    const [properties, setProperties] = useState([]);

    useEffect(() => {
        setProperties(getProperties());
    }, []);

    const handleAdd = (data) => {
        addProperty(data);
        showToast(`${data.name} added to your portfolio`);
        setProperties(getProperties());
        setShowAddForm(false);
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <header className="hidden md:flex justify-end items-center px-8 py-5 gap-6 border-b border-gray-100 bg-white sticky top-0 z-20">
                <nav className="flex gap-8 font-medium text-[13px] text-gray-400">
                    <Link href="/owner" className="py-2 hover:text-purple-600 transition-colors">Overview</Link>
                    <Link href="/owner/leads" className="py-2 hover:text-purple-600 transition-colors">Leads</Link>
                    <Link href="/owner/properties" className="bg-purple-600 text-white px-5 py-2 rounded-full shadow-sm shadow-purple-200">Properties</Link>
                    <Link href="/owner/team" className="py-2 hover:text-purple-600 transition-colors">Team</Link>
                    <Link href="/owner/finance" className="py-2 hover:text-purple-600 transition-colors">Finance</Link>
                </nav>
                <div className="w-10 h-10 rounded-full border-2 border-purple-100 overflow-hidden cursor-pointer hover:border-purple-400 transition-colors">
                    <img src="https://i.pravatar.cc/100?img=33" alt="Profile" className="w-full h-full object-cover" />
                </div>
            </header>

            <div className="p-4 sm:p-8 w-full max-w-7xl mx-auto text-gray-800 flex-1">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Inventory Management</h1>
                        <p className="text-gray-500 text-sm mt-1">Add, update, and manage your real estate portfolio.</p>
                    </div>
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-sm"
                    >
                        {showAddForm ? "Cancel" : "+ Add New Property"}
                    </button>
                </header>

                {showAddForm ? (
                    <AddPropertyForm onClose={() => setShowAddForm(false)} onSubmit={handleAdd} />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {properties.map((prop) => (
                            <PropertyCard key={prop.id} property={prop} />
                        ))}
                        {properties.length === 0 && <p className="text-sm text-gray-400">No properties yet. Add your first one.</p>}
                    </div>
                )}
            </div>
        </div>
    );
}