// src/app/owner/bookings/page.jsx  (/owner/bookings)
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getBookings, addBooking, updateBookingPaymentStatus, getEmployees } from "../../../lib/store";
import { showToast } from "../../../lib/toast";
import Modal from "../../../components/shared/Modal";

const PAYMENT_STYLES = {
    Paid: "bg-emerald-100 text-emerald-700",
    Partial: "bg-orange-100 text-orange-600",
    Pending: "bg-gray-100 text-gray-500",
};
const PAYMENT_ORDER = ["Pending", "Partial", "Paid"];

export default function OwnerBookingsPage() {
    const [bookings, setBookings] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState({ clientName: "", property: "", unit: "", amount: "", bookingDate: "", assignedTo: "" });

    useEffect(() => {
        setBookings(getBookings());
        const emps = getEmployees();
        setEmployees(emps);
        if (emps.length) setForm((f) => ({ ...f, assignedTo: emps[0].id }));
    }, []);

    const employeeName = (id) => employees.find((e) => e.id === id)?.name || "Unassigned";

    const handleAdd = (e) => {
        e.preventDefault();
        addBooking({ ...form });
        showToast(`Booking added for ${form.clientName}`);
        setBookings(getBookings());
        setIsModalOpen(false);
        setForm({ clientName: "", property: "", unit: "", amount: "", bookingDate: "", assignedTo: employees[0]?.id || "" });
    };

    const cyclePayment = (booking) => {
        const next = PAYMENT_ORDER[(PAYMENT_ORDER.indexOf(booking.paymentStatus) + 1) % PAYMENT_ORDER.length];
        updateBookingPaymentStatus(booking.id, next);
        showToast(`Payment status updated to ${next}`);
        setBookings(getBookings());
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <header className="hidden md:flex justify-end items-center px-8 py-5 gap-6 border-b border-gray-100 bg-white sticky top-0 z-20">
                <nav className="flex gap-8 font-medium text-[13px] text-gray-400">
                    <Link href="/owner" className="py-2 hover:text-purple-600 transition-colors">Overview</Link>
                    <Link href="/owner/leads" className="py-2 hover:text-purple-600 transition-colors">Leads</Link>
                    <Link href="/owner/properties" className="py-2 hover:text-purple-600 transition-colors">Properties</Link>
                    <Link href="/owner/team" className="py-2 hover:text-purple-600 transition-colors">Team</Link>
                    <Link href="/owner/site-visits" className="py-2 hover:text-purple-600 transition-colors">Site Visits</Link>
                    <Link href="/owner/bookings" className="bg-purple-600 text-white px-5 py-2 rounded-full shadow-sm shadow-purple-200">Bookings</Link>
                    <Link href="/owner/reports" className="py-2 hover:text-purple-600 transition-colors">Reports</Link>
                </nav>
                <div className="w-10 h-10 rounded-full border-2 border-purple-100 overflow-hidden cursor-pointer hover:border-purple-400 transition-colors">
                    <img src="https://i.pravatar.cc/100?img=33" alt="Profile" className="w-full h-full object-cover" />
                </div>
            </header>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 pt-16 md:pt-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
                    <p className="text-sm text-gray-500 mt-1">Confirmed sales and their payment status. Click a status to update it.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                    + Add Booking
                </button>
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
                                <button onClick={() => cyclePayment(b)} className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-transform hover:scale-105 ${PAYMENT_STYLES[b.paymentStatus]}`}>
                                    {b.paymentStatus}
                                </button>
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