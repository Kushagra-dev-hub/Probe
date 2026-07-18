/**
 * Minimal REST helper for the standalone rebuild. Question details + the interview
 * setup surface (list / create / edit) are served by the expert service.
 * Base URL = NEXT_PUBLIC_EXPERT_URL.
 */
function getBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_EXPERT_URL?.trim() || "http://localhost:3004";
  return configured.replace(/\/$/, "");
}

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, token),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, token, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, token, { method: "PATCH", body: JSON.stringify(body) }),
};

/* ------------------------------------------------------------------ *
 * Shared response shapes for the dashboards + create form.
 * ------------------------------------------------------------------ */

export type Me = {
  id: string;
  name: string;
  email: string | null;
  role: "interviewer" | "interviewee";
  avatarUrl: string | null;
  username: string | null;
};

export type InterviewSummary = {
  id: string;
  status: string;
  scheduledAt: string | null;
  timezone: string | null;
  durationMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
  interviewerNotes: string | null;
  candidateInstructions: string | null;
  interviewer: { id: string; name: string; email: string | null };
  interviewee: { id: string; name: string; email: string | null; avatarUrl: string | null };
  questions: { id: string; questionId: string | null; text: string; difficulty: string | null; order: number }[];
  questionCount: number;
  evaluation: { score: number | null; recommendation: string } | null;
};

export type InterviewListResponse = {
  role: "interviewer" | "interviewee";
  interviews: InterviewSummary[];
};

export type ResourcesResponse = {
  interviewees: { id: string; name: string; email: string | null; avatarUrl: string | null }[];
  questions: { id: string; title: string; difficulty: string | null; language: string | null }[];
};

/**
 * Readiness + join window (ports the reference `isReady` / `canJoinDirectInterview`):
 * joinable when it has a schedule + at least one question, and we're within a window
 * around `scheduledAt` (from 10 min before, up to the scheduled end).
 */
export function interviewReadiness(i: InterviewSummary, now = Date.now()) {
  const hasSchedule = Boolean(i.scheduledAt);
  const hasQuestion = i.questionCount > 0;
  const ready = hasSchedule && hasQuestion;
  const isTerminal = i.status === "completed" || i.status === "cancelled" || i.status === "no_show";

  let withinWindow = false;
  if (i.scheduledAt) {
    const start = new Date(i.scheduledAt).getTime();
    const openFrom = start - 10 * 60 * 1000;
    const openUntil = start + (i.durationMinutes + 30) * 60 * 1000;
    withinWindow = now >= openFrom && now <= openUntil;
  }

  return {
    ready,
    hasSchedule,
    hasQuestion,
    isTerminal,
    canJoin: ready && withinWindow && !isTerminal,
    reason: !hasSchedule
      ? "Schedule the interview first"
      : !hasQuestion
        ? "Add at least one question"
        : isTerminal
          ? "This interview has ended"
          : !withinWindow
            ? "Join opens 10 min before the start"
            : "",
  };
}
