// src/app/employee/followups/page.jsx  (/employee/followups)
"use client";
import { useEffect, useState } from "react";
import { getCurrentEmployeeId } from "../../../lib/auth";
import { getFollowupsByEmployee, addFollowup, toggleFollowupStatus } from "../../../lib/store";
import { showToast } from "../../../lib/toast";
import Modal from "../../../components/shared/Modal";
import { Check } from "lucide-react";

export default function EmployeeFollowupsPage() {
    const [employeeId, setEmployeeId] = useState(null);
    const [followups, setFollowups] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState({ refName: "", type: "Call", dueDate: "", notes: "" });

    useEffect(() => {
        const id = getCurrentEmployeeId();
        setEmployeeId(id);
        if (id) setFollowups(getFollowupsByEmployee(id));
    }, []);

    const refresh = (id) => setFollowups(getFollowupsByEmployee(id));

    const handleAdd = (e) => {
        e.preventDefault();
        addFollowup({ ...form, assignedTo: employeeId });
        showToast("Follow-up added");
        setForm({ refName: "", type: "Call", dueDate: "", notes: "" });
        setIsModalOpen(false);
        refresh(employeeId);
    };

    const handleToggle = (id) => {
        toggleFollowupStatus(id);
        showToast("Follow-up updated");
        refresh(employeeId);
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto pt-16 md:pt-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Follow-ups</h1>
                    <p className="text-sm text-gray-500 mt-1">Keep your leads and clients warm.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                    + Add Follow-up
                </button>
            </div>

            <div className="px-4 sm:px-8 pb-8 flex flex-col gap-3">
                {followups.map((f) => (
                    <div key={f.id} className="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm">
                        <button
                            onClick={() => handleToggle(f.id)}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${f.status === "Done" ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:border-purple-400"}`}
                        >
                            {f.status === "Done" && <Check size={14} className="text-white" />}
                        </button>
                        <div className="flex-1 px-4">
                            <p className={`text-sm font-medium ${f.status === "Done" ? "line-through text-gray-400" : "text-gray-900"}`}>{f.refName}</p>
                            <p className="text-xs text-gray-500">{f.type} · {f.notes}</p>
                        </div>
                        <span className="text-xs text-gray-500 w-24 text-right">{f.dueDate}</span>
                    </div>
                ))}
                {followups.length === 0 && <p className="text-sm text-gray-400">No follow-ups yet.</p>}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Follow-up">
                <form onSubmit={handleAdd} className="flex flex-col gap-4">
                    <input required placeholder="Lead / Client Name" value={form.refName} onChange={(e) => setForm({ ...form, refName: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                        <option>Call</option><option>Site Visit</option><option>Email</option><option>Meeting</option>
                    </select>
                    <input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" rows={3} />
                    <button type="submit" className="mt-2 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors">Save Follow-up</button>
                </form>
            </Modal>
        </div>
    );
}