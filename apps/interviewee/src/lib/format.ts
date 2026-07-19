/** Small presentation helpers shared by the dashboard + forms. */

export function formatSchedule(iso: string | null): string {
  if (!iso) return "Not scheduled";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeToNow(iso: string | null): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const unit = mins < 60 ? `${mins} min` : hours < 48 ? `${hours} hr` : `${days} day${days === 1 ? "" : "s"}`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-steel/15 text-steel",
  active: "bg-emerald-500/15 text-emerald-300",
  interviewer_joined: "bg-amber-500/15 text-amber-300",
  candidate_waiting: "bg-amber-500/15 text-amber-300",
  completed: "bg-grape/40 text-haze",
  cancelled: "bg-rose-500/15 text-rose-300",
  no_show: "bg-rose-500/15 text-rose-300",
};

export function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? "bg-grape/40 text-haze";
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

const REC_STYLES: Record<string, string> = {
  hire: "bg-emerald-500/15 text-emerald-300",
  hold: "bg-amber-500/15 text-amber-300",
  reject: "bg-rose-500/15 text-rose-300",
  pending: "bg-grape/40 text-haze/70",
};

export function recommendationStyle(rec: string): string {
  return REC_STYLES[rec] ?? "bg-grape/40 text-haze/70";
}

/** Convert an ISO string to the value a <input type="datetime-local"> expects. */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
