"use client";

/**
 * Dark-only app: kept as a passthrough so existing imports keep working.
 */
export function ForceLight({ children }: { children: React.ReactNode }) {
    // Dark-only app: this wrapper is now a passthrough (no light forcing).
    return <>{children}</>;
}
