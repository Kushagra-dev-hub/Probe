/**
 * @probe/contract — the single source of truth for the interview-room realtime protocol.
 *
 * Both the expert backend (Socket.IO server) and the two Next.js clients import these
 * types so the wire format cannot drift. All room events are namespaced `direct:`.
 * The room is keyed by `interviewId`.
 */

export const SOCKET_PATH = "/expert/socket.io";

export type Role = "interviewer" | "interviewee";
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

export type ExecutionResult = {
  statusId: number;
  status: string;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
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
}

/** Room name helper — keep server + any tooling in agreement. */
export const roomName = (interviewId: string) => `interview:${interviewId}`;
export const userRoom = (userId: string) => `user:${userId}`;
export const lobbyName = (interviewId: string) => `lobby:${interviewId}`;
