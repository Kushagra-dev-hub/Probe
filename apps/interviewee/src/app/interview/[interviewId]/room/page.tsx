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
import { SpeechCapture } from "@/components/speech-capture";
import { DesignBoard, DesignExtras } from "@/components/design-board";
import { SqlSchema, SqlResultView } from "@/components/sql-view";
import { api } from "@/lib/api";

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

function formatDateTime(value?: string | null) {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not scheduled";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
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

function initials(name?: string | null) {
    return (name || "")
        .split(/\s+/)
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() || "I";
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
    if (["cpp", "c++", "cpp17", "cpp20", "cxx"].includes(value)) return "cpp";
    if (value === "golang") return "go";
    return value;
}

function normalizeStarterCodeMap(source?: Record<string, string>): Record<string, string> {
    if (!source) return {};
    const normalized: Record<string, string> = {};
    Object.entries(source).forEach(([rawLanguage, starter]) => {
        const language = normalizeStarterLanguageKey(rawLanguage);
        if (!normalized[language] || normalized[language].trim().length === 0) normalized[language] = starter;
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

function isChromiumDesktop() {
    if (typeof navigator === "undefined") return true;
    const ua = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const isChromium = /Chrome\/|Edg\//.test(ua) && !/OPR\//.test(ua);
    return isChromium && !isMobile && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

const SURFACE_LABEL: Record<string, string> = {
    meet: "Conversation",
    dsa: "Coding — Data Structures & Algorithms",
    sql: "SQL",
    design: "System design",
};

function CandidateRoom() {
    const { session } = useAuth();
    const params = useParams<{ interviewId: string }>();
    const router = useRouter();
    const identifier = params?.interviewId || "";
    const joinedRef = useRef(false);
    const syncTimeoutRef = useRef<number | null>(null);
    const revisionRef = useRef(0);
    const starterSyncKeyRef = useRef("");
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const lastHandledOfferSdpRef = useRef<string | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const screenPcRef = useRef<RTCPeerConnection | null>(null);
    const screenPendingIceRef = useRef<RTCIceCandidateInit[]>([]);
    const lastHandledScreenAnswerSdpRef = useRef<string | null>(null);
    const codeDraftsRef = useRef<Record<string, string>>({});
    const mainEditorRef = useRef<any>(null);
    const editorSeededRef = useRef(false);
    const [code, setCode] = useState("");
    const [language, setLanguage] = useState("python");
    const [leftTab, setLeftTab] = useState<"problem" | "instructions">("problem");
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
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
    const [leftWidth, setLeftWidth] = useState(480);
    const [resultsHeight, setResultsHeight] = useState(280);
    const [screenSharing, setScreenSharing] = useState(false);
    const [screenStarting, setScreenStarting] = useState(false);
    const [screenError, setScreenError] = useState<string | null>(null);
    const [screenRequestActive, setScreenRequestActive] = useState(false);
    const [systemAudioMissing, setSystemAudioMissing] = useState(false);
    const questionDetailsCacheRef = useRef<Record<string, DsaQuestionDetails>>({});
    const {
        connected,
        loading,
        joining,
        error,
        bootstrap,
        roomState,
        lobbyState,
        editorState,
        timerState,
        sessionEnded,
        executionState,
        signalOffer,
        signalAnswer,
        signalIce,
        surfaceState,
        join,
        syncEditorState,
        executeCode,
        sendSignalAnswer,
        sendSignalIce,
        clearSignalOffer,
        clearSignalAnswer,
        clearSignalIce,
        screenShareRequest,
        screenAnswer,
        screenIce,
        sendScreenShareState,
        sendScreenOffer,
        sendScreenIce,
        clearScreenShareRequest,
        clearScreenAnswer,
        clearScreenIce,
        sendTranscript,
        reload,
    } = useInterviewRoom(identifier);

    const status = roomState?.status || bootstrap?.status || "scheduled";
    const admitted = Boolean(roomState?.candidateAdmittedAt || bootstrap?.candidateAdmittedAt || status === "active" || lobbyState?.state === "admitted");
    const questions = bootstrap?.questions || [];

    // The active surface is driven entirely by the interviewer. Default to the
    // Google-Meet conversation view until they explicitly launch a coding round.
    const surface = surfaceState?.surface ?? bootstrap?.activeSurface ?? "meet";
    const isMeet = surface === "meet";
    const isDesign = surface === "design";
    const canRun = surface === "dsa" || surface === "sql";

    const activeQuestionId = roomState?.activeQuestionId || bootstrap?.activeQuestionId;
    const activeQuestion = useMemo(() => {
        if (!questions.length || isMeet) return null;
        const matches = (question: { type?: string | null }) => {
            const type = (question.type || "").toLowerCase();
            return surface === "design" ? type === "design" || type === "system_design" : type === surface;
        };
        const byActiveId = questions.find((question) => question.id === activeQuestionId);
        if (byActiveId && matches(byActiveId)) return byActiveId;
        return questions.find(matches) || byActiveId || questions[roomState?.activeQuestionIndex || bootstrap?.activeQuestionIndex || 0] || questions[0];
    }, [activeQuestionId, bootstrap?.activeQuestionIndex, isMeet, questions, roomState?.activeQuestionIndex, surface]);
    const questionLookupId = getQuestionLookupId(activeQuestion);
    const questionCacheKey = `${bootstrap?.directInterviewId || ""}:${questionLookupId || ""}`;
    const testCasesToDisplay = questionDetails?.sample_tests || [];
    const totalSeconds = timerState?.totalSeconds || (bootstrap?.durationMinutes || 60) * 60;
    const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
    // Running clock — elapsed time since the candidate was admitted.
    const admittedAt = roomState?.candidateAdmittedAt || bootstrap?.candidateAdmittedAt || null;
    const [nowTs, setNowTs] = useState(() => Date.now());
    useEffect(() => {
        if (!admittedAt || sessionEnded) return;
        const id = window.setInterval(() => setNowTs(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [admittedAt, sessionEnded]);
    const runningElapsed = admittedAt ? Math.max(0, Math.floor((nowTs - new Date(admittedAt).getTime()) / 1000)) : 0;
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
        if (!connected || joinedRef.current) return;
        joinedRef.current = true;
        join();
    }, [connected, join]);

    // Keep the editor language pinned to the active surface. SQL and system-design
    // rounds use fixed languages; DSA lets the candidate pick among EDITOR_LANGUAGES.
    useEffect(() => {
        if (surface === "sql") setLanguage("sql");
        else if (surface === "design") setLanguage("markdown");
        else if (surface === "dsa") setLanguage((current) => (current === "sql" || current === "markdown" ? "python" : current));
    }, [surface]);

    useEffect(() => {
        starterSyncKeyRef.current = "";
        editorSeededRef.current = false;
        setQuestionDetails(null);
        setStarterCodeByLanguage({});
        setQuestionError(null);
        setActiveTestCase(0);
        setCode(codeDraftsRef.current[draftKeyFor(language)] ?? "");
    }, [activeQuestion?.id]);

    // Imperatively replace the editor contents from a non-typing source. Never call this
    // on every `code` change — that races with fast typing and resets the caret. Only the
    // deliberate sources below (mount/resume, question & language switch, reset) use it.
    const applyEditorValue = useCallback((nextCode: string) => {
        const editor = mainEditorRef.current;
        if (editor && editor.getModel?.() && editor.getValue() !== nextCode) {
            editor.setValue(nextCode);
        }
    }, []);

    // Seed the editor from the server snapshot only once per question (initial load /
    // resume). The candidate is the sole writer, so live echoes of their own edits must
    // not flow back into the editor — that would reset the caret while typing.
    useEffect(() => {
        if (!activeEditorState || editorSeededRef.current) return;
        editorSeededRef.current = true;
        const nextLanguage = normalizeStarterLanguageKey(activeEditorState.language || language);
        const nextCode = activeEditorState.code || "";
        revisionRef.current = Math.max(revisionRef.current, activeEditorState.revision || 0);
        codeDraftsRef.current[draftKeyFor(nextLanguage)] = nextCode;
        setCode(nextCode);
        setLanguage(nextLanguage);
        applyEditorValue(nextCode);
    }, [activeEditorState, applyEditorValue, draftKeyFor]);

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
            // Starter-code seeding only makes sense for the DSA editor. SQL / design
            // rounds seed from the shared snapshot (or start blank) so we don't fight
            // the fixed-language behaviour.
            if (surface !== "dsa") return;
            const availableLanguages = Object.keys(starterCode);
            const serverLanguage = normalizeStarterLanguageKey(activeEditorState?.language || "");
            const questionLanguage = normalizeStarterLanguageKey(response.language || "");
            const nextLanguage = activeEditorState?.code?.trim()
                ? serverLanguage
                : hasStarterForLanguage(starterCode, language)
                    ? normalizeStarterLanguageKey(language)
                    : hasStarterForLanguage(starterCode, questionLanguage)
                        ? questionLanguage
                        : availableLanguages[0] || normalizeStarterLanguageKey(language);
            const draftKey = `${activeQuestion?.id || "active"}:${nextLanguage}`;
            const localDraft = codeDraftsRef.current[draftKey];
            const starter = getExactStarterForLanguage(starterCode, nextLanguage);
            const nextCode = activeEditorState?.code?.trim() ? activeEditorState.code : localDraft ?? starter;
            if (nextCode || nextLanguage !== language) {
                codeDraftsRef.current[draftKey] = nextCode;
                setLanguage(nextLanguage);
                setCode(nextCode);
                applyEditorValue(nextCode);
                const syncKey = `${activeQuestion?.id || ""}:${nextLanguage}:${nextCode.length}:${nextCode.slice(0, 32)}`;
                if (!activeEditorState?.code?.trim() && nextCode && admitted && activeQuestion?.id && starterSyncKeyRef.current !== syncKey) {
                    starterSyncKeyRef.current = syncKey;
                    revisionRef.current += 1;
                    syncEditorState({ questionId: activeQuestion.id, language: nextLanguage, code: nextCode, revision: revisionRef.current });
                }
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
    }, [activeQuestion?.id, activeQuestion?.source, admitted, applyEditorValue, bootstrap?.directInterviewId, questionCacheKey, questionLookupId, session?.access_token, surface, syncEditorState]);

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
            setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
        }, 1000);
        return () => window.clearInterval(interval);
    }, [admitted, bootstrap?.startedAt, roomState?.startedAt, sessionEnded]);

    /* --------------------------------------------------------------- *
     * WebRTC — candidate is the A/V ANSWERER (getUserMedia + answer to
     * the interviewer's offer) and the SCREEN-SHARE OFFERER. Preserved
     * verbatim from the original IDE-first room; only the layout changed.
     * --------------------------------------------------------------- */

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
        if (!admitted) return;
        void ensurePeerConnection();
    }, [admitted, ensurePeerConnection]);

    useEffect(() => {
        if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        if (remoteVideoRef.current && remoteStreamRef.current) {
            remoteVideoRef.current.srcObject = remoteStreamRef.current;
            void remoteVideoRef.current.play().catch(() => {});
        }
    }, [mediaReady, surface]);

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
        if (!signalOffer || signalOffer.directInterviewId !== bootstrap?.directInterviewId) return;
        const handleOffer = async () => {
            if (lastHandledOfferSdpRef.current === signalOffer.sdp) return;
            lastHandledOfferSdpRef.current = signalOffer.sdp;
            const pc = await ensurePeerConnection();
            if (!pc) return;
            await pc.setRemoteDescription({ type: "offer", sdp: signalOffer.sdp });
            await flushQueuedIceCandidates(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignalAnswer(signalOffer.directInterviewId, answer.sdp || "");
        };
        handleOffer()
            .catch((err) => setMediaError(err instanceof Error ? err.message : "Could not connect video."))
            .finally(clearSignalOffer);
    }, [bootstrap?.directInterviewId, clearSignalOffer, ensurePeerConnection, flushQueuedIceCandidates, sendSignalAnswer, signalOffer]);

    useEffect(() => {
        if (!signalAnswer || signalAnswer.directInterviewId !== bootstrap?.directInterviewId) return;
        clearSignalAnswer();
    }, [bootstrap?.directInterviewId, clearSignalAnswer, signalAnswer]);

    useEffect(() => {
        if (!signalIce || signalIce.directInterviewId !== bootstrap?.directInterviewId) return;
        const handleIce = async () => {
            const candidate = JSON.parse(signalIce.candidate) as RTCIceCandidateInit;
            const pc = peerConnectionRef.current;
            if (!pc || !pc.remoteDescription) {
                pendingIceCandidatesRef.current.push(candidate);
                return;
            }
            await pc.addIceCandidate(candidate);
        };
        handleIce()
            .catch(() => {})
            .finally(clearSignalIce);
    }, [bootstrap?.directInterviewId, clearSignalIce, signalIce]);

    const stopScreenShare = useCallback((notify = true) => {
        screenStreamRef.current?.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        screenPcRef.current?.close();
        screenPcRef.current = null;
        screenPendingIceRef.current = [];
        lastHandledScreenAnswerSdpRef.current = null;
        setScreenSharing(false);
        setScreenStarting(false);
        if (notify) sendScreenShareState("stopped");
    }, [sendScreenShareState]);

    const startScreenShare = useCallback(async () => {
        const directInterviewId = bootstrap?.directInterviewId || identifier;
        if (!directInterviewId || screenSharing || screenStarting) return;
        setScreenError(null);

        if (!isChromiumDesktop()) {
            setScreenError("Screen sharing for proctoring requires desktop Chrome or Edge.");
            return;
        }

        setScreenStarting(true);
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: "monitor" },
                audio: true,
                selfBrowserSurface: "exclude",
                surfaceSwitching: "exclude",
                monitorTypeSurfaces: "include",
            } as DisplayMediaStreamOptions);
        } catch (err) {
            setScreenStarting(false);
            setScreenError(
                (err as { name?: string })?.name === "NotAllowedError"
                    ? "Screen share was cancelled. Your interviewer needs you to share your entire screen."
                    : err instanceof Error ? err.message : "Could not start screen sharing."
            );
            return;
        }

        const videoTrack = stream.getVideoTracks()[0];
        const surfaceKind = (videoTrack?.getSettings() as { displaySurface?: string })?.displaySurface;
        if (surfaceKind && surfaceKind !== "monitor") {
            stream.getTracks().forEach((track) => track.stop());
            setScreenStarting(false);
            setScreenError("Please share your entire screen — not a single tab or window.");
            return;
        }

        const hasSystemAudio = stream.getAudioTracks().length > 0;
        setSystemAudioMissing(!hasSystemAudio);
        screenStreamRef.current = stream;

        const pc = new RTCPeerConnection({ iceServers: getIceServers() });
        screenPcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        pc.onicecandidate = (event) => {
            if (event.candidate) sendScreenIce(directInterviewId, JSON.stringify(event.candidate.toJSON()));
        };
        videoTrack?.addEventListener("ended", () => stopScreenShare());

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendScreenOffer(directInterviewId, offer.sdp || "");
        } catch (err) {
            stopScreenShare(false);
            setScreenError(err instanceof Error ? err.message : "Could not start screen sharing.");
            return;
        }

        setScreenSharing(true);
        setScreenStarting(false);
        setScreenRequestActive(false);
        sendScreenShareState("active", hasSystemAudio);
    }, [bootstrap?.directInterviewId, identifier, screenSharing, screenStarting, sendScreenIce, sendScreenOffer, sendScreenShareState, stopScreenShare]);

    useEffect(() => {
        if (!screenShareRequest || screenShareRequest.directInterviewId !== (bootstrap?.directInterviewId || identifier)) return;
        if (!screenSharing) setScreenRequestActive(true);
        clearScreenShareRequest();
    }, [bootstrap?.directInterviewId, clearScreenShareRequest, identifier, screenShareRequest, screenSharing]);

    useEffect(() => {
        if (!screenAnswer || screenAnswer.directInterviewId !== (bootstrap?.directInterviewId || identifier)) return;
        const handleAnswer = async () => {
            const pc = screenPcRef.current;
            if (!pc || lastHandledScreenAnswerSdpRef.current === screenAnswer.sdp || pc.signalingState !== "have-local-offer") return;
            lastHandledScreenAnswerSdpRef.current = screenAnswer.sdp;
            await pc.setRemoteDescription({ type: "answer", sdp: screenAnswer.sdp });
            const queued = [...screenPendingIceRef.current];
            screenPendingIceRef.current = [];
            for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => {});
        };
        handleAnswer().catch(() => {}).finally(clearScreenAnswer);
    }, [bootstrap?.directInterviewId, clearScreenAnswer, identifier, screenAnswer]);

    useEffect(() => {
        if (!screenIce || screenIce.directInterviewId !== (bootstrap?.directInterviewId || identifier)) return;
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
    }, [bootstrap?.directInterviewId, clearScreenIce, identifier, screenIce]);

    useEffect(() => {
        if (sessionEnded && screenSharing) stopScreenShare();
    }, [screenSharing, sessionEnded, stopScreenShare]);

    useEffect(() => {
        if (!sessionEnded) return;
        peerConnectionRef.current?.close();
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
    }, [sessionEnded]);

    useEffect(() => {
        if (!sessionEnded) return;
        const timer = window.setTimeout(() => router.push("/"), 6000);
        return () => window.clearTimeout(timer);
    }, [router, sessionEnded]);

    useEffect(() => {
        return () => {
            screenStreamRef.current?.getTracks().forEach((track) => track.stop());
            screenPcRef.current?.close();
        };
    }, []);

    function syncCode(nextCode: string, nextLanguage = language) {
        if (!admitted || sessionEnded) return;
        revisionRef.current += 1;
        if (syncTimeoutRef.current) window.clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = window.setTimeout(() => {
            syncEditorState({ questionId: activeQuestion?.id || null, language: nextLanguage, code: nextCode, revision: revisionRef.current });
        }, 300);
    }

    function updateCode(nextCode: string) {
        codeDraftsRef.current[draftKeyFor(language)] = nextCode;
        setCode(nextCode);
        syncCode(nextCode);
    }

    // System-design surface: the Excalidraw scene serializes to a JSON string that
    // rides the SAME editor-sync channel the Monaco editor uses, so the interviewer
    // sees the candidate's drawing live. DesignCanvas already debounces onChange
    // (500ms), so we can call syncEditorState directly. Mirrors syncCode's shape.
    const handleDesignChange = useCallback((serialized: string) => {
        codeDraftsRef.current[draftKeyFor("design")] = serialized;
        setCode(serialized);
        if (!admitted || sessionEnded) return;
        revisionRef.current += 1;
        syncEditorState({ questionId: activeQuestion?.id ?? null, language: "design", code: serialized, revision: revisionRef.current });
    }, [activeQuestion?.id, admitted, draftKeyFor, sessionEnded, syncEditorState]);

    function updateLanguage(nextLanguage: string) {
        const normalizedLanguage = normalizeStarterLanguageKey(nextLanguage);
        codeDraftsRef.current[draftKeyFor(language)] = code;
        const nextDraftKey = draftKeyFor(normalizedLanguage);
        const starter = getExactStarterForLanguage(starterCodeByLanguage, normalizedLanguage);
        const nextCode = codeDraftsRef.current[nextDraftKey] ?? starter;
        codeDraftsRef.current[nextDraftKey] = nextCode;
        setLanguage(normalizedLanguage);
        setCode(nextCode);
        applyEditorValue(nextCode);
        syncCode(nextCode, normalizedLanguage);
    }

    function resetStarterCode() {
        const starter = getExactStarterForLanguage(starterCodeByLanguage, language);
        codeDraftsRef.current[draftKeyFor(language)] = starter;
        setCode(starter);
        applyEditorValue(starter);
        syncCode(starter);
    }

    // "Leave" for the candidate simply tears down local media and routes home.
    // Candidates never END the interview for both parties — only the interviewer can.
    const leaveRoom = useCallback(() => {
        try {
            screenStreamRef.current?.getTracks().forEach((track) => track.stop());
            screenPcRef.current?.close();
            peerConnectionRef.current?.close();
            localStreamRef.current?.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
        } catch {}
        router.push("/");
    }, [router]);

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
                    <h1 className="font-nunito text-2xl font-bold text-slate-900 dark:text-white">Could not open interview</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{error}</p>
                    <button type="button" onClick={reload} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition-colors hover:bg-blue-700">
                        Try again
                    </button>
                </section>
            </main>
        );
    }

    if (sessionEnded || status === "completed") {
        return (
            <div className="fixed inset-0 z-[100] grid place-items-center bg-[#FAFBFC] px-6 dark:bg-lc-bg">
                <div className="max-w-md space-y-6 text-center">
                    <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                        <span className="material-symbols-outlined text-5xl text-emerald-600 dark:text-emerald-400">task_alt</span>
                    </div>
                    <div>
                        <h1 className="font-nunito text-2xl font-bold text-slate-900 dark:text-white">Interview complete</h1>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Thanks for your time. The team is reviewing your interview and you&apos;ll be notified here when there&apos;s an update.</p>
                    </div>
                    <button type="button" onClick={() => router.push("/")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary/90">
                        <span className="material-symbols-outlined text-[18px]">event</span>
                        Go to my interviews
                    </button>
                    {sessionEnded && <p className="text-xs font-semibold text-slate-400">Redirecting you shortly…</p>}
                </div>
            </div>
        );
    }

    if (!admitted) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#FAFBFC] px-6 dark:bg-lc-bg">
                <div className="max-w-md space-y-6 text-center">
                    <button type="button" onClick={() => router.push("/")} className="mx-auto inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition-colors hover:text-primary dark:text-slate-300">
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                        Scheduled
                    </button>
                    <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/15">
                        <span className="material-symbols-outlined text-5xl text-green-600 dark:text-green-400">meeting_room</span>
                    </div>
                    <div>
                        <h1 className="font-nunito text-2xl font-bold text-slate-900 dark:text-white">Waiting for interviewer</h1>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {lobbyState?.message || "You are in the lobby. The interviewer will admit you when they are ready."}
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 dark:border-lc-border dark:bg-lc-surface">
                        <span className="material-symbols-outlined text-[18px] text-primary">timer</span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{formatDateTime(bootstrap?.scheduledAt)}</span>
                    </div>
                    {bootstrap?.candidateInstructions && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4 text-left text-sm leading-6 text-slate-600 dark:border-lc-border dark:bg-lc-surface dark:text-slate-300">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Instructions</p>
                            <p className="mt-2 whitespace-pre-line">{bootstrap.candidateInstructions}</p>
                        </div>
                    )}
                    <button type="button" disabled={joining} onClick={join} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:cursor-wait disabled:opacity-70">
                        <span className="material-symbols-outlined text-[18px]">sync</span>
                        {joining ? "Checking lobby..." : "Refresh lobby"}
                    </button>
                    {error && <p className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
                </div>
            </div>
        );
    }

    /* --------------------------------------------------------------- *
     * ADMITTED — Google-Meet-first room. The interviewer drives which
     * surface is live: `meet` (default) shows only the video stage;
     * `dsa`/`sql`/`design` reveal the IDE with a persistent video PiP.
     * No copilot data is ever rendered on the candidate side.
     * --------------------------------------------------------------- */

    const micButtonClass = (active: boolean, big: boolean) =>
        `flex ${big ? "size-12" : "size-7"} items-center justify-center rounded-full text-white shadow transition-all ${active ? "bg-red-500 hover:bg-red-600" : big ? "bg-white/15 hover:bg-white/25" : "bg-black/50 hover:bg-black/70"}`;

    const videoStage = (
        <div
            className={
                isMeet
                    ? "pointer-events-none absolute inset-0 flex items-center justify-center p-4 sm:p-8"
                    : "pointer-events-none absolute bottom-4 right-4 z-40 w-56 sm:w-72"
            }
        >
            <div
                className={`pointer-events-auto relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl ${isMeet ? "max-w-5xl" : ""}`}
            >
                <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    onClick={() => void remoteVideoRef.current?.play().catch(() => {})}
                    className="absolute inset-0 size-full cursor-pointer bg-slate-900 object-cover"
                />
                {!hasRemoteVideo && (
                    <div className="absolute inset-0 grid place-items-center bg-slate-900">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                            <div className="grid size-16 place-items-center rounded-full bg-white/10 text-xl font-bold text-white">{initials(bootstrap?.interviewer.name)}</div>
                            <p className="text-xs font-bold">Waiting for {bootstrap?.interviewer.name || "interviewer"} video</p>
                        </div>
                    </div>
                )}
                <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`absolute rounded-lg border-2 border-white/30 object-cover ${isMeet ? "bottom-4 right-4 h-24 w-40 sm:h-32 sm:w-52" : "bottom-2 right-2 h-[43px] w-[76px]"} ${isCameraOn ? "" : "hidden"}`}
                    style={{ transform: "scaleX(-1)" }}
                />
                {!isCameraOn && (
                    <div className={`absolute grid place-items-center rounded-lg border-2 border-white/20 bg-slate-800 text-slate-400 ${isMeet ? "bottom-4 right-4 h-24 w-40 sm:h-32 sm:w-52" : "bottom-2 right-2 h-[43px] w-[76px]"}`}>
                        <span className="material-symbols-outlined text-[20px]">videocam_off</span>
                    </div>
                )}

                {isMeet ? (
                    <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4">
                        <button type="button" onClick={() => setIsMuted((value) => !value)} className={micButtonClass(isMuted, true)} title={isMuted ? "Unmute" : "Mute"}>
                            <span className="material-symbols-outlined text-[22px] leading-none">{isMuted ? "mic_off" : "mic"}</span>
                        </button>
                        <button type="button" onClick={() => setIsCameraOn((value) => !value)} className={micButtonClass(!isCameraOn, true)} title={isCameraOn ? "Turn off camera" : "Turn on camera"}>
                            <span className="material-symbols-outlined text-[22px] leading-none">{isCameraOn ? "videocam" : "videocam_off"}</span>
                        </button>
                        <button type="button" onClick={leaveRoom} className="flex h-12 items-center gap-2 rounded-full bg-red-500 px-6 text-sm font-bold text-white shadow transition-all hover:bg-red-600" title="Leave the interview">
                            <span className="material-symbols-outlined text-[22px] leading-none">call_end</span>
                            Leave
                        </button>
                    </div>
                ) : (
                    <div className="absolute left-2 top-2 z-20 flex items-center gap-1.5">
                        <button type="button" onClick={() => setIsMuted((value) => !value)} className={micButtonClass(isMuted, false)} title={isMuted ? "Unmute" : "Mute"}>
                            <span className="material-symbols-outlined text-[13px] leading-none">{isMuted ? "mic_off" : "mic"}</span>
                        </button>
                        <button type="button" onClick={() => setIsCameraOn((value) => !value)} className={micButtonClass(!isCameraOn, false)} title={isCameraOn ? "Turn off camera" : "Turn on camera"}>
                            <span className="material-symbols-outlined text-[13px] leading-none">{isCameraOn ? "videocam" : "videocam_off"}</span>
                        </button>
                    </div>
                )}

                {mediaError && (
                    <div className="absolute inset-x-0 top-0 z-20 bg-red-600/90 px-3 py-1.5 text-center text-[11px] font-semibold text-white">{mediaError}</div>
                )}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#0b0f17] text-white">
            <header className="relative flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0f141d] px-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-4">
                    <div className="hidden min-w-0 sm:block">
                        <p className="truncate text-[13px] font-bold text-white">Interview with {bootstrap?.interviewer.name || "Interviewer"}</p>
                        <p className="truncate text-[11px] font-semibold text-slate-400">{SURFACE_LABEL[surface] || "Conversation"}</p>
                    </div>
                </div>

                {/* Running interview timer — centered, red, HH:MM:SS since admit. */}
                <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2">
                    <span className={`material-symbols-outlined text-[19px] ${admitted ? "text-red-500" : "text-slate-500"}`}>timer</span>
                    <span className={`font-mono text-[17px] font-black tabular-nums ${admitted ? "text-red-500" : "text-slate-500"}`}>{admitted ? formatElapsed(runningElapsed) : "00:00:00"}</span>
                    {admitted && <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-red-500" /></span>}
                </div>

                <div className="flex items-center gap-2">
                    {!isMuted && (
                        <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 sm:inline-flex" title="Your microphone is on and being transcribed for the interviewer">
                            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                            Mic on
                        </span>
                    )}
                    {screenSharing && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-[12px] font-bold text-blue-300">
                            <span className="size-1.5 animate-pulse rounded-full bg-blue-400" />
                            Sharing screen
                        </span>
                    )}
                    <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${connected ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-slate-300"}`}>
                        {connected ? "Connected" : "Connecting"}
                    </span>
                    <button type="button" onClick={leaveRoom} className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3.5 py-1.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-red-600" title="Leave the interview">
                        <span className="material-symbols-outlined text-[16px] leading-none">call_end</span>
                        Leave
                    </button>
                </div>
            </header>

            {error && <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300">{error}</div>}
            {!screenSharing && (screenRequestActive || screenError) && (
                <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                            <span className="material-symbols-outlined mt-0.5 text-[20px] text-amber-400">screen_share</span>
                            <div>
                                <p className="text-sm font-bold text-amber-300">Your interviewer asked you to share your entire screen</p>
                                <p className="text-xs font-semibold text-amber-300/70">Share your full screen (with audio) so the interviewer can proctor this round. Requires desktop Chrome or Edge.</p>
                                {screenError && <p className="mt-1 text-xs font-bold text-red-400">{screenError}</p>}
                            </div>
                        </div>
                        <button type="button" disabled={screenStarting} onClick={() => void startScreenShare()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-wait disabled:opacity-70">
                            <span className={`material-symbols-outlined text-[18px] ${screenStarting ? "animate-spin" : ""}`}>{screenStarting ? "progress_activity" : "screen_share"}</span>
                            {screenStarting ? "Starting…" : "Share screen"}
                        </button>
                    </div>
                </div>
            )}
            {screenSharing && systemAudioMissing && (
                <div className="shrink-0 border-b border-white/10 bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold text-slate-400">
                    Screen is shared. System audio isn&apos;t available on this OS/browser — your microphone is still on.
                </div>
            )}

            <main className="relative min-h-0 flex-1 overflow-hidden">
                {isMeet ? (
                    <div className="absolute inset-0 grid place-items-center">
                        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-center">
                            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">You are live with</p>
                            <p className="text-sm font-bold text-slate-200">{bootstrap?.interviewer.name || "your interviewer"}</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#FAFBFC] text-slate-900 dark:bg-lc-bg dark:text-white xl:flex-row">
                        <aside style={{ "--left-w": `${leftWidth}px` } as React.CSSProperties} className="flex w-full shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white dark:border-lc-border dark:bg-lc-surface xl:w-[var(--left-w)]">
                            <div className="flex items-center gap-1 border-b border-slate-100 px-4 dark:border-lc-border">
                                {(["problem", "instructions"] as const).map((tab) => (
                                    <button key={tab} type="button" onClick={() => setLeftTab(tab)} className={`mr-3 border-b-2 px-1 py-3 text-[13px] font-semibold capitalize transition-colors ${leftTab === tab ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
                                        {tab}
                                    </button>
                                ))}
                            </div>
                            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 text-[15px] leading-relaxed text-[#374151] dark:text-[#d1d5db]">
                                {leftTab === "problem" && (
                                    <div className="space-y-4">
                                        <div>
                                            <h2 className="text-[18px] font-bold leading-snug text-slate-900 dark:text-white">{questionDetails?.title || activeQuestion?.text || "Waiting for the interviewer to reveal a question"}</h2>
                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                {activeQuestion?.difficulty && <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${difficultyTagClass(activeQuestion.difficulty)}`}>{activeQuestion.difficulty}</span>}
                                                {activeQuestion?.setTitle && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">{activeQuestion.setTitle}</span>}
                                                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{SURFACE_LABEL[surface] || surface}</span>
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
                                                {surface !== "sql" && questionDetails.examples && questionDetails.examples.length > 0 && (
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
                                                {surface === "sql" && <SqlSchema examples={questionDetails.examples as any} />}
                                                {surface === "design" && <DesignExtras followUps={(questionDetails as any)?.designMeta?.followUpQuestions} hints={(questionDetails as any)?.hints} />}
                                            </>
                                        ) : (
                                            <div className="rounded-lg bg-[#F8FAFC] p-4 text-sm font-semibold text-slate-600 dark:bg-lc-bg dark:text-slate-300">Think out loud, explain tradeoffs, and submit when your solution is ready.</div>
                                        )}
                                    </div>
                                )}

                                {leftTab === "instructions" && (
                                    <div className="space-y-3">
                                        <div className="rounded-lg bg-[#F8FAFC] p-4 dark:bg-lc-bg">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Candidate instructions</p>
                                            <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{bootstrap?.candidateInstructions || "Follow the interviewer instructions during the session."}</p>
                                        </div>
                                        <div className="rounded-lg bg-[#F8FAFC] p-4 dark:bg-lc-bg">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Schedule</p>
                                            <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{formatDateTime(bootstrap?.scheduledAt)}</p>
                                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{bootstrap?.durationMinutes || 60} minutes</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </aside>

                        <DragHandle axis="x" className="hidden xl:flex" onDelta={(delta) => setLeftWidth((width) => clampSize(width + delta, 320, 760))} />

                        <section className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-slate-200 bg-white dark:border-lc-border dark:bg-lc-surface">
                            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-lc-border">
                                {surface === "dsa" ? (
                                    <select value={language} onChange={(event) => updateLanguage(event.target.value)} disabled={Boolean(sessionEnded)} className="rounded-xl border border-slate-200 bg-slate-100 px-2 py-1 text-[12px] font-bold text-slate-700 disabled:opacity-60 dark:border-lc-border dark:bg-lc-bg dark:text-white">
                                        {EDITOR_LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                ) : (
                                    <span className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1 text-[12px] font-bold uppercase text-slate-600 dark:border-lc-border dark:bg-lc-bg dark:text-slate-200">{surface === "sql" ? "SQL" : <><span className="material-symbols-outlined text-[15px]">design_services</span>System Design</>}</span>
                                )}
                                <div className="ml-auto flex items-center gap-2">
                                    {surface === "dsa" && (
                                        <button type="button" onClick={resetStarterCode} disabled={!hasStarterForLanguage(starterCodeByLanguage, language) || Boolean(sessionEnded)} className="flex items-center gap-1 text-[12px] font-semibold text-slate-500 transition-colors hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#ababab] dark:hover:text-white" title="Reset to starter code">
                                            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                                            <span>Reset</span>
                                        </button>
                                    )}
                                    {canRun && (
                                        <>
                                            <button type="button" disabled={!code.trim() || executionRunning || Boolean(sessionEnded)} onClick={() => executeCode({ questionId: activeQuestion?.id || null, language, code, mode: "run" })} className={`flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold shadow-sm transition-colors dark:border-lc-border ${executionRunning ? "cursor-not-allowed bg-slate-100 text-slate-400 opacity-50" : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-lc-surface dark:text-[#eff1f6] dark:hover:bg-lc-hover"}`}>
                                                <span className="material-symbols-outlined text-[18px]">{executionRunning ? "sync" : "play_arrow"}</span>
                                                {executionRunning ? "Running..." : "Run"}
                                            </button>
                                            <button type="button" disabled={!code.trim() || executionRunning || Boolean(sessionEnded)} onClick={() => executeCode({ questionId: activeQuestion?.id || null, language, code, mode: "submit" })} className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-bold text-white shadow-sm transition-colors ${executionRunning ? "cursor-not-allowed bg-emerald-400 opacity-50" : "bg-[#10b981] hover:bg-[#059669]"}`}>
                                                <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                                                Submit
                                            </button>
                                        </>
                                    )}
                                    {isDesign && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400"><span className="material-symbols-outlined text-[14px]">draw</span>Draw your architecture — the interviewer sees it live.</span>
                                    )}
                                </div>
                            </div>

                            <div className="min-h-0 flex-1">
                                {isDesign ? (
                                    <DesignBoard value={code} readOnly={false} onChange={handleDesignChange} theme="light" />
                                ) : (
                                    <MonacoEditor key={`${activeQuestion?.id || "question"}:${language}`} height="100%" language={monacoLanguage(language)} defaultValue={code} onMount={(editor) => { mainEditorRef.current = editor; if (code && editor.getValue() !== code) editor.setValue(code); }} onChange={(value) => updateCode(value || "")} theme="light" options={{ minimap: { enabled: false }, fontSize: 14, readOnly: Boolean(sessionEnded), wordWrap: "on", automaticLayout: true, scrollBeyondLastLine: false }} />
                                )}
                            </div>

                            {!isDesign && (
                                <>
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
                                                {surface === "sql" ? (
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
                                                                    <button key={testCase.id || `case_${index}`} type="button" onClick={() => setActiveTestCase(index)} className={`relative top-px flex items-center gap-1.5 border-b-2 pb-3 text-[14px] font-bold transition-colors ${activeTestCase === index ? "border-orange-500 text-orange-500" : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>
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
                                                ) : activeExecutionState?.result ? (
                                                    <div className="custom-scrollbar flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[13px] text-slate-800 dark:bg-[#1e1e1e] dark:text-[#d4d4d4]">
                                                        {formatExecutionOutput(activeExecutionState.result, activeTestCase)}
                                                    </div>
                                                ) : (
                                                    <div className="flex h-full flex-col items-center justify-center text-[13px] text-slate-400 dark:text-slate-500">
                                                        <span className="material-symbols-outlined mb-2 text-3xl opacity-50">data_object</span>
                                                        <p>Run your code to see the output.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </section>
                    </div>
                )}

                {videoStage}
            </main>

            <SpeechCapture
                enabled={admitted && !isMuted && !sessionEnded}
                onTranscript={(text, isFinal) => sendTranscript(text, isFinal, "interviewee")}
            />
        </div>
    );
}

export default function CandidateFinalInterviewRoomPage() {
    return <CandidateRoom />;
}
