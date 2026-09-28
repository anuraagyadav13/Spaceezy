"use client";
import { useState } from "react";
import { addEmployee } from "../../../lib/store";
import { showToast } from "../../../lib/toast";

export function TeamMemberForm({ onSaved }) {
    const [form, setForm] = useState({ name: "", email: "", phone: "", role: "Sales Executive" });

    const handleAdd = (e) => {
        e.preventDefault();
        const avatar = `https://i.pravatar.cc/150?u=${encodeURIComponent(form.email || form.name)}`;
        addEmployee({ ...form, avatar, joinedDate: new Date().toISOString().slice(0, 10) });
        showToast(`${form.name} added to the team`);
        setForm({ name: "", email: "", phone: "", role: "Sales Executive" });
        if (onSaved) onSaved();
    };

    return (
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <input required placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                <option>Sales Executive</option>
                <option>Senior Sales Executive</option>
                <option>Field Executive</option>
                <option>Relationship Manager</option>
            </select>
            <button type="submit" className="mt-2 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors">Add Employee</button>
        </form>
    );
}
