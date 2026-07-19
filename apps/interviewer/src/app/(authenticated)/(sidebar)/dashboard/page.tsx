"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import {
  api,
  type InterviewListResponse,
  type InterviewRound,
  type InterviewSummary,
  type Me,
} from "@/lib/api";
import { ReportModal } from "@/components/report-modal";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.14em] text-haze/40";
const ROW = "flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.04]";

const ROUND_META: Record<InterviewRound, { label: string; cls: string }> = {
  dsa: { label: "DSA", cls: "text-steel" },
  sql: { label: "SQL", cls: "text-emerald-300" },
  design: { label: "Design", cls: "text-amber-300" },
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** An interview is "past" (has a report to view) once it's terminal or its scheduled time has passed. */
function isPast(i: InterviewSummary): boolean {
  if (i.status === "completed" || i.status === "cancelled" || i.status === "no_show") return true;
  return i.scheduledAt ? new Date(i.scheduledAt).getTime() < Date.now() : false;
}

function dotClass(i: InterviewSummary): string {
  if (i.status === "cancelled" || i.status === "no_show") return "bg-haze/25";
  const rec = i.evaluation?.recommendation;
  if (rec === "hire") return "bg-emerald-400";
  if (rec === "hold") return "bg-amber-400";
  if (rec === "reject") return "bg-rose-400";
  const happened = i.status === "completed" || (i.scheduledAt ? new Date(i.scheduledAt).getTime() < Date.now() : false);
  return happened ? "bg-haze/50" : "bg-steel";
}

function recBadge(i: InterviewSummary): { label: string; cls: string } | null {
  const rec = i.evaluation?.recommendation;
  if (!rec || rec === "pending") return null;
  const score = i.evaluation?.score;
  const label = `${rec[0].toUpperCase()}${rec.slice(1)}${score != null ? ` · ${score}` : ""}`;
  const cls = rec === "hire" ? "text-emerald-300" : rec === "hold" ? "text-amber-300" : "text-rose-300";
  return { label, cls };
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-steel to-mint text-xs font-bold text-night">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Rounds({ rounds }: { rounds: InterviewRound[] }) {
  if (!rounds.length) return null;
  return (
    <span className="flex items-center gap-1.5">
      {rounds.map((r, idx) => (
        <span key={r} className={`text-[11px] font-semibold ${ROUND_META[r].cls}`}>
          {ROUND_META[r].label}
          {idx < rounds.length - 1 && <span className="ml-1.5 text-haze/25">·</span>}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function InterviewerDashboard() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [me, setMe] = useState<Me | null>(null);
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
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
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, InterviewSummary[]>();
    for (const i of interviews) {
      if (!i.scheduledAt) continue;
      const k = dayKey(new Date(i.scheduledAt));
      const arr = map.get(k);
      if (arr) arr.push(i);
      else map.set(k, [i]);
    }
    return map;
  }, [interviews]);

  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [selected, setSelected] = useState<Date | null>(null);

  useEffect(() => {
    if (selected || byDay.size === 0) return;
    const now = Date.now();
    let best: Date | null = null;
    for (const i of interviews) {
      if (!i.scheduledAt) continue;
      const d = new Date(i.scheduledAt);
      if (d.getTime() > now) continue;
      if (!best || d.getTime() > best.getTime()) best = d;
    }
    const target = best ?? new Date();
    setSelected(target);
    setCursor({ y: target.getFullYear(), m: target.getMonth() });
  }, [byDay, interviews, selected]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, idx) => {
      const day = idx - startOffset + 1;
      return day >= 1 && day <= daysInMonth ? day : null;
    });
  }, [cursor]);

  const todayKey = dayKey(new Date());
  const selectedKey = selected ? dayKey(selected) : null;
  const selectedList = selectedKey ? byDay.get(selectedKey) ?? [] : [];

  const wrongRole = me && me.role !== "interviewer";

  return (
    <main className="relative flex h-full flex-col overflow-y-auto px-8 py-6 lg:overflow-hidden lg:px-14">
      <div className="pointer-events-none absolute -right-32 -top-32 -z-10 h-96 w-96 rounded-full bg-mint/[0.04] blur-3xl" />

      {/* ── Hero: intro + create ─────────────────────────────────── */}
      <section className="mx-auto mb-8 flex w-full max-w-5xl shrink-0 flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-md">
          <h1 className="text-[2.1rem] font-bold leading-[1.15] tracking-tight text-white">
            Hiring, <span className="text-mint">just made smarter.</span>
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-haze/60">
            Not deep in the tech stack? We&apos;ve got you covered — your AI copilot reads the candidate&apos;s
            code, flags the gaps, and hands you the next question.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link
            href="/instant"
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-mint px-6 py-3 text-[15px] font-semibold text-night shadow-[0_10px_28px_-18px_rgba(182,234,218,0.6)] transition hover:bg-primary-dark"
          >
            <span className="material-symbols-outlined text-[20px]">bolt</span>
            Instant interview
          </Link>
          <Link
            href="/later"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-[15px] font-semibold text-haze transition hover:border-white/30 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">calendar_month</span>
            Schedule later
          </Link>
        </div>
      </section>

      {wrongRole && (
        <div className="mx-auto mb-6 w-full max-w-5xl shrink-0 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          Signed in as <b>{me?.role}</b> — creating interviews is disabled. Reload with{" "}
          <a href="/dashboard?token=seed-interviewer" className="font-semibold underline">?token=seed-interviewer</a>.
        </div>
      )}
      {error && <div className="mx-auto mb-6 w-full max-w-5xl shrink-0 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {/* ── Calendar + selected-day activity (centered) ──────────── */}
      <div className="mx-auto grid w-full min-h-0 max-w-5xl gap-x-16 gap-y-10 lg:flex-1 lg:grid-cols-[minmax(400px,440px)_1fr]">
        <Calendar
          cursor={cursor}
          setCursor={setCursor}
          cells={cells}
          byDay={byDay}
          todayKey={todayKey}
          selectedKey={selectedKey}
          onSelect={setSelected}
          onToday={() => {
            const n = new Date();
            setCursor({ y: n.getFullYear(), m: n.getMonth() });
            setSelected(n);
          }}
        />
        <div className="flex min-h-0 flex-col lg:border-l lg:border-white/[0.06] lg:pl-16">
          <DayBlock selected={selected} list={selectedList} token={token} onViewReport={setReportId} />
        </div>
      </div>

      {reportId && token && <ReportModal interviewId={reportId} token={token} onClose={() => setReportId(null)} />}
      <ReportModalStyles />
    </main>
  );
}

/** Backdrop/panel entrance keyframes for the report modal (self-contained). */
function ReportModalStyles() {
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

/* ------------------------------------------------------------------ *
 * Calendar
 * ------------------------------------------------------------------ */

function Calendar({
  cursor,
  setCursor,
  cells,
  byDay,
  todayKey,
  selectedKey,
  onSelect,
  onToday,
}: {
  cursor: { y: number; m: number };
  setCursor: React.Dispatch<React.SetStateAction<{ y: number; m: number }>>;
  cells: (number | null)[];
  byDay: Map<string, InterviewSummary[]>;
  todayKey: string;
  selectedKey: string | null;
  onSelect: (d: Date) => void;
  onToday: () => void;
}) {
  return (
    <div className="shrink-0">
      <header className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-bold text-white">{MONTHS[cursor.m]} {cursor.y}</h2>
        <div className="flex items-center gap-1 text-haze/50">
          <button
            onClick={() => setCursor(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}
            className="grid h-7 w-7 place-items-center rounded-lg transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Previous month"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button onClick={onToday} className="rounded-lg px-2 py-1 text-xs font-medium transition hover:bg-white/[0.05] hover:text-white">
            Today
          </button>
          <button
            onClick={() => setCursor(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}
            className="grid h-7 w-7 place-items-center rounded-lg transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Next month"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </header>

      <div className="mb-2 grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-semibold uppercase tracking-wider text-haze/30">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} className="h-10" />;
          const cellDate = new Date(cursor.y, cursor.m, day);
          const k = dayKey(cellDate);
          const list = byDay.get(k) ?? [];
          const isToday = k === todayKey;
          const isSelected = k === selectedKey;
          return (
            <div key={idx} className="flex flex-col items-center gap-1">
              <button
                onClick={() => onSelect(cellDate)}
                className={`grid h-10 w-10 place-items-center rounded-full text-[14px] transition ${
                  isToday
                    ? "bg-mint font-bold text-night"
                    : isSelected
                      ? "bg-white/10 font-semibold text-white"
                      : "text-haze/75 hover:bg-white/[0.05]"
                }`}
              >
                {day}
              </button>
              <span className="flex h-1 items-center gap-0.5">
                {list.slice(0, 3).map((i) => (
                  <span key={i.id} className={`h-1.5 w-1.5 rounded-full ${dotClass(i)}`} />
                ))}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend — what the dot colours mean */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-3 text-[11px] text-haze/50">
        <LegendDot cls="bg-emerald-400" label="Hire" />
        <LegendDot cls="bg-amber-400" label="Hold" />
        <LegendDot cls="bg-rose-400" label="Reject" />
        <LegendDot cls="bg-haze/50" label="Unscored" />
        <LegendDot cls="bg-steel" label="Upcoming" />
      </div>
    </div>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Selected-day activity
 * ------------------------------------------------------------------ */

function DayBlock({
  selected,
  list,
  token,
  onViewReport,
}: {
  selected: Date | null;
  list: InterviewSummary[];
  token?: string;
  onViewReport: (id: string) => void;
}) {
  return (
    <>
      <p className={LABEL}>
        {selected ? selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "Select a day"}
      </p>
      <div className="-mx-2 mt-3 min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="relative grid h-16 w-16 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-mint/[0.06]" />
                <span className="hero-anim-float grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.04] text-mint/70">
                  <span className="material-symbols-outlined text-[28px]">event_busy</span>
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white/90">Nothing this day</p>
                <p className="mt-1 text-xs text-haze/45">Pick another date, or create an interview.</p>
              </div>
            </div>
          </div>
        ) : (
          list.map((i) => <DayRow key={i.id} interview={i} token={token} onViewReport={onViewReport} />)
        )}
      </div>
    </>
  );
}

function DayRow({
  interview,
  token,
  onViewReport,
}: {
  interview: InterviewSummary;
  token?: string;
  onViewReport: (id: string) => void;
}) {
  const badge = recBadge(interview);
  const past = isPast(interview);

  const inner = (
    <>
      <Avatar name={interview.interviewee.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{interview.interviewee.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-haze/45">
          {interview.roleTitle && <span className="truncate">{interview.roleTitle}</span>}
          {interview.roleTitle && (interview.rounds?.length ?? 0) > 0 && <span className="text-haze/25">·</span>}
          <Rounds rounds={interview.rounds ?? []} />
        </div>
      </div>
      {badge ? (
        <span className={`shrink-0 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
      ) : (
        past && (
          <span className="shrink-0 text-[11px] font-medium text-haze/40">View report</span>
        )
      )}
    </>
  );

  // Past interviews open the filled report; upcoming ones jump into the room.
  if (past) {
    return (
      <button type="button" onClick={() => onViewReport(interview.id)} className={`animate-slide-up-fade w-full text-left ${ROW}`}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={`/interview/${interview.id}/room?token=${token ?? ""}`} className={`animate-slide-up-fade ${ROW}`}>
      {inner}
    </Link>
  );
}
