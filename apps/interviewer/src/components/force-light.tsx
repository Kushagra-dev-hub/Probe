"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

/**
 * Wraps children in a forced-light-mode context.
 * Temporarily sets the theme to "light" and restores previous theme on unmount.
 * However, respects the "practers-dark" localStorage flag for pages that implement
 * their own dark mode (landing page, interview types, login, etc.)
 */
export function ForceLight({ children }: { children: React.ReactNode }) {
    const { setTheme, theme } = useTheme();
    const prevTheme = useRef<string | undefined>(undefined);

    useEffect(() => {
        const checkAndApplyTheme = () => {
            // Check if the page wants to use the landing page dark mode
            const useLandingDarkMode = typeof window !== "undefined" && 
                                       localStorage.getItem("practers-dark") === "true";

            // Store the current theme before forcing light
            if (prevTheme.current === undefined) {
                prevTheme.current = theme;
            }
            
            setTheme("light");

            // Only force light mode classes if NOT using landing page dark mode
            if (!useLandingDarkMode) {
                document.documentElement.setAttribute('data-theme', 'light');
                document.documentElement.classList.add('light');
                document.documentElement.classList.remove('dark');
            } else {
                // If using landing dark mode, ensure dark class is present
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
            }
        };

        // Initial check
        checkAndApplyTheme();

        // Listen for storage changes
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === "practers-dark") {
                checkAndApplyTheme();
            }
        };

        window.addEventListener("storage", handleStorageChange);

        // Poll for changes (for same-tab updates)
        const interval = setInterval(checkAndApplyTheme, 500);

        return () => {
            window.removeEventListener("storage", handleStorageChange);
            clearInterval(interval);
            
            // Restore the user's preferred theme when leaving
            if (prevTheme.current && prevTheme.current !== "light") {
                setTheme(prevTheme.current);
                const useLandingDarkMode = typeof window !== "undefined" && 
                                           localStorage.getItem("practers-dark") === "true";
                if (!useLandingDarkMode) {
                    document.documentElement.removeAttribute('data-theme');
                }
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <>{children}</>;
}
