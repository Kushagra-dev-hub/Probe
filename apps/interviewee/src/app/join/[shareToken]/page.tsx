"use client";

/**
 * Candidate-facing pre-interview experience.
 *
 * URL: /join/[shareToken]
 * Backend (expert service):
 *   GET  /join/:shareToken          -> JoinInfo (public, no auth)
 *   POST /join/:shareToken/resume   -> multipart "file" (PDF/DOCX, max 8MB)
 *
 * On join, redirects to /interview/:interviewId/room?token=:candidateToken —
 * the existing room page owns the waiting lobby + admission flow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

/* ------------------------------------------------------------------ *
 * Types + constants
 * ------------------------------------------------------------------ */

type JoinInfo = {
  interviewId: string;
  status: string;
  scheduledAt: string | null;
  timezone: string | null;
  durationMinutes: number;
  rounds: string[]; // 'dsa' | 'sql' | 'design'
  companyName: string | null;
  roleTitle: string | null;
  experienceLevel: string | null;
  candidateInstructions: string | null;
  interviewerName: string;
  candidate: { name: string; email: string | null };
  resumeUploaded: boolean;
  admitted: boolean;
  candidateToken: string;
};

const EXPERT_URL = (process.env.NEXT_PUBLIC_EXPERT_URL?.trim() || "http://localhost:3004").replace(/\/$/, "");

const MAX_RESUME_BYTES = 8 * 1024 * 1024; // 8MB

const ROUND_META: Record<string, { label: string; icon: string }> = {
  dsa: { label: "DSA", icon: "code" },
  sql: { label: "SQL", icon: "database" },
  design: { label: "System Design", icon: "architecture" },
};

const CHECKLIST: { icon: string; title: string; detail: string }[] = [
  {
    icon: "public",
    title: "Use Google Chrome",
    detail: "Chrome gives the best compatibility for video, screen share, and the live editor.",
  },
  {
    icon: "videocam",
    title: "Allow camera & microphone",
    detail: "Your browser will ask for permission when you join — click Allow so your interviewer can see and hear you.",
  },
  {
    icon: "wifi",
    title: "Stable internet connection",
    detail: "A wired connection or 5GHz Wi-Fi is best. Avoid downloads or streaming during the interview.",
  },
  {
    icon: "light_mode",
    title: "Quiet, well-lit room",
    detail: "Find a distraction-free spot with light on your face, not behind you.",
  },
  {
    icon: "fullscreen",
    title: "Keep this tab focused",
    detail: "Stay in the interview tab; fullscreen is recommended. Switching away can disrupt the session.",
  },
  {
    icon: "water_drop",
    title: "Have water ready",
    detail: "Interviews involve a lot of talking — keep a glass of water within reach.",
  },
  {
    icon: "record_voice_over",
    title: "Think out loud",
    detail: "The interviewer may share coding exercises — narrate your approach as you work through them.",
  },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function formatSchedule(iso: string | null, timezone: string | null): string {
  if (!iso) return "To be scheduled";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "To be scheduled";
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone: timezone || undefined }).format(date);
  } catch {
    // Invalid IANA timezone string from the API — fall back to the viewer's local zone.
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

type Remaining = { days: number; hours: number; minutes: number; seconds: number };

function remainingUntil(targetMs: number, nowMs: number): Remaining | null {
  const diff = targetMs - nowMs;
  if (diff <= 0) return null;
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** Pure client-side countdown driven by the fetched scheduledAt ISO string. */
function useCountdown(scheduledAt: string | null): { remaining: Remaining | null; reached: boolean } {
  const targetMs = useMemo(() => {
    if (!scheduledAt) return null;
    const ms = new Date(scheduledAt).getTime();
    return Number.isNaN(ms) ? null : ms;
  }, [scheduledAt]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetMs === null || targetMs <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  if (targetMs === null) return { remaining: null, reached: true };
  const remaining = remainingUntil(targetMs, now);
  return { remaining, reached: remaining === null };
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function JoinPage() {
  const params = useParams<{ shareToken: string }>();
  const shareToken = params?.shareToken ?? "";

  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resumeModalOpen, setResumeModalOpen] = useState(false);

  useEffect(() => {
    if (!shareToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${EXPERT_URL}/join/${encodeURIComponent(shareToken)}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message || "This interview link is invalid or expired.");
        }
        const data = (await res.json()) as JoinInfo;
        if (!cancelled) setInfo(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error && err.message !== "Failed to fetch"
              ? err.message
              : "We couldn't reach the interview service. Check your connection and refresh."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  const { remaining, reached } = useCountdown(info?.scheduledAt ?? null);

  const goToRoom = useCallback(() => {
    if (!info) return;
    window.location.href = `/interview/${info.interviewId}/room?token=${encodeURIComponent(info.candidateToken)}`;
  }, [info]);

  const handleJoin = useCallback(() => {
    if (!info) return;
    if (!info.resumeUploaded) {
      setResumeModalOpen(true);
      return;
    }
    goToRoom();
  }, [info, goToRoom]);

  const handleResumeUploaded = useCallback((fileName: string) => {
    setInfo((prev) => (prev ? { ...prev, resumeUploaded: true } : prev));
    void fileName;
  }, []);

  if (loading) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary dark:border-lc-border dark:border-t-primary" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading your interview…</p>
        </div>
      </Shell>
    );
  }

  if (loadError || !info) {
    return (
      <Shell>
        <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
          <div className="animate-slide-up w-full rounded-2xl border border-slate-200 bg-white p-10 shadow-sm dark:border-lc-border dark:bg-lc-surface">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-500/10">
              <span className="material-symbols-outlined !text-[32px] text-rose-500">link_off</span>
            </div>
            <h1 className="font-nunito text-2xl font-extrabold text-slate-900 dark:text-white">
              This interview link is invalid or expired
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {loadError || "The link you followed doesn't match any scheduled interview."} If you believe this is a
              mistake, contact the person who sent you this invitation.
            </p>
          </div>
          <PoweredBy />
        </div>
      </Shell>
    );
  }

  const rounds = info.rounds.map((r) => ROUND_META[r] ?? { label: titleCase(r), icon: "quiz" });
  const cancelled = info.status === "cancelled" || info.status === "no_show";
  const completed = info.status === "completed";

  return (
    <Shell>
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6">
        {/* ── Countdown / Join ─────────────────────────────────── */}
        <section className="animate-slide-up-fade">
          {cancelled ? (
            <StatusBanner
              icon="event_busy"
              tone="rose"
              title="This interview has been cancelled"
              detail="Reach out to your interviewer if you weren't expecting this."
            />
          ) : completed ? (
            <StatusBanner
              icon="task_alt"
              tone="emerald"
              title="This interview has already been completed"
              detail="Thanks for participating — you're all done here."
            />
          ) : !reached && remaining ? (
            <CountdownCard remaining={remaining} />
          ) : (
            <JoinNowCard
              onJoin={handleJoin}
              resumeUploaded={info.resumeUploaded}
              onReplaceResume={() => setResumeModalOpen(true)}
            />
          )}
        </section>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="animate-slide-up-fade mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-lc-border dark:bg-lc-surface">
          <div className="h-1.5 w-full bg-gradient-to-r from-primary via-indigo-400 to-primary" />
          <div className="p-7 sm:p-9">
            <p className="text-sm font-semibold text-primary">
              Hi {info.candidate.name.split(" ")[0]}, you're invited to interview with
            </p>
            <h1 className="mt-2 font-nunito text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              {info.companyName || "Probe Interview"}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {info.roleTitle && (
                <span className="text-lg font-semibold text-slate-700 dark:text-slate-200">{info.roleTitle}</span>
              )}
              {info.experienceLevel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-light px-3 py-1 text-xs font-bold text-primary">
                  <span className="material-symbols-outlined !text-[14px]">military_tech</span>
                  {titleCase(info.experienceLevel)}
                </span>
              )}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <HeroFact icon="event" label="Scheduled for" value={formatSchedule(info.scheduledAt, info.timezone)} />
              <HeroFact icon="timer" label="Duration" value={`${info.durationMinutes} minutes`} />
              <HeroFact icon="person" label="Hosted by" value={info.interviewerName} />
            </div>

            {rounds.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5 dark:border-lc-border">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Interview rounds
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {rounds.map((round) => (
                    <span
                      key={round.label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-semibold text-slate-700 dark:border-lc-border dark:bg-lc-hover dark:text-slate-200"
                    >
                      <span className="material-symbols-outlined !text-[18px] text-primary">{round.icon}</span>
                      {round.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Note from interviewer ────────────────────────────── */}
        {info.candidateInstructions && (
          <section className="animate-slide-up-fade mt-6 rounded-2xl border border-primary/20 bg-primary-light p-6 dark:border-primary/30 dark:bg-primary/10">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 !text-[22px] text-primary">sticky_note_2</span>
              <div>
                <h2 className="font-nunito text-base font-extrabold text-slate-900 dark:text-white">
                  A note from your interviewer
                </h2>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {info.candidateInstructions}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── Before-you-join checklist ────────────────────────── */}
        <section className="animate-slide-up-fade mt-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-lc-border dark:bg-lc-surface sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light">
              <span className="material-symbols-outlined !text-[22px] text-primary">checklist</span>
            </div>
            <div>
              <h2 className="font-nunito text-xl font-extrabold text-slate-900 dark:text-white">Before you join</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">A quick checklist so everything runs smoothly.</p>
            </div>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {CHECKLIST.map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-lc-border dark:bg-lc-hover/50"
              >
                <span className="material-symbols-outlined mt-0.5 shrink-0 !text-[20px] text-primary">{item.icon}</span>
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Device check ─────────────────────────────────────── */}
        <DeviceCheckCard />

        <PoweredBy />
      </main>

      {resumeModalOpen && (
        <ResumeModal
          shareToken={shareToken}
          replaceMode={info.resumeUploaded}
          onClose={() => setResumeModalOpen(false)}
          onUploaded={handleResumeUploaded}
          onContinue={goToRoom}
        />
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ *
 * Layout bits
 * ------------------------------------------------------------------ */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#FAFBFC] dark:bg-lc-bg">{children}</div>;
}

function PoweredBy() {
  return (
    <p className="mt-10 text-center text-xs font-medium text-slate-400 dark:text-slate-500">
      Powered by <span className="font-bold text-primary">Probe</span>
    </p>
  );
}

function HeroFact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-lc-border dark:bg-lc-hover/50">
      <span className="material-symbols-outlined mt-0.5 !text-[20px] text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</p>
      </div>
    </div>
  );
}

function StatusBanner({
  icon,
  tone,
  title,
  detail,
}: {
  icon: string;
  tone: "rose" | "emerald";
  title: string;
  detail: string;
}) {
  const tones =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400"
      : "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400";
  return (
    <div className={`flex items-start gap-4 rounded-2xl border p-6 ${tones}`}>
      <span className="material-symbols-outlined !text-[28px]">{icon}</span>
      <div>
        <h2 className="font-nunito text-lg font-extrabold">{title}</h2>
        <p className="mt-1 text-sm opacity-80">{detail}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Countdown + Join
 * ------------------------------------------------------------------ */

function CountdownCard({ remaining }: { remaining: Remaining }) {
  const cells: { label: string; value: number }[] = [
    { label: "Days", value: remaining.days },
    { label: "Hours", value: remaining.hours },
    { label: "Minutes", value: remaining.minutes },
    { label: "Seconds", value: remaining.seconds },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-lc-border dark:bg-lc-surface">
      <div className="bg-gradient-to-br from-primary to-indigo-500 px-7 py-8 text-center text-white sm:px-9">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">Your interview starts in</p>
        <div className="mx-auto mt-5 flex max-w-lg items-start justify-center gap-2 sm:gap-4">
          {cells.map((cell, idx) => (
            <div key={cell.label} className="flex items-start gap-2 sm:gap-4">
              {idx > 0 && <span className="pt-2 font-nunito text-3xl font-black text-white/50 sm:text-4xl">:</span>}
              <div className="flex w-16 flex-col items-center sm:w-20">
                <span className="font-nunito text-4xl font-black tabular-nums leading-none sm:text-5xl">
                  {String(cell.value).padStart(2, "0")}
                </span>
                <span className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/70 sm:text-xs">
                  {cell.label}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs font-medium text-white/70">
          The join button will appear here automatically when it's time.
        </p>
      </div>
    </div>
  );
}

function JoinNowCard({
  onJoin,
  resumeUploaded,
  onReplaceResume,
}: {
  onJoin: () => void;
  resumeUploaded: boolean;
  onReplaceResume: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-lc-border dark:bg-lc-surface">
      <div className="flex flex-col items-center gap-4 px-7 py-9 text-center sm:px-9">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Your interview room is open
        </span>
        <button
          type="button"
          onClick={onJoin}
          className="animate-pulse-glow inline-flex items-center gap-2.5 rounded-xl bg-primary px-10 py-4 font-nunito text-lg font-extrabold text-night shadow-lg shadow-primary/25 transition hover:bg-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-lc-surface"
        >
          <span className="material-symbols-outlined !text-[24px]">videocam</span>
          Join Interview
        </button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {resumeUploaded ? (
            <>
              Resume received.{" "}
              <button
                type="button"
                onClick={onReplaceResume}
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Replace resume
              </button>
            </>
          ) : (
            "You'll be asked to upload your resume before entering the room."
          )}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Device check
 * ------------------------------------------------------------------ */

function DeviceCheckCard() {
  const [testing, setTesting] = useState(false);
  const [active, setActive] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  // Stop tracks if the candidate navigates away mid-test.
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setDeviceError(null);
    setTesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setActive(true);
      // Let the <video> mount before attaching.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setDeviceError(
        name === "NotAllowedError"
          ? "Permission denied. Click the camera icon in your browser's address bar and allow access, then try again."
          : name === "NotFoundError"
            ? "No camera or microphone was found. Plug in a device and try again."
            : err instanceof Error
              ? err.message
              : "Could not access your camera and microphone."
      );
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <section className="animate-slide-up-fade mt-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-lc-border dark:bg-lc-surface sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light">
            <span className="material-symbols-outlined !text-[22px] text-primary">video_camera_front</span>
          </div>
          <div>
            <h2 className="font-nunito text-xl font-extrabold text-slate-900 dark:text-white">Device check</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Make sure your camera and microphone work before joining.
            </p>
          </div>
        </div>
        {!active ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-night transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="material-symbols-outlined !text-[18px]">{testing ? "hourglass_top" : "play_circle"}</span>
            {testing ? "Requesting access…" : "Test camera & mic"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-lc-border dark:bg-lc-hover dark:text-slate-200 dark:hover:bg-lc-input"
          >
            <span className="material-symbols-outlined !text-[18px]">stop_circle</span>
            Stop test
          </button>
        )}
      </div>

      {active && (
        <div className="animate-fade-in mt-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-lc-border">
            <video ref={videoRef} autoPlay playsInline muted className="mx-auto aspect-video w-full max-w-xl bg-black" />
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <span className="material-symbols-outlined !text-[20px]">check_circle</span>
            Camera and microphone look good
          </div>
        </div>
      )}

      {deviceError && !active && (
        <div className="animate-fade-in mt-5 flex items-start gap-2.5 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          <span className="material-symbols-outlined mt-0.5 !text-[20px]">error</span>
          <span>{deviceError}</span>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Resume upload modal
 * ------------------------------------------------------------------ */

type UploadPhase = "pick" | "uploading" | "success";

function ResumeModal({
  shareToken,
  replaceMode,
  onClose,
  onUploaded,
  onContinue,
}: {
  shareToken: string;
  replaceMode: boolean;
  onClose: () => void;
  onUploaded: (fileName: string) => void;
  onContinue: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("pick");
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const continueTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (continueTimer.current !== null) window.clearTimeout(continueTimer.current);
    };
  }, []);

  const acceptFile = useCallback((candidate: File | null) => {
    if (!candidate) return;
    const lower = candidate.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
      setUploadError("Only PDF and DOCX files are accepted.");
      return;
    }
    if (candidate.size > MAX_RESUME_BYTES) {
      setUploadError("That file is larger than 8MB. Export a smaller version and try again.");
      return;
    }
    setUploadError(null);
    setFile(candidate);
  }, []);

  const upload = useCallback(() => {
    if (!file) return;
    setPhase("uploading");
    setProgress(0);
    setUploadError(null);

    const form = new FormData();
    form.append("file", file, file.name);

    // XHR (not fetch) so we get real upload progress events.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${EXPERT_URL}/join/${encodeURIComponent(shareToken)}/resume`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setProgress(100);
        setPhase("success");
        onUploaded(file.name);
        continueTimer.current = window.setTimeout(() => onContinue(), 1400);
      } else {
        let message = "Upload failed. Please try again.";
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          /* keep default */
        }
        setUploadError(message);
        setPhase("pick");
      }
    };
    xhr.onerror = () => {
      setUploadError("Upload failed — check your connection and try again.");
      setPhase("pick");
    };
    xhr.send(form);
  }, [file, shareToken, onUploaded, onContinue]);

  const sizeLabel = file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : "";

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Upload your resume"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase !== "uploading") onClose();
      }}
    >
      <div className="animate-slide-up w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl dark:border-lc-border dark:bg-lc-surface">
        {phase === "success" ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
              <span className="material-symbols-outlined !text-[34px] text-emerald-500">check_circle</span>
            </div>
            <h3 className="mt-4 font-nunito text-xl font-extrabold text-slate-900 dark:text-white">Resume uploaded</h3>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Taking you to the interview room…
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-nunito text-xl font-extrabold text-slate-900 dark:text-white">
                  {replaceMode ? "Replace your resume" : "Upload your resume before joining"}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Your interviewer uses it to tailor the conversation. PDF or DOCX, up to 8MB.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={phase === "uploading"}
                aria-label="Close"
                className="ml-3 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-lc-hover dark:hover:text-slate-200"
              >
                <span className="material-symbols-outlined !text-[22px]">close</span>
              </button>
            </div>

            <div
              className={`mt-5 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-9 text-center transition ${
                dragging
                  ? "border-primary bg-primary-light"
                  : "border-slate-200 bg-slate-50/60 hover:border-primary/50 dark:border-lc-border dark:bg-lc-hover/40"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (phase === "pick") setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (phase === "pick") acceptFile(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              {file ? (
                <div className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left dark:border-lc-border dark:bg-lc-surface">
                  <span className="material-symbols-outlined !text-[28px] text-primary">
                    {file.name.toLowerCase().endsWith(".pdf") ? "picture_as_pdf" : "description"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{file.name}</p>
                    <p className="text-xs text-slate-400">{sizeLabel}</p>
                  </div>
                  {phase === "pick" && (
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      aria-label="Remove file"
                      className="rounded p-1 text-slate-400 transition hover:text-rose-500"
                    >
                      <span className="material-symbols-outlined !text-[18px]">delete</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined !text-[36px] text-slate-300 dark:text-slate-600">
                    upload_file
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Drag & drop your resume here
                  </p>
                  <p className="mt-1 text-xs text-slate-400">or</p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-2 rounded-lg border border-primary/40 bg-white px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary-light dark:bg-transparent"
                  >
                    Browse files
                  </button>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  acceptFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </div>

            {phase === "uploading" && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Uploading…</span>
                  <span className="tabular-nums">{progress}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-lc-hover">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {uploadError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                <span className="material-symbols-outlined mt-0.5 !text-[18px]">error</span>
                <span>{uploadError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={upload}
              disabled={!file || phase === "uploading"}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-nunito text-base font-extrabold text-night transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "uploading" ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Uploading…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined !text-[20px]">upload</span>
                  {replaceMode ? "Upload new resume" : "Upload & continue"}
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
