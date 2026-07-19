"use client";

/**
 * DesignCanvas — a real Excalidraw whiteboard for the System Design round.
 *
 * The scene is carried over the existing editor-sync channel as a JSON string
 * ({ elements }). The candidate draws (editable); the interviewer observes
 * (viewModeEnabled) and the scene updates live via updateScene.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
    ssr: false,
    loading: () => (
        <div className="grid h-full place-items-center bg-slate-50 dark:bg-lc-bg">
            <div className="flex flex-col items-center gap-2 text-slate-400">
                <span className="material-symbols-outlined animate-pulse text-3xl">design_services</span>
                <p className="text-sm font-semibold">Loading canvas…</p>
            </div>
        </div>
    ),
});

type Serialized = { elements: readonly unknown[] };

function parseElements(value: string): unknown[] {
    try {
        const parsed = JSON.parse(value || "{}") as Partial<Serialized>;
        return Array.isArray(parsed.elements) ? [...parsed.elements] : [];
    } catch {
        return [];
    }
}

export function DesignCanvas({
    value,
    onChange,
    readOnly,
    theme = "light",
}: {
    value: string;
    onChange?: (serialized: string) => void;
    readOnly: boolean;
    theme?: "light" | "dark";
}) {
    const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
    const debounceRef = useRef<number | null>(null);
    const lastSentRef = useRef<string>("");

    // Initial scene — only used on first mount; later updates go through updateScene.
    const initialData = useMemo(() => ({ elements: parseElements(value) as never, scrollToContent: true }), []);

    // Observer side: when a new scene arrives from the peer, push it into the canvas.
    useEffect(() => {
        if (!readOnly) return;
        const api = apiRef.current;
        if (!api || value === lastSentRef.current) return;
        try {
            api.updateScene({ elements: parseElements(value) as never });
            lastSentRef.current = value;
        } catch {
            /* ignore malformed scene */
        }
    }, [value, readOnly]);

    const handleChange = useCallback(
        (elements: readonly unknown[]) => {
            if (readOnly || !onChange) return;
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            debounceRef.current = window.setTimeout(() => {
                const serialized = JSON.stringify({ elements });
                if (serialized === lastSentRef.current) return;
                lastSentRef.current = serialized;
                onChange(serialized);
            }, 500);
        },
        [readOnly, onChange]
    );

    return (
        <div className="h-full w-full">
            <Excalidraw
                excalidrawAPI={(api) => {
                    apiRef.current = api;
                }}
                initialData={initialData}
                viewModeEnabled={readOnly}
                theme={theme}
                onChange={readOnly ? undefined : (handleChange as never)}
                UIOptions={{ canvasActions: { toggleTheme: false, loadScene: false } }}
            />
        </div>
    );
}
