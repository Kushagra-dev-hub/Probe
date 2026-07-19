"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export function ProfileDropdown() {
    const { signOut, user } = useAuth();
    const router = useRouter();
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    const displayName = user?.name || "User";
    const initial = displayName.charAt(0).toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U";

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={profileRef}>
            <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="rounded-full cursor-pointer hover:opacity-90 transition-all"
            >
                <div className="size-9 rounded-full bg-gradient-to-br from-steel to-mint flex items-center justify-center text-night font-bold text-xs overflow-hidden hover:ring-2 hover:ring-mint/30">
                    {initial}
                </div>
            </button>
            {profileOpen && (
                <div className="absolute right-0 top-12 w-56 bg-white dark:bg-lc-surface rounded-xl shadow-lg border border-slate-100 dark:border-lc-border py-2 z-50 overflow-hidden">
                    {/* Identity header */}
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-lc-border">
                        <p className="text-sm font-semibold text-slate-900 dark:text-[#eff1f6] truncate">
                            {displayName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-[#8a8a8a] truncate">
                            {user?.email}
                        </p>
                    </div>

                    {/* Log out */}
                    <button
                        onClick={() => {
                            signOut();
                            router.push("/");
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-lg">logout</span>
                        Log out
                    </button>
                </div>
            )}
        </div>
    );
}
