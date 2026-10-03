"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { fetchUserProfile } from "../../../../lib/api/users";
import { ArrowLeft, Calendar, FileText } from "lucide-react";
import Image from "next/image";
import { showToast } from "../../../../lib/toast";

const VISIT_STYLES = {
    Scheduled: "bg-purple-100 text-purple-700",
    Completed: "bg-emerald-100 text-emerald-700",
    Cancelled: "bg-gray-100 text-gray-500",
};
const PAYMENT_STYLES = {
    Paid: "bg-emerald-100 text-emerald-700",
    Partial: "bg-orange-100 text-orange-600",
    Pending: "bg-gray-100 text-gray-500",
};

export default function DashboardEmployeeDetailPage({ params }) {
    const resolvedParams = use(params);
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const id = resolvedParams.employeeId;
        fetchUserProfile(id)
            .then(data => setEmployee(data))
            .catch(err => showToast("Failed to load employee profile", "error"))
            .finally(() => setLoading(false));
    }, [resolvedParams.employeeId]);

    if (loading) return <div className="p-8 text-gray-400 font-medium">Loading employee details...</div>;
    if (!employee) return <div className="p-8 text-gray-400 font-medium">Employee not found.</div>;

    const leads = employee.leads || [];
    const clients = employee.clients || [];
    const followups = employee.followups || [];
    const siteVisits = employee.siteVisits || [];
    const bookings = employee.bookings || [];

    // The backend doesn't explicitly have "dailyWork" grouped by day right now,
    // so we'll mock that specific visual from the followups/activities
    const dailyWork = []; 

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 pt-16 md:pt-0">
            <div className="px-4 sm:px-8 py-6">
                <Link href="/dashboard/team" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600 mb-4">
                    <ArrowLeft size={16} /> Back to team
                </Link>
                <div className="bg-white rounded-3xl p-6 flex items-center gap-4 shadow-sm border border-gray-100">
                    <div className="w-16 h-16 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xl">
                        {employee.name?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">{employee.name}</h1>
                        <p className="text-sm text-gray-500">{employee.role} · Joined {employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : ""}</p>
                        <p className="text-xs text-gray-400 mt-1">{employee.email} · {employee.phone}</p>
                    </div>
                </div>
            </div>

            <div className="px-4 sm:px-8 grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-xs text-gray-500 mb-1">Leads</p><h3 className="text-xl font-normal text-gray-900">{leads.length}</h3></div>
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-xs text-gray-500 mb-1">Clients</p><h3 className="text-xl font-normal text-gray-900">{clients.length}</h3></div>
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-xs text-gray-500 mb-1">Follow-ups</p><h3 className="text-xl font-normal text-gray-900">{followups.filter(f => f.status === "Pending").length}</h3></div>
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-xs text-gray-500 mb-1">Site Visits</p><h3 className="text-xl font-normal text-gray-900">{siteVisits.length}</h3></div>
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-xs text-gray-500 mb-1">Bookings</p><h3 className="text-xl font-normal text-gray-900">{bookings.length}</h3></div>
            </div>

            <div className="px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Calendar size={16} className="text-purple-500" />
                        <h3 className="font-medium text-[15px] text-gray-900">Site Visits</h3>
                    </div>
                    <div className="flex flex-col gap-3">
                        {siteVisits.map((v) => (
                            <div key={v.id} className="flex items-center justify-between text-sm">
                                <div>
                                    <p className="font-medium text-gray-800">{v.leadName}</p>
                                    <p className="text-xs text-gray-400">{v.property} · {v.date}</p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${VISIT_STYLES[v.status] || VISIT_STYLES.Scheduled}`}>{v.status}</span>
                            </div>
                        ))}
                        {siteVisits.length === 0 && <p className="text-sm text-gray-400">No site visits yet.</p>}
                    </div>
                </div>

                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <FileText size={16} className="text-purple-500" />
                        <h3 className="font-medium text-[15px] text-gray-900">Bookings</h3>
                    </div>
                    <div className="flex flex-col gap-3">
                        {bookings.map((b) => (
                            <div key={b.id} className="flex items-center justify-between text-sm">
                                <div>
                                    <p className="font-medium text-gray-800">{b.clientName}</p>
                                    <p className="text-xs text-gray-400">{b.property} · {b.amount}</p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${PAYMENT_STYLES[b.paymentStatus] || PAYMENT_STYLES.Pending}`}>{b.paymentStatus}</span>
                            </div>
                        ))}
                        {bookings.length === 0 && <p className="text-sm text-gray-400">No bookings yet.</p>}
                    </div>
                </div>
            </div>

            <div className="px-4 sm:px-8 pb-8">
                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <h3 className="font-medium text-[15px] text-gray-900 mb-4">Follow-ups Timeline</h3>
                    <div className="flex flex-col gap-4">
                        {followups.map((f) => (
                            <div key={f.id} className="border-l-2 border-purple-200 pl-4">
                                <p className="text-xs font-bold text-gray-400 mb-1">{f.dueDate}</p>
                                <ul className="flex flex-col gap-1">
                                    <li className="text-sm text-gray-700 flex justify-between max-w-md">
                                        <span>{f.type}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${f.status === "Done" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{f.status}</span>
                                    </li>
                                </ul>
                                {f.notes && <p className="text-xs text-gray-500 mt-1 italic">{f.notes}</p>}
                            </div>
                        ))}
                        {followups.length === 0 && <p className="text-sm text-gray-400">No follow-ups logged yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
