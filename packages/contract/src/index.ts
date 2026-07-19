/**
 * @probe/contract — the single source of truth for the interview-room realtime protocol.
 *
 * Both the expert backend (Socket.IO server) and the two Next.js clients import these
 * types so the wire format cannot drift. All room events are namespaced `direct:`.
 * The room is keyed by `interviewId`.
 */

export const SOCKET_PATH = "/expert/socket.io";

export type Role = "interviewer" | "interviewee";
/** Shared surfaces the interviewer can open in the room. */
export type RoomSurface = "meet" | "dsa" | "sql" | "design";
export type InterviewRound = "dsa" | "sql" | "system_design";
export type InterviewStatus =
  | "scheduled"
  | "interviewer_joined"
  | "candidate_waiting"
  | "active"
  | "completed"
  | "cancelled"
  | "no_show";
export type Recommendation = "pending" | "hire" | "hold" | "reject";
export type ExecutionMode = "run" | "submit";
export type ExecutionPhase = "running" | "completed";
export type ScreenShareLiveState = "active" | "stopped";

/* ------------------------------------------------------------------ *
 * Domain payloads (server -> client)
 * ------------------------------------------------------------------ */

export type RoomQuestion = {
  id: string;
  questionId?: string | null;
  text: string;
  setTitle?: string | null;
  type?: string | null;
  source?: string | null;
  difficulty?: string | null;
  expectedTopics?: string[];
};

export type EditorState = {
  interviewId: string;
  roomSessionId: string;
  questionId: string | null;
  language: string;
  code: string;
  revision: number;
  updatedByUserId: string;
  updatedAt: string;
};

export type RoomParticipant = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl?: string | null;
  username?: string | null;
};

export type RoomBootstrap = {
  interviewId: string;
  roomSessionId: string;
  role: Role;
  status: InterviewStatus;
  scheduledAt: string | null;
  timezone: string | null;
  durationMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
  candidateAdmittedAt: string | null;
  candidateInstructions: string | null;
  interviewerNotes: string | null;
  activeQuestionId: string | null;
  activeQuestionIndex: number;
  editorState: EditorState | null;
  questions: RoomQuestion[];
  interviewee: RoomParticipant;
  interviewer: {
    memberId: string | null;
    name: string;
    email: string | null;
  };
  permissions: {
    canAdmitCandidate: boolean;
    canRunCode: boolean;
    canEditCode: boolean;
  };
  /** Rounds picked at scheduling time ('dsa' | 'sql' | 'system_design'). */
  rounds: string[];
  /** The surface currently shared with the room. */
  activeSurface: RoomSurface;
  /** Candidate resume metadata (interviewer only; null for the candidate). */
  resume: { fileName: string | null; uploadedAt: string | null } | null;
};

export type SurfaceState = {
  interviewId: string;
  surface: RoomSurface;
  updatedAt: string;
};

/* ------------------------------------------------------------------ *
 * Live transcript + conversational copilot insights.
 * Transcript entries flow from BOTH browsers (each side transcribes its own
 * mic locally); analysis output is interviewer-only.
 * ------------------------------------------------------------------ */

export type TranscriptEntry = {
  interviewId: string;
  speaker: Role;
  text: string;
  /** Interim results stream live; only finals enter conversation memory. */
  isFinal: boolean;
  at: string;
};

/** A completed-answer analysis card (interviewer-only). */
export type CopilotInsight = {
  id: string;
  interviewId: string;
  createdAt: string;
  kind: "answer" | "resume" | "code-mismatch";
  /** The question the answer responded to, as the copilot understood it. */
  question: string | null;
  /** Plain-language summary of what the candidate actually said. */
  summary: string;
  verdict: "correct" | "partially-correct" | "incorrect" | "evasive" | "unclear";
  /** Signs of confident bluffing / substance-free answering, when detected. */
  bluff: string | null;
  missingConcepts: string[];
  /** 0-100 answer quality. */
  score: number | null;
  confidence: "low" | "medium" | "high";
  followups: string[];
};

/** Structured resume analysis (interviewer-only). */
export type ResumeAnalysis = {
  interviewId: string;
  generatedAt: string;
  summary: string;
  skills: string[];
  technologies: string[];
  projects: { name: string; detail: string; askAbout: string[] }[];
  experience: { title: string; detail: string }[];
  education: string[];
  redFlags: string[];
  strongAreas: string[];
  recommendedQuestions: { question: string; reason: string; topic: string }[];
};

export type RoomState = Pick<
  RoomBootstrap,
  | "interviewId"
  | "roomSessionId"
  | "status"
  | "startedAt"
  | "endedAt"
  | "candidateAdmittedAt"
  | "activeQuestionId"
  | "activeQuestionIndex"
>;

export type LobbyRequest = {
  interviewId: string;
  candidate: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
};

/** The candidate's own view of their admission status (interviewee side). */
export type LobbyState = {
  interviewId: string;
  state: "waiting" | "admitted";
  message?: string;
};

export type TimerState = {
  interviewId: string;
  roomSessionId: string;
  elapsedSeconds: number;
  totalSeconds: number;
  syncedAt: string;
};

export type SessionEnded = {
  interviewId: string;
  roomSessionId: string;
  reason: string;
  endedAt: string;
};

/** One sample-test outcome when a run executes against the question's tests. */
export type ExecutionTestResult = {
  id: string;
  index: number;
  passed: boolean;
  status: string;
  stdin: string;
  expectedOutput: string;
  actualOutput: string | null;
  stderr: string | null;
  compileOutput: string | null;
  time: string | null;
};

/** A tabular query result (SQL round). */
export type ExecutionTable = { columns: string[]; rows: string[][] };

export type ExecutionResult = {
  statusId: number;
  status: string;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
  /** Present when the run executed against the question's sample tests. */
  tests?: ExecutionTestResult[] | null;
  passedCount?: number | null;
  totalCount?: number | null;
  /** SQL round: the query output and expected output as tables. */
  table?: ExecutionTable | null;
  expectedTable?: ExecutionTable | null;
};

export type ExecutionState = {
  interviewId: string;
  roomSessionId: string;
  phase: ExecutionPhase;
  mode: ExecutionMode;
  questionId: string | null;
  startedByUserId: string;
  startedByRole: Role;
  language: string;
  result?: ExecutionResult | null;
  executionError?: string | null;
  executionId?: string | null;
  updatedAt: string;
};

export type Evaluation = {
  id: string;
  score: number | null;
  recommendation: Recommendation;
  strengths: string[];
  concerns: string[];
  notes: string | null;
  updatedAt: string | null;
};

/* ------------------------------------------------------------------ *
 * Probe copilot — the assistive layer for the interviewer.
 * Copilot events are ONLY ever emitted to the interviewer; nothing here
 * reaches the candidate by design.
 * ------------------------------------------------------------------ */

/** One provable thing from the role pack. */
export type RubricItem = {
  key: string;
  title: string;
  description: string;
  /** What a weak answer/work sample looks like for this item. */
  weakSignal: string;
  /** What a strong answer/work sample looks like. */
  strongSignal: string;
};

export type InterviewRubric = {
  interviewId: string;
  roleTitle: string | null;
  jdText: string | null;
  items: RubricItem[];
  version: number;
  source: "generated" | "fallback" | "manual";
  updatedAt: string;
};

export type CopilotTrigger = "editor" | "execution" | "question" | "manual";

/** The "ASK THIS NEXT" card. Every field is grounded in the candidate's work. */
export type CopilotSuggestion = {
  id: string;
  interviewId: string;
  createdAt: string;
  questionId: string | null;
  trigger: CopilotTrigger;
  surface: "ide" | "runs" | "question";
  rubricKey: string | null;
  /** What the copilot observed in the work (never about the person). */
  observation: string;
  /** Exact excerpt (code lines / run output) the observation cites. */
  evidence: string;
  /** e.g. "lines 3-5" — where the evidence lives. */
  evidenceLines: string | null;
  /** The one follow-up question to ask next. */
  ask: string;
  confidence: "low" | "medium" | "high";
};

export type CopilotStatus = {
  interviewId: string;
  state: "idle" | "watching" | "thinking" | "error" | "disabled";
  detail?: string;
};

export type ScorecardVerdict = "strong" | "mixed" | "thin" | "unknown";

export type ScorecardItem = {
  key: string;
  title: string;
  verdict: ScorecardVerdict;
  /** Evidence strings, each citing a concrete artifact (code line, run, timestamp). */
  evidence: string[];
  note: string;
};

export type CopilotScorecard = {
  interviewId: string;
  summary: string;
  items: ScorecardItem[];
  generatedAt: string;
};

/* ------------------------------------------------------------------ *
 * WebRTC signaling payloads
 * ------------------------------------------------------------------ */

export type SignalOffer = { interviewId: string; sdp: string };
export type SignalAnswer = { interviewId: string; sdp: string };
export type SignalIce = { interviewId: string; candidate: string };
export type ScreenShareState = {
  interviewId: string;
  state: ScreenShareLiveState;
  hasSystemAudio: boolean;
};

/* ------------------------------------------------------------------ *
 * Ack envelope (for request/response emits)
 * ------------------------------------------------------------------ */

export type Ack<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error?: string; message?: string };

/* ------------------------------------------------------------------ *
 * Event maps — the frozen wire protocol.
 * ------------------------------------------------------------------ */

export interface ClientToServerEvents {
  "direct:join-session": (
    p: { interviewId: string },
    ack?: (r: Ack<RoomBootstrap>) => void
  ) => void;
  "direct:admit-candidate": (
    p: { interviewId: string },
    ack?: (r: Ack<RoomBootstrap>) => void
  ) => void;
  "direct:select-question": (
    p: { interviewId: string; questionId: string },
    ack?: (r: Ack) => void
  ) => void;
  "direct:editor-sync": (p: {
    interviewId: string;
    questionId?: string | null;
    language: string;
    code: string;
    revision?: number;
  }) => void;
  "direct:timer-sync": (p: {
    interviewId: string;
    elapsedSeconds: number;
    totalSeconds?: number;
  }) => void;
  "direct:end-session": (
    p: { interviewId: string; reason: string },
    ack?: (r: Ack) => void
  ) => void;
  "direct:code-execute": (
    p: {
      interviewId: string;
      mode?: ExecutionMode;
      questionId?: string | null;
      language: string;
      code: string;
      stdin?: string | null;
    },
    ack?: (r: Ack) => void
  ) => void;
  "direct:evaluation-save": (
    p: {
      interviewId: string;
      score?: number | null;
      recommendation: Recommendation;
      strengths?: string[];
      concerns?: string[];
      notes?: string | null;
    },
    ack?: (r: Ack<Evaluation>) => void
  ) => void;
  "direct:signal-offer": (p: SignalOffer) => void;
  "direct:signal-answer": (p: SignalAnswer) => void;
  "direct:signal-ice": (p: SignalIce) => void;
  "direct:request-screen-share": (p: { interviewId: string }) => void;
  "direct:screen-share-state": (p: ScreenShareState) => void;
  "direct:screen-offer": (p: SignalOffer) => void;
  "direct:screen-answer": (p: SignalAnswer) => void;
  "direct:screen-ice": (p: SignalIce) => void;
  /** Interviewer-only: force a copilot analysis pass right now. */
  "direct:copilot-analyze": (
    p: { interviewId: string },
    ack?: (r: Ack) => void
  ) => void;
  /** Interviewer-only: draft the evidence-linked scorecard. */
  "direct:copilot-scorecard": (
    p: { interviewId: string },
    ack?: (r: Ack<CopilotScorecard>) => void
  ) => void;
  /** Interviewer-only: switch the shared surface (meet | dsa | sql | design). */
  "direct:surface-change": (
    p: { interviewId: string; surface: RoomSurface },
    ack?: (r: Ack) => void
  ) => void;
  /** Both sides stream their own mic transcript into conversation memory. */
  "direct:transcript": (p: TranscriptEntry) => void;
  /** Interviewer marks the candidate's current answer complete → analyze it now. */
  "direct:analyze-answer": (p: { interviewId: string }, ack?: (r: Ack) => void) => void;
}

export interface ServerToClientEvents {
  "direct:bootstrap": (p: RoomBootstrap) => void;
  "direct:session-state": (p: RoomState) => void;
  "direct:lobby-request": (p: LobbyRequest) => void;
  "direct:lobby-state": (p: LobbyState) => void;
  "direct:editor-state": (p: EditorState) => void;
  "direct:timer-sync": (p: TimerState) => void;
  "direct:session-ended": (p: SessionEnded) => void;
  "direct:execution-sync": (p: ExecutionState) => void;
  "direct:evaluation-saved": (p: Evaluation) => void;
  "direct:signal-offer": (p: SignalOffer) => void;
  "direct:signal-answer": (p: SignalAnswer) => void;
  "direct:signal-ice": (p: SignalIce) => void;
  "direct:screen-share-requested": (p: { interviewId: string }) => void;
  "direct:screen-share-state": (p: ScreenShareState) => void;
  "direct:screen-offer": (p: SignalOffer) => void;
  "direct:screen-answer": (p: SignalAnswer) => void;
  "direct:screen-ice": (p: SignalIce) => void;
  /** Interviewer-only stream (delivered to the interviewer's user room). */
  "direct:copilot-suggestion": (p: CopilotSuggestion) => void;
  "direct:copilot-status": (p: CopilotStatus) => void;
  "direct:copilot-scorecard": (p: CopilotScorecard) => void;
  "direct:copilot-insight": (p: CopilotInsight) => void;
  "direct:resume-analysis": (p: ResumeAnalysis) => void;
  "direct:transcript-entry": (p: TranscriptEntry) => void;
  /** Broadcast to the whole room — both sides render the new surface. */
  "direct:surface-state": (p: SurfaceState) => void;
}

/** Room name helper — keep server + any tooling in agreement. */
export const roomName = (interviewId: string) => `interview:${interviewId}`;
export const userRoom = (userId: string) => `user:${userId}`;
export const lobbyName = (interviewId: string) => `lobby:${interviewId}`;
