"use client";

import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { useSidebar } from "@/context/sidebar-context";
import { ProfileDropdown } from "./profile-dropdown";

function Clock() {
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        setNow(new Date());
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Render an invisible placeholder pre-mount to avoid a hydration mismatch
    // (server has no clock) while reserving the row height.
    if (!now) return <span className="hidden sm:block h-5" aria-hidden />;

    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    const date = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

    return (
        <span className="hidden sm:flex items-center gap-1.5 text-sm font-medium tabular-nums text-slate-500 dark:text-[#8a8a8a] select-none">
            <span className="text-slate-700 dark:text-[#ccc]">{time}</span>
            <span className="text-slate-300 dark:text-[#555]">•</span>
            <span>{date}</span>
        </span>
    );
}

export function TopHeader() {
    const { isCollapsed, toggleCollapsed } = useSidebar();
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const isDark = mounted && resolvedTheme === "dark";
    const bigLogo = isDark ? "/logo_big_dark.svg" : "/logo_big.svg";

    return (
        <header className="h-16 shrink-0 flex items-center justify-between px-4 bg-[#FAFBFC] dark:bg-lc-bg sticky top-0 z-[60] print:hidden">
            {/* Left side: Logo & Toggle */}
            <div className="flex items-center gap-4 w-[200px] shrink-0">
                {/* Menu Toggle is ALWAYS shown */}
                <button
                    onClick={toggleCollapsed}
                    className="hidden md:block p-1.5 rounded-full text-slate-500 hover:text-slate-900 dark:text-[#8a8a8a] dark:hover:text-[#ccc] hover:bg-slate-100 dark:hover:bg-lc-hover transition-colors shrink-0 cursor-pointer mt-1.5"
                    title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    <span className="material-symbols-outlined text-[24px]">menu</span>
                </button>

                {/* Persistent Big Logo */}
                <Link href="/dashboard" className="flex items-center shrink-0 ml-2">
                    <Image
                        src={bigLogo}
                        alt="Probe Logo"
                        width={220}
                        height={60}
                        className="h-10 w-auto object-contain"
                    />
                </Link>
            </div>

            {/* Right side: Actions */}
            <div className="flex items-center shrink-0 gap-4">
                <Clock />
                {/* New interview — hover reveals Instant / Later; a plain click defaults to Later */}
                <div className="group relative">
                    <Link
                        href="/later"
                        className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-night transition hover:bg-primary-dark"
                    >
                        New interview
                        <span className="material-symbols-outlined text-[18px] transition-transform group-hover:rotate-180">expand_more</span>
                    </Link>
                    <div className="invisible absolute right-0 top-full z-50 translate-y-1 pt-2 opacity-0 transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                        <div className="w-56 overflow-hidden rounded-xl border border-white/10 bg-lc-surface p-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
                            <Link href="/instant" className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition hover:bg-white/5">
                                <span className="material-symbols-outlined mt-0.5 text-[19px] text-mint">bolt</span>
                                <span className="leading-tight">
                                    <span className="block text-sm font-semibold text-white">Instant interview</span>
                                    <span className="block text-[11px] text-[#8a8a8a]">Start a room right now</span>
                                </span>
                            </Link>
                            <Link href="/later" className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition hover:bg-white/5">
                                <span className="material-symbols-outlined mt-0.5 text-[19px] text-steel">calendar_month</span>
                                <span className="leading-tight">
                                    <span className="block text-sm font-semibold text-white">Schedule later</span>
                                    <span className="block text-[11px] text-[#8a8a8a]">Pick a date &amp; share a link</span>
                                </span>
                            </Link>
                        </div>
                    </div>
                </div>
                {/* subtle divider to separate quick-actions from identity */}
                <span className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-lc-border" />
                <div className="pl-1">
                    <ProfileDropdown />
                </div>
            </div>
        </header>
    );
}
