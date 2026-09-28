// src/app/login/page.jsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getEmployees } from "../../lib/store";
import { loginAsOwner, loginAsEmployee } from "../../lib/auth";
import { Building2, UserCog, ArrowRight } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const [employees, setEmployees] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState("");
    const [mode, setMode] = useState(null); // "owner" | "employee"

    useEffect(() => {
        const emps = getEmployees();
        setEmployees(emps);
        if (emps.length) setSelectedEmployee(emps[0].id);
    }, []);

    const handleOwnerLogin = () => {
        loginAsOwner();
        router.push("/owner");
    };

    const handleEmployeeLogin = (e) => {
        e.preventDefault();
        if (!selectedEmployee) return;
        loginAsEmployee(selectedEmployee);
        router.push("/employee");
    };

    return (
        <div className="min-h-screen bg-[#E5E7EB] flex items-center justify-center p-4">
            <div className="w-full max-w-4xl bg-[#F3F5F9] rounded-[40px] shadow-2xl border-4 border-white/50 p-8 sm:p-12">
                <div className="text-center mb-10">
                    <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <div className="w-4 h-4 bg-white rounded-full"></div>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">SpaceEzy CRM</h1>
                    <p className="text-gray-500 mt-2">Choose how you&apos;d like to sign in</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <button
                        onClick={() => setMode("owner")}
                        className={`text-left bg-white rounded-3xl p-6 border-2 transition-all shadow-sm ${mode === "owner" ? "border-purple-500 shadow-md" : "border-transparent hover:border-purple-200"}`}
                    >
                        <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mb-4">
                            <Building2 className="text-purple-600" size={22} />
                        </div>
                        <h3 className="font-bold text-gray-900 text-lg mb-1">Owner Portal</h3>
                        <p className="text-sm text-gray-500">Track leads, properties, finances and your whole team&apos;s daily work.</p>
                    </button>

                    <button
                        onClick={() => setMode("employee")}
                        className={`text-left bg-white rounded-3xl p-6 border-2 transition-all shadow-sm ${mode === "employee" ? "border-purple-500 shadow-md" : "border-transparent hover:border-purple-200"}`}
                    >
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                            <UserCog className="text-blue-600" size={22} />
                        </div>
                        <h3 className="font-bold text-gray-900 text-lg mb-1">Employee Portal</h3>
                        <p className="text-sm text-gray-500">Manage your leads, clients, follow-ups and log your daily work.</p>
                    </button>
                </div>

                {mode === "owner" && (
                    <div className="mt-8 bg-white rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                        <p className="text-sm text-gray-500">Continue as the business owner / admin.</p>
                        <button onClick={handleOwnerLogin} className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                            Enter Dashboard <ArrowRight size={16} />
                        </button>
                    </div>
                )}

                {mode === "employee" && (
                    <form onSubmit={handleEmployeeLogin} className="mt-8 bg-white rounded-3xl p-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shadow-sm">
                        <select
                            value={selectedEmployee}
                            onChange={(e) => setSelectedEmployee(e.target.value)}
                            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                            {employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>{emp.name} — {emp.role}</option>
                            ))}
                        </select>
                        <button type="submit" className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity shadow-sm shadow-blue-200">
                            Enter Portal <ArrowRight size={16} />
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}