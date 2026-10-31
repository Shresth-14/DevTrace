"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Search,
} from "lucide-react";
import { API_BASE_URL, getStoredSession } from "@/lib/api";
import { FOCUS } from "./ui";
import { InvestigationResult, type InvestigationResultDto } from "./InvestigationResult";

/** Mirrors the server's investigation record (server/src/modules/investigation). */
export interface InvestigationDto {
  id: string;
  status:
    | "queued"
    | "fetching"
    | "analysing"
    | "done"
    | "partial"
    | "rate_limited"
    | "forbidden"
    | "not_found"
    | "network"
    | "failed";
  source: { number: number; kind?: string; title?: string; url?: string };
  linked: { number: number; kind: "issue" | "pull_request"; url: string }[];
  linkedNotFollowed: number;
  cacheHit: boolean | null;
  decisionsSaved: number;
  error?: string;
  retryAfterSeconds?: number;
  result?: InvestigationResultDto;
}

const ACTIVE = new Set(["queued", "fetching", "analysing"]);

const STATUS_TEXT: Record<InvestigationDto["status"], string> = {
  queued: "Waiting to start",
  fetching: "Fetching the thread from GitHub",
  analysing: "Analysing the discussion",
  done: "Done",
  partial: "Partly done",
  rate_limited: "Paused by GitHub's rate limit",
  forbidden: "No access to this repository",
  not_found: "Not found",
  network: "GitHub could not be reached",
  failed: "Failed",
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const token = getStoredSession();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new Error("Could not reach the Dev Trace server. Check that it is running.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || body.message || `Request failed with HTTP ${res.status}`);
  }
  return body as T;
}

const kindLabel = (kind?: string) =>
  kind === "pull_request" ? "PR" : kind === "issue" ? "Issue" : "Thread";

interface InvestigatePanelProps {
  slug: string;
  repoFullName: string;
  /** Called when an investigation saved new decisions, so the page can reload them. */
  onDecisionsSaved?: () => void;
  /** Polling interval in ms (tests use a short one). */
  pollMs?: number;
}

/** Investigate one issue or pull request on demand, instead of importing the whole repository. */
export function InvestigatePanel({
  slug,
  repoFullName,
  onDecisionsSaved,
  pollMs = 1500,
}: InvestigatePanelProps) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [inv, setInv] = useState<InvestigationDto | null>(null);
  const savedCallback = useRef(onDecisionsSaved);
  useEffect(() => {
    savedCallback.current = onDecisionsSaved;
  }, [onDecisionsSaved]);

  const base = `/api/projects/${encodeURIComponent(slug)}/investigations`;

  // Poll the real status while the server is still working. No simulated progress.
  useEffect(() => {
    if (!inv || !ACTIVE.has(inv.status)) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { investigation } = await call<{ investigation: InvestigationDto }>(
          `${base}/${inv.id}`
        );
        if (cancelled) return;
        setInv(investigation);
        if (!ACTIVE.has(investigation.status) && investigation.decisionsSaved > 0) {
          savedCallback.current?.();
        }
      } catch (err) {
        if (!cancelled) setRequestError(err instanceof Error ? err.message : String(err));
      }
    }, pollMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [inv, base, pollMs]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const value = input.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setRequestError(null);
    try {
      const { investigation } = await call<{ investigation: InvestigationDto }>(base, {
        method: "POST",
        body: JSON.stringify({ input: value }),
      });
      setInv(investigation);
    } catch (err) {
      setInv(null);
      setRequestError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const working = !!inv && ACTIVE.has(inv.status);
  const ok = inv?.status === "done";
  const waiting = inv?.status === "rate_limited";

  return (
    <section
      aria-labelledby="investigate-heading"
      className="rounded-2xl border border-dt-line-strong bg-dt-surface p-5 sm:p-6"
    >
      <h2 id="investigate-heading" className="text-base font-semibold text-dt-ink-strong">
        Investigate an issue or pull request
      </h2>
      <p className="mt-1 text-sm text-dt-muted-text">
        Fetches just that thread and the threads it links to, then finds the decisions in it.
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="investigate-input" className="sr-only">
          Issue or pull request URL or number
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dt-muted"
            aria-hidden="true"
          />
          <input
            id="investigate-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`https://github.com/${repoFullName}/issues/123 or #123`}
            autoComplete="off"
            className="w-full rounded-lg border border-dt-line-strong bg-dt-surface py-2 pl-9 pr-3 text-sm text-dt-ink-strong placeholder:text-dt-muted-text focus:border-dt-sage focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-dt-forest"
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || submitting || working}
          className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-dt-forest px-4 py-2 text-sm font-medium text-dt-bg transition-colors hover:bg-dt-forest-dark disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Investigate
        </button>
      </form>

      {requestError ? (
        <p role="alert" className="mt-3 text-sm text-dt-reject">
          {requestError}
        </p>
      ) : null}

      {inv ? (
        <div className="mt-5 space-y-4 border-t border-dt-line pt-4">
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-dt-ink-strong">
            {working ? (
              <Loader2 className="h-4 w-4 animate-spin text-dt-forest motion-reduce:animate-none" aria-hidden="true" />
            ) : ok ? (
              <CheckCircle2 className="h-4 w-4 text-dt-accept" aria-hidden="true" />
            ) : waiting ? (
              <Clock className="h-4 w-4 text-dt-unresolved" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-dt-unresolved" aria-hidden="true" />
            )}
            {STATUS_TEXT[inv.status]}
          </p>

          {inv.source.url ? (
            <p className="text-sm text-dt-ink">
              <span className="text-dt-muted-text">{kindLabel(inv.source.kind)} </span>
              <a
                href={inv.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-baseline gap-1 rounded font-medium text-dt-forest hover:underline ${FOCUS}`}
              >
                #{inv.source.number} {inv.source.title}
                <ExternalLink className="h-3 w-3 shrink-0 self-center" aria-hidden="true" />
              </a>
            </p>
          ) : (
            <p className="text-sm text-dt-muted-text">#{inv.source.number}</p>
          )}

          {inv.cacheHit === true ? (
            <p className="text-sm text-dt-muted-text">
              Unchanged since it was last analysed, so the stored analysis was reused (no model call).
            </p>
          ) : null}
          {inv.cacheHit === false && !working ? (
            <p className="text-sm text-dt-muted-text">
              Analysed now: {inv.decisionsSaved} decision{inv.decisionsSaved === 1 ? "" : "s"} saved.
            </p>
          ) : null}

          {inv.linked.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-dt-muted-text">
                Linked threads fetched for context
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {inv.linked.map((l) => (
                  <li key={l.number}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`rounded text-sm text-dt-forest hover:underline ${FOCUS}`}
                    >
                      {kindLabel(l.kind)} #{l.number}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {inv.linkedNotFollowed > 0 ? (
            <p className="text-xs text-dt-muted-text">
              {inv.linkedNotFollowed} more linked thread{inv.linkedNotFollowed === 1 ? " was" : "s were"} not
              followed (limit reached).
            </p>
          ) : null}

          {inv.error ? (
            <p className={`text-sm ${ok ? "text-dt-muted-text" : "text-dt-reject"}`}>{inv.error}</p>
          ) : null}

          {inv.result && !working ? (
            <div className="border-t border-dt-line pt-5">
              <InvestigationResult result={inv.result} />
            </div>
          ) : null}

          {waiting ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-dt-ink">
                {inv.retryAfterSeconds !== undefined
                  ? `GitHub asked us to wait about ${inv.retryAfterSeconds} seconds.`
                  : "GitHub asked us to wait before trying again."}
              </p>
              <button
                type="button"
                onClick={() => submit()}
                disabled={submitting}
                className={`cursor-pointer rounded-lg border border-dt-line-strong px-3 py-1.5 text-xs font-medium text-dt-ink-strong hover:bg-dt-bg2/60 disabled:opacity-60 ${FOCUS}`}
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
