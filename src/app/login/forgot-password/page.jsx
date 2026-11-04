"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { showToast } from "../../../lib/toast";
import {
    forgotPasswordAPI,
    resetPasswordAPI,
    verifyResetOtpAPI,
} from "../../../lib/api/auth";

// Mirrors backend/src/constants/passwordReset.js — the API does not expose
// these, so the UI quotes the same policy: 6-digit code, 60s resend cooldown,
// 5-minute code lifetime, 10-character minimum password.
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;
const OTP_EXPIRY_SECONDS = 5 * 60;
const MIN_PASSWORD_LENGTH = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Primary button, matching the login page's gradient variant.
const primaryButtonClass =
    "w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 rounded-xl font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200 disabled:opacity-50";

const inputClass =
    "block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500";

const labelClass = "block text-sm font-medium text-gray-700 mb-2";

// Spinning placeholder used by every async submit in this file.
const Spinner = () => <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />;

// Resend countdown, formatted mm:ss. `secondsLeft === 0` means resend is live.
const Countdown = ({ secondsLeft }) => {
    if (secondsLeft <= 0) return null;
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const ss = String(secondsLeft % 60).padStart(2, "0");
    return (
        <span className="text-xs text-gray-500" role="timer" aria-live="polite">
            Resend available in {mm}:{ss}
        </span>
    );
};

export default function ForgotPasswordPage() {
    const router = useRouter();

    // step: "email" → "otp" → "password" → "done"
    const [step, setStep] = useState("email");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [resetToken, setResetToken] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Resend cooldown + code-expiry clocks, both in seconds.
    const [resendIn, setResendIn] = useState(0);
    const [codeExpiresIn, setCodeExpiresIn] = useState(OTP_EXPIRY_SECONDS);

    const emailRef = useRef(null);
    const otpRef = useRef(null);

    // Ticking clocks. Cleared on unmount; both stop when they reach zero.
    useEffect(() => {
        if (step !== "otp" && resendIn <= 0 && codeExpiresIn <= 0) return undefined;
        const id = setInterval(() => {
            setResendIn((s) => (s > 0 ? s - 1 : 0));
            setCodeExpiresIn((s) => (s > 0 ? s - 1 : 0));
        }, 1000);
        return () => clearInterval(id);
    }, [step, resendIn, codeExpiresIn]);

    // Focus the first field of each step.
    useEffect(() => {
        if (step === "email") emailRef.current?.focus();
        if (step === "otp") otpRef.current?.focus();
    }, [step]);

    // Any navigation away mid-flow must not leave a stale token in memory.
    useEffect(() => () => setResetToken(""), []);

    const fail = useCallback((err, fallback) => {
        setError(err?.message || fallback);
    }, []);

    // Step 1 — request a code. The API answers identically for known and
    // unknown addresses, so success simply advances: we never tell the user
    // whether the email exists.
    const submitEmail = async (e) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!EMAIL_RE.test(trimmed)) {
            setError("Enter a valid email address.");
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            await forgotPasswordAPI(trimmed);
            setEmail(trimmed);
            setOtp("");
            setResendIn(RESEND_COOLDOWN_SECONDS);
            setCodeExpiresIn(OTP_EXPIRY_SECONDS);
            setStep("otp");
            showToast("If an account exists for that email, a code has been sent.", "success");
        } catch (err) {
            // 429 (rate limited) or a network failure — both are worth saying.
            fail(err, "Could not send the code. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    // Resend — same generic behaviour, restarts the cooldown.
    const resendCode = async () => {
        if (resendIn > 0 || isLoading) return;
        setIsLoading(true);
        setError(null);
        try {
            await forgotPasswordAPI(email);
            setOtp("");
            setResendIn(RESEND_COOLDOWN_SECONDS);
            setCodeExpiresIn(OTP_EXPIRY_SECONDS);
            otpRef.current?.focus();
            showToast("A new code has been sent.", "success");
        } catch (err) {
            fail(err, "Could not resend the code. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2 — verify the code, receive the one-time reset token.
    const submitOtp = async (e) => {
        e.preventDefault();
        if (!/^\d{6}$/.test(otp)) {
            setError("Enter the 6-digit code from your email.");
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const data = await verifyResetOtpAPI(email, otp);
            setResetToken(data?.resetToken || "");
            setStep("password");
            showToast("Code verified. Choose a new password.", "success");
        } catch (err) {
            // Wrong, expired and locked-out codes share one message server-side;
            // keep it identical here so nothing leaks.
            fail(err, "Invalid or expired verification code.");
            setOtp("");
            otpRef.current?.focus();
        } finally {
            setIsLoading(false);
        }
    };

    // Step 3 — set the new password (confirmed client-side, validated server-side).
    const submitPassword = async (e) => {
        e.preventDefault();
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            await resetPasswordAPI(email, resetToken, newPassword);
            setStep("done");
            setNewPassword("");
            setConfirmPassword("");
            setResetToken("");
            showToast("Password updated successfully.", "success");
        } catch (err) {
            // Token expired (10 min) or already used — send them back to the
            // code step rather than dead-ending.
            if (err?.code === "INVALID_RESET_CODE") {
                setError("That session expired. Request a new code.");
                setResetToken("");
                setOtp("");
                setResendIn(0);
                setStep("email");
            } else {
                fail(err, "Could not update the password. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const backToLogin = () => router.push("/login");

    return (
        <div className="relative min-h-[100dvh] w-full flex items-center justify-center p-4 overflow-x-hidden bg-[#0e0720]">
            {/* Background image & gradient overlays */}
            <div className="absolute inset-0 z-0">
                <Image
                    src="/images/login-bg.jpg"
                    alt="Spaceezy Luxury Real Estate"
                    fill
                    priority
                    sizes="100vw"
                    className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#170B2C]/90 via-[#1A0E33]/70 to-[#241147]/85" />
                <div className="absolute top-1/2 -right-48 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />
            </div>

            <div className="relative z-10 w-full max-w-lg bg-white rounded-[32px] sm:rounded-[36px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] border border-white/80 p-5 sm:p-8 my-auto">
                {/* Logo & Header */}
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="relative w-22 h-22 sm:w-26 sm:h-26 drop-shadow-md">
                        <Image
                            src="/images/spaceezy-logo.png"
                            alt="Spaceezy logo"
                            width={104}
                            height={104}
                            className="w-full h-full object-contain"
                            priority
                        />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mt-3">
                        Spaceezy<span className="text-purple-600">.</span> CRM
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">Reset your password</p>
                </div>

                <div>
                    {/* Progress: three dots, current one highlighted. */}
                    <div className="flex items-center justify-center gap-2 mb-6" aria-hidden="true">
                        {["email", "otp", "password"].map((name, i) => {
                            const activeIdx = ["email", "otp", "password"].indexOf(step);
                            const done = activeIdx > i || step === "done";
                            const active = activeIdx === i;
                            return (
                                <span
                                    key={name}
                                    className={`h-1.5 rounded-full transition-all ${
                                        done || active ? "w-8 bg-purple-600" : "w-4 bg-gray-200"
                                    }`}
                                />
                            );
                        })}
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium mb-5"
                        >
                            {error}
                        </div>
                    )}

                    {/* ---------------------------------------------------------- Step 1 */}
                    {step === "email" && (
                        <form onSubmit={submitEmail} noValidate>
                            <div className="flex items-center gap-2 mb-4">
                                <Mail className="text-purple-600" size={20} />
                                <h2 className="text-xl font-bold text-gray-900">Forgot your password?</h2>
                            </div>
                            <p className="text-sm text-gray-500 mb-6">
                                Enter the email registered with your SpaceEzy account and we&apos;ll send
                                you a 6-digit verification code.
                            </p>

                            <div className="mb-6">
                                <label htmlFor="fp-email" className={labelClass}>Email Address</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        id="fp-email"
                                        ref={emailRef}
                                        type="email"
                                        autoComplete="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className={inputClass}
                                        placeholder="Enter your email"
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            <button type="submit" disabled={isLoading} className={primaryButtonClass}>
                                {isLoading ? <><Spinner /> Sending code...</> : <>Send code <ArrowRight size={18} /></>}
                            </button>

                            <button
                                type="button"
                                onClick={backToLogin}
                                className="w-full mt-3 flex items-center justify-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 py-2"
                            >
                                <ArrowLeft size={16} /> Back to sign in
                            </button>
                        </form>
                    )}

                    {/* ---------------------------------------------------------- Step 2 */}
                    {step === "otp" && (
                        <form onSubmit={submitOtp} noValidate>
                            <div className="flex items-center gap-2 mb-4">
                                <KeyRound className="text-purple-600" size={20} />
                                <h2 className="text-xl font-bold text-gray-900">Enter verification code</h2>
                            </div>
                            <p className="text-sm text-gray-500 mb-1">
                                We sent a 6-digit code to <span className="font-medium text-gray-700">{email}</span>.
                            </p>
                            <p className="text-xs text-gray-400 mb-6">
                                The code expires in{" "}
                                <span className={codeExpiresIn <= 30 ? "text-red-500 font-medium" : "text-gray-500"}>
                                    {Math.floor(codeExpiresIn / 60)}:{String(codeExpiresIn % 60).padStart(2, "0")}
                                </span>
                                . It can only be used once.
                            </p>

                            <div className="mb-6">
                                <label htmlFor="fp-otp" className={labelClass}>6-digit code</label>
                                <input
                                    id="fp-otp"
                                    ref={otpRef}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={OTP_LENGTH}
                                    pattern="\d*"
                                    value={otp}
                                    onChange={(e) => {
                                        const digits = e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH);
                                        setOtp(digits);
                                        if (error) setError(null);
                                    }}
                                    className="block w-full py-3 bg-gray-50 border border-gray-200 rounded-xl text-center text-2xl font-bold tracking-[0.5em] text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="000000"
                                    disabled={isLoading}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || otp.length !== OTP_LENGTH}
                                className={primaryButtonClass}
                            >
                                {isLoading ? <><Spinner /> Verifying...</> : <>Verify code <ArrowRight size={18} /></>}
                            </button>

                            <div className="flex items-center justify-between mt-4">
                                <button
                                    type="button"
                                    onClick={() => { setStep("email"); setError(null); setOtp(""); }}
                                    className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
                                    disabled={isLoading}
                                >
                                    <ArrowLeft size={16} /> Change email
                                </button>
                                <Countdown secondsLeft={resendIn} />
                                <button
                                    type="button"
                                    onClick={resendCode}
                                    disabled={resendIn > 0 || isLoading}
                                    className="text-sm font-medium text-purple-600 hover:text-purple-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? "Sending..." : "Resend code"}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ---------------------------------------------------------- Step 3 */}
                    {step === "password" && (
                        <form onSubmit={submitPassword} noValidate>
                            <div className="flex items-center gap-2 mb-4">
                                <ShieldCheck className="text-purple-600" size={20} />
                                <h2 className="text-xl font-bold text-gray-900">Set a new password</h2>
                            </div>
                            <p className="text-sm text-gray-500 mb-6">
                                Choose a password of at least {MIN_PASSWORD_LENGTH} characters. All existing
                                sessions will be signed out.
                            </p>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label htmlFor="fp-password" className={labelClass}>New password</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <ShieldCheck className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <input
                                            id="fp-password"
                                            type="password"
                                            autoComplete="new-password"
                                            value={newPassword}
                                            onChange={(e) => { setNewPassword(e.target.value); if (error) setError(null); }}
                                            className={inputClass}
                                            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="fp-confirm" className={labelClass}>Confirm new password</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <ShieldCheck className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <input
                                            id="fp-confirm"
                                            type="password"
                                            autoComplete="new-password"
                                            value={confirmPassword}
                                            onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError(null); }}
                                            className={inputClass}
                                            placeholder="Re-enter the new password"
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button type="submit" disabled={isLoading} className={primaryButtonClass}>
                                {isLoading ? <><Spinner /> Updating...</> : <>Update password <ArrowRight size={18} /></>}
                            </button>
                        </form>
                    )}

                    {/* ---------------------------------------------------------- Done */}
                    {step === "done" && (
                        <div className="text-center py-2">
                            <CheckCircle2 className="mx-auto text-green-500 mb-4" size={48} aria-hidden="true" />
                            <h2 className="text-xl font-bold text-gray-900 mb-2">Password updated</h2>
                            <p className="text-sm text-gray-500 mb-6">
                                Your password has been changed and all other sessions were signed out.
                                You can now sign in with your new password.
                            </p>
                            <button
                                type="button"
                                onClick={backToLogin}
                                className={primaryButtonClass}
                            >
                                Sign in <ArrowRight size={18} />
                            </button>
                        </div>
                    )}
                </div>

                <p className="text-center text-xs text-gray-400 mt-6">
                    Need help? Contact your organization administrator.
                </p>
            </div>
        </div>
    );
}
