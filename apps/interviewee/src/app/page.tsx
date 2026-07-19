"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { api, interviewReadiness, type InterviewListResponse, type InterviewSummary, type Me } from "@/lib/api";
import { formatSchedule, relativeToNow, statusLabel, statusStyle } from "@/lib/format";

export default function IntervieweeDashboard() {
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-white">My interviews</h1>
        <p className="mt-1 text-sm text-haze/60">{me ? `Signed in as ${me.name}` : "Interviewee dashboard"}</p>
      </header>

      {loading && <p className="text-sm text-haze/60">Loading…</p>}
      {error && <p className="rounded-lg bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>}

      {!loading && !error && interviews.length === 0 && (
        <div className="rounded-2xl border border-dashed border-steel/25 p-12 text-center">
          <p className="text-sm text-haze/60">You have no interviews scheduled yet.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <Section title="Scheduled">
          {upcoming.map((i) => (
            <InterviewCard key={i.id} interview={i} token={token} />
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past">
          {past.map((i) => (
            <InterviewCard key={i.id} interview={i} token={token} />
          ))}
        </Section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-haze/60">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function InterviewCard({ interview, token }: { interview: InterviewSummary; token?: string }) {
  const readiness = interviewReadiness(interview);
  const roomUrl = `/interview/${interview.id}/room?token=${token ?? ""}`;

  return (
    <div className="rounded-2xl border border-steel/15 bg-grape/25 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            Interview with {interview.interviewer.name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-haze/60">
            <span title={interview.scheduledAt ?? ""}>
              🗓 {formatSchedule(interview.scheduledAt)}
              {interview.scheduledAt && <span className="ml-1 text-haze/60">({relativeToNow(interview.scheduledAt)})</span>}
            </span>
            <span>⏱ {interview.durationMinutes} min</span>
          </div>
          {interview.candidateInstructions && (
            <p className="mt-3 rounded-lg bg-grape/20 p-3 text-xs text-haze">{interview.candidateInstructions}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyle(interview.status)}`}>
          {statusLabel(interview.status)}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-steel/15 pt-4">
        {readiness.canJoin ? (
          <Link
            href={roomUrl}
            className="rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-night transition hover:bg-primary-dark"
          >
            Join interview
          </Link>
        ) : (
          <>
            <span className="cursor-not-allowed rounded-lg bg-grape/30 px-4 py-2 text-sm font-medium text-haze/40">
              Join interview
            </span>
            {readiness.reason && <span className="text-xs text-haze/60">{readiness.reason}</span>}
          </>
        )}
      </div>
    </div>
  );
}
