"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, UserCog, ArrowRight, Lock, Mail } from "lucide-react";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../features/auth/hooks/useAuth";

export default function LoginPage() {
    const router = useRouter();
    const { login } = useAuth();
    const [mode, setMode] = useState("employee"); // "owner" | "employee"
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            showToast("Please enter email and password", "error");
            return;
        }

        setIsLoading(true);
        try {
            const user = await login(email, password);
            const normalizedRole = String(user?.role ?? "").toUpperCase();
            const destination = normalizedRole === "ADMIN" || normalizedRole === "SUPER_ADMIN"
                ? "/dashboard"
                : "/dashboard/employee";

            showToast("Logged in successfully", "success");
            router.push(destination);
        } catch (err) {
            showToast(err?.message || "Login failed", "error");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#E5E7EB] flex items-center justify-center p-4">
            <div className="w-full max-w-4xl bg-[#F3F5F9] rounded-[40px] shadow-2xl border-4 border-white/50 p-8 sm:p-12">
                <div className="text-center mb-10">
                    <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <div className="w-4 h-4 bg-white rounded-full"></div>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">SpaceEzy CRM</h1>
                    <p className="text-gray-500 mt-2">Sign in to your account</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <button
                        type="button"
                        onClick={() => setMode("owner")}
                        className={`text-left bg-white rounded-3xl p-6 border-2 transition-all shadow-sm ${mode === "owner" ? "border-purple-500 shadow-md" : "border-transparent hover:border-purple-200"}`}
                    >
                        <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mb-4">
                            <Building2 className="text-purple-600" size={22} />
                        </div>
                        <h3 className="font-bold text-gray-900 text-lg mb-1">Owner Portal</h3>
                        <p className="text-sm text-gray-500">Track leads, properties, finances and your whole {"team's"} daily work.</p>
                    </button>

                    <button
                        type="button"
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

                <form onSubmit={handleLogin} className="bg-white rounded-3xl p-8 shadow-sm">
                    <h3 className="text-xl font-bold text-gray-900 mb-6">
                        {mode === "owner" ? "Admin Login" : "Employee Login"}
                    </h3>
                    
                    <div className="space-y-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="Enter your email"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="Enter your password"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 rounded-xl font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200 disabled:opacity-50"
                    >
                        {isLoading ? "Signing in..." : "Sign In"} <ArrowRight size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
}