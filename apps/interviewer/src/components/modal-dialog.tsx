"use client";

import { useEffect } from "react";

interface ModalDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    type?: "success" | "error" | "warning" | "info";
    details?: string;
}

export function ModalDialog({
    isOpen,
    onClose,
    title,
    message,
    type = "info",
    details,
}: ModalDialogProps) {
    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                onClose();
            }
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const getIconAndColors = () => {
        switch (type) {
            case "success":
                return {
                    icon: (
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ),
                    iconColor: "text-emerald-500 dark:text-emerald-400",
                    bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
                    borderColor: "border-emerald-200 dark:border-emerald-800",
                };
            case "error":
                return {
                    icon: (
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ),
                    iconColor: "text-red-500 dark:text-red-400",
                    bgColor: "bg-red-50 dark:bg-red-900/20",
                    borderColor: "border-red-200 dark:border-red-800",
                };
            case "warning":
                return {
                    icon: (
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    ),
                    iconColor: "text-amber-500 dark:text-amber-400",
                    bgColor: "bg-amber-50 dark:bg-amber-900/20",
                    borderColor: "border-amber-200 dark:border-amber-800",
                };
            default:
                return {
                    icon: (
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ),
                    iconColor: "text-blue-500 dark:text-blue-400",
                    bgColor: "bg-blue-50 dark:bg-blue-900/20",
                    borderColor: "border-blue-200 dark:border-blue-800",
                };
        }
    };

    const { icon, iconColor, bgColor, borderColor } = getIconAndColors();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 dark:bg-black/70"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-[#282828] rounded-lg shadow-2xl max-w-lg w-full border border-slate-200 dark:border-[#3e3e3e] animate-in fade-in zoom-in duration-200">
                {/* Icon Section */}
                <div className={`flex justify-center pt-8 pb-6 ${bgColor} rounded-t-lg border-b ${borderColor}`}>
                    <div className={iconColor}>{icon}</div>
                </div>

                {/* Content */}
                <div className="p-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3 text-center">
                        {title}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 text-center mb-4">
                        {message}
                    </p>

                    {/* Details Section (for errors, etc.) */}
                    {details && (
                        <div className="mt-4 p-4 bg-slate-50 dark:bg-[#1c160d] rounded border border-slate-200 dark:border-[#3e3e3e]">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Details:
                            </p>
                            <pre className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap overflow-x-auto max-h-60">
{details}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-[#282828]"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
