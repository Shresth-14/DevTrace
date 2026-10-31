"use client";

import { useMemo } from "react";
import { ArrowRight, Layers } from "lucide-react";
import type {
  ActivityEvent,
  CodeRelationship,
  DecisionRecord,
  DecisionStatus,
  PrIntelligenceItem,
  ProjectTab,
  RejectedApproach,
  SourceWithRefs,
} from "./types";
import {
  EmptyState,
  Eyebrow,
  FOCUS,
  FilePath,
  STATUS_META,
  StatusDot,
  dateValue,
} from "./ui";

interface OverviewSectionProps {
  decisions: DecisionRecord[];
  rejectedApproaches: RejectedApproach[];
  sources: SourceWithRefs[];
  codeRelationships: CodeRelationship[];
  prs: PrIntelligenceItem[];
  activity: ActivityEvent[];
  onOpenDecision: (id: string) => void;
  onNavigate: (tab: ProjectTab) => void;
}

const STATUS_ORDER: DecisionStatus[] = [
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "UNRESOLVED",
];

const linkButton = `inline-flex items-center gap-1 rounded text-sm font-medium text-dt-forest hover:text-dt-forest-dark hover:underline cursor-pointer ${FOCUS}`;

export function OverviewSection({
  decisions,
  rejectedApproaches,
  sources,
  codeRelationships,
  prs,
  activity,
  onOpenDecision,
  onNavigate,
}: OverviewSectionProps) {
  const counts = useMemo(() => {
    const c: Record<DecisionStatus, number> = {
      ACCEPTED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
      UNRESOLVED: 0,
    };
    decisions.forEach((d) => {
      c[d.status] += 1;
    });
    return c;
  }, [decisions]);

  const recent = useMemo(
    () =>
      [...decisions]
        .sort((a, b) => dateValue(b.date) - dateValue(a.date))
        .slice(0, 4),
    [decisions]
  );

  const hotspots = useMemo(
    () =>
      [...codeRelationships]
        .sort((a, b) => b.decisions.length - a.decisions.length)
        .slice(0, 4),
    [codeRelationships]
  );

  const lastSync = activity.find((a) => a.type === "sync_completed");
  const needsReview = prs.filter((p) => p.checkStatus === "NEEDS_REVIEW");

  // Insights are computed from the records above, never written by hand.
  const insights: string[] = [];
  if (decisions.length > 0 && rejectedApproaches.length > 0) {
    insights.push(
      `${rejectedApproaches.length} of ${decisions.length} decisions record an alternative that was considered and rejected.`
    );
  }
  if (needsReview.length > 0) {
    insights.push(
      `${needsReview.length} pull request${needsReview.length === 1 ? "" : "s"} touch${needsReview.length === 1 ? "es" : ""} code governed by a previous decision and need${needsReview.length === 1 ? "s" : ""} review.`
    );
  }
  if (hotspots[0] && hotspots[0].decisions.length > 1) {
    insights.push(
      `${hotspots[0].path} is shaped by ${hotspots[0].decisions.length} decisions, the most of any file.`
    );
  }

  if (decisions.length === 0) {
    return (
      <EmptyState icon={Layers} title="No decisions recovered yet">
        Once Dev Trace has processed this repository&apos;s issues, pull
        requests and discussions, a summary of its decisions will appear here.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-12">
      {/* Summary: one lead figure, supporting figures separated by dividers */}
      <section
        aria-label="Project summary"
        className="grid gap-x-14 gap-y-8 border-b border-dt-line pb-10 lg:grid-cols-12"
      >
        <div className="lg:col-span-5">
          <p className="font-mono text-7xl font-extralight leading-none tracking-tight text-dt-ink-strong tabular-nums">
            {decisions.length}
          </p>
          <p className="mt-3 text-sm font-medium text-dt-ink-strong">
            Decisions recorded
          </p>
          <div
            className="mt-4 flex h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-dt-bg2"
            role="img"
            aria-label={STATUS_ORDER.map(
              (s) => `${counts[s]} ${STATUS_META[s].label.toLowerCase()}`
            ).join(", ")}
          >
            {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <span
                key={s}
                className={STATUS_META[s].dot}
                style={{ width: `${(counts[s] / decisions.length) * 100}%` }}
              />
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:col-span-7 lg:border-l lg:border-dt-line lg:pl-12">
          {STATUS_ORDER.map((s) => (
            <div key={s}>
              <dt className="flex items-center gap-1.5 text-xs text-dt-muted-text">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dot}`}
                  aria-hidden="true"
                />
                {STATUS_META[s].label}
              </dt>
              <dd className="mt-1 font-mono text-3xl font-light tabular-nums text-dt-ink-strong">
                {counts[s]}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-dt-muted-text">Alternatives considered</dt>
            <dd className="mt-1 font-mono text-3xl font-light tabular-nums text-dt-ink-strong">
              {rejectedApproaches.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-dt-muted-text">Connected sources</dt>
            <dd className="mt-1 font-mono text-3xl font-light tabular-nums text-dt-ink-strong">
              {sources.length}
            </dd>
          </div>
          {lastSync ? (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs text-dt-muted-text">Last sync event</dt>
              <dd className="mt-1 text-sm text-dt-ink">
                {lastSync.timestamp}
                <span className="text-dt-muted-text"> · {lastSync.source}</span>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {insights.length > 0 ? (
        <section aria-labelledby="insights-heading" className="space-y-3">
          <div id="insights-heading">
            <Eyebrow>What stands out</Eyebrow>
          </div>
          <ul className="space-y-2 text-sm leading-relaxed text-dt-ink">
            {insights.map((text) => (
              <li key={text} className="flex gap-3">
                <span
                  className="mt-2 h-1 w-1 shrink-0 rounded-full bg-dt-sage"
                  aria-hidden="true"
                />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-12">
        <section aria-labelledby="recent-heading" className="lg:col-span-7">
          <div className="flex items-baseline justify-between">
            <div id="recent-heading">
              <Eyebrow>Recent decisions</Eyebrow>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("decisions")}
              className={linkButton}
            >
              View all {decisions.length}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-3 divide-y divide-dt-line border-y border-dt-line">
            {recent.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onOpenDecision(d.id)}
                  className={`group -mx-3 block w-[calc(100%+1.5rem)] cursor-pointer rounded-lg px-3 py-4 text-left transition-colors hover:bg-dt-surface ${FOCUS}`}
                >
                  <span className="flex items-start justify-between gap-4">
                    <span className="min-w-0 text-sm font-medium text-dt-ink-strong group-hover:underline">
                      {d.title}
                    </span>
                    <StatusDot status={d.status} />
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-dt-muted-text">
                    {d.summary}
                  </span>
                  <span className="mt-2 block font-mono text-xs text-dt-muted-text">
                    {d.id} · {d.date} · {d.author}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="activity-heading" className="lg:col-span-5">
          <div id="activity-heading">
            <Eyebrow>Recent activity</Eyebrow>
          </div>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-dt-muted-text">
              No activity recorded yet.
            </p>
          ) : (
            <ol className="relative mt-4 space-y-6 border-l border-dt-line-strong pl-6">
              {activity.map((a) => (
                <li key={a.id} className="relative">
                  <span
                    className="absolute -left-[1.85rem] top-1.5 h-2 w-2 rounded-full border border-dt-sage bg-dt-bg"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-dt-ink-strong">
                    {a.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-dt-muted-text">
                    {a.description}
                  </p>
                  <p className="mt-1 font-mono text-xs text-dt-muted-text">
                    {a.timestamp} · {a.source}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {hotspots.length > 0 ? (
        <section
          aria-labelledby="hotspots-heading"
          className="border-t border-dt-line pt-8"
        >
          <div className="flex items-baseline justify-between">
            <div id="hotspots-heading">
              <Eyebrow>Files shaped by the most decisions</Eyebrow>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("code")}
              className={linkButton}
            >
              All code relationships
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-3 divide-y divide-dt-line border-y border-dt-line">
            {hotspots.map((f) => (
              <li
                key={f.path}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <FilePath path={f.path} lines={f.lines} />
                <span className="shrink-0 text-xs text-dt-muted-text">
                  {f.decisions.length} decision
                  {f.decisions.length === 1 ? "" : "s"} ·{" "}
                  <span className="font-mono">
                    {f.decisions.map((d) => d.id).join(", ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
