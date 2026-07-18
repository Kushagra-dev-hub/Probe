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
  easy: "text-emerald-600",
  medium: "text-amber-600",
  hard: "text-rose-600",
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

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<ResourcesResponse>("/interviews/resources", token)
      .then(setResources)
      .catch((e: Error) => setLoadError(e.message));
  }, [token]);

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
      <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700">
        <p>Failed to load form data: {loadError}</p>
        {roleMismatch && (
          <p className="mt-2 text-rose-600">
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
    return <p className="text-sm text-slate-500">Loading question bank…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Interviewee */}
      <section>
        <label className="mb-2 block text-sm font-semibold text-slate-700">Interviewee</label>
        {resources.interviewees.length === 0 ? (
          <p className="text-sm text-slate-500">No interviewees exist yet. Seed one first.</p>
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
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{c.name}</span>
                  <span className="block truncate text-xs text-slate-500">{c.email}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Questions */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">Questions</label>
          <span className="text-xs text-slate-500">{selectedQuestions.length} selected</span>
        </div>
        <div className="space-y-2">
          {resources.questions.map((q) => {
            const checked = selectedQuestions.includes(q.id);
            return (
              <label
                key={q.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                  checked ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleQuestion(q.id)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="flex-1 text-sm font-medium text-slate-800">{q.title}</span>
                {q.difficulty && (
                  <span className={`text-xs font-semibold capitalize ${DIFFICULTY_STYLE[q.difficulty] ?? "text-slate-500"}`}>
                    {q.difficulty}
                  </span>
                )}
                {q.language && <span className="text-xs text-slate-400">{q.language}</span>}
              </label>
            );
          })}
        </div>
      </section>

      {/* Schedule + duration */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Scheduled time</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Duration (minutes)</label>
          <input
            type="number"
            min={15}
            max={480}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </section>

      {/* Notes */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Interviewer notes <span className="font-normal text-slate-400">(private)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Focus areas, rubric reminders…"
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Candidate instructions <span className="font-normal text-slate-400">(shown in room)</span>
          </label>
          <textarea
            value={candidateInstructions}
            onChange={(e) => setCandidateInstructions(e.target.value)}
            rows={3}
            placeholder="What to expect, allowed resources…"
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </section>

      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : existing ? "Save changes" : "Create interview"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
