"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import "katex/dist/katex.min.css";
import { useAuth } from "@/context/auth-context";
import { useInterviewRoom } from "@/hooks/use-interview-room";
import { api } from "@/lib/api";
import { CopilotDock, ResumePdf, ScorecardView } from "@/components/copilot";
import { DesignBoard, DesignExtras } from "@/components/design-board";
import { SqlSchema, SqlResultView } from "@/components/sql-view";
import { SolutionView } from "@/components/solution-view";
import { SpeechCapture } from "@/components/speech-capture";
import type { CopilotInsight, CopilotScorecard, CopilotSuggestion, InterviewRubric, ResumeAnalysis, RoomSurface } from "@probe/contract";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type DsaExample = {
    input: unknown;
    output: unknown;
    explanation?: string;
};

type DsaQuestionDetails = {
    id: string;
    title: string;
    statement?: string;
    description?: string;
    problemMd?: string;
    problem_md?: string;
    examples?: DsaExample[];
    constraints?: string[] | string;
    language?: string;
    starter_code?: Record<string, string> | string;
    starterCode?: Record<string, string> | string;
    codeSnippets?: Record<string, { starter_code?: string; starterCode?: string; code?: string; wrapper_code?: string } | string>;
    hints?: string[];
    solution?: any;
    sample_tests?: Array<{
        id?: string;
        stdin?: unknown;
        expected_output?: unknown;
        input?: unknown;
        output?: unknown;
    }>;
};

const EDITOR_LANGUAGES = [
    { value: "python", label: "Python" },
    { value: "javascript", label: "JavaScript" },
    { value: "java", label: "Java" },
    { value: "cpp", label: "C++" },
];

const RECOMMENDATION_OPTIONS: Array<{
    value: "hire" | "hold" | "reject" | "pending";
    label: string;
    icon: string;
    activeClass: string;
}> = [
    { value: "hire", label: "Hire", icon: "thumb_up", activeClass: "border-emerald-500 bg-emerald-500 text-white" },
    { value: "hold", label: "Hold", icon: "pause", activeClass: "border-amber-500 bg-amber-500 text-white" },
    { value: "reject", label: "Reject", icon: "thumb_down", activeClass: "border-red-500 bg-red-500 text-white" },
    { value: "pending", label: "Pending", icon: "schedule", activeClass: "border-slate-400 bg-slate-500 text-white" },
];

function initials(name?: string | null) {
    return (name || "")
        .split(/\s+/)
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() || "C";
}

function clampSize(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function DragHandle({ axis, onDelta, className = "" }: { axis: "x" | "y"; onDelta: (delta: number) => void; className?: string }) {
    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        let last = axis === "x" ? event.clientX : event.clientY;
        const move = (moveEvent: PointerEvent) => {
            const current = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
            onDelta(current - last);
            last = current;
        };
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        document.body.style.userSelect = "none";
        document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    };

    return (
        <div
            onPointerDown={onPointerDown}
            className={`group shrink-0 items-center justify-center bg-slate-100 transition-colors hover:bg-primary/60 dark:bg-lc-border ${axis === "x" ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize"} ${className}`}
        >
            <div className={`rounded-full bg-slate-300 transition-colors group-hover:bg-white dark:bg-slate-600 ${axis === "x" ? "h-10 w-0.5" : "h-0.5 w-10"}`} />
        </div>
    );
}

const VIDEO_TILE_WIDTH = 256;
const VIDEO_TILE_HEIGHT = 180;
const VIDEO_TILE_MARGIN = 8;

function formatDateTime(value?: string | null) {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not scheduled";
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function statusLabel(value?: string | null) {
    return (value || "scheduled").replace(/_/g, " ");
}

function formatDuration(totalSeconds: number) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** HH:MM:SS elapsed clock. */
function formatElapsed(totalSeconds: number) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function difficultyTagClass(difficulty?: string | null) {
    const value = (difficulty || "").toLowerCase();
    if (value === "easy") return "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400";
    if (value === "medium") return "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400";
    if (value === "hard") return "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400";
    return "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300";
}

function monacoLanguage(value: string) {
    if (value === "cpp") return "cpp";
    return value;
}

function normalizeStarterLanguageKey(language: string): string {
    const value = language.trim().toLowerCase();
    if (["python", "python3", "py"].includes(value)) return "python";
    if (["javascript", "js", "node", "nodejs", "typescript", "ts"].includes(value)) return "javascript";
    if (["java"].includes(value)) return "java";
    if (["cpp", "c++", "cpp17", "cpp20", "cxx"].includes(value)) return "cpp";
    if (["go", "golang"].includes(value)) return "go";
    return value;
}

function normalizeStarterCodeMap(source?: Record<string, string>): Record<string, string> {
    if (!source) return {};
    const normalized: Record<string, string> = {};
    Object.entries(source).forEach(([rawLanguage, starter]) => {
        const language = normalizeStarterLanguageKey(rawLanguage);
        if (!normalized[language] || normalized[language].trim().length === 0) {
            normalized[language] = starter;
        }
    });
    return normalized;
}

function extractStarterCodeMap(question?: DsaQuestionDetails | null): Record<string, string> {
    const raw: Record<string, string> = {};
    if (typeof question?.starter_code === "string") raw[normalizeStarterLanguageKey(question.language || "python")] = question.starter_code;
    else Object.assign(raw, question?.starter_code || {});
    if (typeof question?.starterCode === "string") raw[normalizeStarterLanguageKey(question.language || "python")] = question.starterCode;
    else Object.assign(raw, question?.starterCode || {});
    Object.entries(question?.codeSnippets || {}).forEach(([language, snippet]) => {
        const starter = typeof snippet === "string" ? snippet : snippet?.starter_code || snippet?.starterCode || snippet?.code || snippet?.wrapper_code || "";
        if (starter) raw[language] = starter;
    });
    return normalizeStarterCodeMap(raw);
}

function getStarterForLanguage(starters: Record<string, string>, language: string) {
    const normalized = normalizeStarterLanguageKey(language);
    return starters[normalized] || starters[language] || starters.python || starters.javascript || starters.java || starters.cpp || Object.values(starters).find((value) => value?.trim()) || "";
}

function getExactStarterForLanguage(starters: Record<string, string>, language: string) {
    const normalized = normalizeStarterLanguageKey(language);
    return starters[normalized] || starters[language] || "";
}

function hasStarterForLanguage(starters: Record<string, string>, language: string) {
    const normalized = normalizeStarterLanguageKey(language);
    return Boolean(starters[normalized]?.trim() || starters[language]?.trim());
}

function decodeHtmlEntities(value: string) {
    if (typeof window === "undefined") return value;
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
}

function stripUnsafeHtmlToMarkdown(value: string) {
    const withoutBrokenImageFragments = value.replace(/^\s*"?\s*alt="[^"\n]*"[^<\n]*\/>\s*$/gim, "");
    const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(value);
    if (!hasHtmlTags) return withoutBrokenImageFragments;

    return decodeHtmlEntities(
        withoutBrokenImageFragments
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p\s*>/gi, "\n\n")
            .replace(/<p\b[^>]*>/gi, "")
            .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
            .replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
            .replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, "_$1_")
            .replace(/<i\b[^>]*>([\s\S]*?)<\/i>/gi, "_$1_")
            .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
            .replace(/<li\b[^>]*>/gi, "- ")
            .replace(/<\/li\s*>/gi, "\n")
            .replace(/<\/?(ul|ol)\b[^>]*>/gi, "\n")
            .replace(/<[^>]+>/g, "")
    );
}

function normalizeAuthoringEscapes(value: string) {
    const latexNCommands = /^(?:abla|eq|eqq|exists|geq|leq|leftarrow|rightarrow|ot|otin|u|parallel|prec|preceq|sim|simeq|subset|subseteq|supset|supseteq|times|triangle|vDash|vdash)\b/;

    return value
        .replace(/\\\\n|\\n/g, (match, offset, source) => {
            const after = source.slice(offset + match.length);
            return latexNCommands.test(after) ? match : "\n";
        })
        .replace(/\\([*_])/g, "$1")
        .replace(/\\\\([()[\]])/g, "\\$1")
        .replace(/\\\\(Rightarrow|Leftarrow|rightarrow|leftarrow|leq?|geq?|neq|times|div|log|ln|sqrt|frac|sum|prod|min|max|cdot|infty|theta|alpha|beta|gamma|delta|Delta|left|right|lceil|rceil)\b/g, "\\$1");
}

function normalizeQuestionMarkdown(value?: string | null) {
    if (!value) return "";
    return stripUnsafeHtmlToMarkdown(normalizeAuthoringEscapes(value))
        .replace(/\r\n/g, "\n")
        .replace(/([^\n])\n(?=(Input Format|Output Format|Examples?|Constraints)\b)/gi, "$1\n\n")
        // GFM needs a blank line before a pipe-table, or it renders as raw text.
        .replace(/([^\n|])\n(\s*\|)/g, "$1\n\n$2")
        .trim();
}

function normalizePlainMathText(value?: string | null) {
    if (!value) return "";
    return value
        .replace(/\r\n/g, "\n")
        .replace(/^\s*[-*]\s+/, "")
        .replace(/^`+|`+$/g, "")
        .replace(/\$\$([\s\S]*?)\$\$/g, (_match, body) => String(body).trim())
        .replace(/\$([^$\n]+)\$/g, (_match, body) => String(body).trim())
        .replace(/\\leq?/g, "<=")
        .replace(/\\geq?/g, ">=")
        .replace(/\\lt/g, "<")
        .replace(/\\gt/g, ">")
        .replace(/\\ldots/g, "...")
        .replace(/\\dots/g, "...")
        .replace(/\\_/g, "_")
        .trim();
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return "";
        if (
            (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
            (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
            (trimmed.startsWith("\"") && trimmed.endsWith("\""))
        ) {
            try {
                const parsed = JSON.parse(trimmed);
                if (typeof parsed === "string") return formatValue(parsed);
                return JSON.stringify(parsed, null, 2);
            } catch {
                return value.replace(/\\n/g, "\n").replace(/\\"/g, "\"");
            }
        }
        return value.replace(/\\n/g, "\n").replace(/\\"/g, "\"");
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function formatExecutionOutput(result: { stdout?: string | null; stderr?: string | null; compileOutput?: string | null; message?: string | null } | null | undefined, activeTestCase: number, activeTestId?: string) {
    if (!result) return "Run code to see output";
    const raw = result.stdout || result.stderr || result.compileOutput || result.message || "";
    const trimmed = raw.trim();
    if (!trimmed) return "No output.";

    try {
        const parsed = JSON.parse(trimmed);
        const tests = Array.isArray(parsed?.sample?.tests) ? parsed.sample.tests : Array.isArray(parsed?.results) ? parsed.results : [];
        const test = tests.find((item: any) => String(item?.id || "") === String(activeTestId || "")) || tests[activeTestCase];
        if (test) {
            return formatValue(test.stdout ?? test.actual ?? test.output ?? test.stderr ?? test.error ?? test.message ?? test);
        }
        if (parsed?.sample?.summary) return formatValue(parsed.sample.summary);
        if (parsed?.hidden?.summary) return formatValue(parsed.hidden.summary);
        return formatValue(parsed);
    } catch {
        return formatValue(trimmed);
    }
}

function normalizeComplexityValue(value?: string): string {
    const normalized = (value || "").trim();
    if (!normalized) return "";
    const lowered = normalized.toLowerCase();
    if (["unknown", "n/a", "na", "none"].includes(lowered)) return "";
    return normalized;
}

function cleanExplainationText(value?: string): string {
    const raw = (value || "").trim();
    if (!raw) return "";
    return raw
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim().toLowerCase();
            return !trimmed.startsWith("time complexity:") && !trimmed.startsWith("space complexity:");
        })
        .join("\n")
        .trim();
}

function getSolutionCodeLanguages(code?: Record<string, string>): string[] {
    if (!code) return [];
    const allowed = new Set(["python", "python3", "cpp", "c++", "java", "javascript", "js", "go"]);
    return Object.keys(code).filter((lang) => allowed.has(lang.toLowerCase()) && (code[lang] || "").trim());
}

function titleFromSolutionKey(key: string, fallback: string) {
    if (key === "bruteForce") return "Brute Force";
    if (["optimized", "optimal", "optimalApproach"].includes(key)) return "Optimal Approach";
    return fallback || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeSolutionCode(value: any): Record<string, string> {
    if (!value) return {};
    if (typeof value === "string") return { [languageFromCodeText(value)]: value };
    if (typeof value !== "object") return {};
    const raw = value.code || value.codes || value.solutionCode || value.implementation || value;
    if (typeof raw === "string") return { [languageFromCodeText(raw)]: raw };
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, string> = {};
    Object.entries(raw).forEach(([language, code]) => {
        if (typeof code === "string" && code.trim()) out[normalizeStarterLanguageKey(language)] = code;
        else if (code && typeof code === "object") {
            const nested = (code as any).code || (code as any).value || (code as any).solution || "";
            if (typeof nested === "string" && nested.trim()) out[normalizeStarterLanguageKey(language)] = nested;
        }
    });
    return out;
}

function languageFromCodeText(code: string) {
    if (/^\s*class\s+Solution\s*:/m.test(code) || /^\s*def\s+/m.test(code)) return "python";
    if (/^\s*#include|std::|vector<|int\s+main\s*\(/m.test(code)) return "cpp";
    if (/public\s+class|static\s+void\s+main/m.test(code)) return "java";
    return "javascript";
}

function normalizeSolutionApproaches(solution: any): Array<{ key: string; title: string; approach: any }> {
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

    const candidates: Array<[string, any]> = [];
    ["bruteForce", "brute_force", "optimized", "optimal", "optimalApproach"].forEach((key) => {
        if (solution[key]) candidates.push([key, solution[key]]);
    });
    if (Array.isArray(solution.approaches)) {
        solution.approaches.forEach((item: any, index: number) => candidates.push([String(item?.key || item?.type || `approach_${index}`), item]));
    }
    if (!candidates.length && (solution.explanation || solution.description || solution.code || solution.solutionCode)) {
        candidates.push(["solution", solution]);
    }

    return candidates.map(([key, approach], index) => ({
        key,
        title: titleFromSolutionKey(key, approach?.title || approach?.name || `Approach ${index + 1}`),
        approach,
    }));
}

function getQuestionLookupId(question?: { id: string; questionId?: string | null } | null) {
    return question?.questionId || question?.id || "";
}

function directQuestionSearchParams(question: { source?: string | null } | null | undefined, directInterviewId?: string | null) {
    const params = new URLSearchParams();
    if (directInterviewId) params.set("directInterviewId", directInterviewId);
    if (question?.source === "contest") params.set("source", "contest-bank");
    const value = params.toString();
    return value ? `?${value}` : "";
}

function getIceServers(): RTCIceServer[] {
    const raw = process.env.NEXT_PUBLIC_ICE_SERVERS;
    if (raw) {
        try {
            const parsed = JSON.parse(raw) as RTCIceServer[];
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {}
    }
    return [{ urls: "stun:stun.l.google.com:19302" }];
}

const SURFACE_META: Record<RoomSurface, { label: string; icon: string }> = {
    meet: { label: "Meeting", icon: "videocam" },
    dsa: { label: "DSA IDE", icon: "code" },
    sql: { label: "SQL IDE", icon: "database" },
    design: { label: "System Design", icon: "design_services" },
};

function roundToSurface(round?: string | null): RoomSurface {
    const value = (round || "").toLowerCase();
    if (value === "sql") return "sql";
    if (value === "design" || value === "system_design" || value === "systemdesign") return "design";
    if (value === "meet" || value === "meeting") return "meet";
    return "dsa";
}

function questionSurface(question?: { type?: string | null } | null): RoomSurface {
    if (!question?.type) return "dsa";
    return roundToSurface(question.type);
}

function InterviewerRoom() {
    const { session } = useAuth();
    const params = useParams<{ interviewId: string }>();
    const router = useRouter();
    const identifier = params?.interviewId || "";
    const joinedRef = useRef(false);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const lastHandledOfferSdpRef = useRef<string | null>(null);
    const lastHandledAnswerSdpRef = useRef<string | null>(null);
    const offerSentRef = useRef(false);
    const screenVideoRef = useRef<HTMLVideoElement | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const screenPcRef = useRef<RTCPeerConnection | null>(null);
    const screenPendingIceRef = useRef<RTCIceCandidateInit[]>([]);
    const lastHandledScreenOfferSdpRef = useRef<string | null>(null);
    const proctorHintSeenRef = useRef(false);
    const codeDraftsRef = useRef<Record<string, string>>({});
    const [code, setCode] = useState("");
    const [language, setLanguage] = useState("python");
    const [evaluationScore, setEvaluationScore] = useState("");
    const [evaluationRecommendation, setEvaluationRecommendation] = useState<"pending" | "hire" | "hold" | "reject">("pending");
    const [evaluationNotes, setEvaluationNotes] = useState("");
    const [evaluationStrengths, setEvaluationStrengths] = useState<string[]>([]);
    const [evaluationConcerns, setEvaluationConcerns] = useState<string[]>([]);
    const [strengthInput, setStrengthInput] = useState("");
    const [concernInput, setConcernInput] = useState("");
    const [finishing, setFinishing] = useState(false);
    const [endConfirm, setEndConfirm] = useState(false);
    const [ended, setEnded] = useState(false);
    const seededEvalRef = useRef(false);
    const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);
    const [leftTab, setLeftTab] = useState<"problem" | "questions" | "hints" | "solution" | "notes">("problem");
    const [questionDetails, setQuestionDetails] = useState<DsaQuestionDetails | null>(null);
    const [questionLoading, setQuestionLoading] = useState(false);
    const [questionError, setQuestionError] = useState<string | null>(null);
    const [starterCodeByLanguage, setStarterCodeByLanguage] = useState<Record<string, string>>({});
    const [activeTestCase, setActiveTestCase] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [mediaError, setMediaError] = useState<string | null>(null);
    const [mediaReady, setMediaReady] = useState(false);
    const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
    const [videoPosition, setVideoPosition] = useState<{ left: number; top: number } | null>(null);
    const [panelCollapsed, setPanelCollapsed] = useState(false);
    const [savingEval, setSavingEval] = useState(false);
    const [leftWidth, setLeftWidth] = useState(480);
    const [rightWidth, setRightWidth] = useState(400);
    const [resultsHeight, setResultsHeight] = useState(280);
    const [screenLive, setScreenLive] = useState(false);
    const [screenStatus, setScreenStatus] = useState<"idle" | "requested" | "active">("idle");
    const [screenHasSystemAudio, setScreenHasSystemAudio] = useState(false);
    const [proctorRect, setProctorRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [proctorMinimized, setProctorMinimized] = useState(false);
    const [proctorFullscreen, setProctorFullscreen] = useState(false);
    const [proctorHintVisible, setProctorHintVisible] = useState(false);
    const videoDraggingRef = useRef(false);
    const videoDragOffsetRef = useRef({ x: 0, y: 0 });
    const videoDraggedRef = useRef(false);
    const questionDetailsCacheRef = useRef<Record<string, DsaQuestionDetails>>({});
    const {
        baseUrl,
        connected,
        loading,
        joining,
        error,
        bootstrap,
        roomState,
        lobbyRequest,
        editorState,
        timerState,
        sessionEnded,
        executionState,
        evaluation,
        signalOffer,
        signalAnswer,
        signalIce,
        join,
        admitCandidate,
        selectQuestion,
        syncTimer,
        endSession,
        executeCode,
        saveEvaluation,
        sendSignalOffer,
        sendSignalAnswer,
        sendSignalIce,
        clearSignalOffer,
        clearSignalAnswer,
        clearSignalIce,
        screenShareState,
        screenOffer,
        screenIce,
        requestScreenShare,
        sendScreenAnswer,
        sendScreenIce,
        clearScreenOffer,
        clearScreenIce,
        copilotSuggestions,
        copilotStatus,
        copilotScorecard,
        copilotInsights,
        resumeAnalysis,
        surfaceState,
        transcript,
        requestCopilotAnalysis,
        requestCopilotScorecard,
        seedCopilotState,
        changeSurface,
        sendTranscript,
        analyzeAnswer,
        reload,
    } = useInterviewRoom(identifier);
    const [resumeOpen, setResumeOpen] = useState(false);
    const [resumePdfUrl, setResumePdfUrl] = useState<string | null>(null);
    const [resumeFileLoading, setResumeFileLoading] = useState(false);
    const [resumeFileError, setResumeFileError] = useState<string | null>(null);
    const [rubric, setRubric] = useState<InterviewRubric | null>(null);
    const [scorecardGenerating, setScorecardGenerating] = useState(false);

    // Hydrate copilot state (role pack + prior suggestions + scorecard) over REST —
    // live updates then stream in over the socket.
    useEffect(() => {
        if (!session?.access_token || !identifier) return;
        api.get<{ rubric: InterviewRubric | null; suggestions: CopilotSuggestion[]; scorecard: CopilotScorecard | null; insights?: CopilotInsight[]; resumeAnalysis?: ResumeAnalysis | null }>(
            `/interviews/${identifier}/copilot`,
            session.access_token
        )
            .then((data) => {
                setRubric(data.rubric);
                seedCopilotState({
                    suggestions: data.suggestions,
                    scorecard: data.scorecard,
                    insights: data.insights,
                    resumeAnalysis: data.resumeAnalysis,
                });
            })
            .catch(() => {});
    }, [identifier, seedCopilotState, session?.access_token]);

    useEffect(() => {
        if (copilotScorecard) setScorecardGenerating(false);
    }, [copilotScorecard]);

    const generateScorecard = useCallback(() => {
        setScorecardGenerating(true);
        requestCopilotScorecard();
    }, [requestCopilotScorecard]);

    // Fetch the real resume PDF (with auth) as a blob and hand ResumePdf an object URL.
    // Runs when the interviewer opens the resume and one exists on the interview.
    useEffect(() => {
        if (!resumeOpen || !bootstrap?.resume || !session?.access_token) return;
        let revoked = false;
        let objUrl: string | null = null;
        setResumeFileLoading(true);
        setResumeFileError(null);
        fetch(`${baseUrl}/interviews/${identifier}/resume/file`, { headers: { Authorization: `Bearer ${session.access_token}` } })
            .then(async (r) => { if (!r.ok) throw new Error("Could not load the resume file."); return r.blob(); })
            .then((blob) => { if (revoked) return; objUrl = URL.createObjectURL(blob); setResumePdfUrl(objUrl); })
            .catch((e) => { if (!revoked) setResumeFileError(e instanceof Error ? e.message : "Could not load the resume."); })
            .finally(() => { if (!revoked) setResumeFileLoading(false); });
        // Belt-and-suspenders: if analysis isn't ready yet, trigger it (it normally runs on upload).
        if (!resumeAnalysis) {
            fetch(`${baseUrl}/interviews/${identifier}/resume/analyze`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => {});
        }
        return () => { revoked = true; if (objUrl) URL.revokeObjectURL(objUrl); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumeOpen, bootstrap?.resume, session?.access_token, baseUrl, identifier]);

    const status = roomState?.status || bootstrap?.status || "scheduled";
    const admitted = Boolean(roomState?.candidateAdmittedAt || bootstrap?.candidateAdmittedAt || status === "active");
    const questions = bootstrap?.questions || [];
    const serverActiveQuestionIndex = roomState?.activeQuestionIndex ?? bootstrap?.activeQuestionIndex ?? 0;
    const serverActiveQuestionId = roomState?.activeQuestionId || bootstrap?.activeQuestionId || questions[serverActiveQuestionIndex]?.id || null;
    const activeQuestionId = pendingQuestionId || serverActiveQuestionId;
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const activeQuestion = useMemo(() => {
        if (!questions.length) return null;
        return questions.find((question) => question.id === activeQuestionId) || questions[serverActiveQuestionIndex] || questions[0];
    }, [activeQuestionId, questions, serverActiveQuestionIndex]);
    const totalSeconds = timerState?.totalSeconds || (bootstrap?.durationMinutes || 60) * 60;
    const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
    // Running clock — elapsed time since the candidate was admitted (interview started).
    const admittedAt = roomState?.candidateAdmittedAt || bootstrap?.candidateAdmittedAt || null;
    const [nowTs, setNowTs] = useState(() => Date.now());
    useEffect(() => {
        if (!admittedAt || sessionEnded) return;
        const id = window.setInterval(() => setNowTs(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [admittedAt, sessionEnded]);
    const runningElapsed = admittedAt ? Math.max(0, Math.floor((nowTs - new Date(admittedAt).getTime()) / 1000)) : 0;
    const progressPct = Math.min(100, Math.round((elapsedSeconds / Math.max(1, totalSeconds)) * 100));
    const questionLookupId = getQuestionLookupId(activeQuestion);
    const questionCacheKey = `${bootstrap?.directInterviewId || ""}:${questionLookupId || ""}`;
    const testCasesToDisplay = questionDetails?.sample_tests || [];
    const activeEditorState = useMemo(() => {
        if (!editorState) return null;
        if (activeQuestion?.id && editorState.questionId !== activeQuestion.id) return null;
        return editorState;
    }, [activeQuestion?.id, editorState]);
    const activeExecutionState = useMemo(() => {
        if (!executionState) return null;
        if (activeQuestion?.id && executionState.questionId !== activeQuestion.id) return null;
        return executionState;
    }, [activeQuestion?.id, executionState]);
    const executionRunning = activeExecutionState?.phase === "running";

    const draftKeyFor = useCallback((nextLanguage: string) => {
        return `${activeQuestion?.id || "active"}:${normalizeStarterLanguageKey(nextLanguage)}`;
    }, [activeQuestion?.id]);

    useEffect(() => {
        if (pendingQuestionId && serverActiveQuestionId === pendingQuestionId) setPendingQuestionId(null);
    }, [pendingQuestionId, serverActiveQuestionId]);

    useEffect(() => {
        setQuestionDetails(null);
        setStarterCodeByLanguage({});
        setQuestionError(null);
        setActiveTestCase(0);
        setCode(codeDraftsRef.current[draftKeyFor(language)] ?? "");
    }, [activeQuestion?.id]);

    useEffect(() => {
        if (!activeEditorState) return;
        const nextLanguage = normalizeStarterLanguageKey(activeEditorState.language || language);
        codeDraftsRef.current[draftKeyFor(nextLanguage)] = activeEditorState.code || "";
        setCode(activeEditorState.code || "");
        setLanguage(nextLanguage);
    }, [activeEditorState, draftKeyFor]);

    useEffect(() => {
        if (!session?.access_token || !questionLookupId) {
            setQuestionDetails(null);
            setStarterCodeByLanguage({});
            return;
        }

        let cancelled = false;
        const applyQuestionDetails = (response: DsaQuestionDetails) => {
            setQuestionDetails(response);
            const starterCode = extractStarterCodeMap(response);
            setStarterCodeByLanguage(starterCode);
            const availableLanguages = Object.keys(starterCode);
            const serverLanguage = normalizeStarterLanguageKey(activeEditorState?.language || "");
            const nextLanguage =
                activeEditorState?.code?.trim()
                    ? serverLanguage
                    : hasStarterForLanguage(starterCode, language)
                    ? normalizeStarterLanguageKey(language)
                    : hasStarterForLanguage(starterCode, normalizeStarterLanguageKey(response.language || ""))
                        ? normalizeStarterLanguageKey(response.language || "")
                        : availableLanguages[0] || normalizeStarterLanguageKey(language);
            const draftKey = `${activeQuestion?.id || "active"}:${nextLanguage}`;
            const localDraft = codeDraftsRef.current[draftKey];
            const starter = getExactStarterForLanguage(starterCode, nextLanguage);
            const nextCode = activeEditorState?.code?.trim() ? activeEditorState.code : localDraft ?? starter;
            if (nextCode || nextLanguage !== language) {
                codeDraftsRef.current[draftKey] = nextCode;
                setLanguage(nextLanguage);
                setCode(nextCode);
            }
        };

        const cached = questionDetailsCacheRef.current[questionCacheKey];
        if (cached) {
            applyQuestionDetails(cached);
            setQuestionLoading(false);
        } else {
            setQuestionLoading(true);
        }
        setQuestionError(null);
        setActiveTestCase(0);

        api.get<DsaQuestionDetails>(`/ide/question/${questionLookupId}${directQuestionSearchParams(activeQuestion, bootstrap?.directInterviewId)}`, session.access_token)
            .then((response) => {
                if (cancelled) return;
                questionDetailsCacheRef.current[questionCacheKey] = response;
                applyQuestionDetails(response);
            })
            .catch((err) => {
                if (cancelled) return;
                setQuestionError(err instanceof Error ? err.message : "Failed to load question details.");
                setQuestionDetails(null);
                setStarterCodeByLanguage({});
            })
            .finally(() => {
                if (!cancelled) setQuestionLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [activeQuestion?.id, activeQuestion?.source, bootstrap?.directInterviewId, questionCacheKey, questionLookupId, session?.access_token]);

    const resetStarterCode = useCallback(() => {
        const starter = getExactStarterForLanguage(starterCodeByLanguage, language);
        codeDraftsRef.current[draftKeyFor(language)] = starter;
        setCode(starter);
    }, [draftKeyFor, language, starterCodeByLanguage]);

    const updateLanguage = useCallback((nextLanguage: string) => {
        const normalizedLanguage = normalizeStarterLanguageKey(nextLanguage);
        codeDraftsRef.current[draftKeyFor(language)] = code;
        const nextDraftKey = draftKeyFor(normalizedLanguage);
        const starter = getExactStarterForLanguage(starterCodeByLanguage, normalizedLanguage);
        const nextCode = codeDraftsRef.current[nextDraftKey] ?? starter;
        codeDraftsRef.current[nextDraftKey] = nextCode;
        setLanguage(normalizedLanguage);
        setCode(nextCode);
    }, [code, draftKeyFor, language, starterCodeByLanguage]);

    useEffect(() => {
        if (timerState) {
            setElapsedSeconds(timerState.elapsedSeconds);
            return;
        }
        const startedAt = roomState?.startedAt || bootstrap?.startedAt;
        if (!startedAt) return;
        const started = new Date(startedAt).getTime();
        if (Number.isNaN(started)) return;
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    }, [bootstrap?.startedAt, roomState?.startedAt, timerState]);

    useEffect(() => {
        if (!admitted || sessionEnded) return;
        const interval = window.setInterval(() => {
            const startedAt = roomState?.startedAt || bootstrap?.startedAt;
            if (!startedAt) return;
            const started = new Date(startedAt).getTime();
            if (Number.isNaN(started)) return;
            const nextElapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
            setElapsedSeconds(nextElapsed);
            // Tick the display every second, but only broadcast the authoritative timer every 5s.
            if (nextElapsed % 5 === 0) syncTimer(nextElapsed, totalSeconds);
        }, 1000);
        return () => window.clearInterval(interval);
    }, [admitted, bootstrap?.startedAt, roomState?.startedAt, sessionEnded, syncTimer, totalSeconds]);

    useEffect(() => {
        if (!connected || joinedRef.current) return;
        joinedRef.current = true;
        join();
    }, [connected, join]);

    const ensurePeerConnection = useCallback(async () => {
        const directInterviewId = bootstrap?.directInterviewId;
        if (!directInterviewId) return null;
        if (peerConnectionRef.current) return peerConnectionRef.current;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            setMediaReady(true);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        } catch (err) {
            setMediaError(err instanceof Error ? err.message : "Could not access camera or microphone.");
        }

        const pc = new RTCPeerConnection({ iceServers: getIceServers() });
        peerConnectionRef.current = pc;

        localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));

        pc.onicecandidate = (event) => {
            if (event.candidate) sendSignalIce(directInterviewId, JSON.stringify(event.candidate.toJSON()));
        };
        pc.ontrack = (event) => {
            const stream = event.streams[0];
            remoteStreamRef.current = stream;
            setHasRemoteVideo(true);
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
                void remoteVideoRef.current.play().catch(() => {});
            }
        };
        return pc;
    }, [bootstrap?.directInterviewId, sendSignalIce]);

    const flushQueuedIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
        if (!pc.remoteDescription || pendingIceCandidatesRef.current.length === 0) return;
        const queued = [...pendingIceCandidatesRef.current];
        pendingIceCandidatesRef.current = [];
        for (const candidate of queued) {
            await pc.addIceCandidate(candidate).catch(() => {});
        }
    }, []);

    useEffect(() => {
        if (!admitted || !bootstrap?.directInterviewId || offerSentRef.current) return;
        offerSentRef.current = true;
        ensurePeerConnection()
            .then(async (pc) => {
                if (!pc) return;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendSignalOffer(bootstrap.directInterviewId, offer.sdp || "");
            })
            .catch((err) => setMediaError(err instanceof Error ? err.message : "Could not start video."));
    }, [admitted, bootstrap?.directInterviewId, ensurePeerConnection, sendSignalOffer]);

    useEffect(() => {
        if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        if (remoteVideoRef.current && remoteStreamRef.current) {
            remoteVideoRef.current.srcObject = remoteStreamRef.current;
            void remoteVideoRef.current.play().catch(() => {});
        }
    }, [mediaReady]);

    useEffect(() => {
        localStreamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = !isMuted;
        });
    }, [isMuted]);

    useEffect(() => {
        localStreamRef.current?.getVideoTracks().forEach((track) => {
            track.enabled = isCameraOn;
        });
    }, [isCameraOn]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!videoDraggingRef.current) return;
            videoDraggedRef.current = true;
            const maxLeft = Math.max(VIDEO_TILE_MARGIN, window.innerWidth - VIDEO_TILE_WIDTH - VIDEO_TILE_MARGIN);
            const maxTop = Math.max(VIDEO_TILE_MARGIN, window.innerHeight - VIDEO_TILE_HEIGHT - VIDEO_TILE_MARGIN);
            const left = Math.min(Math.max(VIDEO_TILE_MARGIN, event.clientX - videoDragOffsetRef.current.x), maxLeft);
            const top = Math.min(Math.max(VIDEO_TILE_MARGIN, event.clientY - videoDragOffsetRef.current.y), maxTop);
            setVideoPosition({ left, top });
        };
        const handlePointerUp = () => {
            videoDraggingRef.current = false;
            document.body.style.userSelect = "";
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            document.body.style.userSelect = "";
        };
    }, []);

    useEffect(() => {
        if (!signalOffer || signalOffer.directInterviewId !== bootstrap?.directInterviewId) return;
        clearSignalOffer();
    }, [bootstrap?.directInterviewId, clearSignalOffer, signalOffer]);

    useEffect(() => {
        if (!signalAnswer || signalAnswer.directInterviewId !== bootstrap?.directInterviewId) return;
        const handleAnswer = async () => {
            const pc = peerConnectionRef.current;
            if (!pc || lastHandledAnswerSdpRef.current === signalAnswer.sdp || pc.signalingState !== "have-local-offer") return;
            lastHandledAnswerSdpRef.current = signalAnswer.sdp;
            await pc.setRemoteDescription({ type: "answer", sdp: signalAnswer.sdp });
            await flushQueuedIceCandidates(pc);
        };
        handleAnswer()
            .catch((err) => setMediaError(err instanceof Error ? err.message : "Could not connect video."))
            .finally(clearSignalAnswer);
    }, [bootstrap?.directInterviewId, clearSignalAnswer, flushQueuedIceCandidates, signalAnswer]);

    useEffect(() => {
        if (!signalIce || signalIce.directInterviewId !== bootstrap?.directInterviewId) return;
        const handleIce = async () => {
            const pc = peerConnectionRef.current;
            if (!pc) return;
            const candidate = JSON.parse(signalIce.candidate) as RTCIceCandidateInit;
            if (!pc.remoteDescription) {
                pendingIceCandidatesRef.current.push(candidate);
                return;
            }
            await pc.addIceCandidate(candidate);
        };
        handleIce()
            .catch(() => {})
            .finally(clearSignalIce);
    }, [bootstrap?.directInterviewId, clearSignalIce, signalIce]);

    useEffect(() => {
        return () => {
            peerConnectionRef.current?.close();
            peerConnectionRef.current = null;
            localStreamRef.current?.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
            remoteStreamRef.current = null;
        };
    }, []);

    const teardownScreen = useCallback(() => {
        screenPcRef.current?.close();
        screenPcRef.current = null;
        screenStreamRef.current = null;
        screenPendingIceRef.current = [];
        lastHandledScreenOfferSdpRef.current = null;
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        setScreenLive(false);
        setScreenStatus("idle");
        setProctorFullscreen(false);
        setProctorMinimized(false);
        setProctorRect(null);
    }, []);

    const teardownMedia = useCallback(() => {
        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        remoteStreamRef.current = null;
        teardownScreen();
    }, [teardownScreen]);

    const endInterview = useCallback(() => {
        setEndConfirm(false);
        setEnded(true);
        teardownMedia();
        endSession("completed");
    }, [endSession, teardownMedia]);

    const handleRequestScreenShare = useCallback(() => {
        requestScreenShare();
        setScreenStatus("requested");
    }, [requestScreenShare]);

    useEffect(() => {
        if (!screenShareState || screenShareState.directInterviewId !== bootstrap?.directInterviewId) return;
        if (screenShareState.state === "stopped") {
            teardownScreen();
        } else {
            setScreenHasSystemAudio(Boolean(screenShareState.hasSystemAudio));
            setScreenStatus("active");
        }
    }, [bootstrap?.directInterviewId, screenShareState, teardownScreen]);

    useEffect(() => {
        if (!screenOffer || screenOffer.directInterviewId !== bootstrap?.directInterviewId) return;
        const handleOffer = async () => {
            if (lastHandledScreenOfferSdpRef.current === screenOffer.sdp) return;
            lastHandledScreenOfferSdpRef.current = screenOffer.sdp;

            let pc = screenPcRef.current;
            if (!pc) {
                pc = new RTCPeerConnection({ iceServers: getIceServers() });
                screenPcRef.current = pc;
                pc.onicecandidate = (event) => {
                    if (event.candidate) sendScreenIce(screenOffer.directInterviewId, JSON.stringify(event.candidate.toJSON()));
                };
                pc.ontrack = (event) => {
                    screenStreamRef.current = event.streams[0];
                    setScreenLive(true);
                    setScreenStatus("active");
                    setProctorMinimized(false);
                    if (!proctorHintSeenRef.current) {
                        proctorHintSeenRef.current = true;
                        setProctorHintVisible(true);
                    }
                    if (screenVideoRef.current) {
                        screenVideoRef.current.srcObject = event.streams[0];
                        void screenVideoRef.current.play().catch(() => {});
                    }
                };
            }

            await pc.setRemoteDescription({ type: "offer", sdp: screenOffer.sdp });
            const queued = [...screenPendingIceRef.current];
            screenPendingIceRef.current = [];
            for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => {});
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendScreenAnswer(screenOffer.directInterviewId, answer.sdp || "");
        };
        handleOffer().catch(() => {}).finally(clearScreenOffer);
    }, [bootstrap?.directInterviewId, clearScreenOffer, screenOffer, sendScreenAnswer, sendScreenIce]);

    useEffect(() => {
        if (!screenIce || screenIce.directInterviewId !== bootstrap?.directInterviewId) return;
        const handleIce = async () => {
            const pc = screenPcRef.current;
            const candidate = JSON.parse(screenIce.candidate) as RTCIceCandidateInit;
            if (!pc || !pc.remoteDescription) {
                screenPendingIceRef.current.push(candidate);
                return;
            }
            await pc.addIceCandidate(candidate);
        };
        handleIce().catch(() => {}).finally(clearScreenIce);
    }, [bootstrap?.directInterviewId, clearScreenIce, screenIce]);

    useEffect(() => {
        if (!screenLive) return;
        if (proctorRect) return;
        const top = 72;
        const left = 16;
        const width = Math.max(480, window.innerWidth - rightWidth - 64);
        const height = Math.max(320, window.innerHeight - top - 24);
        setProctorRect({ x: left, y: top, w: width, h: height });
    }, [proctorRect, rightWidth, screenLive]);

    useEffect(() => {
        const video = screenVideoRef.current;
        if (screenLive && video && screenStreamRef.current && video.srcObject !== screenStreamRef.current) {
            video.srcObject = screenStreamRef.current;
            void video.play().catch(() => {
                // Autoplay with audio may be blocked — fall back to muted so the screen is still visible.
                video.muted = true;
                void video.play().catch(() => {});
            });
        }
    }, [screenLive, proctorRect, proctorFullscreen, proctorMinimized]);

    useEffect(() => {
        if (!proctorHintVisible) return;
        const timer = window.setTimeout(() => setProctorHintVisible(false), 7000);
        return () => window.clearTimeout(timer);
    }, [proctorHintVisible]);

    useEffect(() => {
        if (sessionEnded) teardownMedia();
    }, [sessionEnded, teardownMedia]);

    useEffect(() => {
        if (!(sessionEnded || ended || status === "completed") || seededEvalRef.current) return;
        seededEvalRef.current = true;
        if (evaluation?.strengths?.length) setEvaluationStrengths(evaluation.strengths);
        if (evaluation?.concerns?.length) setEvaluationConcerns(evaluation.concerns);
        if (evaluation?.score != null && !evaluationScore) setEvaluationScore(String(evaluation.score));
        if (evaluation?.recommendation && evaluationRecommendation === "pending") setEvaluationRecommendation(evaluation.recommendation as "pending" | "hire" | "hold" | "reject");
        if (evaluation?.notes && !evaluationNotes) setEvaluationNotes(evaluation.notes);
    }, [ended, evaluation, evaluationNotes, evaluationRecommendation, evaluationScore, sessionEnded, status]);

    useEffect(() => {
        return () => {
            screenPcRef.current?.close();
        };
    }, []);

    const startProctorDrag = useCallback((event: React.PointerEvent, mode: "move" | "resize") => {
        event.preventDefault();
        event.stopPropagation();
        const start = proctorRect;
        if (!start) return;
        const startX = event.clientX;
        const startY = event.clientY;
        const origin = { ...start };
        const move = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (mode === "move") {
                setProctorRect({
                    ...origin,
                    x: clampSize(origin.x + dx, 0, window.innerWidth - 160),
                    y: clampSize(origin.y + dy, 56, window.innerHeight - 80),
                });
            } else {
                setProctorRect({
                    ...origin,
                    w: clampSize(origin.w + dx, 360, window.innerWidth - origin.x - 8),
                    h: clampSize(origin.h + dy, 220, window.innerHeight - origin.y - 8),
                });
            }
        };
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            document.body.style.userSelect = "";
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        document.body.style.userSelect = "none";
    }, [proctorRect]);

    const addStrength = useCallback(() => {
        const value = strengthInput.trim();
        if (!value) return;
        setEvaluationStrengths((list) => (list.includes(value) ? list : [...list, value].slice(0, 12)));
        setStrengthInput("");
    }, [strengthInput]);

    const addConcern = useCallback(() => {
        const value = concernInput.trim();
        if (!value) return;
        setEvaluationConcerns((list) => (list.includes(value) ? list : [...list, value].slice(0, 12)));
        setConcernInput("");
    }, [concernInput]);

    const finishInterview = useCallback(async (save: boolean) => {
        if (save) {
            setFinishing(true);
            await saveEvaluation({
                score: evaluationScore ? Math.min(100, Number(evaluationScore)) : null,
                recommendation: evaluationRecommendation,
                strengths: evaluationStrengths,
                concerns: evaluationConcerns,
                notes: evaluationNotes,
            });
            setFinishing(false);
        }
        router.push("/");
    }, [evaluationConcerns, evaluationNotes, evaluationRecommendation, evaluationScore, evaluationStrengths, router, saveEvaluation]);

    // --- Meet-first surfaces -------------------------------------------------
    const activeSurface: RoomSurface = surfaceState?.surface ?? bootstrap?.activeSurface ?? "meet";
    const meetActive = activeSurface === "meet" && !resumeOpen;
    const isCodingSurface = !resumeOpen && (activeSurface === "dsa" || activeSurface === "sql" || activeSurface === "design");
    const showRunButton = !resumeOpen && (activeSurface === "dsa" || activeSurface === "sql");
    const runLanguage = activeSurface === "sql" ? "sql" : language;
    const editorMonacoLanguage = activeSurface === "sql" ? "sql" : activeSurface === "design" ? "markdown" : monacoLanguage(language);
    const resumeLoading = Boolean(bootstrap?.resume) && !resumeAnalysis;
    const hasResume = Boolean(bootstrap?.resume);
    const speechEnabled = admitted && !isMuted && !sessionEnded;

    const roundSurfaces = useMemo<RoomSurface[]>(() => {
        const set = new Set<RoomSurface>();
        (bootstrap?.rounds || []).forEach((round) => set.add(roundToSurface(round)));
        if (set.size === 0) questions.forEach((question) => set.add(questionSurface(question)));
        set.delete("meet");
        return Array.from(set);
    }, [bootstrap?.rounds, questions]);

    const surfaceQuestions = useMemo(
        () => questions.filter((question) => questionSurface(question) === activeSurface),
        [questions, activeSurface]
    );

    const recentTranscript = useMemo(() => transcript.slice(-6), [transcript]);

    const launchSurface = useCallback((surface: RoomSurface) => {
        setResumeOpen(false);
        changeSurface(surface);
        if (surface === "meet") return;
        const currentMatches = activeQuestion && questionSurface(activeQuestion) === surface;
        if (currentMatches) return;
        const first = questions.find((question) => questionSurface(question) === surface);
        if (first) {
            setPendingQuestionId(first.id);
            selectQuestion(first.id);
        }
    }, [activeQuestion, changeSurface, questions, selectQuestion]);

    if (loading) {
        return (
            <main className="grid min-h-full place-items-center bg-[#FAFBFC] p-8 dark:bg-lc-bg">
                <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </main>
        );
    }

    if (!bootstrap && error) {
        return (
            <main className="fixed inset-0 z-[100] grid place-items-center bg-[#FAFBFC] px-6 dark:bg-lc-bg">
                <section className="max-w-md space-y-5 text-center">
                    <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.06]">
                        <span className="material-symbols-outlined text-4xl text-slate-500">event_busy</span>
                    </div>
                    <h1 className="font-nunito text-2xl font-bold text-slate-900 dark:text-white">Could not open interview room</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{error}</p>
                    <button type="button" onClick={reload} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition-colors hover:bg-blue-700">
                        Try again
                    </button>
                </section>
            </main>
        );
    }

    if (sessionEnded || ended || status === "completed") {
        return (
            <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#FAFBFC] px-4 py-10 dark:bg-lc-bg">
                <div className="mx-auto max-w-2xl">
                    <div className="mb-6 flex items-center gap-3">
                        <div className="grid size-11 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                            <span className="material-symbols-outlined text-[24px]">task_alt</span>
                        </div>
                        <div>
                            <h1 className="font-nunito text-2xl font-bold text-slate-900 dark:text-white">Interview ended</h1>
                            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Submit your evaluation for {bootstrap?.candidate.name || "the candidate"}.</p>
                        </div>
                    </div>

                    <div className="mb-6">
                        <ScorecardView
                            scorecard={copilotScorecard}
                            generating={scorecardGenerating}
                            onGenerate={generateScorecard}
                            onCopyToEvaluation={({ strengths, concerns, notes }) => {
                                if (strengths.length) setEvaluationStrengths((list) => Array.from(new Set([...list, ...strengths])).slice(0, 12));
                                if (concerns.length) setEvaluationConcerns((list) => Array.from(new Set([...list, ...concerns])).slice(0, 12));
                                if (notes) setEvaluationNotes((current) => (current ? current : notes));
                            }}
                        />
                    </div>

                    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-lc-border dark:bg-lc-surface">
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Recommendation</label>
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {RECOMMENDATION_OPTIONS.map((option) => {
                                    const active = evaluationRecommendation === option.value;
                                    return (
                                        <button key={option.value} type="button" onClick={() => setEvaluationRecommendation(option.value)} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-bold transition-colors ${active ? option.activeClass : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-lc-border dark:text-slate-300 dark:hover:bg-lc-bg"}`}>
                                            <span className="material-symbols-outlined text-[16px]">{option.icon}</span>
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Score</label>
                                <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{evaluationScore === "" ? "—" : evaluationScore}<span className="text-slate-400">/100</span></span>
                            </div>
                            <input type="range" min={0} max={100} value={evaluationScore === "" ? 0 : Number(evaluationScore)} onChange={(event) => setEvaluationScore(event.target.value)} className="mt-2 w-full cursor-pointer accent-primary" />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Strengths</label>
                            <div className="mt-2 flex gap-2">
                                <input value={strengthInput} onChange={(event) => setStrengthInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addStrength(); } }} placeholder="Add a strength and press Enter" className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-lc-border dark:bg-lc-bg dark:text-slate-200" />
                                <button type="button" onClick={addStrength} className="rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-lc-border dark:text-slate-300 dark:hover:bg-lc-bg">Add</button>
                            </div>
                            {evaluationStrengths.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {evaluationStrengths.map((item) => (
                                        <span key={item} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                                            {item}
                                            <button type="button" onClick={() => setEvaluationStrengths((list) => list.filter((value) => value !== item))} className="text-emerald-500 hover:text-emerald-700"><span className="material-symbols-outlined text-[14px]">close</span></button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Areas of concern</label>
                            <div className="mt-2 flex gap-2">
                                <input value={concernInput} onChange={(event) => setConcernInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addConcern(); } }} placeholder="Add a concern and press Enter" className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-lc-border dark:bg-lc-bg dark:text-slate-200" />
                                <button type="button" onClick={addConcern} className="rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-lc-border dark:text-slate-300 dark:hover:bg-lc-bg">Add</button>
                            </div>
                            {evaluationConcerns.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {evaluationConcerns.map((item) => (
                                        <span key={item} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 dark:bg-red-500/10 dark:text-red-400">
                                            {item}
                                            <button type="button" onClick={() => setEvaluationConcerns((list) => list.filter((value) => value !== item))} className="text-red-500 hover:text-red-700"><span className="material-symbols-outlined text-[14px]">close</span></button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Summary / feedback</label>
                            <textarea value={evaluationNotes} onChange={(event) => setEvaluationNotes(event.target.value)} placeholder="Overall assessment of the candidate's performance…" className="mt-2 min-h-32 w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold leading-6 text-slate-700 placeholder:font-normal dark:border-lc-border dark:bg-lc-bg dark:text-slate-200" />
                        </div>
                    </div>

                    <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button type="button" onClick={() => finishInterview(false)} disabled={finishing} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-lc-border dark:text-slate-300 dark:hover:bg-lc-surface">
                            Skip &amp; go to candidates
                        </button>
                        <button type="button" onClick={() => finishInterview(true)} disabled={finishing} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70">
                            <span className={`material-symbols-outlined text-[18px] ${finishing ? "animate-spin" : ""}`}>{finishing ? "progress_activity" : "save"}</span>
                            {finishing ? "Saving…" : "Save & go to candidates"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] overflow-hidden bg-[#FAFBFC] dark:bg-lc-bg">
            {endConfirm && (
                <div className="fixed inset-0 z-[120] grid place-items-center bg-black/40 px-4" onClick={() => setEndConfirm(false)}>
                    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-lc-border dark:bg-lc-surface" onClick={(event) => event.stopPropagation()}>
                        <div className="flex size-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                            <span className="material-symbols-outlined text-[24px]">call_end</span>
                        </div>
                        <h2 className="mt-4 font-nunito text-lg font-bold text-slate-900 dark:text-white">End this interview?</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">The candidate&apos;s room will close and they&apos;ll see a completion screen. You&apos;ll then submit your evaluation. This can&apos;t be undone.</p>
                        <div className="mt-5 flex justify-end gap-3">
                            <button type="button" onClick={() => setEndConfirm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-lc-border dark:text-slate-300 dark:hover:bg-lc-bg">Cancel</button>
                            <button type="button" onClick={endInterview} className="rounded-lg bg-[#E11D48] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#BE123C]">End interview</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex h-full flex-col">
                <header className="relative flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 dark:border-lc-border dark:bg-lc-surface sm:px-5">
                    <div className="flex min-w-0 items-center gap-4">
                        <button type="button" onClick={() => router.back()} className="flex size-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 dark:border-lc-border dark:text-slate-200 dark:hover:bg-lc-border" title="Back">
                            <span className="material-symbols-outlined text-[17px]">arrow_back</span>
                        </button>
                        <div className="hidden min-w-0 sm:block">
                            <p className="truncate text-[13px] font-bold text-slate-900 dark:text-white">{bootstrap?.candidate.name || "Candidate"}</p>
                            <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{formatDateTime(bootstrap?.scheduledAt)}</p>
                        </div>
                    </div>

                    {/* Running interview timer — centered, red, HH:MM:SS since admit. */}
                    <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2">
                        <span className={`material-symbols-outlined text-[19px] ${admitted ? "text-red-500" : "text-slate-400"}`}>timer</span>
                        <span className={`font-mono text-[17px] font-black tabular-nums ${admitted ? "text-red-500" : "text-slate-400"}`}>{admitted ? formatElapsed(runningElapsed) : "00:00:00"}</span>
                        {admitted && <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-red-500" /></span>}
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="hidden rounded-full border border-slate-200 px-3 py-1 text-[12px] font-bold capitalize text-slate-600 dark:border-lc-border dark:text-slate-300 sm:inline-flex">
                            {statusLabel(status)}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${connected ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"}`}>
                            {connected ? "Connected" : "Connecting"}
                        </span>
                        <button
                            type="button"
                            onClick={() => setEndConfirm(true)}
                            disabled={Boolean(sessionEnded)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#E11D48] px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-[#BE123C] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:text-sm"
                            title="End Interview"
                        >
                            <span className="material-symbols-outlined text-[15px]">call_end</span>
                            <span>End Interview</span>
                        </button>
                    </div>
                </header>

                <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {error && (
                        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
                        {meetActive && (
                            <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-slate-950">
                                {/* The persistent video stage (rendered below) fills this area once admitted. */}
                                {!admitted && (
                                    <div className="z-10 w-full max-w-md px-6 text-center">
                                        <div className={`mx-auto grid size-16 place-items-center rounded-full ${lobbyRequest ? "bg-amber-500/15 text-amber-400" : "bg-slate-800 text-slate-400"}`}>
                                            <span className="material-symbols-outlined text-4xl">{lobbyRequest ? "person_raised_hand" : "groups"}</span>
                                        </div>
                                        <p className="mt-4 text-lg font-bold text-white">
                                            {lobbyRequest ? `${bootstrap?.candidate.name || "The candidate"} is waiting in the lobby` : "Waiting for the candidate to join"}
                                        </p>
                                        <p className="mt-1 text-xs font-semibold text-slate-400">
                                            {lobbyRequest ? "Admit them to start the call. You can launch a coding surface once you're both in." : "You can admit now, or once they arrive in the lobby."}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={admitCandidate}
                                            className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg transition-colors ${lobbyRequest ? "bg-emerald-500 hover:bg-emerald-600" : "bg-emerald-600/80 hover:bg-emerald-600"}`}
                                        >
                                            <span className="material-symbols-outlined text-[20px]">door_open</span>
                                            Admit candidate
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {resumeOpen && (
                            <div className="min-w-0 flex-1 overflow-hidden bg-white dark:bg-lc-surface">
                                <ResumePdf url={resumePdfUrl} loading={resumeFileLoading} fileName={bootstrap?.resume?.fileName ?? null} error={resumeFileError} />
                            </div>
                        )}

                        {isCodingSurface && (<>
                        <aside style={{ "--left-w": `${leftWidth}px` } as React.CSSProperties} className="flex w-full shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white dark:border-lc-border dark:bg-lc-surface xl:w-[var(--left-w)]">
                            <div className="flex items-center gap-1 border-b border-slate-100 px-4 dark:border-lc-border">
                                {(["problem", "questions", "hints", "solution", "notes"] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setLeftTab(tab)}
                                        className={`mr-3 border-b-2 px-1 py-3 text-[13px] font-semibold capitalize transition-colors ${leftTab === tab ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 text-[15px] leading-relaxed text-[#374151] dark:text-[#d1d5db]">
                                {leftTab === "problem" && (
                                    <div className="space-y-4">
                                        <div>
                                            <h2 className="text-[18px] font-bold leading-snug text-slate-900 dark:text-white">{questionDetails?.title || activeQuestion?.text || "Select a question"}</h2>
                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                {activeQuestion?.difficulty && <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${difficultyTagClass(activeQuestion.difficulty)}`}>{activeQuestion.difficulty}</span>}
                                                {activeQuestion?.setTitle && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">{activeQuestion.setTitle}</span>}
                                            </div>
                                        </div>
                                        {questionLoading && <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">Loading problem statement...</div>}
                                        {questionError && <div className="text-sm font-semibold text-red-600 dark:text-red-400">{questionError}</div>}
                                        {questionDetails ? (
                                            <>
                                                <div className="prose prose-base max-w-none dark:prose-invert prose-pre:border prose-pre:border-slate-200 prose-pre:bg-slate-50 prose-pre:text-slate-800 dark:prose-pre:border-lc-border dark:prose-pre:bg-lc-bg dark:prose-pre:text-[#d4d4d4]">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeSanitize, [rehypeKatex, { strict: false, throwOnError: false }]] as any}>
                                                        {normalizeQuestionMarkdown(questionDetails.statement || questionDetails.problemMd || questionDetails.problem_md || questionDetails.description || "")}
                                                    </ReactMarkdown>
                                                </div>
                                                {activeSurface !== "sql" && questionDetails.examples && questionDetails.examples.length > 0 && (
                                                    <div className="space-y-3">
                                                        <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-900 dark:text-white">Examples</h3>
                                                        {questionDetails.examples.map((example, index) => (
                                                            <div key={index} className="space-y-2 rounded-lg bg-[#F8FAFC] p-4 font-mono text-[13px] text-slate-800 dark:bg-lc-bg dark:text-[#d4d4d4]">
                                                                <div className="font-bold text-slate-900 dark:text-white">Example {index + 1}</div>
                                                                {formatValue(example.input).trim() && <div><span className="font-bold opacity-60">Input:</span> {formatValue(example.input)}</div>}
                                                                {formatValue(example.output).trim() && <div><span className="font-bold opacity-60">Output:</span> {formatValue(example.output)}</div>}
                                                                {example.explanation && (
                                                                    <div className={formatValue(example.input).trim() ? "border-t border-slate-200 pt-2 dark:border-lc-border/50" : ""}>
                                                                        <div className="whitespace-pre-wrap font-sans leading-relaxed">
                                                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeSanitize, [rehypeKatex, { strict: false, throwOnError: false }]] as any} components={{ p: ({ children }) => <p className="mb-1">{children}</p> }}>
                                                                                {normalizeQuestionMarkdown(example.explanation)}
                                                                            </ReactMarkdown>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {(() => {
                                                    const c = questionDetails.constraints;
                                                    const lines = typeof c === "string" ? c.split("\n").map((l) => l.trim()).filter(Boolean) : Array.isArray(c) ? c.map((l) => String(l).trim()).filter(Boolean) : [];
                                                    if (lines.length === 0) return null;
                                                    return (
                                                        <div className="space-y-3">
                                                            <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-900 dark:text-white">Constraints</h3>
                                                            <div className="rounded-lg bg-[#F8FAFC] p-4 dark:bg-lc-bg">
                                                                <ul className="list-disc space-y-1.5 pl-4 font-mono text-[13px] text-slate-800 marker:text-slate-400 dark:text-[#d4d4d4]">
                                                                    {lines.map((line, index) => <li key={index}>{normalizePlainMathText(line)}</li>)}
                                                                </ul>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                                {activeSurface === "sql" && (
                                                    <SqlSchema examples={questionDetails.examples as any} />
                                                )}
                                                {activeSurface === "design" && (
                                                    <DesignExtras followUps={(questionDetails as any)?.designMeta?.followUpQuestions} hints={questionDetails.hints} />
                                                )}
                                            </>
                                        ) : (
                                            <div className="rounded-lg bg-[#F8FAFC] p-4 text-sm font-semibold text-slate-600 dark:bg-lc-bg dark:text-slate-300">
                                                The candidate solves here while you observe, run code, and guide the final interview.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {leftTab === "questions" && (
                                    <div className="space-y-2">
                                        {surfaceQuestions.length ? surfaceQuestions.map((question, index) => (
                                            <button
                                                key={question.id}
                                                type="button"
                                                onClick={() => {
                                                    setPendingQuestionId(question.id);
                                                    selectQuestion(question.id);
                                                }}
                                                className={`w-full rounded-lg border p-3 text-left text-sm font-bold transition-colors ${activeQuestion?.id === question.id ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-600 hover:border-primary/40 dark:border-lc-border dark:text-slate-300"}`}
                                            >
                                                <span className="block text-xs text-slate-400">Question {index + 1}</span>
                                                {question.text}
                                            </button>
                                        )) : (
                                            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No assigned questions.</p>
                                        )}
                                    </div>
                                )}

                                {leftTab === "notes" && (
                                    <div className="space-y-3">
                                        <div className="rounded-lg bg-[#F8FAFC] p-4 dark:bg-lc-bg">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Interviewer notes</p>
                                            <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{bootstrap?.interviewerNotes || "No interviewer notes assigned."}</p>
                                        </div>
                                        <div className="rounded-lg bg-[#F8FAFC] p-4 dark:bg-lc-bg">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Candidate</p>
                                            <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{bootstrap?.candidate.name}</p>
                                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{bootstrap?.candidate.email}</p>
                                        </div>
                                    </div>
                                )}

                                {leftTab === "hints" && (
                                    <div className="space-y-3">
                                        {questionDetails?.hints && questionDetails.hints.length > 0 ? (
                                            questionDetails.hints.map((hint, index) => (
                                                <div key={index} className="rounded-lg bg-[#F8FAFC] p-4 dark:bg-lc-bg">
                                                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Hint {index + 1}</div>
                                                    <p className="text-[13px] text-slate-700 dark:text-slate-200">{hint}</p>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-sm italic text-slate-500">No hints available for this question.</div>
                                        )}
                                    </div>
                                )}

                                {leftTab === "solution" && (
                                    <SolutionView solution={questionDetails?.solution} preferredLanguage={language} />
                                )}
                            </div>
                        </aside>

                        <DragHandle axis="x" className="hidden xl:flex" onDelta={(delta) => setLeftWidth((width) => clampSize(width + delta, 320, 760))} />

                        <section className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-slate-200 bg-white dark:border-lc-border dark:bg-lc-surface">
                            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-lc-border">
                                {activeSurface !== "design" && (
                                    <select
                                        value={language}
                                        onChange={(event) => updateLanguage(event.target.value)}
                                        disabled
                                        title="Candidate controls the live editor language"
                                        className="rounded-xl border border-slate-200 bg-slate-100 px-2 py-1 text-[12px] font-bold text-slate-700 disabled:opacity-70 dark:border-lc-border dark:bg-lc-bg dark:text-white"
                                    >
                                        {EDITOR_LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                )}
                                <div className="ml-auto flex items-center gap-2">
                                    {isCodingSurface && (
                                        <button
                                            type="button"
                                            onClick={requestCopilotAnalysis}
                                            className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">neurology</span>
                                            Analyse IDE
                                        </button>
                                    )}
                                    {activeSurface !== "design" && (
                                        <button
                                            type="button"
                                            onClick={resetStarterCode}
                                            disabled
                                            className="flex items-center gap-1 text-[12px] font-semibold text-slate-500 transition-colors hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#ababab] dark:hover:text-white"
                                            title="Candidate controls the live editor"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                                            <span>Reset</span>
                                        </button>
                                    )}
                                    {showRunButton && (
                                        <button
                                            type="button"
                                            disabled={!code.trim() || executionRunning || Boolean(sessionEnded)}
                                            onClick={() => executeCode({ questionId: activeQuestion?.id || null, language: runLanguage, code, mode: "run" })}
                                            className={`flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold shadow-sm transition-colors dark:border-lc-border ${executionRunning ? "cursor-not-allowed bg-slate-100 text-slate-400 opacity-50" : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-lc-surface dark:text-[#eff1f6] dark:hover:bg-lc-hover"}`}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">{executionRunning ? "sync" : "play_arrow"}</span>
                                            {executionRunning ? "Running..." : "Run"}
                                        </button>
                                    )}
                                    {activeSurface === "design" && (
                                        <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 dark:bg-lc-bg dark:text-slate-400">Live whiteboard — synced</span>
                                    )}
                                </div>
                            </div>

                            <div className="min-h-0 flex-1">
                                {activeSurface === "design" ? (
                                    <DesignBoard value={code} readOnly onChange={undefined} theme="light" />
                                ) : (
                                    <MonacoEditor
                                        height="100%"
                                        key={`${activeQuestion?.id || "question"}:${editorMonacoLanguage}`}
                                        language={editorMonacoLanguage}
                                        value={code}
                                        onChange={(value) => {
                                            const nextCode = value || "";
                                            codeDraftsRef.current[draftKeyFor(language)] = nextCode;
                                            setCode(nextCode);
                                        }}
                                        theme="light"
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            readOnly: true,
                                            wordWrap: "on",
                                            automaticLayout: true,
                                            scrollBeyondLastLine: false,
                                        }}
                                    />
                                )}
                            </div>

                            {activeSurface !== "design" && (<>
                            <DragHandle axis="y" onDelta={(delta) => setResultsHeight((height) => clampSize(height - delta, 140, 600))} />

                            <div style={{ "--results-h": `${resultsHeight}px` } as React.CSSProperties} className="h-[var(--results-h)] shrink-0 border-t border-slate-200 bg-white dark:border-lc-border dark:bg-lc-surface">
                                <div className="flex h-full flex-col">
                                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-lc-border">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px] text-orange-500">terminal</span>
                                            <span className="text-[13px] font-bold uppercase tracking-wider text-slate-700 dark:text-white">Test Results</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {activeExecutionState?.result?.passedCount != null && activeExecutionState?.result?.totalCount != null && (
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${activeExecutionState.result.passedCount === activeExecutionState.result.totalCount ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"}`}>
                                                    {activeExecutionState.result.passedCount}/{activeExecutionState.result.totalCount} passed
                                                </span>
                                            )}
                                            {activeExecutionState && <span className="text-xs font-bold capitalize text-slate-500">{activeExecutionState.phase} - {activeExecutionState.mode}</span>}
                                        </div>
                                    </div>
                                    <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-white p-4 pb-16 dark:bg-lc-surface">
                                        {activeSurface === "sql" ? (
                                            <SqlResultView
                                                table={activeExecutionState?.result?.table ?? null}
                                                passed={activeExecutionState?.result ? ((activeExecutionState.result.passedCount ?? 0) > 0 ? activeExecutionState.result.passedCount === activeExecutionState.result.totalCount : (activeExecutionState.result.status === "Accepted")) : null}
                                                error={activeExecutionState?.executionError ?? activeExecutionState?.result?.stderr ?? activeExecutionState?.result?.compileOutput ?? null}
                                                ran={activeExecutionState?.phase === "completed"}
                                            />
                                        ) : activeExecutionState?.executionError ? (
                                            <div className="mb-3 shrink-0 rounded-lg border border-red-200 bg-red-50 p-3 font-mono text-[13px] text-red-700 whitespace-pre-wrap dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                                                <div className="mb-1 flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[16px]">error</span>
                                                    <span className="text-[11px] font-bold uppercase tracking-wider">Compile / Runtime Error</span>
                                                </div>
                                                {activeExecutionState.executionError}
                                            </div>
                                        ) : testCasesToDisplay.length > 0 ? (
                                            <div className="flex h-full min-h-0 flex-col gap-4">
                                                <div className="flex shrink-0 gap-6 border-b border-slate-100 px-2 dark:border-lc-border">
                                                    {testCasesToDisplay.map((testCase, index) => {
                                                        const outcome = activeExecutionState?.result?.tests?.find((t) => t.id === String(testCase.id ?? "")) ?? activeExecutionState?.result?.tests?.[index];
                                                        return (
                                                            <button
                                                                key={testCase.id || `case_${index}`}
                                                                type="button"
                                                                onClick={() => setActiveTestCase(index)}
                                                                className={`relative top-px flex items-center gap-1.5 border-b-2 pb-3 text-[14px] font-bold transition-colors ${activeTestCase === index ? "border-orange-500 text-orange-500" : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                                                            >
                                                                <span className={`size-2 rounded-full ${activeExecutionState?.phase === "running" ? "animate-pulse bg-blue-400" : outcome ? (outcome.passed ? "bg-green-500" : "bg-red-500") : activeExecutionState?.result ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                                                                Case {index + 1}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <div className="flex min-h-0 flex-1 gap-4 overflow-hidden pb-1">
                                                    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                                                        <div className="shrink-0 text-[13px] font-bold uppercase tracking-wider text-slate-500">Input</div>
                                                        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[13px] text-slate-800 dark:bg-[#1e1e1e] dark:text-[#d4d4d4]">{formatValue(testCasesToDisplay[activeTestCase]?.stdin ?? testCasesToDisplay[activeTestCase]?.input)}</div>
                                                    </div>
                                                    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                                                        <div className="shrink-0 text-[13px] font-bold uppercase tracking-wider text-slate-500">Expected</div>
                                                        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[13px] text-slate-800 dark:bg-[#1e1e1e] dark:text-[#d4d4d4]">{formatValue(testCasesToDisplay[activeTestCase]?.expected_output ?? testCasesToDisplay[activeTestCase]?.output)}</div>
                                                    </div>
                                                    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                                                        <div className="shrink-0 text-[13px] font-bold uppercase tracking-wider text-slate-500">Output</div>
                                                        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[13px] text-slate-800 dark:bg-[#1e1e1e] dark:text-[#d4d4d4]">
                                                            {formatExecutionOutput(activeExecutionState?.result, activeTestCase, testCasesToDisplay[activeTestCase]?.id)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex h-full flex-col items-center justify-center text-[13px] text-slate-400 dark:text-slate-500">
                                                <span className="material-symbols-outlined mb-2 text-3xl opacity-50">data_object</span>
                                                <p>No sample test cases available for this question.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            </>)}
                        </section>
                        </>)}

                        <DragHandle axis="x" className="hidden xl:flex" onDelta={(delta) => setRightWidth((width) => clampSize(width - delta, 280, 560))} />

                        <aside style={{ "--right-w": `${rightWidth}px` } as React.CSSProperties} className="relative flex w-full shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white dark:border-lc-border dark:bg-lc-surface xl:w-[var(--right-w)]">
                            <CopilotDock
                                suggestions={copilotSuggestions}
                                insights={copilotInsights}
                                status={copilotStatus}
                                resumeAnalysis={resumeAnalysis}
                                transcript={transcript}
                                listening={admitted && !isMuted && !sessionEnded}
                                onAnalyzeAnswer={analyzeAnswer}
                            />
                        </aside>

                        {admitted && (
                            <div
                                className={`fixed z-50 touch-none select-none overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl ${meetActive ? "" : "w-64"}`}
                                style={
                                    meetActive
                                        ? { left: 16, top: 72, right: 400, bottom: 96 }
                                        : videoPosition
                                            ? { left: videoPosition.left, top: videoPosition.top, cursor: "grab" }
                                            : { right: 408, top: 80, cursor: "grab" }
                                }
                                title={meetActive ? undefined : "Drag to reposition. Click to enable audio."}
                                onPointerDown={(event) => {
                                    if (meetActive) return;
                                    const target = event.target as HTMLElement;
                                    if (target.closest("button")) return;
                                    event.preventDefault();
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    videoDraggingRef.current = true;
                                    videoDraggedRef.current = false;
                                    videoDragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
                                    document.body.style.userSelect = "none";
                                }}
                                onClick={() => {
                                    if (videoDraggedRef.current) return;
                                    void remoteVideoRef.current?.play().catch(() => {});
                                }}
                            >
                                <div className={meetActive ? "relative h-full w-full" : "relative w-full"} style={meetActive ? undefined : { aspectRatio: "16/9" }}>
                                    <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 size-full object-cover" />
                                    {!hasRemoteVideo && <div className="absolute inset-0 grid place-items-center bg-slate-900 text-xs font-bold text-slate-400">Waiting for candidate video</div>}
                                    <video
                                        ref={localVideoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className={`absolute rounded-lg border-2 border-white/30 object-cover ${meetActive ? "bottom-4 right-4 h-1/4 max-h-40 min-h-[120px] w-1/4 min-w-[180px] max-w-[280px]" : "bottom-2 right-2 h-[43px] w-[76px]"} ${isCameraOn ? "" : "hidden"}`}
                                        style={{ transform: "scaleX(-1)" }}
                                    />
                                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                                    {meetActive && (
                                        <div className="absolute left-4 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white">{bootstrap?.candidate.name || "Candidate"}</div>
                                    )}
                                    <div className={`absolute bottom-2 left-2 z-20 flex items-center gap-1.5 ${meetActive ? "hidden" : ""}`}>
                                        <button
                                            type="button"
                                            onClick={() => setIsMuted((value) => !value)}
                                            className={`flex size-7 items-center justify-center rounded-full text-white shadow transition-all ${isMuted ? "bg-red-500 hover:bg-red-600" : "bg-black/50 hover:bg-black/70"}`}
                                            title={isMuted ? "Unmute" : "Mute"}
                                        >
                                            <span className="material-symbols-outlined text-[13px] leading-none">{isMuted ? "mic_off" : "mic"}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsCameraOn((value) => !value)}
                                            className={`flex size-7 items-center justify-center rounded-full text-white shadow transition-all ${!isCameraOn ? "bg-red-500 hover:bg-red-600" : "bg-black/50 hover:bg-black/70"}`}
                                            title={isCameraOn ? "Turn off camera" : "Turn on camera"}
                                        >
                                            <span className="material-symbols-outlined text-[13px] leading-none">{isCameraOn ? "videocam" : "videocam_off"}</span>
                                        </button>
                                    </div>
                                </div>
                                {mediaError && <div className="border-t border-white/10 px-3 py-2 text-[11px] font-semibold text-red-200">{mediaError}</div>}
                            </div>
                        )}

                        {screenLive && proctorRect && (
                            proctorMinimized ? (
                                <button
                                    type="button"
                                    onClick={() => setProctorMinimized(false)}
                                    className="fixed bottom-4 left-4 z-[60] inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-2xl"
                                >
                                    <span className="size-2 animate-pulse rounded-full bg-blue-400" />
                                    Candidate screen live
                                    <span className="material-symbols-outlined text-[18px]">open_in_full</span>
                                </button>
                            ) : (
                                <div
                                    className="fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
                                    style={proctorFullscreen ? { left: 16, top: 64, right: 16, bottom: 16 } : { left: proctorRect.x, top: proctorRect.y, width: proctorRect.w, height: proctorRect.h }}
                                >
                                    <div
                                        onPointerDown={(event) => { if (!proctorFullscreen) startProctorDrag(event, "move"); }}
                                        className={`flex shrink-0 items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2 ${proctorFullscreen ? "" : "cursor-grab active:cursor-grabbing"}`}
                                    >
                                        <div className="flex min-w-0 items-center gap-2 text-white">
                                            <span className="size-2 animate-pulse rounded-full bg-blue-400" />
                                            <span className="material-symbols-outlined text-[16px]">screen_share</span>
                                            <span className="truncate text-[13px] font-bold">Candidate screen</span>
                                            <span className={`material-symbols-outlined text-[15px] ${screenHasSystemAudio ? "text-emerald-400" : "text-slate-500"}`} title={screenHasSystemAudio ? "System audio shared" : "No system audio"}>{screenHasSystemAudio ? "volume_up" : "volume_off"}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button type="button" onClick={() => setProctorFullscreen((value) => !value)} title={proctorFullscreen ? "Restore" : "Fullscreen"} className="flex size-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-700 hover:text-white">
                                                <span className="material-symbols-outlined text-[17px]">{proctorFullscreen ? "close_fullscreen" : "open_in_full"}</span>
                                            </button>
                                            <button type="button" onClick={() => setProctorMinimized(true)} title="Minimize" className="flex size-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-700 hover:text-white">
                                                <span className="material-symbols-outlined text-[17px]">remove</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="relative min-h-0 flex-1 bg-black">
                                        <video
                                            ref={screenVideoRef}
                                            autoPlay
                                            playsInline
                                            onClick={() => { const video = screenVideoRef.current; if (video) { video.muted = false; void video.play().catch(() => {}); } }}
                                            className="absolute inset-0 size-full cursor-pointer object-contain"
                                        />
                                        {proctorHintVisible && (
                                            <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-3 rounded-lg bg-slate-900/90 px-3 py-2 text-[12px] font-semibold text-slate-100 shadow-lg ring-1 ring-white/10">
                                                <span><span className="font-bold">This window is resizable.</span> Drag the header to move, drag the bottom-right corner to resize, or use the ⛶ button for fullscreen.</span>
                                                <button type="button" onClick={() => setProctorHintVisible(false)} className="shrink-0 text-slate-400 hover:text-white"><span className="material-symbols-outlined text-[16px]">close</span></button>
                                            </div>
                                        )}
                                    </div>
                                    {!proctorFullscreen && (
                                        <div
                                            onPointerDown={(event) => startProctorDrag(event, "resize")}
                                            className="absolute bottom-0 right-0 z-10 flex size-6 cursor-nwse-resize items-end justify-end p-1 text-slate-400 hover:text-white"
                                            title="Drag to resize"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">south_east</span>
                                        </div>
                                    )}
                                </div>
                            )
                        )}

                        {/* Meet-style control bar — centered over the meeting area only,
                            kept clear of the copilot dock on the right. */}
                        {admitted && (
                            <div
                                style={{ left: `calc((100vw - ${panelCollapsed ? 52 : rightWidth}px) / 2)`, maxWidth: `calc(100vw - ${(panelCollapsed ? 52 : rightWidth) + 48}px)` }}
                                className="fixed bottom-4 z-[70] flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur dark:border-lc-border dark:bg-lc-surface/95"
                            >
                                <button
                                    type="button"
                                    onClick={() => setIsMuted((value) => !value)}
                                    title={isMuted ? "Unmute microphone" : "Mute microphone"}
                                    className={`flex size-10 items-center justify-center rounded-full text-white transition-colors ${isMuted ? "bg-red-500 hover:bg-red-600" : "bg-slate-700 hover:bg-slate-800 dark:bg-slate-600"}`}
                                >
                                    <span className="material-symbols-outlined text-[20px]">{isMuted ? "mic_off" : "mic"}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCameraOn((value) => !value)}
                                    title={isCameraOn ? "Turn off camera" : "Turn on camera"}
                                    className={`flex size-10 items-center justify-center rounded-full text-white transition-colors ${!isCameraOn ? "bg-red-500 hover:bg-red-600" : "bg-slate-700 hover:bg-slate-800 dark:bg-slate-600"}`}
                                >
                                    <span className="material-symbols-outlined text-[20px]">{isCameraOn ? "videocam" : "videocam_off"}</span>
                                </button>

                                <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-lc-border" />

                                <button
                                    type="button"
                                    onClick={() => launchSurface("meet")}
                                    title="Back to the meeting"
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold transition-colors ${meetActive ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-lc-bg"}`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">{SURFACE_META.meet.icon}</span>
                                    <span className="hidden sm:inline">{SURFACE_META.meet.label}</span>
                                </button>
                                {roundSurfaces.map((surface) => {
                                    const active = !resumeOpen && activeSurface === surface;
                                    const meta = SURFACE_META[surface];
                                    return (
                                        <button
                                            key={surface}
                                            type="button"
                                            onClick={() => launchSurface(surface)}
                                            title={meta.label}
                                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold transition-colors ${active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-lc-bg"}`}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">{meta.icon}</span>
                                            <span className="hidden sm:inline">{meta.label}</span>
                                        </button>
                                    );
                                })}

                                <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-lc-border" />

                                <button
                                    type="button"
                                    onClick={() => setResumeOpen((value) => !value)}
                                    disabled={!hasResume}
                                    title={hasResume ? "Toggle candidate resume" : "No resume yet"}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${resumeOpen ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-lc-bg"}`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">description</span>
                                    <span className="hidden sm:inline">Resume</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRequestScreenShare}
                                    title="Ask the candidate to share their screen"
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold transition-colors ${screenLive ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-lc-bg"}`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">screen_share</span>
                                    <span className="hidden md:inline">{screenLive ? "Sharing" : "Screen"}</span>
                                </button>
                            </div>
                        )}

                        {/* Headless: transcribe the interviewer's own mic into conversation memory. */}
                        <SpeechCapture
                            enabled={speechEnabled}
                            onTranscript={(text, isFinal) => sendTranscript(text, isFinal, "interviewer")}
                        />
                    </section>
                </main>
            </div>
        </div>
    );
}

export default function DirectInterviewRoomPage() {
    return <InterviewerRoom />;
}
