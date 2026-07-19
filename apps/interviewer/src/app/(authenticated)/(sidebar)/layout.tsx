"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { TopHeader } from "@/components/top-header";
import { SidebarProvider } from "@/context/sidebar-context";

const MOBILE_NAV_ITEMS = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/schedule", label: "Schedule", icon: "calendar_month" },
];

function MobileBottomNav() {
    const pathname = usePathname();
    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[80] h-[60px] bg-white dark:bg-lc-surface border-t border-slate-200 dark:border-lc-border flex items-stretch print:hidden">
            {MOBILE_NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium font-nunito transition-colors ${
                            isActive
                                ? "text-primary"
                                : "text-slate-500 dark:text-[#8a8a8a]"
                        }`}
                    >
                        <span
                            className="material-symbols-outlined text-[22px]"
                            style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                        >
                            {item.icon}
                        </span>
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SidebarProvider>
            <div className="flex flex-col h-screen overflow-hidden bg-[#FAFBFC] dark:bg-lc-bg print:h-auto print:overflow-visible">
                <TopHeader />
                <div className="flex flex-1 overflow-hidden print:overflow-visible print:h-auto">
                    <Sidebar />
                    <div className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto relative print:overflow-visible print:h-auto print:block pb-[60px] md:pb-0">{children}</div>
                </div>
                <MobileBottomNav />
            </div>
        </SidebarProvider>
    );
}
