"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/context/sidebar-context";
import { useState } from "react";

const NAV_ITEMS = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard", activeAlso: [] as string[] },
    { href: "/schedule", label: "Schedule", icon: "calendar_month", activeAlso: [] as string[] },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { isCollapsed } = useSidebar();
    const [isHovered, setIsHovered] = useState(false);

    const expanded = !isCollapsed || isHovered;

    return (
        <div
            className={`hidden md:block relative z-[90] h-full shrink-0 transition-[width] duration-300 ${isCollapsed ? "w-[72px]" : "w-[200px]"}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <aside
                className={`
                    absolute top-0 left-0 z-[90] h-full flex flex-col transition-all duration-300 overflow-hidden bg-white dark:bg-lc-surface
                    ${expanded ? "w-[200px] border-r border-slate-200 dark:border-lc-border shadow-[4px_0_24px_-8px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_24px_-8px_rgba(0,0,0,0.5)]" : "w-[72px] border-r border-slate-200 dark:border-lc-border"}
                    ${!isCollapsed ? "!shadow-none" : ""}
                `}
            >
                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-x-hidden w-[200px]">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + "/") || (item.activeAlso?.some(p => pathname === p || pathname.startsWith(p + "/")));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={!expanded ? item.label : undefined}
                                className={`flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium font-nunito transition-colors whitespace-nowrap px-3 ${isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-slate-600 dark:text-[#8a8a8a] hover:bg-slate-50 dark:hover:bg-lc-hover hover:text-slate-900 dark:hover:text-[#ccc]"
                                    }`}
                            >
                                <span
                                    className="material-symbols-outlined text-xl shrink-0"
                                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                                >
                                    {item.icon}
                                </span>
                                <span
                                    className={`transition-all duration-300 ${!expanded ? "opacity-0 w-0 -translate-x-4 ml-0" : "opacity-100 w-auto translate-x-0"}`}
                                >
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </nav>
            </aside>
        </div>
    );
}
