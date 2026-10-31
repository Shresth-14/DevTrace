/** "3 hours ago" style label for an ISO timestamp. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
    [2592000, "month"],
    [31536000, "year"],
  ];
  let label = "minute";
  let size = 60;
  for (const [n, name] of units) {
    if (s >= n) {
      size = n;
      label = name;
    }
  }
  const v = Math.floor(s / size);
  return `${v} ${label}${v === 1 ? "" : "s"} ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "date unknown";
  const t = new Date(iso);
  return Number.isNaN(t.getTime())
    ? "date unknown"
    : t.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export const SYNC_LABEL: Record<string, string> = {
  never: "Not synced yet",
  queued: "Sync queued",
  running: "Fetching GitHub data",
  completed: "GitHub data imported",
  partial: "Partially imported",
  failed: "GitHub import failed",
};

export const AI_LABEL: Record<string, string> = {
  pending: "Analysis pending",
  running: "Analysing discussions",
  completed: "Analysis complete",
  partial: "Partially analysed",
  failed: "Analysis failed",
  not_configured: "AI not configured",
};
