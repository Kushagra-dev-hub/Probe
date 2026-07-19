"use client";

/**
 * Probe copilot UI — interviewer-only surfaces.
 *
 *  CopilotDock   : the always-on autonomous assistant panel (right rail). No manual
 *                  buttons — it streams resume insight, per-answer analysis, code
 *                  suggestions, and a live transcript as the interview happens.
 *  ResumePdf     : the real embedded resume, rendered in the browser's native PDF
 *                  viewer via a blob URL (scroll + zoom + page nav for free).
 *  ScorecardView : the evidence-linked scorecard on the end screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
    CopilotInsight,
    CopilotScorecard,
    CopilotStatus,
    CopilotSuggestion,
    ResumeAnalysis,
    ScorecardVerdict,
    TranscriptEntry,
} from "@probe/contract";

function timeAgo(iso: string) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
}

/* ------------------------------------------------------------------ *
 * Embedded resume — the actual PDF in the native browser viewer.
 * ------------------------------------------------------------------ */

export function ResumePdf({ url, loading, fileName, error }: { url: string | null; loading: boolean; fileName: string | null; error: string | null }) {
    return (
        <div className="flex h-full flex-col bg-slate-100 dark:bg-lc-bg">
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-lc-border dark:bg-lc-surface">
                <span className="material-symbols-outlined text-[20px] text-primary">description</span>
                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{fileName || "Candidate resume"}</p>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                    <span className="material-symbols-outlined text-[12px]">visibility_off</span>
                    Interviewer only
                </span>
            </div>
            <div className="relative min-h-0 flex-1">
                {url ? (
                    <iframe src={`${url}#view=FitH`} title={fileName || "Resume"} className="h-full w-full border-none bg-white" />
                ) : (
                    <div className="grid h-full place-items-center p-8 text-center">
                        <div className="flex flex-col items-center gap-3">
                            <span className={`material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 ${loading ? "animate-pulse" : ""}`}>
                                {error ? "error" : "picture_as_pdf"}
                            </span>
                            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                                {error || (loading ? "Loading resume…" : "No resume uploaded yet.")}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * CopilotDock — the autonomous assistant. Everything auto-updates.
 * ------------------------------------------------------------------ */

const VERDICT_CHIP: Record<CopilotInsight["verdict"], { label: string; cls: string }> = {
    correct: { label: "Correct", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
    "partially-correct": { label: "Partial", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
    incorrect: { label: "Incorrect", cls: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
    evasive: { label: "Bluffing / evasive", cls: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400" },
    unclear: { label: "Unclear", cls: "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300" },
};

const CONFIDENCE_STYLE: Record<CopilotSuggestion["confidence"], string> = {
    high: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    medium: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    low: "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300",
};

type FeedItem =
    | { kind: "insight"; at: string; data: CopilotInsight }
    | { kind: "suggestion"; at: string; data: CopilotSuggestion };

function statusMeta(status: CopilotStatus | null) {
    const state = status?.state ?? "watching";
    if (state === "thinking") return { label: status?.detail || "Thinking…", dot: "animate-pulse bg-indigo-500", text: "text-indigo-600 dark:text-indigo-400" };
    if (state === "error") return { label: "Copilot error", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" };
    if (state === "disabled") return { label: "Copilot off", dot: "bg-slate-400", text: "text-slate-500" };
    return { label: "Live — watching & listening", dot: "bg-emerald-500 animate-pulse", text: "text-emerald-600 dark:text-emerald-400" };
}

export function CopilotDock({
    suggestions,
    insights,
    status,
    resumeAnalysis,
    transcript,
    listening,
    onAnalyzeAnswer,
}: {
    suggestions: CopilotSuggestion[];
    insights: CopilotInsight[];
    status: CopilotStatus | null;
    resumeAnalysis: ResumeAnalysis | null;
    transcript: TranscriptEntry[];
    listening: boolean;
    onAnalyzeAnswer: () => void;
}) {
    const meta = statusMeta(status);
    const [resumeOpen, setResumeOpen] = useState(true);
    const [justSent, setJustSent] = useState(false);

    const sendAnswer = () => {
        onAnalyzeAnswer();
        setJustSent(true);
        window.setTimeout(() => setJustSent(false), 1400);
    };

    // Press Enter anywhere (except while typing in a field / the code editor) to
    // send the candidate's current answer to the copilot — the primary trigger.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey) return;
            const el = document.activeElement as HTMLElement | null;
            if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
            e.preventDefault();
            sendAnswer();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onAnalyzeAnswer]);

    // Merge answer insights + code suggestions into one reverse-chronological feed.
    const feed = useMemo<FeedItem[]>(() => {
        const items: FeedItem[] = [
            ...insights.map((i) => ({ kind: "insight" as const, at: i.createdAt, data: i })),
            ...suggestions.map((s) => ({ kind: "suggestion" as const, at: s.createdAt, data: s })),
        ];
        return items.sort((a, b) => b.at.localeCompare(a.at));
    }, [insights, suggestions]);

    // Auto-scroll the live transcript strip to the newest line.
    const transcriptEndRef = useRef<HTMLDivElement | null>(null);
    const finals = useMemo(() => transcript.filter((t) => t.isFinal).slice(-40), [transcript]);
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [finals.length]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-lc-surface">
            {/* Header — status only, no controls */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-lc-border">
                <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-md bg-indigo-600 text-[11px] font-black text-white">P</span>
                    <div>
                        <p className="font-nunito text-sm font-extrabold text-slate-900 dark:text-white">Probe Copilot</p>
                        <p className={`flex items-center gap-1.5 text-[10px] font-bold ${meta.text}`}>
                            <span className={`size-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                        </p>
                    </div>
                </div>
                {listening && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                        <span className="material-symbols-outlined animate-pulse text-[13px]">graphic_eq</span>
                        Listening
                    </span>
                )}
            </div>

            {/* Scrollable body */}
            <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {/* Resume digest — appears automatically once analyzed */}
                {resumeAnalysis && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                        <button type="button" onClick={() => setResumeOpen((v) => !v)} className="flex w-full items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                <span className="material-symbols-outlined text-[15px]">contact_page</span>
                                Resume read
                            </span>
                            <span className="material-symbols-outlined text-[16px] text-indigo-400">{resumeOpen ? "expand_less" : "expand_more"}</span>
                        </button>
                        {resumeOpen && (
                            <div className="mt-2 space-y-2">
                                <p className="text-[12px] font-medium leading-relaxed text-slate-700 dark:text-slate-200">{resumeAnalysis.summary}</p>
                                {resumeAnalysis.recommendedQuestions.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Ask about their work</p>
                                        {resumeAnalysis.recommendedQuestions.slice(0, 6).map((q, i) => (
                                            <div key={i} className="rounded-lg bg-white p-2 dark:bg-lc-bg">
                                                <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100">{q.question}</p>
                                                <p className="text-[10px] font-semibold text-slate-400">{q.topic}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {(resumeAnalysis.redFlags.length > 0 || resumeAnalysis.strongAreas.length > 0) && (
                                    <div className="flex flex-wrap gap-1">
                                        {resumeAnalysis.strongAreas.slice(0, 4).map((s, i) => (
                                            <span key={`s${i}`} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">✓ {s}</span>
                                        ))}
                                        {resumeAnalysis.redFlags.slice(0, 4).map((s, i) => (
                                            <span key={`f${i}`} className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">? {s}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Live feed of insights + suggestions */}
                {feed.length === 0 && !resumeAnalysis && (
                    <div className="rounded-xl bg-slate-50 p-4 text-center dark:bg-lc-bg">
                        <span className="material-symbols-outlined mb-1 text-2xl text-indigo-300">neurology</span>
                        <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                            Probe is listening and reading the work. It surfaces the next question to ask the moment there&apos;s something worth asking — automatically.
                        </p>
                    </div>
                )}

                {feed.map((item, i) =>
                    item.kind === "insight" ? (
                        <InsightCard key={item.data.id} insight={item.data} defaultOpen={i === 0} />
                    ) : (
                        <SuggestionCard key={item.data.id} suggestion={item.data} defaultOpen={i === 0} />
                    )
                )}
            </div>

            {/* Live transcript strip — condensed (… + last lines), with the
                Enter-to-analyze affordance. Recording is continuous; the interviewer
                decides when the answer is complete. */}
            <div className="shrink-0 border-t border-slate-200 bg-slate-50/60 dark:border-lc-border dark:bg-lc-bg">
                <div className="flex items-center justify-between px-3 pt-2">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <span className={`material-symbols-outlined text-[14px] ${listening ? "text-emerald-500" : ""}`}>{listening ? "graphic_eq" : "forum"}</span>
                        Live transcript
                    </p>
                    {finals.length > 3 && <span className="text-[10px] font-semibold text-slate-400">…{finals.length - 3} earlier</span>}
                </div>
                <div className="custom-scrollbar max-h-20 space-y-0.5 overflow-y-auto px-3 pb-1.5 pt-1">
                    {finals.length === 0 ? (
                        <p className="py-1 text-[11px] italic text-slate-400">Listening… speech appears here as it&apos;s spoken.</p>
                    ) : (
                        finals.slice(-3).map((t, i) => (
                            <p key={i} className="truncate text-[11px] leading-snug">
                                <span className={`font-bold ${t.speaker === "interviewer" ? "text-blue-500" : "text-indigo-500"}`}>
                                    {t.speaker === "interviewer" ? "You" : "Candidate"}:
                                </span>{" "}
                                <span className="text-slate-600 dark:text-slate-300">{t.text}</span>
                            </p>
                        ))
                    )}
                    <div ref={transcriptEndRef} />
                </div>
                <div className="px-2.5 pb-2.5 pt-1">
                    <button
                        type="button"
                        onClick={sendAnswer}
                        className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors ${justSent ? "bg-emerald-500" : "bg-indigo-600 hover:bg-indigo-700"}`}
                    >
                        <span className="material-symbols-outlined text-[18px]">{justSent ? "check" : "keyboard_return"}</span>
                        {justSent ? "Sent to Copilot" : "Answer done — analyze"}
                        <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
                    </button>
                </div>
            </div>
        </div>
    );
}

function scoreColor(score: number): string {
    if (score >= 75) return "bg-emerald-500";
    if (score >= 50) return "bg-amber-500";
    if (score >= 30) return "bg-orange-500";
    return "bg-rose-500";
}

function InsightCard({ insight, defaultOpen }: { insight: CopilotInsight; defaultOpen: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    const chip = VERDICT_CHIP[insight.verdict] ?? VERDICT_CHIP.unclear;
    const score = insight.score;
    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-lc-border dark:bg-lc-bg">
            {/* Scorecard header — verdict + score gauge (practers report style). Click to collapse. */}
            <button type="button" onClick={() => setOpen((v) => !v)} className="w-full border-b border-slate-100 bg-slate-50/70 px-3 py-2.5 text-left dark:border-lc-border dark:bg-white/[0.02]">
                <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${chip.cls}`}>{chip.label}</span>
                    <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold capitalize text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">{insight.confidence} conf</span>
                        <span className="text-[10px] font-semibold text-slate-400">{timeAgo(insight.createdAt)}</span>
                        <span className="material-symbols-outlined text-[16px] text-slate-400">{open ? "expand_less" : "expand_more"}</span>
                    </div>
                </div>
                {score != null && (
                    <div className="mt-2">
                        <div className="flex items-end justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Answer quality</span>
                            <span className="font-mono text-[15px] font-black leading-none text-slate-900 dark:text-white">{score}<span className="text-[10px] font-bold text-slate-400">/100</span></span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-lc-border">
                            <div className={`h-full rounded-full ${scoreColor(score)} transition-all`} style={{ width: `${score}%` }} />
                        </div>
                    </div>
                )}
                {!open && insight.question && <p className="mt-1.5 truncate text-[11px] font-semibold italic text-slate-400">Q: {insight.question}</p>}
            </button>
            {open && (
            <div className="p-3">
                {insight.question && <p className="mb-1 text-[11px] font-semibold italic text-slate-400">Q: {insight.question}</p>}
                <p className="text-[12px] font-medium leading-relaxed text-slate-700 dark:text-slate-200">{insight.summary}</p>
                {insight.bluff && (
                    <p className="mt-1.5 flex items-start gap-1 rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                        <span className="material-symbols-outlined text-[13px]">warning</span> {insight.bluff}
                    </p>
                )}
                {insight.missingConcepts.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {insight.missingConcepts.map((c, i) => (
                            <span key={i} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">missing: {c}</span>
                        ))}
                    </div>
                )}
                {insight.followups.length > 0 && (
                    <div className="mt-2 space-y-1 rounded-lg bg-indigo-50/60 p-2 dark:bg-indigo-500/10">
                        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                            <span className="material-symbols-outlined text-[13px]">quiz</span> Ask this next
                        </p>
                        {insight.followups.map((f, i) => (
                            <p key={i} className="text-[12px] font-semibold text-slate-800 dark:text-slate-200">• {f}</p>
                        ))}
                    </div>
                )}
            </div>
            )}
        </div>
    );
}

function SuggestionCard({ suggestion, defaultOpen }: { suggestion: CopilotSuggestion; defaultOpen: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
            <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                    <span className="material-symbols-outlined text-[13px]">code</span> Ask this next
                </p>
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-400">{timeAgo(suggestion.createdAt)}</span>
                    <span className="material-symbols-outlined text-[16px] text-indigo-400">{open ? "expand_less" : "expand_more"}</span>
                </div>
            </button>
            <p className="mt-1 text-[13px] font-bold leading-snug text-slate-900 dark:text-white">&ldquo;{suggestion.ask}&rdquo;</p>
            {open && (
                <>
                    <p className="mt-1 text-[12px] font-medium text-slate-600 dark:text-slate-300">{suggestion.observation}</p>
                    {suggestion.evidence && (
                        <pre className="custom-scrollbar mt-1.5 max-h-20 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-2 font-mono text-[10px] leading-relaxed text-slate-100">{suggestion.evidence}</pre>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {suggestion.evidenceLines && (
                            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">{suggestion.evidenceLines}</span>
                        )}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold capitalize ${CONFIDENCE_STYLE[suggestion.confidence]}`}>{suggestion.confidence}</span>
                    </div>
                </>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * ScorecardView — the evidence-linked scorecard on the end screen.
 * ------------------------------------------------------------------ */

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
            <p className="mt-1 text-[11px] font-semibold text-slate-400">Drafted from the session log — every row cites the work. Review before you rely on it; Probe never makes the decision.</p>

            {!scorecard ? (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500 dark:bg-lc-bg dark:text-slate-400">
                    {generating ? "Reading the session log…" : "No scorecard yet — generate one from the session's code, runs, and answers."}
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
