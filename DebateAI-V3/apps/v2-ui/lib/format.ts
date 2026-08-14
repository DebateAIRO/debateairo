export function relativeTime(input: string | null | undefined): string {
  if (!input) return "";
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  const week = Math.round(day / 7);
  if (week < 5) return `${week} week${week === 1 ? "" : "s"} ago`;
  return new Date(input).toLocaleDateString();
}

export function statusLabel(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "complete" || s === "completed" || s === "done") return "Complete";
  if (s === "queued") return "Queued";
  if (s === "claimed") return "Claimed";
  if (s === "running") return "Running";
  if (s === "settled") return "Settled";
  if (s === "generating" || s === "in_progress" || s === "pending") return "Generating";
  if (s === "failed" || s === "error") return "Failed";
  if (s === "draft") return "Draft";
  return status || "—";
}

export function isComplete(status: string): boolean {
  const s = (status || "").toLowerCase();
  return s === "complete" || s === "completed" || s === "done";
}
