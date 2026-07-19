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

/** Joinable anytime the interview has questions and hasn't ended (no time window). */
export function interviewReadiness(i: InterviewSummary, _now = Date.now()) {
  const hasSchedule = Boolean(i.scheduledAt);
  const hasQuestion = i.questionCount > 0;
  const isTerminal = i.status === "completed" || i.status === "cancelled" || i.status === "no_show";

  return {
    ready: hasQuestion,
    hasSchedule,
    hasQuestion,
    isTerminal,
    canJoin: hasQuestion && !isTerminal,
    reason: !hasQuestion ? "No questions attached yet" : isTerminal ? "This interview has ended" : "",
  };
}
