"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
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

    const { signIn, signUp, session, loading, error: authError, clearError } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const nextPath = getSafeNextPath(searchParams.get("next"));

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

    return (
        <>
        <ForceLight>
            <div className="flex min-h-screen w-full flex-col lg:flex-row relative bg-night transition-colors duration-300">
                {/* Back to Landing */}
                <button
                    onClick={() => router.push("/")}
                    suppressHydrationWarning
                    className="fixed top-5 left-5 z-50 flex items-center justify-center size-10 text-primary hover:text-primary/80 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors cursor-pointer rounded-full"
                >
                    <span className="material-symbols-outlined text-xl">arrow_back</span>
                </button>
                {/* Left Side: Marketing Area */}
                <div className="relative sticky top-0 h-screen hidden w-full lg:flex lg:w-1/2 flex-col justify-center px-12 xl:px-24 overflow-hidden bg-gradient-to-br from-grape/70 via-night to-night">
                    <div className="relative z-10">
                        <div className="mb-12">
                            <Image src="/logo_big_dark.svg" alt="Probe." width={260} height={73} className="h-16 w-auto" />
                        </div>

                        <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-[1.15] mb-8 tracking-tight">
                            Welcome back to{" "}
                            <span className="text-mint">Probe</span>.
                        </h1>

                        <p className="text-lg text-haze max-w-md leading-relaxed">
                            Sign in to schedule interviews, open your live coding room, and pick up
                            right where you left off.
                        </p>
                    </div>
                </div>

                {/* Right Side: Auth Card */}
                <div className="flex flex-1 items-center justify-center p-6 sm:p-12 lg:p-16 bg-night">
                    <div className="w-full max-w-[480px]">
                        {/* Mobile Logo */}
                        <div className="flex lg:hidden items-center justify-center mb-8">
                            <Image src="/logo_big_dark.svg" alt="Probe." width={140} height={40} className="h-8 w-auto" />
                        </div>

                        <div className="mb-10">
                            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2 tracking-tight">
                                {activeTab === "login" ? "Welcome back" : "Create account"}
                            </h2>
                            <p className="text-slate-500 dark:text-neutral-400">
                                {activeTab === "login"
                                    ? "Sign in to continue."
                                    : "Create your account to get started."}
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
                                <div className="mb-2">
                                    <label
                                        className="block text-sm font-semibold text-slate-700 dark:text-neutral-300"
                                        htmlFor="password"
                                    >
                                        Password
                                    </label>
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
                                className="w-full rounded-full bg-mint py-4 text-sm font-bold text-night transition hover:bg-primary-dark shadow-lg shadow-mint/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                type="submit"
                                disabled={isSubmitting}
                                suppressHydrationWarning
                            >
                                {isSubmitting && (
                                    <div className="w-4 h-4 border-2 border-night/30 border-t-night rounded-full animate-spin" />
                                )}
                                {isSubmitting
                                    ? (activeTab === "login" ? "Signing In..." : "Creating Account...")
                                    : (activeTab === "login" ? "Sign In" : "Create Account")}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </ForceLight>
        </>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-night" />}>
            <LoginContent />
        </Suspense>
    );
}
