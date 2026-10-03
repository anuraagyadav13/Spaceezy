"use client";
import { useEffect, useState } from "react";
import { fetchBookings, createBooking, updatePaymentStatus } from "../../../lib/api/bookings";
import { fetchUsers } from "../../../lib/api/users";
import { showToast } from "../../../lib/toast";
import Modal from "../../../components/shared/Modal";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";

const PAYMENT_STYLES = {
    Paid: "bg-emerald-100 text-emerald-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    Partial: "bg-orange-100 text-orange-600",
    PARTIAL: "bg-orange-100 text-orange-600",
    Pending: "bg-gray-100 text-gray-500",
    PENDING: "bg-gray-100 text-gray-500",
    CANCELLED: "bg-red-100 text-red-600"
};
const PAYMENT_ORDER = ["PENDING", "PARTIAL", "COMPLETED"];

export default function DashboardBookingsPage() {
    const [bookings, setBookings] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState({ clientName: "", property: "", unit: "", amount: "", bookingDate: "", assignedTo: "" });

    const loadData = async () => {
        try {
            const [bookRes, empData] = await Promise.all([
                fetchBookings(),
                fetchUsers()
            ]);
            const bookList = bookRes.bookings || bookRes || [];
            setBookings(bookList);
            const empList = empData || [];
            setEmployees(empList);
            if (empList.length && !form.assignedTo) setForm((f) => ({ ...f, assignedTo: empList[0].id }));
        } catch (err) {
            showToast(`Failed to load data: ${err.message}`, "error");
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const employeeName = (id) => employees.find((e) => e.id === id)?.name || "Unassigned";

    const handleAdd = async (e) => {
        e.preventDefault();
        try {
            // Note: form needs to be aligned with backend API expecting customerId and propertyId.
            // For now, this requires a Customer and Property selection rather than just strings.
            // As a mock migration step for the UI form:
            await createBooking({ 
                customerId: "00000000-0000-0000-0000-000000000000", // Needs a real picker
                propertyId: "00000000-0000-0000-0000-000000000000", // Needs a real picker
                amount: parseFloat(form.amount.replace(/[^0-9.]/g, '') || 0), 
                paymentStatus: "PENDING" 
            });
            showToast(`Booking added`);
            loadData();
            setIsModalOpen(false);
            setForm({ clientName: "", property: "", unit: "", amount: "", bookingDate: "", assignedTo: employees[0]?.id || "" });
        } catch (err) {
            showToast(`Failed to add booking: ${err.message}`, "error");
        }
    };

    const cyclePayment = async (booking) => {
        const current = booking.paymentStatus;
        const next = PAYMENT_ORDER[(PAYMENT_ORDER.indexOf(current) + 1) % PAYMENT_ORDER.length];
        try {
            await updatePaymentStatus(booking.id, next);
            showToast(`Payment status updated to ${next}`);
            loadData();
        } catch (err) {
            showToast(`Failed to update status: ${err.message}`, "error");
        }
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
                    <p className="text-sm text-gray-500 mt-1">Confirmed sales and their payment status. Click a status to update it.</p>
                </div>
                <PermissionGate permission="booking:create">
                    <button onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                        + Add Booking
                    </button>
                </PermissionGate>
            </div>

            <div className="px-4 sm:px-8 pb-8">
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="hidden md:grid grid-cols-6 gap-4 px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                        <span className="col-span-2">Client</span>
                        <span>Property / Unit</span>
                        <span>Amount</span>
                        <span>Sales Exec</span>
                        <span className="text-right">Payment</span>
                    </div>
                    {bookings.map((b) => (
                        <div key={b.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 md:gap-4 px-6 py-4 border-b border-gray-50 last:border-0 items-center">
                            <div className="md:col-span-2">
                                <p className="text-sm font-bold text-gray-900">{b.clientName}</p>
                                <p className="text-xs text-gray-400">{b.bookingDate}</p>
                            </div>
                            <p className="text-sm text-gray-700">{b.property} · {b.unit}</p>
                            <p className="text-sm font-bold text-emerald-600">{b.amount}</p>
                            <p className="text-sm text-gray-500">{employeeName(b.assignedTo)}</p>
                            <div className="md:text-right">
                                <PermissionGate permission="booking:approve" fallback={
                                    <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full ${PAYMENT_STYLES[b.paymentStatus]}`}>
                                        {b.paymentStatus}
                                    </span>
                                }>
                                    <button onClick={() => cyclePayment(b)} className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-transform hover:scale-105 ${PAYMENT_STYLES[b.paymentStatus]}`}>
                                        {b.paymentStatus}
                                    </button>
                                </PermissionGate>
                            </div>
                        </div>
                    ))}
                    {bookings.length === 0 && <p className="text-sm text-gray-400 px-6 py-8">No bookings yet.</p>}
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Booking">
                <form onSubmit={handleAdd} className="flex flex-col gap-4">
                    <input required placeholder="Client Name" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <div className="grid grid-cols-2 gap-4">
                        <input required placeholder="Property" value={form.property} onChange={(e) => setForm({ ...form, property: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                        <input required placeholder="Unit No." value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <input required placeholder="Amount (e.g., ₹1.4 Cr)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                        <input required type="date" value={form.bookingDate} onChange={(e) => setForm({ ...form, bookingDate: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    </div>
                    <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                    <button type="submit" className="mt-2 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors">Save Booking</button>
                </form>
            </Modal>
        </div>
    );
}
