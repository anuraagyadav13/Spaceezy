// src/app/owner/team/page.jsx  (/owner/team)
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getEmployees, addEmployee, getLeadsByEmployee, getDailyWorkByEmployee, getSiteVisitsByEmployee, getBookingsByEmployee } from "../../../lib/store";
import { showToast } from "../../../lib/toast";
import Modal from "../../../components/shared/Modal";

export default function OwnerTeamPage() {
    const [employees, setEmployees] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", phone: "", role: "Sales Executive" });

    useEffect(() => {
        setEmployees(getEmployees());
    }, []);

    const handleAdd = (e) => {
        e.preventDefault();
        const avatar = `https://i.pravatar.cc/150?u=${encodeURIComponent(form.email || form.name)}`;
        addEmployee({ ...form, avatar, joinedDate: new Date().toISOString().slice(0, 10) });
        showToast(`${form.name} added to the team`);
        setForm({ name: "", email: "", phone: "", role: "Sales Executive" });
        setIsModalOpen(false);
        setEmployees(getEmployees());
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <header className="hidden md:flex justify-end items-center px-8 py-5 gap-6 border-b border-gray-100 bg-white sticky top-0 z-20">
                <nav className="flex gap-8 font-medium text-[13px] text-gray-400">
                    <Link href="/owner" className="py-2 hover:text-purple-600 transition-colors">Overview</Link>
                    <Link href="/owner/leads" className="py-2 hover:text-purple-600 transition-colors">Leads</Link>
                    <Link href="/owner/properties" className="py-2 hover:text-purple-600 transition-colors">Properties</Link>
                    <Link href="/owner/team" className="bg-purple-600 text-white px-5 py-2 rounded-full shadow-sm shadow-purple-200">Team</Link>
                    <Link href="/owner/finance" className="py-2 hover:text-purple-600 transition-colors">Finance</Link>
                </nav>
                <div className="w-10 h-10 rounded-full border-2 border-purple-100 overflow-hidden cursor-pointer hover:border-purple-400 transition-colors">
                    <img src="https://i.pravatar.cc/100?img=33" alt="Profile" className="w-full h-full object-cover" />
                </div>
            </header>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 pt-16 md:pt-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Team & Employees</h1>
                    <p className="text-sm text-gray-500 mt-1">See what each team member is working on, in one glance.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-md shadow-purple-200">
                    + Add Employee
                </button>
            </div>

            <div className="px-4 sm:px-8 pb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {employees.map((emp) => {
                    const leadCount = getLeadsByEmployee(emp.id).length;
                    const visitCount = getSiteVisitsByEmployee(emp.id).filter((v) => v.status === "Scheduled").length;
                    const bookingCount = getBookingsByEmployee(emp.id).length;
                    const workDays = getDailyWorkByEmployee(emp.id);
                    const lastEntry = workDays[0];
                    return (
                        <Link key={emp.id} href={`/owner/team/${emp.id}`} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-purple-200 transition-all">
                            <div className="flex items-center gap-3 mb-5">
                                <img src={emp.avatar} className="w-12 h-12 rounded-full" />
                                <div className="min-w-0">
                                    <h3 className="font-bold text-gray-900 truncate">{emp.name}</h3>
                                    <p className="text-xs text-gray-500 truncate">{emp.role}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mb-4">
                                <div className="bg-gray-50 rounded-xl py-2 text-center">
                                    <p className="text-sm font-bold text-gray-900">{leadCount}</p>
                                    <p className="text-[10px] text-gray-500">Leads</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl py-2 text-center">
                                    <p className="text-sm font-bold text-gray-900">{visitCount}</p>
                                    <p className="text-[10px] text-gray-500">Visits</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl py-2 text-center">
                                    <p className="text-sm font-bold text-gray-900">{bookingCount}</p>
                                    <p className="text-[10px] text-gray-500">Bookings</p>
                                </div>
                            </div>

                            <p className="text-xs text-gray-500 border-t border-gray-50 pt-4">
                                {lastEntry ? `Last active ${lastEntry.date}` : "No activity logged yet"}
                            </p>
                        </Link>
                    );
                })}
                {employees.length === 0 && <p className="text-sm text-gray-400">No team members yet.</p>}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Employee">
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
            </Modal>
        </div>
    );
}