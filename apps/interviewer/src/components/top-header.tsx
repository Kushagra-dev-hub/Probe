"use client";

import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { useSidebar } from "@/context/sidebar-context";
import { ProfileDropdown } from "./profile-dropdown";

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
        <header className="h-16 shrink-0 flex items-center justify-between px-4 bg-white dark:bg-lc-surface sticky top-0 z-[60] border-b border-slate-200 dark:border-lc-border print:hidden">
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
            <div className="flex items-center shrink-0 gap-1 md:gap-0">
                <div className="ml-1 md:ml-0">
                    <ProfileDropdown />
                </div>
            </div>
        </header>
    );
}
