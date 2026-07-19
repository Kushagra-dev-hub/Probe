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
      // Only advertise a JSON body when one is actually sent — Fastify rejects a
      // Content-Type of application/json with an empty body (e.g. DELETE requests).
      ...(init?.body != null ? { "Content-Type": "application/json" } : {}),
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
  del: <T>(path: string, token?: string) => request<T>(path, token, { method: "DELETE" }),
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

export type InterviewRound = "dsa" | "sql" | "design";

export type InterviewSummary = {
  id: string;
  status: string;
  scheduledAt: string | null;
  timezone: string | null;
  durationMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
  rounds: InterviewRound[];
  shareToken: string;
  companyName: string | null;
  roleTitle: string | null;
  experienceLevel: string | null;
  resume: { fileName: string; uploadedAt: string } | null;
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

export type InterviewReport = {
  interview: {
    id: string;
    status: string;
    scheduledAt: string | null;
    durationMinutes: number;
    startedAt: string | null;
    endedAt: string | null;
    rounds: InterviewRound[];
    roleTitle: string | null;
    companyName: string | null;
    interviewer: { id: string; name: string; email: string | null };
    interviewee: { id: string; name: string; email: string | null; avatarUrl: string | null };
  };
  evaluation: {
    score: number | null;
    recommendation: string;
    strengths: string[];
    concerns: string[];
    notes: string | null;
    updatedAt: string;
  } | null;
  scorecard: {
    summary: string | null;
    items: { key?: string; title: string; verdict: string; evidence?: string[]; note?: string }[];
    generatedAt?: string;
  } | null;
};

export type ResourcesResponse = {
  interviewees: { id: string; name: string; email: string | null; avatarUrl: string | null }[];
  questions: { id: string; title: string; difficulty: string | null; language: string | null }[];
};

/**
 * Readiness: the interviewer can join anytime the interview has at least one round
 * (or attached question) and hasn't ended. Scheduling is optional — no time window,
 * so a session can be started on demand.
 */
export function interviewReadiness(i: InterviewSummary, _now = Date.now()) {
  const hasSchedule = Boolean(i.scheduledAt);
  const hasQuestion = i.questionCount > 0 || (i.rounds?.length ?? 0) > 0;
  const isTerminal = i.status === "completed" || i.status === "cancelled" || i.status === "no_show";

  return {
    ready: hasQuestion,
    hasSchedule,
    hasQuestion,
    isTerminal,
    canJoin: hasQuestion && !isTerminal,
    reason: !hasQuestion
      ? "Add at least one round or question"
      : isTerminal
        ? "This interview has ended"
        : "",
  };
}
