"use client";
import Link from "next/link";
import Image from "next/image";

export function TeamTable({ employees }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {employees.map((emp) => {
                // Placeholder counts until dashboard aggregation API is implemented
                const leadCount = emp._count?.assignedLeads || 0;
                const visitCount = 0;
                const bookingCount = 0;
                const lastEntry = null;
                
                return (
                    <Link key={emp.id} href={`/dashboard/team/${emp.id}`} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-purple-200 transition-all">
                        <div className="flex items-center gap-3 mb-5">
                            <Image src={emp.avatar || `https://i.pravatar.cc/150?u=${emp.email || emp.id}`} alt={emp.name || 'User'} width={48} height={48} className="w-12 h-12 rounded-full" />
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
    );
}
