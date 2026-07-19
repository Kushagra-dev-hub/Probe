"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { api, type InterviewRound, type InterviewSummary, type ResourcesResponse } from "@/lib/api";

type Mode = "instant" | "later";

const INPUT =
  "w-full rounded-lg border border-steel/25 bg-night/50 px-3 py-2 text-sm text-white placeholder:text-haze/50 focus:border-steel focus:outline-none focus:ring-1 focus:ring-steel/30";

const ROUND_OPTIONS: { key: InterviewRound; label: string; icon: string; desc: string }[] = [
  { key: "dsa", label: "DSA", icon: "data_object", desc: "Data structures & algorithms" },
  { key: "sql", label: "SQL", icon: "database", desc: "Database & queries" },
  { key: "design", label: "System Design", icon: "schema", desc: "Architecture & scale" },
];
const roundLabel = (r: InterviewRound) => ROUND_OPTIONS.find((o) => o.key === r)?.label ?? r;

const emailValid = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

const STEPS: Record<Mode, { key: string; label: string }[]> = {
  // Instant starts with the interviewee (no scheduling — it begins now).
  instant: [
    { key: "interviewee", label: "Interviewee" },
    { key: "rounds", label: "Rounds" },
    { key: "details", label: "Details" },
    { key: "review", label: "Review" },
  ],
  // Later starts with date & time, then the interviewee.
  later: [
    { key: "schedule", label: "Date & time" },
    { key: "interviewee", label: "Interviewee" },
    { key: "rounds", label: "Rounds" },
    { key: "details", label: "Details" },
    { key: "review", label: "Review" },
  ],
};

export function InterviewWizard({ mode }: { mode: Mode }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const router = useRouter();

  const steps = STEPS[mode];
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx].key;
  const isLast = stepIdx === steps.length - 1;

  const [resources, setResources] = useState<ResourcesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [intervieweeId, setIntervieweeId] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [roleTitle, setRoleTitle] = useState("");
  const [jdText, setJdText] = useState("");
  const [notes, setNotes] = useState("");
  const [candidateInstructions, setCandidateInstructions] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<ResourcesResponse>("/interviews/resources", token)
      .then(setResources)
      .catch((e: Error) => setLoadError(e.message));
  }, [token]);

  const toggleRound = (r: InterviewRound) =>
    setRounds((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const hasInterviewee = addingNew ? Boolean(newName.trim()) && emailValid(newEmail) : Boolean(intervieweeId);

  const stepValid = useMemo(() => {
    switch (step) {
      case "schedule":
        return Boolean(scheduledAt) && durationMinutes >= 15 && durationMinutes <= 480;
      case "interviewee":
        return hasInterviewee;
      case "rounds":
        return rounds.length > 0;
      default:
        return true;
    }
  }, [step, scheduledAt, durationMinutes, hasInterviewee, rounds]);

  const interviewee = resources?.interviewees.find((c) => c.id === intervieweeId) ?? null;
  const intervieweeLabel = addingNew ? newName.trim() || newEmail.trim() || "New interviewee" : interviewee?.name ?? "—";

  function back() {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
    else router.push("/dashboard");
  }
  function next() {
    if (stepValid && !isLast) setStepIdx((i) => i + 1);
  }

  async function submit() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    const iso = mode === "later" ? (scheduledAt ? new Date(scheduledAt).toISOString() : null) : new Date().toISOString();
    const payload = {
      ...(addingNew ? { candidateName: newName.trim(), candidateEmail: newEmail.trim() } : { intervieweeId }),
      rounds,
      scheduledAt: iso,
      durationMinutes: Number(durationMinutes),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      notes,
      candidateInstructions,
      roleTitle,
      jdText,
    };
    try {
      const created = await api.post<InterviewSummary>("/interviews", payload, token);
      if (mode === "instant") {
        router.push(`/interview/${created.id}/room?token=${token ?? ""}`);
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (loadError) {
    const roleMismatch = /interviewer access required/i.test(loadError);
    return (
      <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
        <p>Failed to load form data: {loadError}</p>
        {roleMismatch && (
          <p className="mt-2">
            This tab is signed in as an interviewee. Reload with{" "}
            <a href="/dashboard?token=seed-interviewer" className="font-semibold underline">?token=seed-interviewer</a> to act
            as the interviewer.
          </p>
        )}
      </div>
    );
  }
  if (!resources) {
    return <p className="text-sm text-haze/60">Loading question bank…</p>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Title */}
      <div className="mb-5 shrink-0">
        <h1 className="text-2xl font-bold text-white">
          {mode === "instant" ? "Instant interview" : "Schedule an interview"}
        </h1>
        <p className="mt-1 text-sm text-haze/55">
          {mode === "instant"
            ? "Set it up and step straight into the room."
            : "Pick a time, then build the session."}
        </p>
      </div>

      {/* Stepper — single line, connectors grow to fill */}
      <ol className="mb-6 flex shrink-0 items-center">
        {steps.map((s, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          const notLast = i < steps.length - 1;
          return (
            <li key={s.key} className={`flex items-center ${notLast ? "flex-1" : "shrink-0"}`}>
              <button
                type="button"
                onClick={() => i < stepIdx && setStepIdx(i)}
                disabled={i > stepIdx}
                className="flex shrink-0 items-center gap-2 disabled:cursor-default"
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition ${
                    done || active ? "bg-mint text-night" : "bg-white/10 text-haze/50"
                  }`}
                >
                  {done ? <span className="material-symbols-outlined text-[15px]">check</span> : i + 1}
                </span>
                <span className={`hidden whitespace-nowrap text-[13px] sm:block ${active ? "font-semibold text-white" : "text-haze/50"}`}>
                  {s.label}
                </span>
              </button>
              {notLast && <span className="mx-2 h-px flex-1 bg-white/10" />}
            </li>
          );
        })}
      </ol>

      {/* Step body — scrolls internally so the page never does */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {step === "schedule" && (
          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-haze">Scheduled time</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-haze">Duration (minutes)</label>
              <input
                type="number"
                min={15}
                max={480}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className={INPUT}
              />
            </div>
          </section>
        )}

        {step === "interviewee" && (
          <section>
            <label className="mb-3 block text-sm font-semibold text-haze">Who are you interviewing?</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {resources.interviewees.map((c) => {
                const selected = !addingNew && intervieweeId === c.id;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      setIntervieweeId(c.id);
                      setAddingNew(false);
                    }}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                      selected ? "border-mint bg-mint/5 ring-1 ring-mint" : "border-steel/15 hover:border-steel/30"
                    }`}
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-steel to-mint text-sm font-bold text-night">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-haze">{c.name}</span>
                      <span className="block truncate text-xs text-haze/60">{c.email}</span>
                    </span>
                  </button>
                );
              })}

              {/* Add someone new by email */}
              <button
                type="button"
                onClick={() => {
                  setAddingNew(true);
                  setIntervieweeId("");
                }}
                className={`flex items-center gap-3 rounded-xl border border-dashed p-3 text-left transition ${
                  addingNew ? "border-mint bg-mint/5 ring-1 ring-mint" : "border-steel/25 hover:border-steel/40"
                }`}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-mint">
                  <span className="material-symbols-outlined text-[20px]">person_add</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-haze">Add by email</span>
                  <span className="block truncate text-xs text-haze/60">Invite someone new</span>
                </span>
              </button>
            </div>

            {addingNew && (
              <div className="mt-3 grid gap-3 rounded-xl border border-steel/15 bg-white/[0.02] p-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-haze/70">Name</label>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jordan Rivera" className={INPUT} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-haze/70">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="jordan@example.com"
                    className={`${INPUT} ${newEmail && !emailValid(newEmail) ? "border-rose-500/40" : ""}`}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {step === "rounds" && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-semibold text-haze">Which rounds?</label>
              <span className="text-xs text-haze/60">{rounds.length} selected</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {ROUND_OPTIONS.map((o) => {
                const on = rounds.includes(o.key);
                return (
                  <button
                    type="button"
                    key={o.key}
                    onClick={() => toggleRound(o.key)}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${
                      on ? "border-mint bg-mint/5 ring-1 ring-mint" : "border-steel/15 hover:border-steel/30"
                    }`}
                  >
                    <span className={`grid h-9 w-9 place-items-center rounded-lg ${on ? "bg-mint text-night" : "bg-white/5 text-mint"}`}>
                      <span className="material-symbols-outlined text-[20px]">{o.icon}</span>
                    </span>
                    <span className="block text-sm font-semibold text-white">{o.label}</span>
                    <span className="block text-[11px] leading-snug text-haze/55">{o.desc}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-haze/45">Probe auto-attaches practice questions for each round you pick.</p>
          </section>
        )}

        {step === "details" && (
          <section className="space-y-6">
            <div className="rounded-xl border border-steel/15 bg-white/[0.02] p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-steel text-[11px] font-bold text-white">P</span>
                <label className="text-sm font-semibold text-haze">Probe role pack <span className="font-normal text-haze/50">(optional)</span></label>
              </div>
              <p className="mb-3 text-xs text-haze/55">
                Paste the role and JD — Probe builds the rubric it coaches you against. Leave blank for a general strong-engineer pack.
              </p>
              <div className="space-y-3">
                <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Role title, e.g. Backend Engineer (Go, Postgres)" className={INPUT} />
                <textarea value={jdText} onChange={(e) => setJdText(e.target.value)} rows={4} placeholder="Paste the job description here…" className={`resize-none ${INPUT}`} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-haze">Interviewer notes <span className="font-normal text-haze/50">(private)</span></label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Focus areas, rubric reminders…" className={`resize-none ${INPUT}`} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-haze">Candidate instructions <span className="font-normal text-haze/50">(shown in room)</span></label>
                <textarea value={candidateInstructions} onChange={(e) => setCandidateInstructions(e.target.value)} rows={3} placeholder="What to expect, allowed resources…" className={`resize-none ${INPUT}`} />
              </div>
            </div>
          </section>
        )}

        {step === "review" && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-haze">Review</h2>
            <dl className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
              <Summary label="Interviewee" value={intervieweeLabel} />
              <Summary label="Rounds" value={rounds.length ? rounds.map(roundLabel).join(", ") : "—"} />
              <Summary
                label="When"
                value={mode === "instant" ? "Starts immediately" : scheduledAt ? new Date(scheduledAt).toLocaleString() : "—"}
              />
              <Summary label="Duration" value={`${durationMinutes} min`} />
              <Summary label="Role pack" value={roleTitle || "General"} />
            </dl>
          </section>
        )}
      </div>

      {error && <p className="mt-4 shrink-0 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}

      {/* Footer nav */}
      <div className="mt-5 flex shrink-0 items-center justify-between border-t border-white/[0.06] pt-5">
        <button onClick={back} className="rounded-lg px-4 py-2.5 text-sm font-medium text-haze transition hover:bg-white/[0.05]">
          {stepIdx === 0 ? "Cancel" : "← Back"}
        </button>
        {isLast ? (
          <button
            onClick={submit}
            disabled={submitting || !hasInterviewee || rounds.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-mint px-6 py-2.5 text-sm font-semibold text-night transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Working…" : mode === "instant" ? (
              <>
                <span className="material-symbols-outlined text-[19px]">bolt</span>
                Create &amp; start
              </>
            ) : (
              "Schedule interview"
            )}
          </button>
        ) : (
          <button
            onClick={next}
            disabled={!stepValid}
            className="rounded-full bg-mint px-6 py-2.5 text-sm font-semibold text-night transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-sm text-haze/55">{label}</dt>
      <dd className="text-sm font-medium text-white">{value}</dd>
    </div>
  );
}
