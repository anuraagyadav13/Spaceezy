"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { fetchCustomers, fetchCustomerById, createCustomer, updateCustomer, deleteCustomer } from "../../../lib/api/customers";
import { showToast } from "../../../lib/toast";
import Modal from "../../../components/shared/Modal";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";
import { formatCurrency } from "../../../features/pipeline/helpers";

const STATUS_STYLES = {
    ACTIVE: "bg-purple-100 text-purple-700",
    CLOSED: "bg-emerald-100 text-emerald-700",
    INACTIVE: "bg-gray-100 text-gray-500"
};

export default function DashboardCustomersPage() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [selectedId, setSelectedId] = useState(null);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

    const customersQuery = useQuery({
        queryKey: ["customers"],
        queryFn: () => fetchCustomers({ limit: 100 }),
        enabled: Boolean(user),
        retry: 1
    });

    const detailQuery = useQuery({
        queryKey: ["customers", selectedId],
        queryFn: () => fetchCustomerById(selectedId),
        enabled: Boolean(selectedId),
        retry: 1
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customers"] });

    const createMutation = useMutation({
        mutationFn: (payload) => createCustomer(payload),
        onSuccess: () => {
            showToast("Customer added");
            setForm({ name: "", phone: "", email: "", notes: "" });
            setIsAddOpen(false);
            invalidate();
        },
        onError: (err) => {
            if (err.status === 409 && err.code === "DUPLICATE_CUSTOMER") {
                showToast(err.message || "A customer with this phone already exists", "error");
            } else {
                showToast(err.message || "Failed to add customer", "error");
            }
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, ...payload }) => updateCustomer({ id, ...payload }),
        onSuccess: () => {
            showToast("Customer updated");
            invalidate();
        },
        onError: (err) => showToast(err.message || "Failed to update customer", "error")
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => deleteCustomer(id),
        onSuccess: () => {
            showToast("Customer deleted");
            setSelectedId(null);
            invalidate();
        },
        onError: (err) => showToast(err.message || "Failed to delete customer", "error")
    });

    const customers = Array.isArray(customersQuery.data)
        ? customersQuery.data
        : customersQuery.data?.customers || [];
    const selected = detailQuery.data || null;

    const handleAdd = (e) => {
        e.preventDefault();
        createMutation.mutate(form);
    };

    const handleStatusChange = (status) => {
        if (!selected) return;
        updateMutation.mutate({ id: selected.id, status });
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your customer base.</p>
                </div>
                <PermissionGate permission="customer:create">
                    <button onClick={() => setIsAddOpen(true)} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                        + Add Customer
                    </button>
                </PermissionGate>
            </div>

            <div className="px-4 sm:px-8 pb-8">
                {customersQuery.isLoading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-36 bg-gray-100 rounded-3xl animate-pulse" />
                        ))}
                    </div>
                )}

                {customersQuery.isError && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
                        <p className="text-sm font-bold text-red-600 mb-2">Failed to load customers</p>
                        <p className="text-xs text-red-500 mb-3">{customersQuery.error?.message || "Unknown error"}</p>
                        <button onClick={() => customersQuery.refetch()} className="text-xs font-bold text-red-600 underline">Retry</button>
                    </div>
                )}

                {!customersQuery.isLoading && !customersQuery.isError && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {customers.map((c) => (
                            <button key={c.id} onClick={() => setSelectedId(c.id)} className="text-left bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-purple-200 transition-all">
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-bold text-gray-900">{c.name}</h3>
                                    <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${STATUS_STYLES[c.status] || STATUS_STYLES.ACTIVE}`}>{c.status}</span>
                                </div>
                                <p className="text-xs text-gray-500 mb-1">{c.phone}</p>
                                <p className="text-xs text-gray-500 mb-4">{c.email || "No email"}</p>
                                <p className="text-xs font-medium text-gray-700">
                                    Booking(s): {c._count?.bookings ?? 0}{c.assignedTo?.name ? ` · Assigned to ${c.assignedTo.name}` : ""}
                                </p>
                            </button>
                        ))}
                        {customers.length === 0 && (
                            <div className="col-span-full bg-white rounded-3xl p-10 text-center border border-gray-100">
                                <p className="text-sm font-bold text-gray-700">No customers yet</p>
                                <p className="text-xs text-gray-400 mt-1">Customers are created manually or automatically when a lead is converted to a booking.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <Modal isOpen={Boolean(selectedId)} onClose={() => setSelectedId(null)} title={selected?.name || ""}>
                {detailQuery.isLoading && <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />}
                {detailQuery.isError && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-xs text-red-600 font-medium">
                        {detailQuery.error?.message || "Failed to load customer details"}
                    </div>
                )}
                {selected && (
                    <div className="flex flex-col gap-4">
                        <p className="text-sm text-gray-500">{selected.phone} · {selected.email || "No email"}</p>
                        <p className="text-sm text-gray-600">{selected.notes || "No notes"}</p>

                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Bookings</p>
                            {(selected.bookings || []).length === 0 ? (
                                <p className="text-xs text-gray-400">No bookings yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {selected.bookings.map((b) => (
                                        <div key={b.id} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 flex justify-between items-center">
                                            <div>
                                                <p className="text-xs font-bold text-gray-800">
                                                    {b.project?.name || "—"} · {b.property ? (b.property.unitNumber || b.property.title) : "No unit"}
                                                </p>
                                                <p className="text-[11px] text-gray-400">
                                                    {formatCurrency(b.amount)} · {b.paymentStatus}
                                                    {b.lead?.name ? ` · Lead: ${b.lead.name}` : ""}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <PermissionGate permission="customer:update">
                            <div className="flex gap-3 mt-2">
                                {["ACTIVE", "INACTIVE", "CLOSED"].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => handleStatusChange(s)}
                                        disabled={updateMutation.isPending}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 ${selected.status === s ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                                    >
                                        {s.charAt(0) + s.slice(1).toLowerCase()}
                                    </button>
                                ))}
                            </div>
                        </PermissionGate>

                        <PermissionGate permission="customer:delete">
                            <button
                                onClick={() => deleteMutation.mutate(selected.id)}
                                disabled={deleteMutation.isPending}
                                className="mt-1 py-2.5 rounded-xl text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-60"
                            >
                                {deleteMutation.isPending ? "Deleting..." : "Delete customer"}
                            </button>
                        </PermissionGate>
                    </div>
                )}
            </Modal>

            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Customer">
                <form onSubmit={handleAdd} className="flex flex-col gap-4">
                    <input required placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" rows={3} />
                    <button type="submit" disabled={createMutation.isPending} className="mt-2 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-60">
                        {createMutation.isPending ? "Saving..." : "Save Customer"}
                    </button>
                </form>
            </Modal>
        </div>
    );
}
