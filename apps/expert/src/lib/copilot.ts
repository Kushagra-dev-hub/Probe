/**
 * Probe copilot — the assistive layer that reads the candidate's actual work
 * (editor snapshots, run results, the active question) and tells the human
 * interviewer the one question to ask next, grounded in a role rubric.
 *
 * Design rules (from the pitch deck, enforced in prompts AND code):
 *  - Never a score on the candidate; observations are about the WORK.
 *  - Every suggestion cites the exact lines / run output it reacted to.
 *  - Suggestions go ONLY to the interviewer (their user room).
 *  - Every prompt is logged to room_events — an audit trail, not a black box.
 */
import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import { prisma } from "@probe/db";
import {
  userRoom,
  type CopilotInsight,
  type CopilotScorecard,
  type CopilotStatus,
  type CopilotSuggestion,
  type CopilotTrigger,
  type InterviewRubric,
  type ResumeAnalysis,
  type RubricItem,
  type ScorecardItem,
} from "@probe/contract";
import { generateJson, llmConfigured } from "./llm.js";

/* ------------------------------------------------------------------ *
 * Runtime state (in-memory, keyed by interviewId).
 * ------------------------------------------------------------------ */

type ExecutionNote = {
  at: string;
  mode: string;
  language: string;
  summary: string;
};

type QuestionContext = {
  id: string; // InterviewQuestion row id (what the room broadcasts)
  bankQuestionId: string | null;
  title: string;
  statement: string;
  constraints: string;
  difficulty: string | null;
};

type SpeechTurn = {
  speaker: "interviewer" | "interviewee";
  text: string;
  at: string;
};

type CopilotRuntime = {
  interviewId: string;
  interviewerId: string;
  candidateName: string;
  roomSessionId: string | null;
  rubric: InterviewRubric | null;
  question: QuestionContext | null;
  code: { code: string; language: string; questionId: string | null; updatedAt: string } | null;
  lastAnalyzedCode: string;
  executions: ExecutionNote[];
  suggestions: CopilotSuggestion[];
  debounce: NodeJS.Timeout | null;
  analyzing: boolean;
  lastAnalysisAt: number;
  /* --- conversational layer --- */
  /** Full finalized conversation, both speakers, oldest first. */
  conversation: SpeechTurn[];
  /** Candidate speech accumulated since the answer being built started. */
  pendingAnswer: SpeechTurn[];
  /** The interviewer's most recent utterance that looked like a question. */
  lastInterviewerQuestion: string | null;
  answerTimer: NodeJS.Timeout | null;
  analyzingAnswer: boolean;
  insights: CopilotInsight[];
  activeSurface: string;
  resumeSummary: string | null;
};

const EDITOR_DEBOUNCE_MS = 7_000;
const MIN_AUTO_INTERVAL_MS = 20_000;
const MIN_CODE_DELTA_CHARS = 25;
const MAX_SUGGESTIONS_KEPT = 20;
/** Endpointing: after this much silence we CONSIDER the answer possibly done… */
const ANSWER_SILENCE_MS = 4_500;
/** …but short answers wait longer, since thinking pauses are normal. */
const SHORT_ANSWER_EXTRA_MS = 3_500;
const MAX_CONVERSATION_KEPT = 400;

const runtimes = new Map<string, CopilotRuntime>();
let ioRef: Server | null = null;

export function initCopilot(io: Server) {
  ioRef = io;
}

function emitToInterviewer(runtime: CopilotRuntime, event: string, payload: unknown) {
  // Copilot output is interviewer-only by design — target their user room,
  // never the shared interview room.
  ioRef?.to(userRoom(runtime.interviewerId)).emit(event, payload);
}

function emitStatus(runtime: CopilotRuntime, state: CopilotStatus["state"], detail?: string) {
  emitToInterviewer(runtime, "direct:copilot-status", {
    interviewId: runtime.interviewId,
    state,
    detail,
  } satisfies CopilotStatus);
}

async function logRoomEvent(runtime: CopilotRuntime, eventType: string, payload: Record<string, unknown>) {
  if (!runtime.roomSessionId) return;
  await prisma.roomEvent
    .create({
      data: {
        roomSessionId: runtime.roomSessionId,
        actorRole: "copilot",
        eventType,
        payload: JSON.parse(JSON.stringify(payload)),
      },
    })
    .catch(() => {});
}

function serializeRubric(row: {
  interviewId: string;
  roleTitle: string | null;
  jdText: string | null;
  items: unknown;
  version: number;
  source: string;
  updatedAt: Date;
}): InterviewRubric {
  return {
    interviewId: row.interviewId,
    roleTitle: row.roleTitle,
    jdText: row.jdText,
    items: normalizeRubricItems(row.items),
    version: row.version,
    source: (row.source as InterviewRubric["source"]) || "generated",
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeRubricItems(raw: unknown): RubricItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const title = String(item.title ?? "").trim();
      if (!title) return null;
      return {
        key: String(item.key ?? `item_${index + 1}`).trim() || `item_${index + 1}`,
        title,
        description: String(item.description ?? "").trim(),
        weakSignal: String(item.weakSignal ?? item.weak_signal ?? item.weak ?? "").trim(),
        strongSignal: String(item.strongSignal ?? item.strong_signal ?? item.strong ?? "").trim(),
      } satisfies RubricItem;
    })
    .filter((item): item is RubricItem => item !== null)
    .slice(0, 10);
}

/** Deterministic fallback rubric so the copilot still works with no LLM key. */
function fallbackRubricItems(roleTitle: string | null): RubricItem[] {
  const role = roleTitle || "Software Engineer";
  return [
    {
      key: "correctness",
      title: "Working, verified solution",
      description: `Writes code that actually solves the problem and checks it against the sample tests before calling it done (${role}).`,
      weakSignal: "Declares the solution done without running it, or ignores failing cases.",
      strongSignal: "Runs the tests unprompted, walks through an edge case, fixes failures methodically.",
    },
    {
      key: "complexity",
      title: "Accurate complexity reasoning",
      description: "States the real time/space cost of their code and can defend it line by line.",
      weakSignal: "Names a complexity that doesn't match the written loops or data structures.",
      strongSignal: "Derives the cost from the actual code and knows which input sizes would break it.",
    },
    {
      key: "data_structures",
      title: "Right data structure for the job",
      description: "Chooses structures that make the operations cheap instead of forcing the first idea to work.",
      weakSignal: "Nested scans where a map/set would do; no justification for the choice.",
      strongSignal: "Names the trade-off explicitly and switches structure when the cost is wrong.",
    },
    {
      key: "edge_cases",
      title: "Edge-case thinking",
      description: "Probes empty inputs, duplicates, extremes, and overflow before being asked.",
      weakSignal: "Only handles the happy path shown in the example.",
      strongSignal: "Lists boundary cases up front and encodes them as checks or tests.",
    },
    {
      key: "communication",
      title: "Narrates the approach",
      description: "Explains the plan before typing and keeps the interviewer oriented while coding.",
      weakSignal: "Long silent stretches; the code appears without a stated plan.",
      strongSignal: "States the approach, estimates cost, and flags uncertainty honestly.",
    },
    {
      key: "debugging",
      title: "Systematic debugging",
      description: "When a run fails, isolates the cause instead of shotgun-editing.",
      weakSignal: "Random edits after a failure; re-runs hoping it passes.",
      strongSignal: "Reads the failing case, reasons about where the state diverges, fixes the cause.",
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Runtime bootstrap.
 * ------------------------------------------------------------------ */

async function loadQuestionContext(interviewId: string, questionRowId: string | null): Promise<QuestionContext | null> {
  if (!questionRowId) return null;
  const row = await prisma.interviewQuestion.findFirst({
    where: { id: questionRowId, interviewId },
    include: { bankQuestion: true },
  });
  if (!row) return null;
  const bank = row.bankQuestion;
  const constraints = bank?.constraints;
  return {
    id: row.id,
    bankQuestionId: row.questionId,
    title: bank?.title || row.text,
    statement: bank?.statement || bank?.description || row.text,
    constraints: Array.isArray(constraints) ? constraints.map(String).join("; ") : constraints ? String(constraints) : "",
    difficulty: bank?.difficulty || row.difficulty,
  };
}

export async function ensureCopilotRuntime(interviewId: string): Promise<CopilotRuntime | null> {
  const existing = runtimes.get(interviewId);
  if (existing) return existing;

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { interviewee: true, roomSession: true, rubric: true },
  });
  if (!interview) return null;

  const runtime: CopilotRuntime = {
    interviewId,
    interviewerId: interview.interviewerId,
    candidateName: interview.interviewee.name,
    roomSessionId: interview.roomSession?.id ?? null,
    rubric: interview.rubric ? serializeRubric(interview.rubric) : null,
    question: await loadQuestionContext(interviewId, interview.roomSession?.activeQuestionId ?? interview.activeQuestionId ?? null),
    code: null,
    lastAnalyzedCode: "",
    executions: [],
    suggestions: [],
    debounce: null,
    analyzing: false,
    lastAnalysisAt: 0,
    conversation: [],
    pendingAnswer: [],
    lastInterviewerQuestion: null,
    answerTimer: null,
    analyzingAnswer: false,
    insights: [],
    activeSurface: interview.roomSession?.activeSurface ?? "meet",
    resumeSummary: summarizeResumeAnalysis(interview.resumeAnalysis),
  };
  runtimes.set(interviewId, runtime);
  return runtime;
}

/** Compact one-paragraph resume digest for prompt context. */
function summarizeResumeAnalysis(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Partial<ResumeAnalysis> & { summary?: string };
  const bits: string[] = [];
  if (a.summary) bits.push(a.summary);
  if (Array.isArray(a.technologies) && a.technologies.length) bits.push(`Tech: ${a.technologies.slice(0, 12).join(", ")}`);
  if (Array.isArray(a.projects) && a.projects.length) bits.push(`Projects: ${a.projects.map((p) => p.name).slice(0, 6).join("; ")}`);
  if (Array.isArray(a.redFlags) && a.redFlags.length) bits.push(`Flagged: ${a.redFlags.slice(0, 4).join("; ")}`);
  return bits.length ? bits.join(" | ").slice(0, 1500) : null;
}

/* ------------------------------------------------------------------ *
 * Rubric generation (the "role pack").
 * ------------------------------------------------------------------ */

const RUBRIC_SYSTEM = `You build interview role packs for Probe, an interview copilot.
A role pack is 6-8 concrete things a strong hire can PROVE during a live coding interview.
Rules:
- Each item must be observable in a candidate's actual work (code, runs, explanations) — not personality traits.
- Each item gets a weak example and a strong example, one sentence each, concrete enough that a non-technical interviewer can match behaviour against them.
- Never include items about appearance, background, school, age, or culture fit.
Return STRICT JSON: {"items":[{"key":"snake_case_id","title":"...","description":"...","weakSignal":"...","strongSignal":"..."}]}`;

export async function generateRubric(input: {
  interviewId: string;
  roleTitle?: string | null;
  jdText?: string | null;
}): Promise<InterviewRubric> {
  const interview = await prisma.interview.findUnique({
    where: { id: input.interviewId },
    include: { questions: { orderBy: { order: "asc" } }, rubric: true },
  });
  if (!interview) throw new Error("Interview not found.");

  const roleTitle = (input.roleTitle ?? interview.rubric?.roleTitle ?? "").trim() || null;
  const jdText = (input.jdText ?? interview.rubric?.jdText ?? "").trim() || null;

  let items: RubricItem[] = [];
  let source: InterviewRubric["source"] = "generated";

  if (llmConfigured()) {
    try {
      const user = [
        `Role title: ${roleTitle || "Software Engineer (unspecified)"}`,
        jdText ? `Job description:\n${jdText.slice(0, 6000)}` : "Job description: (none provided — build a general strong-hire pack for the role title)",
        interview.questions.length
          ? `Planned interview questions: ${interview.questions.map((q) => `${q.text}${q.difficulty ? ` (${q.difficulty})` : ""}`).join("; ")}`
          : "",
        interview.interviewerNotes ? `Interviewer notes: ${interview.interviewerNotes.slice(0, 1500)}` : "",
        "Build the role pack now.",
      ]
        .filter(Boolean)
        .join("\n\n");
      const raw = (await generateJson({ system: RUBRIC_SYSTEM, user })) as { items?: unknown };
      items = normalizeRubricItems(raw?.items);
    } catch {
      items = [];
    }
  }
  if (items.length < 3) {
    items = fallbackRubricItems(roleTitle);
    source = "fallback";
  }

  const saved = await prisma.interviewRubric.upsert({
    where: { interviewId: input.interviewId },
    update: { roleTitle, jdText, items: items as object[], source, version: { increment: 1 } },
    create: { interviewId: input.interviewId, roleTitle, jdText, items: items as object[], source },
  });

  const rubric = serializeRubric(saved);
  const runtime = runtimes.get(input.interviewId);
  if (runtime) runtime.rubric = rubric;
  return rubric;
}

export async function getRubric(interviewId: string): Promise<InterviewRubric | null> {
  const row = await prisma.interviewRubric.findUnique({ where: { interviewId } });
  return row ? serializeRubric(row) : null;
}

/* ------------------------------------------------------------------ *
 * Signal intake from the room.
 * ------------------------------------------------------------------ */

export function noteEditorSync(interviewId: string, payload: { code: string; language: string; questionId: string | null }) {
  void ensureCopilotRuntime(interviewId).then((runtime) => {
    if (!runtime) return;
    runtime.code = { ...payload, updatedAt: new Date().toISOString() };
    if (runtime.debounce) clearTimeout(runtime.debounce);
    runtime.debounce = setTimeout(() => {
      runtime.debounce = null;
      void analyze(interviewId, "editor");
    }, EDITOR_DEBOUNCE_MS);
    emitStatus(runtime, "watching");
  });
}

export function noteExecution(
  interviewId: string,
  payload: {
    mode: string;
    language: string;
    questionId: string | null;
    result: { status: string; stdout: string | null; stderr: string | null; compileOutput: string | null; passedCount?: number | null; totalCount?: number | null; tests?: Array<{ id: string; passed: boolean; expectedOutput: string; actualOutput: string | null }> | null } | null;
    executionError: string | null;
    code?: string;
  }
) {
  void ensureCopilotRuntime(interviewId).then((runtime) => {
    if (!runtime) return;
    const r = payload.result;
    let summary: string;
    if (payload.executionError) {
      summary = `Execution error: ${payload.executionError}`;
    } else if (r && typeof r.passedCount === "number" && typeof r.totalCount === "number" && r.totalCount > 0) {
      const failing = (r.tests || [])
        .filter((t) => !t.passed)
        .slice(0, 3)
        .map((t) => `case ${t.id}: expected ${JSON.stringify(t.expectedOutput).slice(0, 120)}, got ${JSON.stringify(t.actualOutput ?? "").slice(0, 120)}`)
        .join(" | ");
      summary = `${payload.mode}: ${r.passedCount}/${r.totalCount} sample tests passed (${r.status}).${failing ? ` Failing → ${failing}` : ""}`;
    } else if (r) {
      const out = (r.stdout || r.stderr || r.compileOutput || "").trim().slice(0, 300);
      summary = `${payload.mode}: ${r.status}. Output: ${out || "(empty)"}`;
    } else {
      summary = `${payload.mode}: no result.`;
    }
    runtime.executions.push({ at: new Date().toISOString(), mode: payload.mode, language: payload.language, summary });
    if (runtime.executions.length > 6) runtime.executions.shift();
    if (payload.code) runtime.code = { code: payload.code, language: payload.language, questionId: payload.questionId, updatedAt: new Date().toISOString() };
    void analyze(interviewId, "execution");
  });
}

export function noteQuestionChange(interviewId: string, questionRowId: string | null) {
  void ensureCopilotRuntime(interviewId).then(async (runtime) => {
    if (!runtime) return;
    runtime.question = await loadQuestionContext(interviewId, questionRowId);
    runtime.lastAnalyzedCode = "";
    runtime.executions = [];
    emitStatus(runtime, "watching", runtime.question ? `Watching: ${runtime.question.title}` : undefined);
  });
}

/* ------------------------------------------------------------------ *
 * The live analysis pass → one "ASK THIS NEXT" card.
 * ------------------------------------------------------------------ */

const SUGGESTION_SYSTEM = `You are Probe, a copilot for the human INTERVIEWER in a live coding interview. You read the candidate's actual work and suggest the single best follow-up question to ask next.

ABSOLUTE RULES:
1. Ground everything in the provided work. Cite the exact line numbers and quote the exact snippet or run output you reacted to. Never invent code, results, or claims.
2. Suggest exactly ONE question, conversational, under 25 words, that the interviewer can say out loud verbatim.
3. Describe the WORK, never the person. Say "the nested loop at lines 3-4 is O(n^2)" — never "the candidate is weak". Flag what is ABSENT from the work (no edge-case handling, never ran the code) as an observation, not a judgement.
4. Tie the suggestion to the single most relevant rubric item via its key. Use null only when nothing fits.
5. If there is nothing genuinely worth asking right now (code barely changed, still boilerplate/starter code, or your last suggestion already covers it), return {"skip": true, "reason": "..."}.
6. Never propose revealing the solution or hints for the candidate. The card is for the interviewer's eyes only.
7. Do not repeat a question that is substantially the same as one of the recent suggestions listed.

Return STRICT JSON, one of:
{"skip": true, "reason": "..."}
or
{"skip": false, "surface": "ide"|"runs", "observation": "...", "evidence": "exact quoted snippet or output", "evidenceLines": "lines X-Y" or null, "ask": "...", "rubricKey": "..." or null, "confidence": "low"|"medium"|"high"}`;

function numberedCode(code: string): string {
  return code
    .split("\n")
    .map((line, index) => `${String(index + 1).padStart(3, " ")}| ${line}`)
    .join("\n");
}

export async function analyze(interviewId: string, trigger: CopilotTrigger): Promise<CopilotSuggestion | null> {
  const runtime = await ensureCopilotRuntime(interviewId);
  if (!runtime) return null;
  if (!llmConfigured()) {
    emitStatus(runtime, "disabled", "No LLM key configured — copilot is off.");
    return null;
  }
  if (runtime.analyzing) return null;

  const code = runtime.code?.code ?? "";
  const now = Date.now();
  if (trigger === "editor") {
    if (now - runtime.lastAnalysisAt < MIN_AUTO_INTERVAL_MS) return null;
    const delta = Math.abs(code.length - runtime.lastAnalyzedCode.length);
    if (code === runtime.lastAnalyzedCode || (delta < MIN_CODE_DELTA_CHARS && runtime.lastAnalyzedCode)) return null;
  }
  if (!code.trim() && runtime.executions.length === 0) return null;

  runtime.analyzing = true;
  runtime.lastAnalysisAt = now;
  emitStatus(runtime, "thinking");

  try {
    const rubric = runtime.rubric ?? (await getRubric(interviewId));
    if (rubric) runtime.rubric = rubric;

    const recent = runtime.suggestions.slice(-4).map((s) => `- ${s.ask}`);
    const user = [
      rubric
        ? `ROLE RUBRIC (${rubric.roleTitle || "unspecified role"}):\n${rubric.items.map((i) => `- [${i.key}] ${i.title}: ${i.description} Weak: ${i.weakSignal} Strong: ${i.strongSignal}`).join("\n")}`
        : "ROLE RUBRIC: (none — use general strong-engineer expectations)",
      runtime.question
        ? `ACTIVE QUESTION: ${runtime.question.title}${runtime.question.difficulty ? ` (${runtime.question.difficulty})` : ""}\n${runtime.question.statement.slice(0, 2000)}${runtime.question.constraints ? `\nConstraints: ${runtime.question.constraints}` : ""}`
        : "ACTIVE QUESTION: (not shared yet)",
      code.trim()
        ? `CANDIDATE'S CURRENT CODE (${runtime.code?.language || "unknown"}, live in the editor, line-numbered):\n${numberedCode(code).slice(0, 6000)}`
        : "CANDIDATE'S CURRENT CODE: (editor is empty)",
      runtime.executions.length
        ? `RECENT RUNS (newest last):\n${runtime.executions.map((e) => `- [${e.at}] ${e.summary}`).join("\n")}`
        : "RECENT RUNS: none — the candidate has not run the code yet.",
      recent.length ? `RECENT SUGGESTIONS ALREADY SHOWN (do not repeat):\n${recent.join("\n")}` : "",
      `TRIGGER: ${trigger === "execution" ? "the candidate just ran the code" : trigger === "manual" ? "the interviewer asked for a suggestion now" : "the candidate paused typing"}`,
      "Produce the JSON now.",
    ]
      .filter(Boolean)
      .join("\n\n");

    // Generous cap: reasoning models spend output tokens on hidden thinking
    // before the JSON appears.
    const raw = (await generateJson({ system: SUGGESTION_SYSTEM, user, maxOutputTokens: 4096 })) as Record<string, unknown>;

    await logRoomEvent(runtime, "copilot_analysis", {
      trigger,
      codeChars: code.length,
      skip: Boolean(raw?.skip),
      reason: raw?.reason ?? null,
    });

    if (!raw || raw.skip) {
      runtime.lastAnalyzedCode = code;
      emitStatus(runtime, "watching", typeof raw?.reason === "string" ? raw.reason : undefined);
      return null;
    }

    const suggestion: CopilotSuggestion = {
      id: randomUUID(),
      interviewId,
      createdAt: new Date().toISOString(),
      questionId: runtime.question?.id ?? runtime.code?.questionId ?? null,
      trigger,
      surface: raw.surface === "runs" ? "runs" : "ide",
      rubricKey: typeof raw.rubricKey === "string" && raw.rubricKey ? raw.rubricKey : null,
      observation: String(raw.observation ?? "").trim(),
      evidence: String(raw.evidence ?? "").trim(),
      evidenceLines: typeof raw.evidenceLines === "string" && raw.evidenceLines ? raw.evidenceLines : null,
      ask: String(raw.ask ?? "").trim(),
      confidence: raw.confidence === "high" ? "high" : raw.confidence === "low" ? "low" : "medium",
    };
    if (!suggestion.ask || !suggestion.observation) {
      runtime.lastAnalyzedCode = code;
      emitStatus(runtime, "watching");
      return null;
    }

    runtime.lastAnalyzedCode = code;
    runtime.suggestions.push(suggestion);
    if (runtime.suggestions.length > MAX_SUGGESTIONS_KEPT) runtime.suggestions.shift();

    await logRoomEvent(runtime, "copilot_suggestion", suggestion as unknown as Record<string, unknown>);
    emitToInterviewer(runtime, "direct:copilot-suggestion", suggestion);
    emitStatus(runtime, "watching");
    return suggestion;
  } catch (err) {
    emitStatus(runtime, "error", err instanceof Error ? err.message.slice(0, 200) : "Copilot analysis failed.");
    return null;
  } finally {
    runtime.analyzing = false;
  }
}

/* ------------------------------------------------------------------ *
 * The evidence-linked scorecard (session end / on demand).
 * ------------------------------------------------------------------ */

const SCORECARD_SYSTEM = `You draft an evidence-linked interview scorecard for Probe. The reader is the human interviewer; the scorecard is a DRAFT they will review — you never make the hiring decision.

ABSOLUTE RULES:
1. One row per rubric item, in the given order, reusing the item's key and title.
2. verdict is about the WORK observed: "strong" (clear strong signal in the work), "mixed" (some signal, some gaps), "thin" (weak signal or contradicted by the work), "unknown" (this item was never exercised in the session — say so, do NOT guess).
3. Every "strong"/"mixed"/"thin" verdict needs at least one evidence string citing a concrete artifact: a quoted code snippet with its line numbers, a run result, or an observation timestamp. "unknown" gets an empty evidence array and a note saying it was never probed.
4. Do not invent positives or negatives. If the session log doesn't show it, it's unknown.
5. Describe work, never the person. No adjectives about the candidate.
6. summary: 2-3 sentences a hiring manager can read, strictly derived from the rows.

Return STRICT JSON: {"summary":"...","items":[{"key":"...","title":"...","verdict":"strong"|"mixed"|"thin"|"unknown","evidence":["..."],"note":"..."}]}`;

export async function generateScorecard(interviewId: string): Promise<CopilotScorecard> {
  const runtime = await ensureCopilotRuntime(interviewId);
  if (!runtime) throw new Error("Interview not found.");
  const rubric = runtime.rubric ?? (await getRubric(interviewId));
  const items = rubric?.items?.length ? rubric.items : fallbackRubricItems(rubric?.roleTitle ?? null);

  // Gather the session log: code snapshot timeline + suggestion history + runs.
  // Suggestions survive server restarts via the room_events audit log.
  const suggestions = runtime.suggestions.length ? runtime.suggestions : await getRecentSuggestions(interviewId);
  const snapshots = runtime.roomSessionId
    ? await prisma.roomCodeSnapshot.findMany({
        where: { roomSessionId: runtime.roomSessionId },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const firstSnapshot = snapshots[0] ?? null;
  const lastSnapshot = snapshots[snapshots.length - 1] ?? null;

  let scorecard: CopilotScorecard | null = null;
  if (llmConfigured()) {
    try {
      const user = [
        `RUBRIC (${rubric?.roleTitle || "unspecified role"}):\n${items.map((i) => `- [${i.key}] ${i.title}: ${i.description} Weak: ${i.weakSignal} Strong: ${i.strongSignal}`).join("\n")}`,
        runtime.question ? `QUESTION WORKED ON: ${runtime.question.title}\n${runtime.question.statement.slice(0, 1200)}` : "QUESTION WORKED ON: unknown",
        lastSnapshot
          ? `FINAL CODE (${lastSnapshot.language}, saved ${lastSnapshot.updatedAt.toISOString()}, line-numbered):\n${numberedCode(lastSnapshot.code).slice(0, 6000)}`
          : "FINAL CODE: none captured",
        firstSnapshot && lastSnapshot && firstSnapshot.id !== lastSnapshot.id
          ? `CODE TIMELINE: ${snapshots.length} snapshots between ${firstSnapshot.createdAt.toISOString()} and ${lastSnapshot.updatedAt.toISOString()}.`
          : "",
        runtime.executions.length
          ? `RUN HISTORY:\n${runtime.executions.map((e) => `- [${e.at}] ${e.summary}`).join("\n")}`
          : "RUN HISTORY: the candidate never ran the code in this session.",
        suggestions.length
          ? `COPILOT OBSERVATIONS DURING THE SESSION:\n${suggestions.map((s) => `- [${s.createdAt}] ${s.observation} (evidence: ${s.evidence}${s.evidenceLines ? `, ${s.evidenceLines}` : ""})`).join("\n")}`
          : "COPILOT OBSERVATIONS DURING THE SESSION: none recorded.",
        "Draft the scorecard now.",
      ]
        .filter(Boolean)
        .join("\n\n");

      const raw = (await generateJson({ system: SCORECARD_SYSTEM, user, maxOutputTokens: 8192 })) as {
        summary?: unknown;
        items?: unknown;
      };
      const rows: ScorecardItem[] = Array.isArray(raw?.items)
        ? (raw.items as Array<Record<string, unknown>>)
            .map((row) => ({
              key: String(row.key ?? "").trim(),
              title: String(row.title ?? "").trim(),
              verdict: (["strong", "mixed", "thin", "unknown"].includes(String(row.verdict)) ? String(row.verdict) : "unknown") as ScorecardItem["verdict"],
              evidence: Array.isArray(row.evidence) ? row.evidence.map(String).slice(0, 5) : [],
              note: String(row.note ?? "").trim(),
            }))
            .filter((row) => row.key && row.title)
        : [];
      if (rows.length) {
        scorecard = {
          interviewId,
          summary: String(raw?.summary ?? "").trim(),
          items: rows,
          generatedAt: new Date().toISOString(),
        };
      }
    } catch {
      scorecard = null;
    }
  }

  if (!scorecard) {
    // Deterministic fallback: everything is unknown except what runs prove.
    const ran = runtime.executions.length > 0;
    scorecard = {
      interviewId,
      summary: ran
        ? "Automatic draft (no LLM available): run history captured; review each row manually."
        : "Automatic draft (no LLM available): no runs captured; the session log is too thin to score.",
      items: items.map((item) => ({
        key: item.key,
        title: item.title,
        verdict: "unknown" as const,
        evidence: item.key === "correctness" && ran ? runtime.executions.map((e) => e.summary).slice(0, 3) : [],
        note: "Not scored automatically — review the session recording/notes.",
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  await prisma.copilotScorecard.upsert({
    where: { interviewId },
    update: { summary: scorecard.summary, items: scorecard.items as object[], generatedAt: new Date(scorecard.generatedAt) },
    create: { interviewId, summary: scorecard.summary, items: scorecard.items as object[], generatedAt: new Date(scorecard.generatedAt) },
  });
  await logRoomEvent(runtime, "copilot_scorecard", { itemCount: scorecard.items.length });

  emitToInterviewer(runtime, "direct:copilot-scorecard", scorecard);
  return scorecard;
}

export async function getScorecard(interviewId: string): Promise<CopilotScorecard | null> {
  const row = await prisma.copilotScorecard.findUnique({ where: { interviewId } });
  if (!row) return null;
  return {
    interviewId,
    summary: row.summary ?? "",
    items: (Array.isArray(row.items) ? row.items : []) as ScorecardItem[],
    generatedAt: row.generatedAt.toISOString(),
  };
}

/** Recent suggestions for room (re)join hydration — interviewer only. */
export async function getRecentSuggestions(interviewId: string): Promise<CopilotSuggestion[]> {
  const runtime = runtimes.get(interviewId);
  if (runtime?.suggestions.length) return runtime.suggestions.slice(-10);
  // Fall back to the audit log so a reloaded interviewer still sees history.
  const session = await prisma.roomSession.findUnique({ where: { interviewId } });
  if (!session) return [];
  const events = await prisma.roomEvent.findMany({
    where: { roomSessionId: session.id, eventType: "copilot_suggestion" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return events
    .map((e) => e.payload as unknown as CopilotSuggestion)
    .filter((s) => s && typeof s === "object" && typeof s.ask === "string")
    .reverse();
}

/* ------------------------------------------------------------------ *
 * Surface awareness — the copilot always knows which workspace is live.
 * ------------------------------------------------------------------ */

export function noteSurfaceChange(interviewId: string, surface: string) {
  void ensureCopilotRuntime(interviewId).then((runtime) => {
    if (!runtime) return;
    runtime.activeSurface = surface;
    runtime.conversation.push({
      speaker: "interviewer",
      text: `[event] The interviewer opened the ${surface === "meet" ? "video meeting" : surface.toUpperCase()} workspace.`,
      at: new Date().toISOString(),
    });
  });
}

/* ------------------------------------------------------------------ *
 * Conversation memory + answer endpointing.
 *
 * Both browsers stream FINALIZED utterances here. Interviewer speech becomes
 * "the current question"; candidate speech accumulates into a pending answer.
 * The answer is only analyzed once we're confident it's complete: a silence
 * window (longer for short answers, since thinking pauses are normal) OR the
 * interviewer speaking again (the natural end of an answer).
 * ------------------------------------------------------------------ */

const QUESTION_HINT = /\?|^(what|why|how|walk|can you|could you|tell me|explain|describe|suppose|imagine|let's|lets|now)\b/i;

export function noteTranscript(interviewId: string, entry: { speaker: "interviewer" | "interviewee"; text: string; at: string }) {
  void ensureCopilotRuntime(interviewId).then((runtime) => {
    if (!runtime) return;
    runtime.conversation.push(entry);
    if (runtime.conversation.length > MAX_CONVERSATION_KEPT) runtime.conversation.shift();
    void logRoomEvent(runtime, "transcript", entry as unknown as Record<string, unknown>);

    if (entry.speaker === "interviewer") {
      // Interviewer talking closes out the candidate's pending answer.
      if (runtime.pendingAnswer.length > 0) finalizeAnswer(runtime, "interviewer-spoke");
      if (QUESTION_HINT.test(entry.text) || entry.text.split(/\s+/).length >= 6) {
        runtime.lastInterviewerQuestion = entry.text;
      }
      return;
    }

    // Candidate speech: extend the pending answer and re-arm the endpoint timer.
    runtime.pendingAnswer.push(entry);
    if (runtime.answerTimer) clearTimeout(runtime.answerTimer);
    const words = runtime.pendingAnswer.reduce((n, t) => n + t.text.split(/\s+/).length, 0);
    const wait = ANSWER_SILENCE_MS + (words < 25 ? SHORT_ANSWER_EXTRA_MS : 0);
    runtime.answerTimer = setTimeout(() => {
      runtime.answerTimer = null;
      finalizeAnswer(runtime, "silence");
    }, wait);
  });
}

function finalizeAnswer(runtime: CopilotRuntime, reason: "silence" | "interviewer-spoke") {
  if (runtime.answerTimer) {
    clearTimeout(runtime.answerTimer);
    runtime.answerTimer = null;
  }
  const answer = runtime.pendingAnswer
    .map((t) => t.text)
    .join(" ")
    .trim();
  runtime.pendingAnswer = [];
  // Too short to be an answer worth analyzing (acknowledgements, "yes", fillers).
  if (!answer || answer.split(/\s+/).length < 8) return;
  void analyzeCompletedAnswer(runtime, answer, reason).catch(() => {});
}

const INSIGHT_SYSTEM = `You are Probe, a live copilot for the human INTERVIEWER in a technical interview. A candidate just finished (or paused for a long time during) a spoken answer. You must analyze that answer for the interviewer.

ABSOLUTE RULES:
1. Ground everything in what was actually said, the question asked, the candidate's code, and run results. Never invent claims.
2. Judge the ANSWER, not the person. "The answer never mentions indexing" — never "the candidate is weak".
3. Detect confident-but-empty answering: fluent talk with no specifics, no numbers, buzzword chains, or claims contradicted by their own code/runs. If detected, describe the exact tell in "bluff"; else null.
4. If the transcript fragment seems INCOMPLETE (cut off mid-thought, or it's clearly a pause while thinking), return {"incomplete": true} and nothing else — do NOT analyze half an answer.
5. followups: 2-4 short questions the interviewer can ask verbatim, ordered best-first, that dig into THIS answer (cross-questions, missing concepts, deeper probes).
6. Keep summary under 40 words, in plain language a non-technical recruiter understands.

Return STRICT JSON:
{"incomplete": false, "question": "the question this answered, short" | null, "summary": "...", "verdict": "correct"|"partially-correct"|"incorrect"|"evasive"|"unclear", "bluff": "..." | null, "missingConcepts": ["..."], "score": 0-100, "confidence": "low"|"medium"|"high", "followups": ["..."]}`;

async function analyzeCompletedAnswer(runtime: CopilotRuntime, answer: string, reason: string) {
  if (!llmConfigured() || runtime.analyzingAnswer) return;
  runtime.analyzingAnswer = true;
  emitStatus(runtime, "thinking", "Analyzing the candidate's answer…");
  try {
    const recentConversation = runtime.conversation
      .slice(-24)
      .map((t) => `${t.speaker === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${t.text}`)
      .join("\n");
    const user = [
      runtime.rubric
        ? `ROLE: ${runtime.rubric.roleTitle || "Software Engineer"}. Rubric focus areas: ${runtime.rubric.items.map((i) => i.title).join("; ")}`
        : "",
      runtime.resumeSummary ? `RESUME DIGEST: ${runtime.resumeSummary}` : "",
      runtime.question ? `ACTIVE ${runtime.activeSurface.toUpperCase()} QUESTION: ${runtime.question.title}\n${runtime.question.statement.slice(0, 900)}` : "",
      runtime.code?.code?.trim() ? `CANDIDATE'S CURRENT CODE (${runtime.code.language}):\n${runtime.code.code.slice(0, 3000)}` : "",
      runtime.executions.length ? `RECENT RUNS:\n${runtime.executions.map((e) => `- ${e.summary}`).join("\n")}` : "",
      `RECENT CONVERSATION:\n${recentConversation}`,
      `QUESTION BEING ANSWERED (best guess): ${runtime.lastInterviewerQuestion || "(unknown — infer from conversation)"}`,
      `THE COMPLETED ANSWER (ended by ${reason === "silence" ? "a long pause" : "the interviewer speaking"}):\n"""${answer.slice(0, 3000)}"""`,
      "Analyze now.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const raw = (await generateJson({ system: INSIGHT_SYSTEM, user, maxOutputTokens: 4096 })) as Record<string, unknown>;
    if (!raw || raw.incomplete) {
      // Not actually finished — put the words back so the next segment continues it.
      runtime.pendingAnswer.unshift({ speaker: "interviewee", text: answer, at: new Date().toISOString() });
      emitStatus(runtime, "watching");
      return;
    }

    const insight: CopilotInsight = {
      id: randomUUID(),
      interviewId: runtime.interviewId,
      createdAt: new Date().toISOString(),
      kind: "answer",
      question: typeof raw.question === "string" ? raw.question : runtime.lastInterviewerQuestion,
      summary: String(raw.summary ?? "").trim(),
      verdict: (["correct", "partially-correct", "incorrect", "evasive", "unclear"].includes(String(raw.verdict))
        ? String(raw.verdict)
        : "unclear") as CopilotInsight["verdict"],
      bluff: typeof raw.bluff === "string" && raw.bluff.trim() ? raw.bluff.trim() : null,
      missingConcepts: Array.isArray(raw.missingConcepts) ? raw.missingConcepts.map(String).slice(0, 6) : [],
      score: typeof raw.score === "number" ? Math.max(0, Math.min(100, Math.round(raw.score))) : null,
      confidence: raw.confidence === "high" ? "high" : raw.confidence === "low" ? "low" : "medium",
      followups: Array.isArray(raw.followups) ? raw.followups.map(String).slice(0, 4) : [],
    };
    if (!insight.summary) {
      emitStatus(runtime, "watching");
      return;
    }
    runtime.insights.push(insight);
    if (runtime.insights.length > 30) runtime.insights.shift();
    await logRoomEvent(runtime, "copilot_insight", insight as unknown as Record<string, unknown>);
    emitToInterviewer(runtime, "direct:copilot-insight", insight);
    emitStatus(runtime, "watching");
  } catch (err) {
    emitStatus(runtime, "error", err instanceof Error ? err.message.slice(0, 200) : "Answer analysis failed.");
  } finally {
    runtime.analyzingAnswer = false;
  }
}

/* ------------------------------------------------------------------ *
 * Resume analysis — practers' resume-analysis prompt adapted for the
 * interviewer copilot. Runs automatically when the candidate uploads.
 * ------------------------------------------------------------------ */

const RESUME_SYSTEM = `You are an expert technical recruiter and resume analyst working inside Probe, an interview copilot. Analyze the resume text and extract structured information for the INTERVIEWER preparing to interview this candidate.
Be thorough and accurate:
- Extract ALL skills, technologies, experiences, and projects mentioned.
- Identify red flags like vague descriptions, missing details, or likely exaggerations worth probing (do NOT judge employment dates as outdated — you don't know today's date).
- Identify genuinely strong areas worth digging into.
- Generate 6-10 tailored interview questions grounded in SPECIFIC resume items (project names, technologies, claims) — each with the reason it's worth asking and its topic.
Return STRICT JSON:
{"summary":"2-3 sentence candidate overview","skills":["..."],"technologies":["..."],"projects":[{"name":"...","detail":"...","askAbout":["..."]}],"experience":[{"title":"...","detail":"..."}],"education":["..."],"redFlags":["..."],"strongAreas":["..."],"recommendedQuestions":[{"question":"...","reason":"...","topic":"..."}]}`;

export async function analyzeResume(interviewId: string): Promise<ResumeAnalysis | null> {
  const runtime = await ensureCopilotRuntime(interviewId);
  if (!runtime) return null;
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { resumeText: true, roleTitle: true, companyName: true, experienceLevel: true },
  });
  if (!interview?.resumeText) return null;
  if (!llmConfigured()) return null;

  emitStatus(runtime, "thinking", "Reading the candidate's resume…");
  const user = [
    `ROLE BEING HIRED FOR: ${interview.roleTitle || "Software Engineer"}${interview.companyName ? ` at ${interview.companyName}` : ""}${interview.experienceLevel ? ` (${interview.experienceLevel})` : ""}`,
    runtime.rubric ? `RUBRIC FOCUS: ${runtime.rubric.items.map((i) => i.title).join("; ")}` : "",
    `RESUME TEXT:\n"""${interview.resumeText.slice(0, 20000)}"""`,
    "Analyze now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = (await generateJson({ system: RESUME_SYSTEM, user, maxOutputTokens: 8192 })) as Record<string, unknown>;
  const analysis: ResumeAnalysis = {
    interviewId,
    generatedAt: new Date().toISOString(),
    summary: String(raw.summary ?? "").trim(),
    skills: Array.isArray(raw.skills) ? raw.skills.map(String).slice(0, 30) : [],
    technologies: Array.isArray(raw.technologies) ? raw.technologies.map(String).slice(0, 30) : [],
    projects: Array.isArray(raw.projects)
      ? (raw.projects as Array<Record<string, unknown>>).map((p) => ({
          name: String(p.name ?? ""),
          detail: String(p.detail ?? ""),
          askAbout: Array.isArray(p.askAbout) ? p.askAbout.map(String).slice(0, 5) : [],
        }))
      : [],
    experience: Array.isArray(raw.experience)
      ? (raw.experience as Array<Record<string, unknown>>).map((e) => ({ title: String(e.title ?? ""), detail: String(e.detail ?? "") }))
      : [],
    education: Array.isArray(raw.education) ? raw.education.map(String) : [],
    redFlags: Array.isArray(raw.redFlags) ? raw.redFlags.map(String).slice(0, 8) : [],
    strongAreas: Array.isArray(raw.strongAreas) ? raw.strongAreas.map(String).slice(0, 8) : [],
    recommendedQuestions: Array.isArray(raw.recommendedQuestions)
      ? (raw.recommendedQuestions as Array<Record<string, unknown>>).map((q) => ({
          question: String(q.question ?? ""),
          reason: String(q.reason ?? ""),
          topic: String(q.topic ?? ""),
        }))
      : [],
  };

  await prisma.interview.update({
    where: { id: interviewId },
    data: { resumeAnalysis: JSON.parse(JSON.stringify(analysis)) },
  });
  runtime.resumeSummary = summarizeResumeAnalysis(analysis);
  await logRoomEvent(runtime, "copilot_resume_analysis", { questionCount: analysis.recommendedQuestions.length });
  emitToInterviewer(runtime, "direct:resume-analysis", analysis);
  emitStatus(runtime, "watching");
  return analysis;
}

/** Insight history for interviewer room hydration. */
export function getRecentInsights(interviewId: string): CopilotInsight[] {
  return runtimes.get(interviewId)?.insights.slice(-15) ?? [];
}
