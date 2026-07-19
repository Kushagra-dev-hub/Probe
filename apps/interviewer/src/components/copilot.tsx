"use client";

/**
 * Probe copilot UI — interviewer-only surfaces.
 *
 * CopilotPanel  : the live "ASK THIS NEXT" card stack in the room's right panel.
 * ScorecardView : the evidence-linked scorecard on the end/evaluation screen.
 */
import { useMemo, useState } from "react";
import type { CopilotScorecard, CopilotStatus, CopilotSuggestion, InterviewRubric, ScorecardVerdict } from "@probe/contract";

function timeAgo(iso: string) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
}

const CONFIDENCE_STYLE: Record<CopilotSuggestion["confidence"], string> = {
    high: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    medium: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    low: "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300",
};

const SURFACE_LABEL: Record<CopilotSuggestion["surface"], string> = {
    ide: "IDE",
    runs: "Run results",
    question: "Question",
};

function statusMeta(status: CopilotStatus | null, hasLlm: boolean) {
    const state = status?.state ?? (hasLlm ? "watching" : "disabled");
    if (state === "thinking") return { label: "Reading the work…", dot: "animate-pulse bg-indigo-500", text: "text-indigo-600 dark:text-indigo-400" };
    if (state === "error") return { label: "Copilot error", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" };
    if (state === "disabled") return { label: "Copilot off", dot: "bg-slate-400", text: "text-slate-500" };
    return { label: "Watching the work", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
}

export function CopilotPanel({
    suggestions,
    status,
    rubric,
    onAnalyze,
    canAnalyze,
}: {
    suggestions: CopilotSuggestion[];
    status: CopilotStatus | null;
    rubric: InterviewRubric | null;
    onAnalyze: () => void;
    canAnalyze: boolean;
}) {
    const [showHistory, setShowHistory] = useState(false);
    const [showRubric, setShowRubric] = useState(false);
    const latest = suggestions[suggestions.length - 1] ?? null;
    const history = suggestions.slice(0, -1).reverse();
    const rubricTitle = useMemo(() => {
        const map = new Map((rubric?.items ?? []).map((item) => [item.key, item.title]));
        return (key: string | null) => (key ? map.get(key) ?? key.replace(/_/g, " ") : null);
    }, [rubric]);
    const meta = statusMeta(status, true);
    const thinking = status?.state === "thinking";

    return (
        <div className="rounded-xl border border-indigo-200 bg-white p-4 dark:border-indigo-500/30 dark:bg-lc-bg">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="grid size-5 place-items-center rounded-md bg-indigo-600 text-[10px] font-bold text-white">P</span>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Probe copilot</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.text}`}>
                    <span className={`size-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                </span>
            </div>

            {status?.state === "error" && status.detail && (
                <p className="mt-2 rounded-lg bg-red-50 p-2 text-[11px] font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400">{status.detail}</p>
            )}

            {latest ? (
                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Ask this next</p>
                        <span className="text-[10px] font-semibold text-slate-400">{timeAgo(latest.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 text-[14px] font-bold leading-snug text-slate-900 dark:text-white">&ldquo;{latest.ask}&rdquo;</p>
                    <p className="mt-2 text-[12px] font-medium leading-relaxed text-slate-600 dark:text-slate-300">{latest.observation}</p>
                    {latest.evidence && (
                        <pre className="custom-scrollbar mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] leading-relaxed text-slate-100">{latest.evidence}</pre>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {latest.evidenceLines && (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">{latest.evidenceLines}</span>
                        )}
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">{SURFACE_LABEL[latest.surface]}</span>
                        {latest.rubricKey && (
                            <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">{rubricTitle(latest.rubricKey)}</span>
                        )}
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold capitalize ${CONFIDENCE_STYLE[latest.confidence]}`}>{latest.confidence} confidence</span>
                    </div>
                </div>
            ) : (
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[12px] font-semibold text-slate-500 dark:bg-lc-surface dark:text-slate-400">
                    Probe reads the candidate&apos;s code and runs as they work, and drops the one follow-up worth asking here. Nothing is shown to the candidate.
                </p>
            )}

            <button
                type="button"
                onClick={onAnalyze}
                disabled={!canAnalyze || thinking}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <span className={`material-symbols-outlined text-[18px] ${thinking ? "animate-spin" : ""}`}>{thinking ? "progress_activity" : "neurology"}</span>
                {thinking ? "Reading the work…" : "Suggest a question now"}
            </button>

            {history.length > 0 && (
                <div className="mt-3">
                    <button type="button" onClick={() => setShowHistory((v) => !v)} className="flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        Earlier suggestions ({history.length})
                        <span className="material-symbols-outlined text-[16px]">{showHistory ? "expand_less" : "expand_more"}</span>
                    </button>
                    {showHistory && (
                        <div className="mt-2 space-y-2">
                            {history.map((s) => (
                                <div key={s.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-lc-border">
                                    <p className="text-[12px] font-bold text-slate-800 dark:text-slate-200">&ldquo;{s.ask}&rdquo;</p>
                                    <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{s.observation}</p>
                                    <p className="mt-1 text-[10px] font-semibold text-slate-400">{timeAgo(s.createdAt)}{s.evidenceLines ? ` · ${s.evidenceLines}` : ""}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {rubric && rubric.items.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-lc-border">
                    <button type="button" onClick={() => setShowRubric((v) => !v)} className="flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        Role pack · {rubric.roleTitle || "General"} ({rubric.items.length})
                        <span className="material-symbols-outlined text-[16px]">{showRubric ? "expand_less" : "expand_more"}</span>
                    </button>
                    {showRubric && (
                        <div className="mt-2 space-y-1.5">
                            {rubric.items.map((item) => (
                                <div key={item.key} className="rounded-lg bg-slate-50 p-2 dark:bg-lc-surface">
                                    <p className="text-[12px] font-bold text-slate-800 dark:text-slate-200">{item.title}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.description}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const VERDICT_STYLE: Record<ScorecardVerdict, { badge: string; icon: string }> = {
    strong: { badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400", icon: "check_circle" },
    mixed: { badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400", icon: "contrast" },
    thin: { badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400", icon: "error" },
    unknown: { badge: "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300", icon: "help" },
};

export function ScorecardView({
    scorecard,
    generating,
    onGenerate,
    onCopyToEvaluation,
}: {
    scorecard: CopilotScorecard | null;
    generating: boolean;
    onGenerate: () => void;
    onCopyToEvaluation?: (data: { strengths: string[]; concerns: string[]; notes: string }) => void;
}) {
    const copyable = useMemo(() => {
        if (!scorecard) return null;
        const strengths = scorecard.items.filter((i) => i.verdict === "strong").map((i) => i.title);
        const concerns = scorecard.items.filter((i) => i.verdict === "thin").map((i) => (i.note ? `${i.title}: ${i.note}` : i.title));
        return { strengths, concerns, notes: scorecard.summary };
    }, [scorecard]);

    return (
        <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm dark:border-indigo-500/30 dark:bg-lc-surface">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">P</span>
                    <h2 className="font-nunito text-base font-bold text-slate-900 dark:text-white">Probe scorecard</h2>
                </div>
                <button
                    type="button"
                    onClick={onGenerate}
                    disabled={generating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                >
                    <span className={`material-symbols-outlined text-[16px] ${generating ? "animate-spin" : ""}`}>{generating ? "progress_activity" : "refresh"}</span>
                    {generating ? "Drafting…" : scorecard ? "Regenerate" : "Generate"}
                </button>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">
                Drafted from the session log — every row cites the work. Review before you rely on it; Probe never makes the decision.
            </p>

            {!scorecard ? (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500 dark:bg-lc-bg dark:text-slate-400">
                    {generating ? "Reading the session log…" : "No scorecard yet — generate one from the session's code, runs, and observations."}
                </p>
            ) : (
                <>
                    {scorecard.summary && <p className="mt-3 rounded-lg bg-indigo-50/60 p-3 text-sm font-medium leading-relaxed text-slate-700 dark:bg-indigo-500/10 dark:text-slate-200">{scorecard.summary}</p>}
                    <div className="mt-3 space-y-2">
                        {scorecard.items.map((item) => {
                            const style = VERDICT_STYLE[item.verdict] ?? VERDICT_STYLE.unknown;
                            return (
                                <div key={item.key} className="rounded-xl border border-slate-200 p-3 dark:border-lc-border">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</p>
                                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${style.badge}`}>
                                            <span className="material-symbols-outlined text-[13px]">{style.icon}</span>
                                            {item.verdict}
                                        </span>
                                    </div>
                                    {item.note && <p className="mt-1 text-[12px] font-medium text-slate-600 dark:text-slate-300">{item.note}</p>}
                                    {item.evidence.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {item.evidence.map((evidence, index) => (
                                                <li key={index} className="flex items-start gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                                    <span className="material-symbols-outlined mt-px text-[13px] text-indigo-400">subdirectory_arrow_right</span>
                                                    <span className="min-w-0 break-words font-mono">{evidence}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {onCopyToEvaluation && copyable && (
                        <button
                            type="button"
                            onClick={() => onCopyToEvaluation(copyable)}
                            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                        >
                            <span className="material-symbols-outlined text-[18px]">content_copy</span>
                            Use as evaluation draft
                        </button>
                    )}
                    <p className="mt-2 text-center text-[10px] font-semibold text-slate-400">Generated {timeAgo(scorecard.generatedAt)} · audit-logged</p>
                </>
            )}
        </div>
    );
}
