"use client";

/**
 * SolutionView — the DSA "Solution" tab, matching practers' clean UI:
 * each approach (Brute Force / Optimal) is a collapsible accordion with an
 * explanation, time/space complexity, and a Code block with per-language tabs
 * (Python3 / C++ / Java / JavaScript) + copy.
 */
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* -------- helpers (ported from the room) -------- */

function normalizeStarterLanguageKey(language: string): string {
    const value = language.trim().toLowerCase();
    if (["python", "python3", "py"].includes(value)) return "python";
    if (["javascript", "js", "node", "nodejs", "typescript", "ts"].includes(value)) return "javascript";
    if (["java"].includes(value)) return "java";
    if (["cpp", "c++", "cpp17", "cpp20", "cxx"].includes(value)) return "cpp";
    if (["go", "golang"].includes(value)) return "go";
    return value;
}

function normalizeComplexityValue(value?: string): string {
    const normalized = (value || "").trim();
    if (!normalized) return "";
    if (["unknown", "n/a", "na", "none"].includes(normalized.toLowerCase())) return "";
    return normalized;
}

function cleanExplainationText(value?: string): string {
    const raw = (value || "").trim();
    if (!raw) return "";
    return raw
        .split("\n")
        .filter((line) => {
            const t = line.trim().toLowerCase();
            return !t.startsWith("time complexity:") && !t.startsWith("space complexity:");
        })
        .join("\n")
        .trim();
}

function getSolutionCodeLanguages(code?: Record<string, string>): string[] {
    if (!code) return [];
    const order = ["python", "cpp", "java", "javascript", "go"];
    const present = Object.keys(code).filter((lang) => (code[lang] || "").trim());
    return present.sort((a, b) => order.indexOf(normalizeStarterLanguageKey(a)) - order.indexOf(normalizeStarterLanguageKey(b)));
}

function titleFromSolutionKey(key: string, fallback: string) {
    if (key === "bruteForce" || key === "brute_force") return "Brute Force";
    if (["optimized", "optimal", "optimalApproach"].includes(key)) return "Optimal Approach";
    return fallback || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function languageFromCodeText(code: string) {
    if (/^\s*class\s+Solution\s*:/m.test(code) || /^\s*def\s+/m.test(code)) return "python";
    if (/^\s*#include|std::|vector<|int\s+main\s*\(/m.test(code)) return "cpp";
    if (/public\s+class|static\s+void\s+main/m.test(code)) return "java";
    return "javascript";
}

function normalizeSolutionCode(value: unknown): Record<string, string> {
    if (!value) return {};
    if (typeof value === "string") return { [languageFromCodeText(value)]: value };
    if (typeof value !== "object") return {};
    const v = value as Record<string, unknown>;
    const raw = (v.code || v.codes || v.solutionCode || v.implementation || v) as unknown;
    if (typeof raw === "string") return { [languageFromCodeText(raw)]: raw };
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, string> = {};
    Object.entries(raw as Record<string, unknown>).forEach(([language, code]) => {
        if (typeof code === "string" && code.trim()) out[normalizeStarterLanguageKey(language)] = code;
        else if (code && typeof code === "object") {
            const nested = (code as Record<string, unknown>).code || (code as Record<string, unknown>).value || (code as Record<string, unknown>).solution || "";
            if (typeof nested === "string" && nested.trim()) out[normalizeStarterLanguageKey(language)] = nested;
        }
    });
    return out;
}

type Approach = { key: string; title: string; approach: Record<string, unknown> };

export function normalizeSolutionApproaches(solution: unknown): Approach[] {
    if (!solution) return [];
    if (typeof solution === "string") return [{ key: "solution", title: "Solution", approach: { explanation: solution } }];
    if (Array.isArray(solution)) {
        return solution.map((item, index) => ({
            key: String(item?.key || item?.type || item?.title || `approach_${index}`),
            title: titleFromSolutionKey(String(item?.key || item?.type || ""), item?.title || `Approach ${index + 1}`),
            approach: item,
        }));
    }
    if (typeof solution !== "object") return [];
    const s = solution as Record<string, unknown>;
    const candidates: Array<[string, Record<string, unknown>]> = [];
    ["bruteForce", "brute_force", "optimized", "optimal", "optimalApproach"].forEach((key) => {
        if (s[key]) candidates.push([key, s[key] as Record<string, unknown>]);
    });
    if (Array.isArray(s.approaches)) {
        (s.approaches as Record<string, unknown>[]).forEach((item, index) => candidates.push([String(item?.key || item?.type || `approach_${index}`), item]));
    }
    if (!candidates.length && (s.explanation || s.description || s.code || s.solutionCode)) candidates.push(["solution", s]);
    return candidates.map(([key, approach], index) => ({ key, title: titleFromSolutionKey(key, String(approach?.title || approach?.name || `Approach ${index + 1}`)), approach }));
}

const LANG_LABEL: Record<string, string> = { python: "Python3", cpp: "C++", java: "Java", javascript: "JavaScript", go: "Go" };
const MONACO_LANG: Record<string, string> = { python: "python", cpp: "cpp", java: "java", javascript: "javascript", go: "go" };

function ApproachAccordion({ title, approach, defaultOpen, preferredLanguage }: { title: string; approach: Record<string, unknown>; defaultOpen: boolean; preferredLanguage: string }) {
    const [open, setOpen] = useState(defaultOpen);
    const [copied, setCopied] = useState(false);
    const explanation = cleanExplainationText(String(approach.explaination || approach.description || approach.explanation || approach.summary || approach.content || ""));
    const codeMap = useMemo(() => normalizeSolutionCode(approach), [approach]);
    const codeLangs = useMemo(() => getSolutionCodeLanguages(codeMap), [codeMap]);
    const [lang, setLang] = useState(() => codeLangs.find((l) => normalizeStarterLanguageKey(l) === normalizeStarterLanguageKey(preferredLanguage)) || codeLangs[0] || "");
    const time = normalizeComplexityValue(String(approach.timeComplexity || ""));
    const space = normalizeComplexityValue(String(approach.spaceComplexity || ""));
    const code = lang ? codeMap[lang] : "";

    const copy = () => {
        if (!code) return;
        void navigator.clipboard.writeText(code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); });
    };

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-lc-border">
            <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100 dark:bg-[#232323] dark:hover:bg-[#2a2a2a]">
                <span className="text-[15px] font-bold text-slate-900 dark:text-white">{title}</span>
                <span className="material-symbols-outlined text-[20px] text-slate-400">{open ? "expand_less" : "expand_more"}</span>
            </button>
            {open && (
                <div className="space-y-4 bg-white p-4 dark:bg-lc-bg">
                    {explanation && (
                        <div>
                            <p className="mb-1.5 text-[13px] font-bold text-slate-900 dark:text-white">Explanation</p>
                            <div className="prose prose-sm max-w-none text-slate-600 dark:prose-invert dark:text-slate-300">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation}</ReactMarkdown>
                            </div>
                        </div>
                    )}
                    {(time || space) && (
                        <div className="grid grid-cols-2 gap-3">
                            {time && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-lc-border dark:bg-[#1e1e1e]"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Time complexity</p><p className="mt-1 font-mono text-[13px] text-slate-700 dark:text-slate-200">{time}</p></div>}
                            {space && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-lc-border dark:bg-[#1e1e1e]"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Space complexity</p><p className="mt-1 font-mono text-[13px] text-slate-700 dark:text-slate-200">{space}</p></div>}
                        </div>
                    )}
                    {codeLangs.length > 0 && (
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-[13px] font-bold text-slate-900 dark:text-white">Code</p>
                                <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-lc-hover dark:hover:text-slate-200">
                                    <span className="material-symbols-outlined text-[15px]">{copied ? "check" : "content_copy"}</span>
                                    {copied ? "Copied" : "Copy"}
                                </button>
                            </div>
                            <div className="mb-2 flex gap-4 border-b border-slate-200 dark:border-lc-border">
                                {codeLangs.map((l) => {
                                    const key = normalizeStarterLanguageKey(l);
                                    return (
                                        <button key={l} type="button" onClick={() => setLang(l)} className={`relative top-px border-b-2 pb-2 text-[13px] font-bold transition-colors ${lang === l ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>
                                            {LANG_LABEL[key] || key}
                                        </button>
                                    );
                                })}
                            </div>
                            <pre className={`custom-scrollbar overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-[13px] leading-relaxed text-slate-100 language-${MONACO_LANG[normalizeStarterLanguageKey(lang)] || "text"}`}>{code}</pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function SolutionView({ solution, preferredLanguage = "python" }: { solution: unknown; preferredLanguage?: string }) {
    const approaches = useMemo(() => normalizeSolutionApproaches(solution), [solution]);
    if (!approaches.length) return <div className="text-sm italic text-slate-500">No solution available for this question.</div>;
    return (
        <div className="space-y-3">
            {approaches.map((a, i) => (
                <ApproachAccordion key={a.key} title={a.title} approach={a.approach} defaultOpen={i === 0} preferredLanguage={preferredLanguage} />
            ))}
        </div>
    );
}
