"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { api, interviewReadiness, type InterviewListResponse, type InterviewSummary, type Me } from "@/lib/api";
import { formatSchedule, relativeToNow, statusLabel, statusStyle, recommendationStyle } from "@/lib/format";

export default function InterviewerDashboard() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [me, setMe] = useState<Me | null>(null);
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [profile, list] = await Promise.all([
        api.get<Me>("/me", token),
        api.get<InterviewListResponse>("/interviews", token),
      ]);
      setMe(profile);
      setInterviews(list.interviews);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const up: InterviewSummary[] = [];
    const pa: InterviewSummary[] = [];
    for (const i of interviews) {
      if (i.status === "completed" || i.status === "cancelled" || i.status === "no_show") pa.push(i);
      else up.push(i);
    }
    return { upcoming: up, past: pa };
  }, [interviews]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Interviews</h1>
          <p className="mt-1 text-sm text-slate-500">
            {me ? `Signed in as ${me.name} (${me.role})` : "Interviewer dashboard"}
          </p>
        </div>
        <Link
          href="/new"
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark"
        >
          + New interview
        </Link>
      </header>

      {me && me.role !== "interviewer" && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You're signed in as an <b>{me.role}</b> on the interviewer app, so creating/editing interviews is
          disabled. Reload with{" "}
          <a href="/?token=seed-interviewer" className="font-semibold underline">
            ?token=seed-interviewer
          </a>{" "}
          to switch identity.
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

      {!loading && !error && interviews.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-sm text-slate-500">No interviews yet.</p>
          <Link href="/new" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
            Create your first interview →
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.map((i) => (
            <InterviewCard key={i.id} interview={i} onChanged={load} />
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past">
          {past.map((i) => (
            <InterviewCard key={i.id} interview={i} onChanged={load} />
          ))}
        </Section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function InterviewCard({ interview, onChanged }: { interview: InterviewSummary; onChanged: () => void }) {
  const readiness = interviewReadiness(interview);
  const { session } = useAuth();
  const token = session?.access_token;
  const [busy, setBusy] = useState(false);

  const roomUrl = `/interview/${interview.id}/room?token=${token ?? ""}`;

  async function cancel() {
    if (!token) return;
    if (!confirm("Cancel this interview?")) return;
    setBusy(true);
    try {
      await api.patch(`/interviews/${interview.id}`, { status: "cancelled" }, token);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
              {interview.interviewee.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{interview.interviewee.name}</p>
              <p className="truncate text-xs text-slate-500">{interview.interviewee.email}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span title={interview.scheduledAt ?? ""}>
              🗓 {formatSchedule(interview.scheduledAt)}
              {interview.scheduledAt && <span className="ml-1 text-slate-400">({relativeToNow(interview.scheduledAt)})</span>}
            </span>
            <span>⏱ {interview.durationMinutes} min</span>
            <span>📝 {interview.questionCount} question{interview.questionCount === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyle(interview.status)}`}>
            {statusLabel(interview.status)}
          </span>
          {interview.evaluation && interview.evaluation.recommendation !== "pending" && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${recommendationStyle(interview.evaluation.recommendation)}`}>
              {interview.evaluation.recommendation}
              {interview.evaluation.score != null ? ` · ${interview.evaluation.score}` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
        {readiness.canJoin ? (
          <Link
            href={roomUrl}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Join room
          </Link>
        ) : (
          <span
            className="cursor-not-allowed rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
            title={readiness.reason}
          >
            Join room
          </span>
        )}
        {!readiness.canJoin && readiness.reason && (
          <span className="text-xs text-slate-400">{readiness.reason}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {!readiness.isTerminal && (
            <>
              <Link
                href={`/interview/${interview.id}/edit`}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Edit
              </Link>
              <button
                onClick={cancel}
                disabled={busy}
                className="rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
