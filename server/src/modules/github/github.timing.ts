import type { Octokit } from "octokit";

/**
 * Opt-in diagnostics for GitHub traffic. Set ANALYSIS_TIMING=1 to log every GitHub
 * request (method, route, status, duration, rate-limit headers) and a per-endpoint
 * summary after each sync. When the flag is off nothing is recorded or logged and
 * requests pass through untouched.
 */
export function timingEnabled(): boolean {
  const v = process.env.ANALYSIS_TIMING?.trim().toLowerCase();
  return !!v && v !== "0" && v !== "false" && v !== "off";
}

interface EndpointStat {
  count: number;
  errors: number;
  ms: number;
}

const stats = new Map<string, EndpointStat>();

type Headers = Record<string, string | number | undefined>;

function record(
  key: string,
  startedAt: number,
  status: number,
  headers: Headers | undefined,
  failed: boolean
): void {
  const ms = Date.now() - startedAt;
  const s = stats.get(key) ?? { count: 0, errors: 0, ms: 0 };
  s.count += 1;
  s.ms += ms;
  if (failed) s.errors += 1;
  stats.set(key, s);

  // Only these headers are ever logged; credentials are never included.
  const extra = [
    ["remaining", headers?.["x-ratelimit-remaining"]],
    ["reset", headers?.["x-ratelimit-reset"]],
    ["retry-after", headers?.["retry-after"]],
  ]
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(
    `[GitHub timing] ${key} ${status} ${ms}ms${extra ? ` ${extra}` : ""}`
  );
}

/** Octokit plugin: wraps every request. A pass-through unless ANALYSIS_TIMING is set. */
export function requestTiming(octokit: Pick<Octokit, "hook">): void {
  octokit.hook.wrap("request", async (request, options) => {
    if (!timingEnabled()) return request(options);
    const key = `${options.method} ${options.url}`;
    const startedAt = Date.now();
    try {
      const res = await request(options);
      record(key, startedAt, res.status, res.headers as Headers, false);
      return res;
    } catch (err) {
      const e = err as { status?: number; response?: { headers?: Headers } };
      record(key, startedAt, e.status ?? 0, e.response?.headers, true);
      throw err;
    }
  });
}

export function getRequestStats(): ReadonlyMap<string, EndpointStat> {
  return stats;
}

export function resetRequestStats(): void {
  stats.clear();
}

/** Logs request counts per endpoint since the last reset, then resets. */
export function logRequestSummary(label: string): void {
  if (!timingEnabled()) return;
  const rows = [...stats.entries()].sort((a, b) => b[1].count - a[1].count);
  const total = rows.reduce((n, [, s]) => n + s.count, 0);
  const errors = rows.reduce((n, [, s]) => n + s.errors, 0);
  console.log(
    `[GitHub timing] ${label}: ${total} request(s), ${errors} failed`
  );
  for (const [key, s] of rows) {
    console.log(
      `[GitHub timing]   ${String(s.count).padStart(5)}  ${key}  (${s.ms}ms total${s.errors ? `, ${s.errors} failed` : ""})`
    );
  }
  stats.clear();
}
