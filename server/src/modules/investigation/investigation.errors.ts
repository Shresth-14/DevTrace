type Headers = Record<string, string | number | undefined>;

interface ErrorLike {
  status?: number;
  message?: string;
  response?: { headers?: Headers };
  /** GraphQL errors from @octokit/graphql */
  errors?: { type?: string; message?: string }[];
}

const num = (v: string | number | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Recognises GitHub's primary and secondary rate limits (REST 403/429 and GraphQL
 * RATE_LIMITED) and returns how long GitHub asked us to wait, when it said so.
 * Returns null for every other failure, including permission errors.
 */
export function rateLimitInfo(
  err: unknown,
  nowMs = Date.now()
): { retryAfterSeconds?: number } | null {
  if (!err || typeof err !== "object") return null;
  const e = err as ErrorLike;
  const headers = e.response?.headers ?? {};
  const retryAfter = num(headers["retry-after"]);
  const remaining = num(headers["x-ratelimit-remaining"]);
  const reset = num(headers["x-ratelimit-reset"]);
  const mentions = /rate limit/i.test(e.message ?? "");

  const limited =
    e.status === 429 ||
    (e.status === 403 &&
      (retryAfter !== undefined || remaining === 0 || mentions)) ||
    e.errors?.some((x) => x.type === "RATE_LIMITED") === true ||
    (e.status === undefined && mentions);
  if (!limited) return null;

  if (retryAfter !== undefined) return { retryAfterSeconds: retryAfter };
  if (reset !== undefined) {
    return {
      retryAfterSeconds: Math.max(0, Math.ceil(reset - nowMs / 1000)),
    };
  }
  return {};
}

export type GithubFailure =
  | "rate_limited"
  | "forbidden"
  | "not_found"
  | "network"
  | "failed";

const NETWORK =
  /fetch failed|network|socket hang up|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|timed? ?out/i;

/** Sorts a GitHub failure into the status the user sees. Rate limits are checked first. */
export function classifyGithubError(
  err: unknown,
  nowMs = Date.now()
): { status: GithubFailure; retryAfterSeconds?: number } {
  const limited = rateLimitInfo(err, nowMs);
  if (limited) return { status: "rate_limited", ...limited };
  const e = (err && typeof err === "object" ? err : {}) as ErrorLike & {
    code?: string;
    cause?: { code?: string; message?: string };
  };
  if (e.status === 401 || e.status === 403) return { status: "forbidden" };
  if (e.status === 404) return { status: "not_found" };
  // Octokit reports a request that never reached GitHub as status 500 with the cause.
  const text = [e.message, e.code, e.cause?.code, e.cause?.message]
    .filter(Boolean)
    .join(" ");
  if ((e.status === undefined || e.status === 500) && NETWORK.test(text)) {
    return { status: "network" };
  }
  return { status: "failed" };
}
