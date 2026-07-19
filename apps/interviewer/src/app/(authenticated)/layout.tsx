"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export default function AuthenticatedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <Suspense fallback={null}>
            <AuthenticatedLayoutContent>{children}</AuthenticatedLayoutContent>
        </Suspense>
    );
}

function AuthenticatedLayoutContent({
    children,
}: {
    children: React.ReactNode;
}) {
    const { session, loading, error } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Only redirect once auth restore has settled — the ?token= dev override is
    // consumed by the AuthProvider during its initial restore (loading === true),
    // so redirecting only when !loading && !session never races it.
    useEffect(() => {
        if (!loading && !session) {
            const params = new URLSearchParams();
            const query = searchParams.toString();
            const next = `${pathname}${query ? `?${query}` : ""}`;
            if (error) params.set("reason", error);
            params.set("next", next);
            router.replace(`/login?${params.toString()}`);
        }
    }, [session, loading, error, pathname, router, searchParams]);

    // Show a global loading spinner while determining auth state
    if (loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#FAFBFC] dark:bg-lc-bg">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!session) {
        return null;
    }

    return <>{children}</>;
}
