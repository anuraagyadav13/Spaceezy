// src/components/owner/AddPropertyForm.js
// Doubles as the "Add Property" form and (via initialData) the "Edit
// Property" form on the detail page — same fields, same validation.
"use client";
import { useState, useEffect } from "react";
import { getEmployees } from "../../../lib/store";

export default function AddPropertyForm({ onClose, onSubmit, initialData, submitLabel = "Create Property" }) {
    const [employees, setEmployees] = useState([]);
    const [form, setForm] = useState({
        name: initialData?.name || "",
        type: initialData?.type || "Residential",
        address: initialData?.address || "",
        image: initialData?.image || "",
        totalUnits: initialData?.totalUnits ?? "",
        occupiedUnits: initialData?.occupiedUnits ?? "",
        status: initialData?.status || "Available",
        assignedTo: initialData?.assignedTo || "",
        description: initialData?.description || "",
        price: initialData?.price || "",
        amenities: initialData?.amenities ? initialData.amenities.join(", ") : "",
        yearBuilt: initialData?.yearBuilt || "",
        floors: initialData?.floors || "",
        parkingSpots: initialData?.parkingSpots || "",
    });

    useEffect(() => {
        const emps = getEmployees();
        const timer = setTimeout(() => {
            setEmployees(emps);
            if (!form.assignedTo && emps.length) setForm((f) => ({ ...f, assignedTo: emps[0].id }));
        }, 0);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        const totalUnits = Number(form.totalUnits) || 0;
        const occupiedUnits = Math.min(Number(form.occupiedUnits) || 0, totalUnits);
        onSubmit?.({
            name: form.name,
            type: form.type,
            address: form.address,
            image: form.image || undefined,
            totalUnits,
            occupiedUnits,
            status: form.status,
            assignedTo: form.assignedTo,
            description: form.description,
            price: form.price,
            amenities: form.amenities.split(",").map((a) => a.trim()).filter(Boolean),
            yearBuilt: form.yearBuilt,
            floors: form.floors,
            parkingSpots: form.parkingSpots,
        });
    };

    const fieldClass = "px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all";

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-2xl">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{initialData ? "Edit Property" : "Add New Property"}</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700">Property Name</label>
                        <input required type="text" placeholder="e.g., The Orion Building" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700">Type</label>
                        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={`${fieldClass} bg-white`}>
                            <option>Residential</option>
                            <option>Commercial</option>
                            <option>Retail</option>
                            <option>Industrial</option>
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">Full Address</label>
                    <input required type="text" placeholder="Locality, City, State" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={fieldClass} />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">Photo URL</label>
                    <input type="url" placeholder="https://... (paste a listing photo link)" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} className={fieldClass} />
                    <p className="text-xs text-gray-400">Leave blank to use a placeholder photo. A broken link falls back to an icon automatically.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700">Total Units</label>
                        <input type="number" min="0" placeholder="e.g., 24" value={form.totalUnits} onChange={(e) => setForm({ ...form, totalUnits: e.target.value })} className={fieldClass} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700">Occupied Units</label>
                        <input type="number" min="0" max={form.totalUnits || undefined} placeholder="e.g., 18" value={form.occupiedUnits} onChange={(e) => setForm({ ...form, occupiedUnits: e.target.value })} className={fieldClass} />
                        {form.totalUnits !== "" && Number(form.occupiedUnits) > Number(form.totalUnits) && (
                            <p className="text-xs text-orange-500">Can&apos;t exceed total units — will be capped at {form.totalUnits}.</p>
                        )}
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700">Status</label>
                        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={`${fieldClass} bg-white`}>
                            <option>Available</option>
                            <option>Fully Occupied</option>
                            <option>Renovating</option>
                            <option>Pre-Launch</option>
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">Assign To</label>
                    <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className={`${fieldClass} bg-white`}>
                        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                    <p className="text-xs text-gray-400">The listing executive — this is who sees it under &quot;My Properties&quot; on their side.</p>
                </div>

                <div className="pt-2 border-t border-gray-100">
                    <p className="text-sm font-bold text-gray-900 mb-4">More Details <span className="text-gray-400 font-normal">(optional)</span></p>
                    <div className="flex flex-col gap-4">
                        <textarea placeholder="Short description of the property..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={fieldClass} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <input placeholder="Value / Price (e.g., ₹1.8 Cr onwards)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={fieldClass} />
                            <input placeholder="Amenities, comma separated" value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} className={fieldClass} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <input placeholder="Year Built" value={form.yearBuilt} onChange={(e) => setForm({ ...form, yearBuilt: e.target.value })} className={fieldClass} />
                            <input placeholder="Floors" value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })} className={fieldClass} />
                            <input placeholder="Parking Spots" value={form.parkingSpots} onChange={(e) => setForm({ ...form, parkingSpots: e.target.value })} className={fieldClass} />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                        Cancel
                    </button>
                    <button type="submit" className="px-5 py-2.5 rounded-lg font-medium text-white bg-gray-900 hover:bg-gray-800 shadow-sm transition-colors">
                        {submitLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}