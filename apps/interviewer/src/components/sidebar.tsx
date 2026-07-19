"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/context/sidebar-context";

const NAV_ITEMS = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard", activeAlso: [] as string[] },
    { href: "/schedule", label: "Schedule", icon: "calendar_month", activeAlso: [] as string[] },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { isCollapsed } = useSidebar();
    const expanded = !isCollapsed;

    return (
        // Wrapper reserves layout width only when open, so content reclaims the
        // full page when collapsed (Google Meet style — no leftover icon rail).
        <div
            className={`hidden md:block shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${expanded ? "w-[220px]" : "w-0"}`}
        >
            {/* Blends into the page: same background, no border, no shadow. */}
            <aside className="h-full w-[220px] flex flex-col bg-transparent">
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-x-hidden">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + "/") || (item.activeAlso?.some(p => pathname === p || pathname.startsWith(p + "/")));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 py-2.5 px-4 rounded-full text-sm font-medium font-nunito transition-colors whitespace-nowrap ${isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-slate-600 dark:text-[#8a8a8a] hover:bg-slate-100 dark:hover:bg-lc-hover hover:text-slate-900 dark:hover:text-[#ccc]"
                                    }`}
                            >
                                <span
                                    className="material-symbols-outlined text-xl shrink-0"
                                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                                >
                                    {item.icon}
                                </span>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </aside>
        </div>
    );
}
