"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { api, type InterviewSummary, type ResourcesResponse } from "@/lib/api";
import { toLocalInputValue } from "@/lib/format";

type Props = {
  /** When present, the form edits this interview instead of creating one. */
  existing?: InterviewSummary;
};

const DIFFICULTY_STYLE: Record<string, string> = {
  easy: "text-emerald-300",
  medium: "text-amber-300",
  hard: "text-rose-300",
};

export function InterviewForm({ existing }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const router = useRouter();

  const [resources, setResources] = useState<ResourcesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [intervieweeId, setIntervieweeId] = useState(existing?.interviewee.id ?? "");
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>(
    existing?.questions.map((q) => q.questionId).filter((q): q is string => Boolean(q)) ?? []
  );
  const [scheduledAt, setScheduledAt] = useState(toLocalInputValue(existing?.scheduledAt ?? null));
  const [durationMinutes, setDurationMinutes] = useState(existing?.durationMinutes ?? 60);
  const [notes, setNotes] = useState(existing?.interviewerNotes ?? "");
  const [candidateInstructions, setCandidateInstructions] = useState(existing?.candidateInstructions ?? "");
  const [roleTitle, setRoleTitle] = useState("");
  const [jdText, setJdText] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<ResourcesResponse>("/interviews/resources", token)
      .then(setResources)
      .catch((e: Error) => setLoadError(e.message));
  }, [token]);

  // When editing, prefill the role/JD from the saved rubric.
  useEffect(() => {
    if (!token || !existing) return;
    api
      .get<{ rubric: { roleTitle: string | null; jdText: string | null } | null }>(`/interviews/${existing.id}/copilot`, token)
      .then((data) => {
        if (data.rubric?.roleTitle) setRoleTitle(data.rubric.roleTitle);
        if (data.rubric?.jdText) setJdText(data.rubric.jdText);
      })
      .catch(() => {});
  }, [token, existing]);

  const toggleQuestion = (id: string) =>
    setSelectedQuestions((prev) => (prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]));

  const canSubmit = useMemo(
    () => Boolean(intervieweeId) && selectedQuestions.length > 0 && !submitting,
    [intervieweeId, selectedQuestions, submitting]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      intervieweeId,
      questionIds: selectedQuestions,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      durationMinutes: Number(durationMinutes),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      notes,
      candidateInstructions,
      roleTitle,
      jdText,
    };
    try {
      if (existing) {
        await api.patch(`/interviews/${existing.id}`, payload, token);
      } else {
        await api.post("/interviews", payload, token);
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (loadError) {
    const roleMismatch = /interviewer access required/i.test(loadError);
    return (
      <div className="rounded-lg bg-rose-500/10 p-4 text-sm text-rose-300 border border-rose-500/20">
        <p>Failed to load form data: {loadError}</p>
        {roleMismatch && (
          <p className="mt-2 text-rose-300">
            This tab is signed in as an interviewee. Reload with{" "}
            <a href="/?token=seed-interviewer" className="font-semibold underline">
              ?token=seed-interviewer
            </a>{" "}
            to act as the interviewer.
          </p>
        )}
      </div>
    );
  }
  if (!resources) {
    return <p className="text-sm text-haze/60">Loading question bank…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Interviewee */}
      <section>
        <label className="mb-2 block text-sm font-semibold text-haze">Interviewee</label>
        {resources.interviewees.length === 0 ? (
          <p className="text-sm text-haze/60">No interviewees exist yet. Seed one first.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {resources.interviewees.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setIntervieweeId(c.id)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  intervieweeId === c.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-steel/15 hover:border-steel/25"
                }`}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-grape/50 text-sm font-semibold text-mint">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-haze">{c.name}</span>
                  <span className="block truncate text-xs text-haze/60">{c.email}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Questions */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-haze">Questions</label>
          <span className="text-xs text-haze/60">{selectedQuestions.length} selected</span>
        </div>
        <div className="space-y-2">
          {resources.questions.map((q) => {
            const checked = selectedQuestions.includes(q.id);
            return (
              <label
                key={q.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                  checked ? "border-primary bg-primary/5" : "border-steel/15 hover:border-steel/25"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleQuestion(q.id)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="flex-1 text-sm font-medium text-haze">{q.title}</span>
                {q.difficulty && (
                  <span className={`text-xs font-semibold capitalize ${DIFFICULTY_STYLE[q.difficulty] ?? "text-haze/60"}`}>
                    {q.difficulty}
                  </span>
                )}
                {q.language && <span className="text-xs text-haze/60">{q.language}</span>}
              </label>
            );
          })}
        </div>
      </section>

      {/* Role pack (Probe copilot) */}
      <section className="rounded-xl border border-steel/15 bg-grape/20 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-steel text-[11px] font-bold text-white">P</span>
          <label className="text-sm font-semibold text-haze">Probe role pack</label>
        </div>
        <p className="mb-3 text-xs text-haze/60">
          Paste the role and JD — Probe builds the rubric it will coach you against during the interview. Leave blank for a
          general strong-engineer pack.
        </p>
        <div className="space-y-3">
          <input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            placeholder="Role title, e.g. Backend Engineer (Go, Postgres)"
            className="w-full rounded-lg border border-steel/25 bg-night/50 px-3 py-2 text-sm text-white placeholder:text-haze/50 focus:border-steel focus:outline-none focus:ring-1 focus:ring-steel/30"
          />
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            rows={4}
            placeholder="Paste the job description here…"
            className="w-full resize-none rounded-lg border border-steel/25 bg-night/50 px-3 py-2 text-sm text-white placeholder:text-haze/50 focus:border-steel focus:outline-none focus:ring-1 focus:ring-steel/30"
          />
        </div>
      </section>

      {/* Schedule + duration */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-semibold text-haze">Scheduled time</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-lg border border-steel/25 bg-night/50 px-3 py-2 text-sm text-white focus:border-steel focus:outline-none focus:ring-1 focus:ring-steel/30"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-haze">Duration (minutes)</label>
          <input
            type="number"
            min={15}
            max={480}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full rounded-lg border border-steel/25 bg-night/50 px-3 py-2 text-sm text-white focus:border-steel focus:outline-none focus:ring-1 focus:ring-steel/30"
          />
        </div>
      </section>

      {/* Notes */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-semibold text-haze">
            Interviewer notes <span className="font-normal text-haze/60">(private)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Focus areas, rubric reminders…"
            className="w-full resize-none rounded-lg border border-steel/25 bg-night/50 px-3 py-2 text-sm text-white placeholder:text-haze/50 focus:border-steel focus:outline-none focus:ring-1 focus:ring-steel/30"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-haze">
            Candidate instructions <span className="font-normal text-haze/60">(shown in room)</span>
          </label>
          <textarea
            value={candidateInstructions}
            onChange={(e) => setCandidateInstructions(e.target.value)}
            rows={3}
            placeholder="What to expect, allowed resources…"
            className="w-full resize-none rounded-lg border border-steel/25 bg-night/50 px-3 py-2 text-sm text-white placeholder:text-haze/50 focus:border-steel focus:outline-none focus:ring-1 focus:ring-steel/30"
          />
        </div>
      </section>

      {error && <p className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300 border border-rose-500/20">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-night transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : existing ? "Save changes" : "Create interview"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-haze transition hover:bg-grape/40"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
