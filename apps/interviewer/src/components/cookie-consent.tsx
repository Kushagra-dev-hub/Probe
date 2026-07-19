"use client";

import { useState, useEffect } from "react";

export function CookieConsent() {
    const [showBanner, setShowBanner] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        setMounted(true);
        
        // Check if user has already accepted cookies
        const hasAccepted = localStorage.getItem("cookie-consent");
        if (!hasAccepted) {
            setShowBanner(true);
        }

        // Check dark mode from landing page's custom implementation
        const checkDarkMode = () => {
            const landing = document.getElementById("landing-page");
            const isDarkMode = landing?.dataset.dark === "true" || 
                              document.documentElement.dataset.dark === "true";
            setIsDark(isDarkMode);
        };

        // Initial check
        checkDarkMode();

        // Watch for dark mode changes
        const observer = new MutationObserver(checkDarkMode);
        const landing = document.getElementById("landing-page");
        if (landing) {
            observer.observe(landing, { 
                attributes: true, 
                attributeFilter: ['data-dark'] 
            });
        }
        observer.observe(document.documentElement, { 
            attributes: true, 
            attributeFilter: ['data-dark'] 
        });

        return () => observer.disconnect();
    }, []);

    const acceptCookies = () => {
        localStorage.setItem("cookie-consent", "accepted");
        setShowBanner(false);
    };

    const closeBanner = () => {
        setShowBanner(false);
    };

    if (!mounted || !showBanner) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[9999] pointer-events-none max-w-[430px]">
            <div className={`
                rounded-2xl shadow-2xl pointer-events-auto
                ${isDark 
                    ? "bg-[#2a2a2a] border border-[#3a3a3a]" 
                    : "bg-white border border-slate-200"
                }
                backdrop-blur-xl
                animate-in slide-in-from-bottom-4 fade-in duration-500
            `}>
                <div className="p-6 relative">
                    {/* Close Button */}
                    <button
                        onClick={closeBanner}
                        className={`
                            absolute top-3 right-3 p-1.5 rounded-lg transition-colors
                            ${isDark
                                ? "hover:bg-white/10 text-white/60 hover:text-white"
                                : "hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                            }
                        `}
                        aria-label="Close"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Content */}
                    <div className="pr-6">
                        <h3 className={`
                            text-lg font-bold mb-3
                            ${isDark ? "text-white" : "text-slate-900"}
                        `}>
                            This website uses cookies.
                        </h3>
                        
                        <p className={`
                            text-sm mb-4 leading-relaxed
                            ${isDark ? "text-slate-300" : "text-slate-600"}
                        `}>
                            This website uses cookies and local storage for performance and personalization. 
                            Only essential cookies are turned on by default.{" "}
                            <a
                                href="/login"
                                className={`
                                    underline font-medium transition-colors
                                    ${isDark 
                                        ? "text-white hover:text-slate-200" 
                                        : "text-slate-700 hover:text-slate-900"
                                    }
                                `}
                            >
                                Privacy Policy
                            </a>.
                        </p>

                        {/* Accept Button */}
                        <button
                            onClick={acceptCookies}
                            className={`
                                w-full px-6 py-2.5 rounded-lg font-semibold text-sm
                                transition-all duration-200
                                ${isDark
                                    ? "bg-[#1a1a1a] text-white hover:bg-[#151515] border border-[#3a3a3a]"
                                    : "bg-slate-900 text-white hover:bg-slate-800"
                                }
                                shadow-md hover:shadow-lg
                            `}
                        >
                            Accept Cookies
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
