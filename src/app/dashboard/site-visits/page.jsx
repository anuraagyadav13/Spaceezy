"use client";
import { useEffect, useState } from "react";
import { getSiteVisits, addSiteVisit, updateSiteVisitStatus, getEmployees } from "../../../lib/store";
import { showToast } from "../../../lib/toast";
import Modal from "../../../components/shared/Modal";
import { Calendar, Phone } from "lucide-react";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";

const STATUS_STYLES = {
    Scheduled: "bg-purple-100 text-purple-700",
    Completed: "bg-emerald-100 text-emerald-700",
    Cancelled: "bg-gray-100 text-gray-500",
};

export default function DashboardSiteVisitsPage() {
    const [visits, setVisits] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState({ leadName: "", phone: "", property: "", date: "", time: "", assignedTo: "" });

    useEffect(() => {
        const timer = setTimeout(() => {
            setVisits(getSiteVisits());
            const emps = getEmployees();
            setEmployees(emps);
            if (emps.length) setForm((f) => ({ ...f, assignedTo: emps[0].id }));
        }, 0);
        return () => clearTimeout(timer);
    }, []);

    const employeeName = (id) => employees.find((e) => e.id === id)?.name || "Unassigned";

    const handleAdd = (e) => {
        e.preventDefault();
        addSiteVisit({ ...form, status: "Scheduled" });
        showToast("Site visit scheduled");
        setVisits(getSiteVisits());
        setIsModalOpen(false);
        setForm({ leadName: "", phone: "", property: "", date: "", time: "", assignedTo: employees[0]?.id || "" });
    };

    const handleStatus = (id, status) => {
        updateSiteVisitStatus(id, status);
        showToast(`Visit marked ${status}`, status === "Cancelled" ? "info" : "success");
        setVisits(getSiteVisits());
    };

    const upcoming = visits.filter((v) => v.status === "Scheduled");
    const past = visits.filter((v) => v.status !== "Scheduled");

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Site Visits</h1>
                    <p className="text-sm text-gray-500 mt-1">Every scheduled and completed site visit across your team.</p>
                </div>
                <PermissionGate permission="lead:create">
                    <button onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                        + Schedule Visit
                    </button>
                </PermissionGate>
            </div>

            <div className="px-4 sm:px-8 pb-8 flex flex-col gap-8">
                <div>
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Upcoming ({upcoming.length})</h2>
                    <div className="flex flex-col gap-3">
                        {upcoming.map((v) => (
                            <div key={v.id} className="bg-white rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-4 shadow-sm">
                                <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                                    <Calendar className="text-purple-600" size={18} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-gray-900">{v.leadName}</p>
                                    <p className="text-xs text-gray-500">{v.property} · {employeeName(v.assignedTo)}</p>
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-1 md:w-32">
                                    <Phone size={12} /> {v.phone}
                                </div>
                                <div className="text-sm font-medium text-gray-700 md:w-36">{v.date} · {v.time}</div>
                                <span className={`text-[11px] font-bold px-3 py-1 rounded-full w-fit ${STATUS_STYLES[v.status]}`}>{v.status}</span>
                                <PermissionGate permission="lead:update">
                                    <div className="flex gap-2">
                                        <button onClick={() => handleStatus(v.id, "Completed")} className="text-xs font-bold px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors">Mark Done</button>
                                        <button onClick={() => handleStatus(v.id, "Cancelled")} className="text-xs font-bold px-3 py-2 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-200 transition-colors">Cancel</button>
                                    </div>
                                </PermissionGate>
                            </div>
                        ))}
                        {upcoming.length === 0 && <p className="text-sm text-gray-400">Nothing scheduled.</p>}
                    </div>
                </div>

                <div>
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">History</h2>
                    <div className="flex flex-col gap-3">
                        {past.map((v) => (
                            <div key={v.id} className="bg-white rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-4 shadow-sm opacity-80">
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-700">{v.leadName}</p>
                                    <p className="text-xs text-gray-500">{v.property} · {employeeName(v.assignedTo)}</p>
                                </div>
                                <div className="text-sm text-gray-500 md:w-36">{v.date} · {v.time}</div>
                                <span className={`text-[11px] font-bold px-3 py-1 rounded-full w-fit ${STATUS_STYLES[v.status]}`}>{v.status}</span>
                            </div>
                        ))}
                        {past.length === 0 && <p className="text-sm text-gray-400">No history yet.</p>}
                    </div>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Schedule Site Visit">
                <form onSubmit={handleAdd} className="flex flex-col gap-4">
                    <input required placeholder="Lead Name" value={form.leadName} onChange={(e) => setForm({ ...form, leadName: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <input required placeholder="Property" value={form.property} onChange={(e) => setForm({ ...form, property: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    <div className="grid grid-cols-2 gap-4">
                        <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                        <input required type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    </div>
                    <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                    <button type="submit" className="mt-2 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors">Schedule Visit</button>
                </form>
            </Modal>
        </div>
    );
}
