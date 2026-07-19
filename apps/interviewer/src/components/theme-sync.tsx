"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

/**
 * Syncs the landing page lamp toggle (practers-dark) with next-themes
 * This ensures dark mode is consistent across authenticated and unauthenticated pages
 */
export function ThemeSync() {
  const { setTheme, resolvedTheme } = useTheme();
  const isInitialSync = useRef(true);
  const isSyncing = useRef(false);

  const applyDomTheme = (isDark: boolean) => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.dataset.dark = isDark ? "true" : "";
  };

  // Initial sync on mount: Read practers-dark and apply to theme
  useEffect(() => {
    if (isInitialSync.current) {
      const practersDark = localStorage.getItem("practers-dark");
      
      if (practersDark !== null) {
        isSyncing.current = true;
        const isDark = practersDark === "true";
        const targetTheme = isDark ? "dark" : "light";
        applyDomTheme(isDark);
        localStorage.setItem("theme", targetTheme);
        setTheme(targetTheme);
        
        // Allow sync to complete before enabling bidirectional updates
        setTimeout(() => {
          isSyncing.current = false;
          isInitialSync.current = false;
        }, 100);
      } else {
        isInitialSync.current = false;
      }
    }
  }, [setTheme]);

  // Sync practers-dark when theme changes in authenticated pages
  useEffect(() => {
    if (!isInitialSync.current && !isSyncing.current && resolvedTheme) {
      const isDark = resolvedTheme === "dark";
      const currentPractersDark = localStorage.getItem("practers-dark");
      const newValue = String(isDark);
      applyDomTheme(isDark);
      
      // Only update if value actually changed to prevent unnecessary writes
      if (currentPractersDark !== newValue) {
        localStorage.setItem("practers-dark", newValue);
      }
      if (localStorage.getItem("theme") !== resolvedTheme) {
        localStorage.setItem("theme", resolvedTheme);
      }
    }
  }, [resolvedTheme]);

  // Listen for storage changes from other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if ((e.key === "practers-dark" || e.key === "theme") && e.newValue !== null && !isSyncing.current) {
        isSyncing.current = true;
        const isDark = e.key === "theme" ? e.newValue === "dark" : e.newValue === "true";
        applyDomTheme(isDark);
        setTheme(isDark ? "dark" : "light");
        
        setTimeout(() => {
          isSyncing.current = false;
        }, 100);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [setTheme]);

  return null;
}
