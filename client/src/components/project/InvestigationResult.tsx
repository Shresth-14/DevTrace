"use client";

import { ExternalLink } from "lucide-react";
import { Eyebrow, FOCUS, Quote, StatusBadge } from "./ui";
import type { DecisionStatus } from "./types";

/** Mirrors the server's investigation result (server/src/modules/investigation). */
export interface ThreadItemDto {
  ref: string;
  sourceType: string;
  author: string | null;
  text: string;
  url: string;
  at: string | null;
  path?: string;
  line?: number | null;
}

export interface SummaryPointDto {
  kind: string;
  text: string;
  quote: string;
  quoteVerified: boolean;
  sources: { ref: string; sourceType: string; author: string | null; url: string; at: string | null }[];
}

export interface ThreadDecisionDto {
  id: string;
  code: string;
  title: string;
  summary: string;
  status: string;
  reasoning: { category: string; explanation: string }[];
  openQuestions: string | null;
  confidence: number | null;
  alternatives: {
    title: string;
    proposedBy: string | null;
    reason: string | null;
    status: string;
    chosenInstead: string | null;
  }[];
  evidence: { sourceType: string; author: string | null; quote: string; url: string; at: string | null }[];
}

export interface InvestigationResultDto {
  thread: {
    kind: string;
    number: number;
    title: string;
    url: string;
    state: string;
    itemCount: number;
    items: ThreadItemDto[];
  };
  summary: { overview: string; points: SummaryPointDto[]; dropped: number } | null;
  summaryError?: string;
  decisions: ThreadDecisionDto[];
}

const SOURCE_LABEL: Record<string, string> = {
  issue: "Issue description",
  issue_comment: "Comment",
  pull_request: "PR description",
  pr_comment: "PR comment",
  review: "Review",
  review_comment: "Inline review comment",
  commit: "Commit",
  discussion: "Discussion",
  discussion_comment: "Discussion comment",
};

const KIND_LABEL: Record<string, string> = {
  problem: "Problem",
  proposal: "Proposal",
  objection: "Objection",
  agreement: "Agreement",
  question: "Question",
  change: "Change",
  outcome: "Outcome",
  update: "Update",
};

const STATUSES = ["ACCEPTED", "REJECTED", "WITHDRAWN", "UNRESOLVED"] as const;
const toStatus = (s: string): DecisionStatus => {
  const up = s.toUpperCase();
  return (STATUSES as readonly string[]).includes(up) ? (up as DecisionStatus) : "UNRESOLVED";
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : null;

function SourceLink({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 rounded text-xs font-medium text-dt-forest hover:underline ${FOCUS}`}
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

const attribution = (author: string | null, at: string | null, type?: string) =>
  [author ? `@${author}` : "unknown author", when(at), type ? SOURCE_LABEL[type] ?? type : null]
    .filter(Boolean)
    .join(" · ");

interface Props {
  result: InvestigationResultDto;
}

/** Everything an investigation found: what happened, the decisions, and the full conversation. */
export function InvestigationResult({ result }: Props) {
  const { thread, summary, summaryError, decisions } = result;

  return (
    <div className="space-y-8">
      <section aria-labelledby="happened-heading" className="space-y-3">
        <div id="happened-heading">
          <Eyebrow>What happened</Eyebrow>
        </div>
        {summary ? (
          <>
            {summary.overview ? (
              <p className="text-sm leading-relaxed text-dt-ink-strong">
                {summary.overview}
                <span className="ml-2 text-xs text-dt-muted-text">
                  AI summary of the points below, not evidence itself.
                </span>
              </p>
            ) : null}
            {summary.points.length === 0 ? (
              <p className="text-sm text-dt-muted-text">
                The model did not report any point that could be tied to a message in the thread.
              </p>
            ) : (
              <ol className="space-y-5 border-l border-dt-line-strong pl-5">
                {summary.points.map((p, i) => (
                  <li key={`${p.kind}-${i}`} className="space-y-1.5">
                    <p className="text-sm text-dt-ink-strong">
                      <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-dt-accept">
                        {KIND_LABEL[p.kind] ?? p.kind}
                      </span>
                      {p.text}
                    </p>
                    <Quote>
                      {p.quote}
                      {!p.quoteVerified ? (
                        <span className="ml-1 text-xs text-dt-muted-text">
                          (start of the cited message; the model&apos;s wording did not match it exactly)
                        </span>
                      ) : null}
                    </Quote>
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dt-muted-text">
                      {p.sources.map((s) => (
                        <SourceLink key={s.ref} url={s.url} label={attribution(s.author, s.at, s.sourceType)} />
                      ))}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {summary.dropped > 0 ? (
              <p className="text-xs text-dt-muted-text">
                {summary.dropped} point{summary.dropped === 1 ? "" : "s"} the model wrote without a real source
                {summary.dropped === 1 ? " was" : " were"} left out.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-dt-reject">
            {summaryError ?? "A summary could not be produced."} The full conversation is below.
          </p>
        )}
      </section>

      <section aria-labelledby="decisions-heading" className="space-y-3">
        <div id="decisions-heading">
          <Eyebrow>Decisions found ({decisions.length})</Eyebrow>
        </div>
        {decisions.length === 0 ? (
          <p className="text-sm text-dt-muted-text">
            No technical decision was recorded for this thread. If the status above says the analysis did not
            finish, run it again.
          </p>
        ) : (
          <ul className="space-y-4">
            {decisions.map((d) => (
              <li key={d.id} className="space-y-3 rounded-xl border border-dt-line-strong p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge status={toStatus(d.status)} />
                  <span className="font-mono text-xs text-dt-muted-text">{d.code}</span>
                  {d.confidence !== null ? (
                    <span className="text-xs text-dt-muted-text">
                      model confidence {Math.round(d.confidence * 100)}%
                    </span>
                  ) : null}
                </div>
                <h4 className="text-sm font-semibold text-dt-ink-strong">{d.title}</h4>
                <p className="text-sm text-dt-ink">{d.summary}</p>

                {d.reasoning.length > 0 ? (
                  <ul className="space-y-1 text-sm text-dt-ink">
                    {d.reasoning.map((r, i) => (
                      <li key={i}>
                        <span className="text-xs font-semibold uppercase tracking-wider text-dt-muted-text">
                          {r.category.replace(/_/g, " ")}
                        </span>{" "}
                        {r.explanation}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {d.alternatives.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-dt-muted-text">
                      Alternatives considered
                    </p>
                    <ul className="space-y-1.5 border-l-2 border-dt-reject/40 pl-3 text-sm text-dt-ink">
                      {d.alternatives.map((a) => (
                        <li key={a.title}>
                          <span className="font-medium">{a.title}</span>{" "}
                          <span className="text-xs text-dt-muted-text">
                            ({a.status}
                            {a.proposedBy ? `, proposed by @${a.proposedBy}` : ""})
                          </span>
                          {a.reason ? <span> {a.reason}</span> : null}
                          {a.chosenInstead ? (
                            <span className="text-dt-muted-text"> Chosen instead: {a.chosenInstead}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {d.openQuestions ? (
                  <p className="text-sm text-dt-ink">
                    <span className="text-xs font-semibold uppercase tracking-wider text-dt-muted-text">
                      Still open{" "}
                    </span>
                    {d.openQuestions}
                  </p>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-dt-muted-text">Evidence</p>
                  {d.evidence.map((e, i) => (
                    <div key={`${e.url}-${i}`} className="space-y-1">
                      <Quote>{e.quote}</Quote>
                      <SourceLink url={e.url} label={attribution(e.author, e.at, e.sourceType)} />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="conversation-heading">
        <details className="group rounded-xl border border-dt-line-strong">
          <summary
            className={`cursor-pointer select-none rounded-xl px-4 py-3 text-sm font-medium text-dt-ink-strong ${FOCUS}`}
          >
            <span id="conversation-heading">
              Full conversation from GitHub ({thread.itemCount} message{thread.itemCount === 1 ? "" : "s"})
            </span>
          </summary>
          <ol className="divide-y divide-dt-line border-t border-dt-line">
            {thread.items.map((m) => (
              <li key={m.ref} className="space-y-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-dt-muted-text">
                    <span className="font-mono">{m.ref}</span> · {attribution(m.author, m.at, m.sourceType)}
                    {m.path ? ` · ${m.path}${m.line ? `:${m.line}` : ""}` : ""}
                  </p>
                  <SourceLink url={m.url} label="Open on GitHub" />
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-dt-ink">{m.text}</p>
              </li>
            ))}
          </ol>
        </details>
      </section>
    </div>
  );
}
