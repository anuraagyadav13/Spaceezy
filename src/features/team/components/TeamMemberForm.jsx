"use client";
import { useState } from "react";
import { createUser } from "../../../lib/api/users";
import { showToast } from "../../../lib/toast";

export function TeamMemberForm({ onSaved }) {
    const [form, setForm] = useState({ name: "", email: "", phone: "", role: "SALES_EXECUTIVE" });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAdd = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            // A realistic password for the demo, since the backend requires it
            await createUser({ ...form, password: "password123" });
            showToast(`${form.name} added to the team`);
            setForm({ name: "", email: "", phone: "", role: "SALES_EXECUTIVE" });
            if (onSaved) onSaved();
        } catch (error) {
            showToast(`Error: ${error}`, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <input required placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                <option value="SALES_EXECUTIVE">Sales Executive</option>
                <option value="SALES_MANAGER">Sales Manager</option>
                <option value="CHANNEL_PARTNER">Channel Partner</option>
                <option value="ADMIN">Admin</option>
            </select>
            <button type="submit" disabled={isSubmitting} className="mt-2 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50">
                {isSubmitting ? "Adding..." : "Add Employee"}
            </button>
        </form>
    );
}
