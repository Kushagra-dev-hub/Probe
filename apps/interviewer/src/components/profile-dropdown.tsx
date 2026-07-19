"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "next-themes";

export function ProfileDropdown() {
    const { signOut, user } = useAuth();
    const router = useRouter();
    const { theme, setTheme } = useTheme();
    const [profileOpen, setProfileOpen] = useState(false);
    const [showThemeOptions, setShowThemeOptions] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    const handleThemeToggle = (newTheme: string, e: React.MouseEvent) => {
        if (!(document as any).startViewTransition) {
            setTheme(newTheme);
            return;
        }

        const x = e.clientX;
        const y = e.clientY;
        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        );

        const transition = (document as any).startViewTransition(() => {
            setTheme(newTheme);
        });

        transition.ready.then(() => {
            document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${x}px ${y}px)`,
                        `circle(${endRadius}px at ${x}px ${y}px)`,
                    ],
                },
                {
                    duration: 600,
                    easing: "ease-in-out",
                    pseudoElement: "::view-transition-new(root)",
                }
            );
        });
    };

    const displayName = user?.name || "User";
    const initial = displayName.charAt(0).toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U";

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
                setShowThemeOptions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Handle initial mount to ensure we have a mounted state before rendering theme UI to avoid hydration mismatch
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <div className="relative" ref={profileRef}>
            <button
                onClick={() => {
                    setProfileOpen(!profileOpen);
                    if (profileOpen) setShowThemeOptions(false); // Reset to main menu when closing
                }}
                className="rounded-full cursor-pointer hover:opacity-90 transition-all"
            >
                <div className="size-9 rounded-full bg-rose-900 flex items-center justify-center text-white font-bold text-xs overflow-hidden hover:ring-2 hover:ring-rose-900/30">
                    {initial}
                </div>
            </button>
            {profileOpen && (
                <div className="absolute right-0 top-12 w-56 bg-white dark:bg-lc-surface rounded-xl shadow-lg border border-slate-100 dark:border-lc-border py-2 z-50 overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-lc-border">
                        <p className="text-sm font-semibold text-slate-900 dark:text-[#eff1f6] truncate">
                            {displayName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-[#8a8a8a] truncate">
                            {user?.email}
                        </p>
                    </div>

                    {!showThemeOptions ? (
                        <>
                            {/* Main Menu */}
                            <div className="py-1">
                                <button
                                    onClick={() => {
                                        setProfileOpen(false);
                                        router.push("/dashboard");
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-[#ababab] hover:bg-slate-50 dark:hover:bg-lc-hover transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-lg text-slate-400">person</span>
                                    Profile
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowThemeOptions(true);
                                    }}
                                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-700 dark:text-[#ababab] hover:bg-slate-50 dark:hover:bg-lc-hover transition-colors cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-lg text-slate-400">palette</span>
                                        Theme
                                    </div>
                                    <span className="material-symbols-outlined text-sm text-slate-400">chevron_right</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setProfileOpen(false);
                                        router.push("/schedule");
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-[#ababab] hover:bg-slate-50 dark:hover:bg-lc-hover transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-lg text-slate-400">settings</span>
                                    Settings
                                </button>
                            </div>
                            <div className="border-t border-slate-100 dark:border-lc-border">
                                <button
                                    onClick={() => {
                                        signOut();
                                        router.push("/");
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-lg">logout</span>
                                    Sign Out
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Theme sub-menu */}
                            <div className="py-1">
                                <div className="px-4 py-2 mb-1 flex items-center gap-2 border-b border-slate-100 dark:border-lc-border">
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setShowThemeOptions(false);
                                        }}
                                        className="text-slate-400 hover:text-slate-700 dark:hover:text-[#ccc] transition-colors p-1 -ml-1 cursor-pointer flex items-center justify-center rounded-md"
                                    >
                                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                                    </button>
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Theme Options</span>
                                </div>

                                {mounted && (
                                    <>
                                        <button
                                            onClick={(e) => handleThemeToggle('light', e)}
                                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-700 dark:text-[#ababab] hover:bg-slate-50 dark:hover:bg-lc-hover transition-colors cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="material-symbols-outlined text-lg text-slate-400">light_mode</span>
                                                Light
                                            </div>
                                            {theme === 'light' && <span className="material-symbols-outlined text-sm text-primary">check</span>}
                                        </button>
                                        <button
                                            onClick={(e) => handleThemeToggle('dark', e)}
                                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-700 dark:text-[#ababab] hover:bg-slate-50 dark:hover:bg-lc-hover transition-colors cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="material-symbols-outlined text-lg text-slate-400">dark_mode</span>
                                                Dark
                                            </div>
                                            {theme === 'dark' && <span className="material-symbols-outlined text-sm text-primary">check</span>}
                                        </button>
                                        <button
                                            onClick={(e) => handleThemeToggle('system', e)}
                                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-700 dark:text-[#ababab] hover:bg-slate-50 dark:hover:bg-lc-hover transition-colors cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="material-symbols-outlined text-lg text-slate-400">desktop_windows</span>
                                                System
                                            </div>
                                            {theme === 'system' && <span className="material-symbols-outlined text-sm text-primary">check</span>}
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
