"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import {
  api,
  interviewReadiness,
  type InterviewListResponse,
  type InterviewSummary,
  type InterviewRound,
  type Me,
} from "@/lib/api";
import {
  formatSchedule,
  relativeToNow,
  statusLabel,
  toLocalInputValue,
} from "@/lib/format";
import { ReportModal } from "@/components/report-modal";

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const CANDIDATE_BASE = (process.env.NEXT_PUBLIC_CANDIDATE_URL || "http://localhost:3000").replace(/\/$/, "");

const ROUND_META: Record<InterviewRound, { label: string; icon: string; light: string; dark: string }> = {
  dsa: {
    label: "DSA",
    icon: "code",
    light: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    dark: "dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30",
  },
  sql: {
    label: "SQL",
    icon: "database",
    light: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dark: "dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  },
  design: {
    label: "System Design",
    icon: "schema",
    light: "bg-amber-50 text-amber-700 ring-amber-200",
    dark: "dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  },
};

const ALL_ROUNDS: InterviewRound[] = ["dsa", "sql", "design"];

const EXPERIENCE_LEVELS = ["Intern", "Junior", "Mid", "Senior", "Staff"] as const;

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-blue-500",
  active: "bg-emerald-500",
  interviewer_joined: "bg-amber-500",
  candidate_waiting: "bg-amber-500",
  completed: "bg-slate-400",
  cancelled: "bg-rose-500",
  no_show: "bg-rose-500",
};

const STATUS_PILL: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  interviewer_joined: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  candidate_waiting: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  completed: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-lc-hover dark:text-[#aaa] dark:ring-lc-border",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  no_show: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
};

const REC_PILL: Record<string, string> = {
  hire: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  hold: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  reject: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
};

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function SchedulePage() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [me, setMe] = useState<Me | null>(null);
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state: `null` closed, `"new"` create, or an interview to edit.
  const [modal, setModal] = useState<"new" | InterviewSummary | null>(null);
  // Share link surfaced after a successful create.
  const [createdLink, setCreatedLink] = useState<{ link: string; name: string } | null>(null);
  // Which list is shown — upcoming vs past.
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  // Past interview whose filled report is open, if any.
  const [reportId, setReportId] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : "Failed to load interviews.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: InterviewSummary[] = [];
    const pa: InterviewSummary[] = [];
    for (const i of interviews) {
      const terminal = i.status === "completed" || i.status === "cancelled" || i.status === "no_show";
      const inPast = i.scheduledAt ? new Date(i.scheduledAt).getTime() + (i.durationMinutes + 60) * 60_000 < now : false;
      if (terminal || inPast) pa.push(i);
      else up.push(i);
    }
    const bySchedule = (a: InterviewSummary, b: InterviewSummary) => {
      const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return ta - tb;
    };
    up.sort(bySchedule);
    pa.sort((a, b) => -bySchedule(a, b));
    return { upcoming: up, past: pa };
  }, [interviews]);

  const wrongRole = me && me.role !== "interviewer";

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-nunito text-3xl font-extrabold tracking-tight text-slate-900 dark:text-[#eff1f6]">
            Interviews
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-[#8a8a8a]">
            Schedule sessions, share candidate links, and jump into the room.
          </p>
        </div>
        {/* New interview — hover reveals Instant / Later; a plain click defaults to the Later wizard */}
        <div className="group relative">
          {wrongRole ? (
            <button
              disabled
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-night opacity-50 cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              New interview
              <span className="material-symbols-outlined text-[18px]">expand_more</span>
            </button>
          ) : (
            <Link
              href="/later"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-night shadow-lg shadow-primary/25 transition hover:bg-primary-dark hover:shadow-primary/40"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              New interview
              <span className="material-symbols-outlined text-[18px] transition-transform group-hover:rotate-180">expand_more</span>
            </Link>
          )}
          {!wrongRole && (
            <div className="invisible absolute right-0 top-full z-50 translate-y-1 pt-2 opacity-0 transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              <div className="w-56 overflow-hidden rounded-xl border border-white/10 bg-lc-surface p-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
                <Link href="/instant" className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/5">
                  <span className="material-symbols-outlined mt-0.5 text-[19px] text-mint">bolt</span>
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold text-white">Instant interview</span>
                    <span className="block text-[11px] text-[#8a8a8a]">Start a room right now</span>
                  </span>
                </Link>
                <Link href="/later" className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/5">
                  <span className="material-symbols-outlined mt-0.5 text-[19px] text-steel">calendar_month</span>
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold text-white">Schedule later</span>
                    <span className="block text-[11px] text-[#8a8a8a]">Pick a date &amp; share a link</span>
                  </span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </header>

      {wrongRole && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          You&apos;re signed in as an <b>{me?.role}</b>. Creating interviews is disabled. Reload with{" "}
          <a href="/schedule?token=seed-interviewer" className="font-semibold underline">
            ?token=seed-interviewer
          </a>{" "}
          to act as the interviewer.
        </div>
      )}

      {/* States */}
      {loading && <CardSkeletons />}
      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      )}

      {!loading && !error && interviews.length === 0 && <EmptyState />}

      {!loading && !error && interviews.length > 0 && (
        <>
          {/* Upcoming / Past toggle */}
          <div className="mb-6 inline-flex items-center gap-1 rounded-full bg-white/[0.04] p-1 text-sm font-semibold">
            {(["upcoming", "past"] as const).map((t) => {
              const count = t === "upcoming" ? upcoming.length : past.length;
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 capitalize transition ${
                    active ? "bg-white/10 text-white" : "text-haze/55 hover:text-white"
                  }`}
                >
                  {t}
                  <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] ${active ? "bg-mint/20 text-mint" : "bg-white/10 text-haze/55"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {(tab === "upcoming" ? upcoming : past).length === 0 ? (
            <p className="py-16 text-center text-sm text-haze/40">No {tab} interviews.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {(tab === "upcoming" ? upcoming : past).map((i) => (
                <InterviewCard
                  key={i.id}
                  interview={i}
                  token={token}
                  onEdit={() => setModal(i)}
                  onChanged={load}
                  onViewReport={tab === "past" ? () => setReportId(i.id) : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {modal && token && (
        <InterviewModal
          token={token}
          existing={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onCreated={(link, name) => {
            setModal(null);
            setCreatedLink({ link, name });
            void load();
          }}
          onSaved={() => {
            setModal(null);
            void load();
          }}
        />
      )}

      {createdLink && <SuccessModal link={createdLink.link} name={createdLink.name} onClose={() => setCreatedLink(null)} />}

      {reportId && token && <ReportModal interviewId={reportId} token={token} onClose={() => setReportId(null)} />}

      <ModalStyles />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Layout helpers
 * ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-16 text-center dark:border-lc-border dark:bg-lc-surface/40">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-[28px]">calendar_add_on</span>
      </span>
      <p className="mt-4 text-base font-semibold text-slate-800 dark:text-[#eff1f6]">No interviews yet</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-[#8a8a8a]">Create your first interview to generate a candidate link.</p>
      <div className="mt-5 flex items-center justify-center gap-2.5">
        <Link
          href="/instant"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 dark:border-lc-border dark:text-[#ccc] dark:hover:border-[#555]"
        >
          <span className="material-symbols-outlined text-[18px]">bolt</span>
          Instant
        </Link>
        <Link
          href="/later"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-night transition hover:bg-primary-dark"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New interview
        </Link>
      </div>
    </div>
  );
}

function CardSkeletons() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-52 animate-pulse rounded-2xl bg-white/[0.03]" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Interview card
 * ------------------------------------------------------------------ */

function InterviewCard({
  interview,
  token,
  onEdit,
  onChanged,
  onViewReport,
}: {
  interview: InterviewSummary;
  token?: string;
  onEdit: () => void;
  onChanged: () => void;
  onViewReport?: () => void;
}) {
  const readiness = interviewReadiness(interview);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const roomUrl = `/interview/${interview.id}/room?token=${token ?? ""}`;
  const shareLink = interview.shareToken ? `${CANDIDATE_BASE}/join/${interview.shareToken}` : null;
  const title = interview.roleTitle || interview.companyName || interview.interviewee.name || "Interview";
  const subtitle = interview.companyName && interview.roleTitle ? interview.companyName : null;

  async function copyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  async function remove() {
    if (!token) return;
    setBusy(true);
    setConfirming(false);
    try {
      await api.del(`/interviews/${interview.id}`, token);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const rec = interview.evaluation && interview.evaluation.recommendation !== "pending" ? interview.evaluation : null;

  return (
    <div
      onClick={onViewReport}
      className={`group flex flex-col rounded-2xl p-5 transition hover:bg-white/[0.03] ${onViewReport ? "cursor-pointer" : ""}`}
    >
      {/* Top row: title + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-nunito text-lg font-bold text-slate-900 dark:text-[#eff1f6]">{title}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#8a8a8a]">
            {subtitle && <span className="truncate">{subtitle}</span>}
            {subtitle && interview.experienceLevel && <span className="text-slate-300 dark:text-[#555]">•</span>}
            {interview.experienceLevel && <span>{interview.experienceLevel}</span>}
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset ${STATUS_PILL[interview.status] ?? "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-lc-hover dark:text-[#aaa] dark:ring-lc-border"}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[interview.status] ?? "bg-slate-400"}`} />
          {statusLabel(interview.status)}
        </span>
      </div>

      {/* Candidate */}
      <div className="mt-4 flex items-center gap-3">
        {interview.interviewee.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={interview.interviewee.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-500 text-sm font-bold text-white">
            {interview.interviewee.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-[#dcdcdc]">{interview.interviewee.name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-[#8a8a8a]">{interview.interviewee.email}</p>
        </div>
      </div>

      {/* Rounds */}
      {interview.rounds.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {interview.rounds.map((r) => {
            const meta = ROUND_META[r];
            if (!meta) return null;
            return (
              <span
                key={r}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${meta.light} ${meta.dark}`}
              >
                <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>
                {meta.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Meta row */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-[#8a8a8a]">
        <span className="inline-flex items-center gap-1.5" title={interview.scheduledAt ?? ""}>
          <span className="material-symbols-outlined text-[16px]">event</span>
          {formatSchedule(interview.scheduledAt)}
          {interview.scheduledAt && (
            <span className="text-slate-400 dark:text-[#666]">· {relativeToNow(interview.scheduledAt)}</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]">schedule</span>
          {interview.durationMinutes} min
        </span>
        {rec && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${REC_PILL[rec.recommendation] ?? "bg-slate-100 text-slate-600 ring-slate-200"}`}
          >
            <span className="material-symbols-outlined text-[13px]">verified</span>
            {rec.recommendation}
            {rec.score != null ? ` · ${rec.score}` : ""}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-1.5 border-t border-slate-100 pt-4 dark:border-lc-border">
        {onViewReport ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewReport();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-night transition hover:bg-primary-dark"
          >
            <span className="material-symbols-outlined text-[18px]">description</span>
            View report
          </button>
        ) : readiness.canJoin ? (
          <Link
            href={roomUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <span className="material-symbols-outlined text-[18px]">videocam</span>
            Join room
          </Link>
        ) : (
          <span
            title={readiness.reason}
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-400 dark:bg-lc-hover dark:text-[#666]"
          >
            <span className="material-symbols-outlined text-[18px]">videocam_off</span>
            Join room
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {shareLink && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void copyLink();
              }}
              title="Copy candidate link"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                copied
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-600 hover:bg-slate-100 dark:text-[#aaa] dark:hover:bg-lc-hover"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{copied ? "check" : "link"}</span>
              <span className="hidden sm:inline">{copied ? "Copied!" : "Copy link"}</span>
            </button>
          )}
          {!readiness.isTerminal && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="Edit interview"
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-[#aaa] dark:hover:bg-lc-hover"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
          )}
          {confirming ? (
            <span className="inline-flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void remove();
                }}
                disabled={busy}
                title="Confirm delete"
                className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 px-2.5 py-2 text-xs font-semibold text-rose-400 transition hover:bg-rose-500/25 disabled:opacity-40"
              >
                {busy ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-400/40 border-t-rose-400" />
                ) : (
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                )}
                Delete
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(false);
                }}
                title="Cancel"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-[#aaa] dark:hover:bg-lc-hover"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
              disabled={busy}
              title="Delete interview"
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:text-[#aaa] dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Create / Edit modal
 * ------------------------------------------------------------------ */

function InterviewModal({
  token,
  existing,
  onClose,
  onCreated,
  onSaved,
}: {
  token: string;
  existing: InterviewSummary | null;
  onClose: () => void;
  onCreated: (link: string, name: string) => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(existing);

  const [candidateName, setCandidateName] = useState(existing?.interviewee.name ?? "");
  const [candidateEmail, setCandidateEmail] = useState(existing?.interviewee.email ?? "");
  const [companyName, setCompanyName] = useState(existing?.companyName ?? "");
  const [roleTitle, setRoleTitle] = useState(existing?.roleTitle ?? "");
  const [experienceLevel, setExperienceLevel] = useState(existing?.experienceLevel ?? "Mid");
  const [rounds, setRounds] = useState<InterviewRound[]>(existing?.rounds ?? ["dsa"]);
  const [scheduledAt, setScheduledAt] = useState(toLocalInputValue(existing?.scheduledAt ?? null));
  const [durationMinutes, setDurationMinutes] = useState(existing?.durationMinutes ?? 60);
  const [notes, setNotes] = useState(existing?.interviewerNotes ?? "");
  const [candidateInstructions, setCandidateInstructions] = useState(existing?.candidateInstructions ?? "");
  const [jdText, setJdText] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill role/JD from the saved rubric when editing.
  useEffect(() => {
    if (!existing) return;
    api
      .get<{ rubric: { roleTitle: string | null; jdText: string | null } | null }>(`/interviews/${existing.id}/copilot`, token)
      .then((data) => {
        if (data.rubric?.roleTitle) setRoleTitle((v) => v || data.rubric!.roleTitle!);
        if (data.rubric?.jdText) setJdText((v) => v || data.rubric!.jdText!);
      })
      .catch(() => {});
  }, [existing, token]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleRound = (r: InterviewRound) =>
    setRounds((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const canSubmit = isEdit
    ? !submitting
    : Boolean(candidateName.trim()) && Boolean(candidateEmail.trim()) && rounds.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const iso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      if (isEdit && existing) {
        // PATCH only accepts these fields (rounds + candidate are immutable server-side).
        await api.patch<InterviewSummary>(
          `/interviews/${existing.id}`,
          {
            scheduledAt: iso,
            durationMinutes: Number(durationMinutes),
            timezone,
            notes,
            candidateInstructions,
            roleTitle: roleTitle.trim() || undefined,
            jdText: jdText.trim() || undefined,
          },
          token
        );
        onSaved();
      } else {
        const created = await api.post<InterviewSummary>(
          "/interviews",
          {
            candidateName: candidateName.trim(),
            candidateEmail: candidateEmail.trim(),
            companyName: companyName.trim() || undefined,
            roleTitle: roleTitle.trim() || undefined,
            experienceLevel,
            rounds,
            scheduledAt: iso,
            durationMinutes: Number(durationMinutes),
            timezone,
            notes,
            candidateInstructions,
            jdText: jdText.trim() || undefined,
          },
          token
        );
        const link = created.shareToken ? `${CANDIDATE_BASE}/join/${created.shareToken}` : "";
        onCreated(link, created.interviewee.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center sm:p-6 probe-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="probe-panel my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-lc-surface dark:ring-white/5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-lc-border">
          <div>
            <h2 className="font-nunito text-xl font-extrabold text-slate-900 dark:text-[#eff1f6]">
              {isEdit ? "Edit interview" : "New interview"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-[#8a8a8a]">
              {isEdit ? "Update the schedule, rounds context and notes." : "We'll generate a candidate join link on save."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-lc-hover dark:hover:text-[#ccc]"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-6">
          {/* Candidate */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Candidate name" required={!isEdit}>
              <input
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                disabled={isEdit}
                placeholder="Ada Lovelace"
                className={inputCls}
              />
            </Field>
            <Field label="Candidate email" required={!isEdit}>
              <input
                type="email"
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                disabled={isEdit}
                placeholder="ada@example.com"
                className={inputCls}
              />
            </Field>
          </div>
          {isEdit && (
            <p className="-mt-3 text-xs text-slate-400 dark:text-[#666]">
              Candidate details and rounds are fixed after creation.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company">
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc." className={inputCls} />
            </Field>
            <Field label="Role title">
              <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Backend Engineer" className={inputCls} />
            </Field>
          </div>

          <Field label="Experience level">
            <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} disabled={isEdit} className={inputCls}>
              {EXPERIENCE_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </Field>

          {/* Rounds */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-[#ccc]">
              Rounds {!isEdit && <span className="text-rose-500">*</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_ROUNDS.map((r) => {
                const meta = ROUND_META[r];
                const active = rounds.includes(r);
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => !isEdit && toggleRound(r)}
                    disabled={isEdit}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-lc-border dark:text-[#aaa] dark:hover:border-[#555]"
                    } ${isEdit ? "cursor-default opacity-80" : ""}`}
                  >
                    <span className="material-symbols-outlined text-[17px]">{meta.icon}</span>
                    {meta.label}
                    {active && <span className="material-symbols-outlined text-[16px]">check</span>}
                  </button>
                );
              })}
            </div>
            {!isEdit && (
              <p className="mt-1.5 text-xs text-slate-400 dark:text-[#666]">
                Questions are auto-picked from the bank for each selected round.
              </p>
            )}
          </div>

          {/* Schedule + duration */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Scheduled time">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Duration (minutes)">
              <input
                type="number"
                min={15}
                max={480}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Notes */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Interviewer notes" hint="private">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Focus areas, rubric reminders…"
                className={`${inputCls} resize-none`}
              />
            </Field>
            <Field label="Candidate instructions" hint="shown in room">
              <textarea
                value={candidateInstructions}
                onChange={(e) => setCandidateInstructions(e.target.value)}
                rows={3}
                placeholder="What to expect, allowed resources…"
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>

          {/* JD / role pack */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/5">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">P</span>
              <label className="text-sm font-semibold text-slate-700 dark:text-[#ccc]">Role pack (Probe copilot)</label>
            </div>
            <p className="mb-3 text-xs text-slate-500 dark:text-[#8a8a8a]">
              Paste the job description — Probe builds the rubric it coaches you against. Optional.
            </p>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={3}
              placeholder="Paste the job description here…"
              className={`${inputCls} resize-none`}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-lc-border">
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-[#aaa] dark:hover:bg-lc-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-night shadow-lg shadow-primary/25 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Create interview"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-[#ccc]">
        {label}
        {required && <span className="text-rose-500"> *</span>}
        {hint && <span className="ml-1 font-normal text-slate-400 dark:text-[#666]">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 transition placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-lc-border dark:bg-lc-input dark:text-[#eff1f6] dark:placeholder:text-[#666] dark:disabled:bg-lc-hover";

/* ------------------------------------------------------------------ *
 * Success modal (share link)
 * ------------------------------------------------------------------ */

function SuccessModal({ link, name, onClose }: { link: string; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* no-op */
    }
  }

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm probe-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="probe-panel w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl ring-1 ring-black/5 dark:bg-lc-surface dark:ring-white/5">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <span className="material-symbols-outlined text-[30px]">check_circle</span>
        </span>
        <h2 className="mt-4 font-nunito text-xl font-extrabold text-slate-900 dark:text-[#eff1f6]">Interview created</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-[#8a8a8a]">
          Send this link to <span className="font-semibold text-slate-700 dark:text-[#ccc]">{name}</span> to let them join.
        </p>

        {link ? (
          <>
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 pl-3.5 dark:border-lc-border dark:bg-lc-input">
              <span className="material-symbols-outlined text-[18px] text-slate-400">link</span>
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 focus:outline-none dark:text-[#ccc]"
              />
              <button
                onClick={copy}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  copied ? "bg-emerald-600 text-white" : "bg-primary text-night hover:bg-primary-dark"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{copied ? "check" : "content_copy"}</span>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400 dark:text-[#666]">
              The candidate opens this link to enter the lobby. You admit them from the room.
            </p>
          </>
        ) : (
          <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            Created, but no share link was returned. Refresh and use the card&apos;s Copy link button.
          </p>
        )}

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-lc-hover dark:hover:bg-[#3d3d3d]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Modal animation keyframes (self-contained; no plugin dependency)
 * ------------------------------------------------------------------ */

function ModalStyles() {
  return (
    <style>{`
      @keyframes probeBackdropIn { from { opacity: 0 } to { opacity: 1 } }
      @keyframes probePanelIn {
        from { opacity: 0; transform: translateY(8px) scale(0.97) }
        to { opacity: 1; transform: translateY(0) scale(1) }
      }
      .probe-backdrop { animation: probeBackdropIn 0.15s ease-out both }
      .probe-panel { animation: probePanelIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both }
    `}</style>
  );
}
