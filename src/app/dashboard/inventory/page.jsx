"use client";
import { useEffect, useState } from "react";
import AddPropertyForm from "../../../features/inventory/components/AddPropertyForm";
import PropertyCard from "../../../components/ui/PropertyCard";
import { getProperties, addProperty } from "../../../lib/store";
import { showToast } from "../../../lib/toast";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";

export default function DashboardInventoryPage() {
    const [showAddForm, setShowAddForm] = useState(false);
    const [properties, setProperties] = useState([]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setProperties(getProperties());
        }, 0);
        return () => clearTimeout(timer);
    }, []);

    const handleAdd = (data) => {
        addProperty(data);
        showToast(`${data.name} added to your portfolio`);
        setProperties(getProperties());
        setShowAddForm(false);
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <div className="p-4 sm:p-8 w-full max-w-7xl mx-auto text-gray-800 flex-1">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Inventory Management</h1>
                        <p className="text-gray-500 text-sm mt-1">Add, update, and manage your real estate portfolio.</p>
                    </div>
                    <PermissionGate permission="inventory:create">
                        <button
                            onClick={() => setShowAddForm(!showAddForm)}
                            className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-sm"
                        >
                            {showAddForm ? "Cancel" : "+ Add New Property"}
                        </button>
                    </PermissionGate>
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
