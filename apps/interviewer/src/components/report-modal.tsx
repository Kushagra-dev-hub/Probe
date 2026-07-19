"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type InterviewReport } from "@/lib/api";
import { formatSchedule } from "@/lib/format";

/* ------------------------------------------------------------------ *
 * Report modal — the evaluation the interviewer filled for a past
 * interview (score / recommendation / strengths / concerns / notes),
 * plus the copilot's assistive scorecard. Interviewer-only.
 * ------------------------------------------------------------------ */

const REC_STYLE: Record<string, { label: string; ring: string; text: string; icon: string }> = {
  hire: { label: "Hire", ring: "ring-emerald-500/30 bg-emerald-500/10", text: "text-emerald-300", icon: "thumb_up" },
  hold: { label: "Hold", ring: "ring-amber-500/30 bg-amber-500/10", text: "text-amber-300", icon: "pause_circle" },
  reject: { label: "No hire", ring: "ring-rose-500/30 bg-rose-500/10", text: "text-rose-300", icon: "thumb_down" },
  pending: { label: "Not decided", ring: "ring-white/10 bg-white/[0.04]", text: "text-haze/60", icon: "hourglass_empty" },
};

const VERDICT_STYLE: Record<string, { cls: string; icon: string }> = {
  strong: { cls: "text-emerald-300", icon: "check_circle" },
  mixed: { cls: "text-amber-300", icon: "contrast" },
  thin: { cls: "text-rose-300", icon: "error" },
  unknown: { cls: "text-haze/50", icon: "help" },
};

export function ReportModal({
  interviewId,
  token,
  onClose,
}: {
  interviewId: string;
  token: string;
  onClose: () => void;
}) {
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<InterviewReport>(`/interviews/${interviewId}/report`, token);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the report.");
    } finally {
      setLoading(false);
    }
  }, [interviewId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ev = report?.evaluation;
  const rec = ev ? REC_STYLE[ev.recommendation] ?? REC_STYLE.pending : null;
  const candidate = report?.interview.interviewee;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center sm:p-6 probe-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="probe-panel my-auto w-full max-w-xl rounded-2xl bg-[#0d0925] shadow-2xl ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-haze/40">Interview report</p>
            <h2 className="mt-1 truncate font-nunito text-xl font-extrabold text-white">
              {candidate?.name ?? "Interview"}
            </h2>
            <p className="mt-0.5 truncate text-xs text-haze/50">
              {report?.interview.roleTitle && <span>{report.interview.roleTitle} · </span>}
              {formatSchedule(report?.interview.scheduledAt ?? null)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-haze/50 transition hover:bg-white/5 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-6">
          {loading && (
            <div className="space-y-4">
              <div className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
              <div className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />
            </div>
          )}

          {error && !loading && (
            <p className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>
          )}

          {!loading && !error && report && !ev && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.04] text-haze/50">
                <span className="material-symbols-outlined text-[28px]">assignment_late</span>
              </span>
              <div>
                <p className="text-sm font-semibold text-white/90">No report was filled</p>
                <p className="mt-1 text-xs text-haze/45">
                  This interview ended without a saved evaluation.
                </p>
              </div>
            </div>
          )}

          {!loading && !error && ev && rec && (
            <>
              {/* Verdict + score */}
              <div className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3.5 ring-1 ring-inset ${rec.ring}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`material-symbols-outlined text-[22px] ${rec.text}`}>{rec.icon}</span>
                  <div>
                    <p className={`text-sm font-bold ${rec.text}`}>{rec.label}</p>
                    <p className="text-[11px] text-haze/45">Recommendation</p>
                  </div>
                </div>
                {ev.score != null && (
                  <div className="text-right">
                    <p className="text-2xl font-extrabold tabular-nums text-white">
                      {ev.score}
                      <span className="text-sm font-semibold text-haze/40">/100</span>
                    </p>
                    <p className="text-[11px] text-haze/45">Score</p>
                  </div>
                )}
              </div>

              {/* Strengths */}
              <ReportList
                title="Strengths"
                icon="add_circle"
                accent="text-emerald-300"
                items={ev.strengths}
                empty="No strengths recorded."
              />

              {/* Concerns */}
              <ReportList
                title="Concerns"
                icon="remove_circle"
                accent="text-rose-300"
                items={ev.concerns}
                empty="No concerns recorded."
              />

              {/* Notes */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-haze/40">
                  <span className="material-symbols-outlined text-[16px] text-steel">notes</span>
                  Notes
                </p>
                {ev.notes?.trim() ? (
                  <p className="whitespace-pre-wrap rounded-xl bg-white/[0.03] p-3.5 text-sm leading-relaxed text-haze/80">
                    {ev.notes}
                  </p>
                ) : (
                  <p className="text-sm text-haze/40">No written notes.</p>
                )}
              </div>

              <p className="text-right text-[11px] text-haze/30">
                Saved {formatSchedule(ev.updatedAt)}
              </p>

              {/* Copilot scorecard (assistive) */}
              {report.scorecard && report.scorecard.items.length > 0 && (
                <div className="border-t border-white/[0.08] pt-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">P</span>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-haze/40">Copilot scorecard</p>
                  </div>
                  {report.scorecard.summary && (
                    <p className="mb-3 text-sm leading-relaxed text-haze/70">{report.scorecard.summary}</p>
                  )}
                  <ul className="space-y-2">
                    {report.scorecard.items.map((item, idx) => {
                      const style = VERDICT_STYLE[item.verdict] ?? VERDICT_STYLE.unknown;
                      return (
                        <li key={item.key ?? idx} className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] px-3.5 py-2.5">
                          <span className={`material-symbols-outlined mt-0.5 text-[18px] ${style.cls}`}>{style.icon}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white/90">
                              {item.title}
                              <span className={`ml-2 text-[11px] font-medium capitalize ${style.cls}`}>{item.verdict}</span>
                            </p>
                            {item.note && <p className="mt-0.5 text-xs leading-relaxed text-haze/55">{item.note}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-white/[0.08] px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportList({
  title,
  icon,
  accent,
  items,
  empty,
}: {
  title: string;
  icon: string;
  accent: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-haze/40">
        <span className={`material-symbols-outlined text-[16px] ${accent}`}>{icon}</span>
        {title}
      </p>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((it, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm leading-relaxed text-haze/80">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${accent.replace("text-", "bg-")}`} />
              {it}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-haze/40">{empty}</p>
      )}
    </div>
  );
}
