"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowRight,
    BarChart3,
    Building2,
    Eye,
    EyeOff,
    Headphones,
    Home,
    Layers,
    Loader2,
    Lock,
    Mail,
    Users
} from "lucide-react";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../features/auth/hooks/useAuth";

export default function LoginPage() {
    const router = useRouter();
    const { login } = useAuth();
    const [mode, setMode] = useState("owner"); // "owner" | "employee"
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
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
        <div className="relative min-h-[100dvh] w-full flex items-center justify-center overflow-x-hidden bg-[#0c051e]">
            {/* Background Image & Lighting */}
            <div className="absolute inset-0 z-0">
                <Image
                    src="/images/login-bg.jpg"
                    alt="Spaceezy Luxury Real Estate"
                    fill
                    priority
                    sizes="100vw"
                    className="object-cover object-center"
                />
                {/* Subtle vignette on the left to ensure high text legibility */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#0E061E]/80 via-[#120826]/30 to-transparent" />

                {/* Soft ambient aura behind right card */}
                <div className="absolute top-1/2 -right-20 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />
                <div className="absolute bottom-10 right-20 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
            </div>

            {/* Main Content Layout */}
            <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 py-4 sm:py-6 lg:py-8 flex flex-col lg:flex-row items-center justify-between gap-8 min-h-[100dvh]">
                {/* Left Column: Hero Branding & Feature Badges (Desktop Only) */}
                <div className="hidden lg:block w-full max-w-xl text-left my-auto">
                    {/* Badge */}
                    <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/95 text-xs font-semibold tracking-wide mb-6 shadow-sm">
                        <span>Real Estate CRM</span>
                    </div>

                    {/* Headline */}
                    <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold text-white tracking-tight leading-[1.12]">
                        Manage Properties,<br />
                        Leads &amp; Sales<br />
                        <span className="text-[#C084FC]">Effortlessly</span>
                    </h1>

                    {/* Subtitle */}
                    <p className="text-white/85 text-base sm:text-lg max-w-md mt-5 leading-relaxed font-normal">
                        All-in-one CRM for real estate businesses. Track leads, manage inventory, automate follow-ups and close more deals.
                    </p>

                    {/* Feature Tiles Row */}
                    <div className="grid grid-cols-4 gap-3.5 sm:gap-4 mt-8 max-w-md">
                        <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-lg transition-transform hover:scale-105">
                            <Home className="w-5 h-5 text-white/90 mb-1.5" />
                            <span className="text-xs font-medium text-white/90">Properties</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-lg transition-transform hover:scale-105">
                            <Users className="w-5 h-5 text-white/90 mb-1.5" />
                            <span className="text-xs font-medium text-white/90">Leads</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-lg transition-transform hover:scale-105">
                            <Layers className="w-5 h-5 text-white/90 mb-1.5" />
                            <span className="text-xs font-medium text-white/90">Sales</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-lg transition-transform hover:scale-105">
                            <BarChart3 className="w-5 h-5 text-white/90 mb-1.5" />
                            <span className="text-xs font-medium text-white/90">Reports</span>
                        </div>
                    </div>
                </div>

                {/* Right Column: Floating Login Card */}
                <div className="w-full lg:w-auto flex justify-center lg:justify-end my-auto">
                    <div className="w-full max-w-[430px] bg-white rounded-[32px] sm:rounded-[36px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] border border-white/80 p-6 sm:p-7 relative">
                        {/* Logo & Card Header */}
                        <div className="flex flex-col items-center text-center mb-5">
                            <div className="relative w-24 h-24 sm:w-28 sm:h-28 drop-shadow-md">
                                <Image
                                    src="/images/spaceezy-logo.png"
                                    alt="Spaceezy logo"
                                    width={112}
                                    height={112}
                                    className="w-full h-full object-contain"
                                    priority
                                />
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight mt-2.5">
                                Spaceezy<span className="text-purple-600">.</span> CRM
                            </h2>
                            <p className="text-xs text-gray-400 mt-0.5">Sign in to your account</p>
                        </div>

                        {/* Portal Switcher */}
                        <div className="grid grid-cols-2 gap-2.5 mb-4">
                            <button
                                type="button"
                                onClick={() => setMode("owner")}
                                className={`text-left p-3 sm:p-3.5 rounded-2xl border transition-all ${
                                    mode === "owner"
                                        ? "border-purple-600 bg-purple-50/40 ring-1 ring-purple-600/20"
                                        : "border-gray-200 bg-white hover:border-gray-300"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                                        <Building2 className="text-purple-600" size={16} />
                                    </div>
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                        mode === "owner" ? "border-purple-600" : "border-gray-300"
                                    }`}>
                                        {mode === "owner" && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                                    </div>
                                </div>
                                <h3 className="font-bold text-gray-900 text-xs sm:text-sm mb-0.5">Owner Portal</h3>
                                <p className="text-[10px] sm:text-[11px] text-gray-500 leading-snug">Manage properties, leads and your business.</p>
                            </button>

                            <button
                                type="button"
                                onClick={() => setMode("employee")}
                                className={`text-left p-3 sm:p-3.5 rounded-2xl border transition-all ${
                                    mode === "employee"
                                        ? "border-purple-600 bg-purple-50/40 ring-1 ring-purple-600/20"
                                        : "border-gray-200 bg-white hover:border-gray-300"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                                        <Users className="text-purple-600" size={16} />
                                    </div>
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                        mode === "employee" ? "border-purple-600" : "border-gray-300"
                                    }`}>
                                        {mode === "employee" && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                                    </div>
                                </div>
                                <h3 className="font-bold text-gray-900 text-xs sm:text-sm mb-0.5">Employee Portal</h3>
                                <p className="text-[10px] sm:text-[11px] text-gray-500 leading-snug">Manage your leads, clients and daily work.</p>
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleLogin} className="space-y-3.5">
                            <div>
                                <label className="block text-xs font-semibold text-gray-800 mb-1">Email Address</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                                        <Mail size={16} />
                                    </div>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="block w-full pl-10 pr-4 py-2.5 bg-[#F1F5F9]/80 border border-[#E2E8F0] rounded-xl text-sm placeholder:text-gray-400 text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-all"
                                        placeholder="admin@spaceezy.com"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-800 mb-1">Password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                                        <Lock size={16} />
                                    </div>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full pl-10 pr-10 py-2.5 bg-[#F1F5F9]/80 border border-[#E2E8F0] rounded-xl text-sm placeholder:text-gray-400 text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-all tracking-wider"
                                        placeholder="••••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                <div className="flex justify-end mt-1.5">
                                    <Link
                                        href="/login/forgot-password"
                                        className="text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors"
                                    >
                                        Forgot password?
                                    </Link>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white py-2.5 sm:py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-md shadow-purple-500/25 disabled:opacity-50 mt-4"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Signing in...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Sign In</span>
                                        <ArrowRight size={16} />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Need Help Footer */}
                        <div className="text-center mt-4 pt-3.5 border-t border-gray-100">
                            <p className="text-[11px] text-gray-400 font-medium">Need help?</p>
                            <div className="flex items-center justify-center gap-1.5 mt-1 text-xs text-gray-600">
                                <Headphones size={14} className="text-purple-600" />
                                <span>Contact support for assistance.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
