"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { getClientsByEmployee, addClient, updateClient } from "../../../lib/store";
import { showToast } from "../../../lib/toast";
import Modal from "../../../components/shared/Modal";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";

export default function DashboardCustomersPage() {
    const { user } = useAuth();
    const [clients, setClients] = useState([]);
    const [selected, setSelected] = useState(null);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [form, setForm] = useState({ name: "", phone: "", email: "", property: "", notes: "" });

    // Mock behavior for role scopes since backend isn't available
    const fetchClients = () => {
        if (!user) return;
        const data = getClientsByEmployee(user.id || "EMP-001"); 
        setClients(data);
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchClients();
        }, 0);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handleAdd = (e) => {
        e.preventDefault();
        addClient({ ...form, assignedTo: user?.id || "EMP-001" });
        showToast(`${form.name} added as a client`);
        setForm({ name: "", phone: "", email: "", property: "", notes: "" });
        setIsAddOpen(false);
        fetchClients();
    };

    const handleStatusChange = (client, status) => {
        updateClient(client.id, { status });
        showToast(`${client.name} marked ${status}`);
        fetchClients();
        setSelected({ ...client, status });
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your customer base.</p>
                </div>
                <PermissionGate permission="booking:create">
                    <button onClick={() => setIsAddOpen(true)} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                        + Add Customer
                    </button>
                </PermissionGate>
            </div>

            <div className="px-4 sm:px-8 pb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clients.map((c) => (
                    <button key={c.id} onClick={() => setSelected(c)} className="text-left bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-purple-200 transition-all">
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="font-bold text-gray-900">{c.name}</h3>
                            <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${c.status === "Closed" ? "bg-emerald-100 text-emerald-700" : "bg-purple-100 text-purple-700"}`}>{c.status}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">{c.phone}</p>
                        <p className="text-xs text-gray-500 mb-4">{c.email}</p>
                        <p className="text-xs font-medium text-gray-700">Interested in: {c.property}</p>
                    </button>
                ))}
                {clients.length === 0 && <p className="text-sm text-gray-400">No customers found.</p>}
            </div>

            <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.name || ""}>
                {selected && (
                    <div className="flex flex-col gap-4">
                        <p className="text-sm text-gray-500">{selected.phone} · {selected.email}</p>
                        <p className="text-sm"><span className="font-medium">Property:</span> {selected.property}</p>
                        <p className="text-sm text-gray-600">{selected.notes}</p>
                        <PermissionGate permission="booking:create">
                            <div className="flex gap-3 mt-2">
                                {["Active", "Closed"].map((s) => (
                                    <button key={s} onClick={() => handleStatusChange(selected, s)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${selected.status === s ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                                        Mark {s}
                                    </button>
                                ))}
                            </div>
                        </PermissionGate>
                    </div>
                )}
            </Modal>

            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Customer">
                <form onSubmit={handleAdd} className="flex flex-col gap-4">
                    <input required placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <input placeholder="Interested Property" value={form.property} onChange={(e) => setForm({ ...form, property: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" rows={3} />
                    <button type="submit" className="mt-2 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors">Save Customer</button>
                </form>
            </Modal>
        </div>
    );
}
