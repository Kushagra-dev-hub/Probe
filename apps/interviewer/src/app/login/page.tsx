"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { ForceLight } from "@/components/force-light";

function getSafeNextPath(value: string | null) {
    if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
    return value;
}

function LoginContent() {
    const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [isDark, setIsDark] = useState(false);

    // Forgot password state
    const [forgotOpen, setForgotOpen] = useState(false);
    const [forgotEmail, setForgotEmail] = useState("");
    const [forgotSubmitting, setForgotSubmitting] = useState(false);
    const [forgotSuccess, setForgotSuccess] = useState(false);
    const [forgotError, setForgotError] = useState<string | null>(null);

    const { signIn, signUp, signInWithGoogle, signInWithLinkedIn, resetPassword, session, loading, error: authError, clearError } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const nextPath = getSafeNextPath(searchParams.get("next"));

    // Check dark mode from localStorage (synced with landing page and interview types)
    useEffect(() => {
        const updateDarkMode = () => {
            const darkMode = localStorage.getItem("practers-dark") === "true";
            setIsDark(darkMode);
            document.documentElement.dataset.dark = darkMode ? "true" : "";
        };

        // Initial check
        updateDarkMode();

        // Listen for storage changes (when theme changes in other tabs or auth pages)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === "practers-dark") {
                updateDarkMode();
            }
        };

        // Listen for theme changes from next-themes
        const handleThemeChange = () => {
            updateDarkMode();
        };

        window.addEventListener("storage", handleStorageChange);
        window.addEventListener("storage", handleThemeChange);

        // Poll for changes (fallback for same-tab changes)
        const interval = setInterval(updateDarkMode, 500);

        return () => {
            window.removeEventListener("storage", handleStorageChange);
            window.removeEventListener("storage", handleThemeChange);
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        if (searchParams.get("tab") === "signup") {
            setActiveTab("signup");
        }
    }, [searchParams]);

    useEffect(() => {
        document.title = activeTab === "signup" ? "Sign Up | Probe" : "Log In | Probe";
    }, [activeTab]);

    const urlError = searchParams.get("error");
    const urlErrorDesc = searchParams.get("error_description");
    const urlReason = searchParams.get("reason"); // e.g. session expiry from auth layout
    let displayError = formError || authError;

    // Process URL errors and mask backend errors
    if (!displayError) {
        if (urlErrorDesc || urlError) {
            const rawError = decodeURIComponent(urlErrorDesc || urlError || "");
            if (rawError.includes("exchange external code") || rawError.includes("server_error")) {
                displayError = "Authentication failed. Please try again or use a different login method.";
            } else {
                displayError = rawError;
            }
        }
    }

    // Redirect signed-in users straight to the dashboard (for login tab only).
    // Guard with isSubmitting so signup flow doesn't race to /dashboard.
    useEffect(() => {
        if (!loading && session && !isSubmitting && activeTab === "login") {
            router.replace(nextPath || "/dashboard");
        }
    }, [session, loading, isSubmitting, activeTab, nextPath, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        clearError();
        setIsSubmitting(true);

        try {
            if (activeTab === "login") {
                await signIn(email, password);
                router.replace(nextPath || "/dashboard");
            } else {
                if (!fullName.trim()) {
                    setFormError("Full name is required");
                    setIsSubmitting(false);
                    return;
                }

                // Sign up auto-logs the user in (no email verification in this build)
                await signUp(email, password, fullName);
                router.replace(nextPath || "/dashboard");
            }
        } catch {
            // Error is set by auth context or caught above
            setIsSubmitting(false);
        }
    };

    const handleGoogleAuth = async () => {
        clearError();
        await signInWithGoogle(nextPath);
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!forgotEmail.trim()) return;
        setForgotSubmitting(true);
        setForgotError(null);
        try {
            await resetPassword(forgotEmail.trim());
            setForgotSuccess(true);
        } catch (err: any) {
            setForgotError(err?.message || "Failed to send reset email. Please try again.");
        } finally {
            setForgotSubmitting(false);
        }
    };

    const closeForgot = () => {
        setForgotOpen(false);
        setForgotEmail("");
        setForgotSuccess(false);
        setForgotError(null);
    };

    return (
        <>
        <ForceLight>
            <div className={`flex min-h-screen w-full flex-col lg:flex-row relative transition-colors duration-300 ${
                isDark ? 'bg-[#222222]' : 'bg-white'
            }`}>
                {/* Back to Landing */}
                <button
                    onClick={() => router.push("/")}
                    suppressHydrationWarning
                    className="fixed top-5 left-5 z-50 flex items-center justify-center size-10 text-primary hover:text-primary/80 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors cursor-pointer rounded-full"
                >
                    <span className="material-symbols-outlined text-xl">arrow_back</span>
                </button>
                {/* Left Side: Marketing Area */}
                <div className="relative sticky top-0 h-screen hidden w-full lg:flex lg:w-1/2 flex-col justify-center px-12 xl:px-24 overflow-hidden bg-gradient-to-br from-[#C5D9F7] via-[#E8F0FC] to-[#A8C5F0] dark:from-[#1a2d4a] dark:via-[#0a0a0a] dark:to-[#1e3a5f]">
                    <div className="relative z-10">
                        <div className="mb-12">
                            <Image src="/logo_big.svg" alt="Probe." width={260} height={73} className="h-16 w-auto" />
                        </div>

                        <h1 className="text-4xl xl:text-5xl font-extrabold text-[#1a1a1a] dark:text-white leading-[1.15] mb-8 tracking-tight">
                            Ready to{" "}
                            <span className="text-[#4A7CFF]">ace</span> your engineering
                            interview?
                        </h1>

                        <p className="text-lg text-[#5a5a5a] dark:text-neutral-300 max-w-md leading-relaxed">
                            Master the technical interview with expert-led courses and
                            real-world simulations designed for the modern engineer.
                        </p>
                    </div>
                </div>

                {/* Right Side: Auth Card */}
                <div className="flex flex-1 items-center justify-center p-6 sm:p-12 lg:p-16 bg-white dark:bg-[#1a1a1a]">
                    <div className="w-full max-w-[480px]">
                        {/* Mobile Logo */}
                        <div className="flex lg:hidden items-center justify-center mb-8">
                            <Image src="/logo_big.svg" alt="Probe." width={140} height={40} className="h-8 w-auto" />
                        </div>

                        <div className="mb-10">
                            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2 tracking-tight">
                                {activeTab === "login" ? "Welcome back" : "Create account"}
                            </h2>
                            <p className="text-slate-500 dark:text-neutral-400">
                                {activeTab === "login"
                                    ? "Sign in to continue your journey."
                                    : "Start your interview prep journey."}
                            </p>
                        </div>

                        {/* Session-expired notice (amber — expected, not a failure) */}
                        {urlReason && !displayError && (
                            <div className="mb-6 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-500 dark:text-amber-400 text-lg">info</span>
                                {decodeURIComponent(urlReason)}
                            </div>
                        )}

                        {/* Error Banner */}
                        {displayError && (
                            <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                                <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-lg">error</span>
                                {displayError}
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="flex border-b border-slate-100 dark:border-lc-border mb-8">
                            <button
                                type="button"
                                onClick={() => { setActiveTab("login"); clearError(); setFormError(null); }}
                                suppressHydrationWarning
                                className={`flex-1 pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "login"
                                    ? "border-primary text-slate-900 dark:text-white"
                                    : "border-transparent text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300"
                                    }`}
                            >
                                Login
                            </button>
                            <button
                                type="button"
                                onClick={() => { setActiveTab("signup"); clearError(); setFormError(null); }}
                                suppressHydrationWarning
                                className={`flex-1 pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "signup"
                                    ? "border-primary text-slate-900 dark:text-white"
                                    : "border-transparent text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300"
                                    }`}
                            >
                                Sign Up
                            </button>
                        </div>

                        {/* Social Auth */}
                        {true && (
                            <>
                                <div className="space-y-3 mb-8">
                                    <button
                                        onClick={handleGoogleAuth}
                                        suppressHydrationWarning
                                        className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-200 dark:border-lc-border bg-white dark:bg-lc-surface py-3 px-4 transition hover:bg-slate-50 dark:hover:bg-lc-surface/80 cursor-pointer"
                                    >
                                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                                            <path
                                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                                fill="#4285F4"
                                            />
                                            <path
                                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                                fill="#34A853"
                                            />
                                            <path
                                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                                                fill="#FBBC05"
                                            />
                                            <path
                                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                                fill="#EA4335"
                                            />
                                        </svg>
                                        <span className="text-sm font-semibold text-slate-700 dark:text-neutral-200">
                                            Continue with Google
                                        </span>
                                    </button>

                                    <button onClick={() => signInWithLinkedIn(nextPath)} suppressHydrationWarning className="flex w-full items-center justify-center gap-3 rounded-full bg-[#0077B5] py-3 px-4 text-white transition hover:opacity-90 cursor-pointer">
                                        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                                            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                                        </svg>
                                        <span className="text-sm font-semibold">
                                            Continue with LinkedIn
                                        </span>
                                    </button>
                                </div>

                                {/* Divider */}
                                <div className="relative mb-8 text-center">
                                    <div aria-hidden="true" className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-slate-100 dark:border-lc-border" />
                                    </div>
                                    <span className="relative bg-white dark:bg-lc-bg px-4 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
                                        OR
                                    </span>
                                </div>
                            </>
                        )}

                        {/* Form */}
                        <form className="space-y-5" onSubmit={handleSubmit}>
                            {/* Full Name — only for signup */}
                            {activeTab === "signup" && (
                                <div>
                                    <label
                                        className="block text-sm font-semibold text-slate-700 dark:text-neutral-300 mb-2"
                                        htmlFor="fullName"
                                    >
                                        Full Name
                                    </label>
                                    <input
                                        className="w-full rounded-lg border border-slate-200 dark:border-lc-border bg-transparent dark:bg-lc-surface py-3 px-4 text-slate-900 dark:text-white focus:border-primary focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-neutral-500 outline-none transition-colors"
                                        id="fullName"
                                        placeholder="Enter your Full Name"
                                        type="text"
                                        autoComplete="name"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        required
                                        suppressHydrationWarning
                                    />
                                </div>
                            )}
                            <div>
                                <label
                                    className="block text-sm font-semibold text-slate-700 dark:text-neutral-300 mb-2"
                                    htmlFor="email"
                                >
                                    Email Address
                                </label>
                                <input
                                    className="w-full rounded-lg border border-slate-200 dark:border-lc-border bg-transparent dark:bg-lc-surface py-3 px-4 text-slate-900 dark:text-white focus:border-primary focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-neutral-500 outline-none transition-colors"
                                    id="email"
                                    placeholder="Enter your email"
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    suppressHydrationWarning
                                />
                            </div>
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label
                                        className="block text-sm font-semibold text-slate-700 dark:text-neutral-300"
                                        htmlFor="password"
                                    >
                                        Password
                                    </label>
                                    {activeTab === "login" && (
                                        <button
                                            type="button"
                                            onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                                            suppressHydrationWarning
                                            className="text-sm font-semibold text-primary hover:underline"
                                        >
                                            Forgot Password?
                                        </button>
                                    )}
                                </div>
                                <input
                                    className="w-full rounded-lg border border-slate-200 dark:border-lc-border bg-transparent dark:bg-lc-surface py-3 px-4 text-slate-900 dark:text-white focus:border-primary focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-neutral-500 outline-none transition-colors"
                                    id="password"
                                    placeholder="••••••••"
                                    type="password"
                                    autoComplete={activeTab === "login" ? "current-password" : "new-password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    suppressHydrationWarning
                                />
                            </div>
                            <button
                                className="w-full rounded-full bg-[#FFE500] py-4 text-sm font-bold text-[#1a1a1a] transition hover:bg-[#f5dc00] shadow-lg shadow-[#FFE500]/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                type="submit"
                                disabled={isSubmitting}
                                suppressHydrationWarning
                            >
                                {isSubmitting && (
                                    <div className="w-4 h-4 border-2 border-[#1a1a1a]/30 border-t-[#1a1a1a] rounded-full animate-spin" />
                                )}
                                {isSubmitting
                                    ? (activeTab === "login" ? "Signing In..." : "Creating Account...")
                                    : (activeTab === "login" ? "Sign In" : "Create Account")}
                            </button>
                        </form>

                        <p className="mt-8 text-center text-xs text-slate-500 dark:text-neutral-400 leading-relaxed">
                            By signing up, you agree to our{" "}
                            <Link className="underline hover:text-primary" href="/terms">
                                Terms
                            </Link>{" "}
                            and{" "}
                            <Link className="underline hover:text-primary" href="/privacy">
                                Privacy Policy
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </ForceLight>

            {/* ── Forgot Password Modal ── */}
            {forgotOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) closeForgot(); }}
                >
                    <div className="w-full max-w-md bg-white dark:bg-lc-surface rounded-2xl shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-200 border border-neutral-200 dark:border-lc-border">
                        {forgotSuccess ? (
                            <div className="text-center">
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
                                    <svg className="h-8 w-8 text-emerald-500 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Check your inbox</h3>
                                <p className="text-sm text-slate-500 dark:text-neutral-400 mb-6">
                                    We sent a password reset link to <strong className="text-slate-700 dark:text-neutral-300">{forgotEmail}</strong>. It expires in 1 hour.
                                </p>
                                <p className="text-xs text-slate-400 dark:text-neutral-500 mb-6">Didn't receive it? Check your spam folder or try again.</p>
                                <button
                                    onClick={closeForgot}
                                    className="w-full rounded-full bg-[#FFE500] py-3 text-sm font-bold text-[#1a1a1a] hover:bg-[#f5dc00] transition"
                                >
                                    Back to Sign In
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Reset your password</h3>
                                        <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">We'll send a secure link to your email.</p>
                                    </div>
                                    <button
                                        onClick={closeForgot}
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 dark:text-neutral-500 hover:bg-slate-100 dark:hover:bg-lc-bg hover:text-slate-600 dark:hover:text-neutral-300 transition"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                {forgotError && (
                                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                                        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                        {forgotError}
                                    </div>
                                )}

                                <form onSubmit={handleForgotPassword} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-neutral-300 mb-2" htmlFor="forgot-email">
                                            Email Address
                                        </label>
                                        <input
                                            id="forgot-email"
                                            type="email"
                                            placeholder="Enter your account email"
                                            value={forgotEmail}
                                            onChange={(e) => setForgotEmail(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 dark:border-lc-border bg-transparent dark:bg-lc-bg py-3 px-4 text-sm text-slate-900 dark:text-white focus:border-primary outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-neutral-500"
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={forgotSubmitting || !forgotEmail.trim()}
                                        className="w-full rounded-full bg-[#FFE500] py-3 text-sm font-bold text-[#1a1a1a] hover:bg-[#f5dc00] transition shadow-lg shadow-[#FFE500]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {forgotSubmitting && <div className="w-4 h-4 border-2 border-[#1a1a1a]/30 border-t-[#1a1a1a] rounded-full animate-spin" />}
                                        {forgotSubmitting ? "Sending link..." : "Send Reset Link"}
                                    </button>
                                </form>

                                <p className="mt-4 text-center text-xs text-slate-400 dark:text-neutral-500">
                                    Remembered it?{" "}
                                    <button onClick={closeForgot} className="font-semibold text-primary hover:underline">
                                        Back to Sign In
                                    </button>
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}

        </>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-white" />}>
            <LoginContent />
        </Suspense>
    );
}
