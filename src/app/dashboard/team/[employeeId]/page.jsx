"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
    getEmployeeById, getLeadsByEmployee, getClientsByEmployee, getFollowupsByEmployee,
    getDailyWorkByEmployee, getSiteVisitsByEmployee, getBookingsByEmployee,
} from "../../../../lib/store";
import { ArrowLeft, Calendar, FileText } from "lucide-react";
import Image from "next/image";

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

export default function DashboardEmployeeDetailPage() {
    const params = useParams();
    const [employee, setEmployee] = useState(null);
    const [leads, setLeads] = useState([]);
    const [clients, setClients] = useState([]);
    const [followups, setFollowups] = useState([]);
    const [dailyWork, setDailyWork] = useState([]);
    const [siteVisits, setSiteVisits] = useState([]);
    const [bookings, setBookings] = useState([]);

    useEffect(() => {
        const id = params.employeeId;
        const timer = setTimeout(() => {
            setEmployee(getEmployeeById(id));
            setLeads(getLeadsByEmployee(id));
            setClients(getClientsByEmployee(id));
            setFollowups(getFollowupsByEmployee(id));
            setDailyWork(getDailyWorkByEmployee(id));
            setSiteVisits(getSiteVisitsByEmployee(id));
            setBookings(getBookingsByEmployee(id));
        }, 0);
        return () => clearTimeout(timer);
    }, [params.employeeId]);

    if (!employee) return <div className="p-8">Loading...</div>;

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 pt-16 md:pt-0">
            <div className="px-4 sm:px-8 py-6">
                <Link href="/dashboard/team" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600 mb-4">
                    <ArrowLeft size={16} /> Back to team
                </Link>
                <div className="bg-white rounded-3xl p-6 flex items-center gap-4 shadow-sm border border-gray-100">
                    <Image src={employee.avatar} alt={employee.name} width={64} height={64} className="w-16 h-16 rounded-full" />
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">{employee.name}</h1>
                        <p className="text-sm text-gray-500">{employee.role} · Joined {employee.joinedDate}</p>
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
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${VISIT_STYLES[v.status]}`}>{v.status}</span>
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
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${PAYMENT_STYLES[b.paymentStatus]}`}>{b.paymentStatus}</span>
                            </div>
                        ))}
                        {bookings.length === 0 && <p className="text-sm text-gray-400">No bookings yet.</p>}
                    </div>
                </div>
            </div>

            <div className="px-4 sm:px-8 pb-8">
                <div className="bg-white rounded-[24px] p-6 shadow-sm">
                    <h3 className="font-medium text-[15px] text-gray-900 mb-4">Daily Work Timeline</h3>
                    <div className="flex flex-col gap-4">
                        {dailyWork.map((day) => (
                            <div key={day.id} className="border-l-2 border-purple-200 pl-4">
                                <p className="text-xs font-bold text-gray-400 mb-1">{day.date}</p>
                                <ul className="flex flex-col gap-1">
                                    {day.tasks.map((t, i) => (
                                        <li key={i} className="text-sm text-gray-700 flex justify-between max-w-md">
                                            <span>{t.title}</span><span className="text-gray-400">{t.hours}h</span>
                                        </li>
                                    ))}
                                </ul>
                                {day.summary && <p className="text-xs text-gray-500 mt-1 italic">{day.summary}</p>}
                            </div>
                        ))}
                        {dailyWork.length === 0 && <p className="text-sm text-gray-400">No work logged yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
