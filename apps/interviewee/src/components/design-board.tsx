"use client";

/**
 * DesignBoard — the System Design workspace, matching practers' solve UI:
 * an Excalidraw whiteboard on top and Functional / Non-Functional Requirement
 * cards below. The whole scene (elements + requirements) travels as one JSON
 * string over the editor-sync channel, so the interviewer sees it live.
 *
 * DesignExtras — Follow-up Questions + revealable Hints for the problem panel.
 */
import { useCallback, useMemo, useState } from "react";
import { DesignCanvas } from "./design-canvas";

type DesignScene = { elements: unknown[]; fr: string; nfr: string };

function parseScene(value: string): DesignScene {
    try {
        const p = JSON.parse(value || "{}") as Partial<DesignScene>;
        return { elements: Array.isArray(p.elements) ? p.elements : [], fr: typeof p.fr === "string" ? p.fr : "", nfr: typeof p.nfr === "string" ? p.nfr : "" };
    } catch {
        return { elements: [], fr: "", nfr: "" };
    }
}

export function DesignBoard({
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
    const scene = useMemo(() => parseScene(value), [value]);
    // Local requirement text so typing stays smooth; canvas elements come from `value`.
    const [fr, setFr] = useState(scene.fr);
    const [nfr, setNfr] = useState(scene.nfr);

    // Keep local requirement text in sync when the peer updates them (observer side).
    const syncedFr = readOnly ? scene.fr : fr;
    const syncedNfr = readOnly ? scene.nfr : nfr;

    const emit = useCallback(
        (next: { elements?: unknown[]; fr?: string; nfr?: string }) => {
            if (readOnly || !onChange) return;
            const current = parseScene(value);
            const merged: DesignScene = {
                elements: next.elements ?? current.elements,
                fr: next.fr ?? (readOnly ? current.fr : fr),
                nfr: next.nfr ?? (readOnly ? current.nfr : nfr),
            };
            onChange(JSON.stringify(merged));
        },
        [readOnly, onChange, value, fr, nfr]
    );

    // The canvas serializes to { elements }; merge those with the requirement text.
    const handleCanvasChange = useCallback(
        (serialized: string) => {
            try {
                const parsed = JSON.parse(serialized) as { elements?: unknown[] };
                emit({ elements: Array.isArray(parsed.elements) ? parsed.elements : [] });
            } catch {
                /* ignore */
            }
        },
        [emit]
    );

    // Pass only { elements } into the canvas so its internal diffing stays stable.
    const canvasValue = useMemo(() => JSON.stringify({ elements: scene.elements }), [scene.elements]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden rounded-t-xl border border-slate-200 dark:border-lc-border">
                <DesignCanvas value={canvasValue} onChange={handleCanvasChange} readOnly={readOnly} theme={theme} />
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 border-x border-b border-slate-200 bg-slate-50 p-2 dark:border-lc-border dark:bg-lc-bg">
                <RequirementCard
                    label="Functional Requirements"
                    value={syncedFr}
                    readOnly={readOnly}
                    onChange={(v) => { setFr(v); emit({ fr: v }); }}
                />
                <RequirementCard
                    label="Non-Functional Requirements"
                    value={syncedNfr}
                    readOnly={readOnly}
                    onChange={(v) => { setNfr(v); emit({ nfr: v }); }}
                />
            </div>
        </div>
    );
}

function RequirementCard({ label, value, readOnly, onChange }: { label: string; value: string; readOnly: boolean; onChange: (v: string) => void }) {
    return (
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-lc-border dark:bg-lc-surface">
            <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100">{label}</p>
                <span className="text-[10px] font-semibold text-slate-400">{value.length} chars</span>
            </div>
            <textarea
                value={value}
                readOnly={readOnly}
                onChange={(e) => onChange(e.target.value)}
                placeholder={readOnly ? "—" : `Write ${label.toLowerCase()} here…`}
                className="custom-scrollbar h-20 w-full resize-none rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-[12px] font-medium text-slate-700 placeholder:font-normal placeholder:text-slate-400 focus:border-primary focus:outline-none dark:border-lc-border dark:bg-lc-bg dark:text-slate-200"
            />
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * DesignExtras — Follow-up questions + revealable hints (problem panel).
 * ------------------------------------------------------------------ */

export function DesignExtras({ followUps, hints }: { followUps?: string[] | null; hints?: string[] | null }) {
    const [revealed, setRevealed] = useState(0);
    const followList = (followUps ?? []).filter(Boolean);
    const hintList = (hints ?? []).filter(Boolean);
    if (followList.length === 0 && hintList.length === 0) return null;
    return (
        <div className="space-y-5">
            {followList.length > 0 && (
                <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                        <span className="material-symbols-outlined text-[16px] text-blue-500">quiz</span>
                        Follow-up Questions
                    </h3>
                    <ol className="space-y-2">
                        {followList.map((q, i) => (
                            <li key={i} className="flex gap-2 text-[13px] text-slate-700 dark:text-slate-300">
                                <span className="font-bold text-blue-500">{i + 1}.</span>
                                <span>{q}</span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
            {hintList.length > 0 && (
                <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                        <span className="material-symbols-outlined text-[16px] text-amber-500">lightbulb</span>
                        Hints <span className="text-[11px] font-semibold text-slate-400">({revealed}/{hintList.length})</span>
                    </h3>
                    <div className="space-y-2">
                        {hintList.slice(0, revealed).map((h, i) => (
                            <div key={i} className="rounded-lg bg-amber-50 p-3 text-[13px] text-slate-700 dark:bg-amber-500/10 dark:text-slate-200">
                                <span className="mr-1 font-bold text-amber-600">Hint {i + 1}:</span>{h}
                            </div>
                        ))}
                        {revealed < hintList.length && (
                            <button
                                type="button"
                                onClick={() => setRevealed((r) => r + 1)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-1.5 text-[12px] font-bold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10"
                            >
                                <span className="material-symbols-outlined text-[15px]">visibility</span>
                                Reveal {revealed === 0 ? "first" : "next"} hint
                            </button>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
