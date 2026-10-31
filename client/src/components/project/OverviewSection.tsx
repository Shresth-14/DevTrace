"use client";

import { useMemo } from "react";
import { ArrowRight, Layers } from "lucide-react";
import { formatDate, relativeTime } from "@/lib/format";
import type {
  CodeRelationship,
  DecisionRecord,
  DecisionStatus,
  OverviewData,
  ProjectTab,
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
  overview: OverviewData;
  decisions: DecisionRecord[];
  codeRelationships: CodeRelationship[];
  onOpenDecision: (id: string) => void;
  onNavigate: (tab: ProjectTab) => void;
}

const STATUS_ORDER: DecisionStatus[] = [
  "ACCEPTED",
  "REJECTED",
  "PROPOSED",
  "WITHDRAWN",
  "UNRESOLVED",
];

const linkButton = `inline-flex items-center gap-1 rounded text-sm font-medium text-dt-forest hover:text-dt-forest-dark hover:underline cursor-pointer ${FOCUS}`;

function emptyReason(o: OverviewData): string {
  const { syncStatus, aiStatus, latestRun } = o.status;
  if (syncStatus === "running" || syncStatus === "queued") {
    return "The repository history is still being imported from GitHub. Decisions are extracted afterwards.";
  }
  if (syncStatus === "never") {
    return "This repository has not been imported yet. Use “Sync now” above to start.";
  }
  if (syncStatus === "failed") {
    return "The GitHub import failed, so there is nothing to analyse. See the status above for the reason.";
  }
  if (aiStatus === "not_configured") {
    return "The sources are imported, but AI analysis is not configured on this server, so no decisions can be extracted.";
  }
  if (aiStatus === "running") {
    return "Discussions are being analysed right now. Decisions will appear as they are validated.";
  }
  if (aiStatus === "failed") {
    return "Imported sources are safe, but the analysis failed. See the status above, then run the analysis again.";
  }
  if (aiStatus === "pending") {
    return "The sources are imported. Run the analysis above to extract decisions.";
  }
  if (latestRun && latestRun.status === "completed") {
    return "The analysis finished and found no decisions that the discussions establish with evidence. That is a valid result, not an error.";
  }
  return "No decisions have been recorded yet.";
}

export function OverviewSection({
  overview,
  decisions,
  codeRelationships,
  onOpenDecision,
  onNavigate,
}: OverviewSectionProps) {
  const { counts, sources, activity } = overview;

  const recent = useMemo(
    () => [...decisions].sort((a, b) => dateValue(b.date) - dateValue(a.date)).slice(0, 4),
    [decisions]
  );
  const hotspots = useMemo(
    () =>
      [...codeRelationships]
        .sort((a, b) => b.decisions.length - a.decisions.length)
        .filter((f) => f.decisions.length > 1)
        .slice(0, 4),
    [codeRelationships]
  );

  const { threads } = overview;
  const res = overview.status.latestJob?.resources ?? {};
  const ofTotal = (stored: number, discovered: number | undefined) =>
    discovered !== undefined && discovered !== stored
      ? `${stored} of ${discovered}`
      : String(stored);

  const stat = (label: string, value: string, hint?: string) => (
    <div key={label}>
      <dt className="text-xs text-dt-muted-text">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-light tabular-nums text-dt-ink-strong">
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-[11px] text-dt-muted-text">{hint}</p> : null}
    </div>
  );

  const notes = ["issues", "pullRequests", "discussions", "references"]
    .map((k) => res[k]?.note)
    .filter((n): n is string => !!n);

  const sourceGrid = (
    <div className="space-y-10">
      <section aria-labelledby="current-heading" className="space-y-3">
        <div id="current-heading">
          <Eyebrow>Current work (open on GitHub)</Eyebrow>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
          {stat(
            "Open issues",
            ofTotal(threads.issues.open, res.issues?.discovered),
            res.issues?.discovered !== undefined ? "imported of those on GitHub" : undefined
          )}
          {stat(
            "Open pull requests",
            ofTotal(threads.pullRequests.open, res.pullRequests?.discovered),
            res.pullRequests?.discovered !== undefined ? "imported of those on GitHub" : undefined
          )}
          {stat(
            "Closed since import",
            String(threads.issues.resolvedCurrent + threads.pullRequests.resolvedCurrent),
            "were current work, now resolved"
          )}
          {stat("Discussions", ofTotal(sources.discussions, res.discussions?.discovered))}
        </dl>
      </section>

      <section aria-labelledby="history-heading" className="space-y-3">
        <div id="history-heading">
          <Eyebrow>Linked history (older threads current work points to)</Eyebrow>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
          {stat("Older issues", String(threads.issues.linkedHistory))}
          {stat("Older pull requests", String(threads.pullRequests.linkedHistory))}
          {stat("Explicit links", String(threads.references), "#N, URLs, closing references")}
          {threads.issues.otherHistory + threads.pullRequests.otherHistory > 0
            ? stat(
                "Earlier imports",
                String(threads.issues.otherHistory + threads.pullRequests.otherHistory),
                "not linked to current work"
              )
            : null}
        </dl>
      </section>

      <section aria-labelledby="sources-heading" className="space-y-3">
        <div id="sources-heading">
          <Eyebrow>Conversation records stored</Eyebrow>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
          {stat("Issue comments", String(sources.issueComments))}
          {stat("PR comments", String(sources.prComments))}
          {stat("Reviews", String(sources.reviews))}
          {stat("Inline comments", String(sources.reviewComments))}
          {stat("Discussion comments", String(sources.discussionComments))}
          {stat("Commits", String(sources.commits))}
          {stat("Changed files", String(sources.prFiles))}
          {stat("Repository files", String(sources.files))}
        </dl>
        <p className="text-[11px] leading-relaxed text-dt-muted-text">
          Quiet threads (fewer than two messages) keep metadata only, so comment
          counts cover discussed threads, not every thread.
        </p>
      </section>

      {notes.length > 0 ? (
        <ul className="space-y-1 text-xs text-dt-unresolved">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  if (counts.total === 0) {
    return (
      <div className="space-y-12">
        <EmptyState icon={Layers} title="No decisions extracted yet">
          {emptyReason(overview)}
        </EmptyState>
        {sourceGrid}
      </div>
    );
  }

  const insights: string[] = [];
  if (counts.rejectedAlternatives > 0) {
    insights.push(
      `${counts.rejectedAlternatives} alternative${counts.rejectedAlternatives === 1 ? " was" : "s were"} explicitly rejected in these discussions.`
    );
  }
  if (counts.unresolved + counts.proposed > 0) {
    insights.push(
      `${counts.unresolved + counts.proposed} proposal${counts.unresolved + counts.proposed === 1 ? "" : "s"} have no established outcome yet.`
    );
  }
  if (hotspots[0]) {
    insights.push(`${hotspots[0].path} is shaped by ${hotspots[0].decisions.length} decisions, the most of any file.`);
  }

  const count: Record<DecisionStatus, number> = {
    ACCEPTED: counts.accepted,
    REJECTED: counts.rejected,
    PROPOSED: counts.proposed,
    WITHDRAWN: counts.withdrawn,
    UNRESOLVED: counts.unresolved,
  };

  return (
    <div className="space-y-12">
      <section
        aria-label="Project summary"
        className="grid gap-x-14 gap-y-8 border-b border-dt-line pb-10 lg:grid-cols-12"
      >
        <div className="lg:col-span-5">
          <p className="font-mono text-7xl font-extralight leading-none tracking-tight text-dt-ink-strong tabular-nums">
            {counts.total}
          </p>
          <p className="mt-3 text-sm font-medium text-dt-ink-strong">Decisions recorded</p>
          <div
            className="mt-4 flex h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-dt-bg2"
            role="img"
            aria-label={STATUS_ORDER.map((s) => `${count[s]} ${STATUS_META[s].label.toLowerCase()}`).join(", ")}
          >
            {STATUS_ORDER.filter((s) => count[s] > 0).map((s) => (
              <span key={s} className={STATUS_META[s].dot} style={{ width: `${(count[s] / counts.total) * 100}%` }} />
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:col-span-7 lg:border-l lg:border-dt-line lg:pl-12">
          {STATUS_ORDER.map((s) => (
            <div key={s}>
              <dt className="flex items-center gap-1.5 text-xs text-dt-muted-text">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dot}`} aria-hidden="true" />
                {STATUS_META[s].label}
              </dt>
              <dd className="mt-1 font-mono text-3xl font-light tabular-nums text-dt-ink-strong">{count[s]}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-dt-muted-text">Alternatives rejected</dt>
            <dd className="mt-1 font-mono text-3xl font-light tabular-nums text-dt-ink-strong">{counts.rejectedAlternatives}</dd>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-xs text-dt-muted-text">Last import</dt>
            <dd className="mt-1 text-sm text-dt-ink">
              {overview.status.lastSyncedAt
                ? `${formatDate(overview.status.lastSyncedAt)} (${relativeTime(overview.status.lastSyncedAt)})`
                : "never"}
            </dd>
          </div>
        </dl>
      </section>

      {sourceGrid}

      {insights.length > 0 ? (
        <section aria-labelledby="insights-heading" className="space-y-3">
          <div id="insights-heading">
            <Eyebrow>What stands out</Eyebrow>
          </div>
          <ul className="space-y-2 text-sm leading-relaxed text-dt-ink">
            {insights.map((text) => (
              <li key={text} className="flex gap-3">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-dt-sage" aria-hidden="true" />
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
            <button type="button" onClick={() => onNavigate("decisions")} className={linkButton}>
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
                    <span className="min-w-0 text-sm font-medium text-dt-ink-strong group-hover:underline">{d.title}</span>
                    <StatusDot status={d.status} />
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-dt-muted-text">{d.summary}</span>
                  <span className="mt-2 block font-mono text-xs text-dt-muted-text">
                    {d.id} · {formatDate(d.date)}
                    {d.author ? ` · @${d.author}` : ""}
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
            <p className="mt-3 text-sm text-dt-muted-text">No activity recorded yet.</p>
          ) : (
            <ol className="relative mt-4 space-y-6 border-l border-dt-line-strong pl-6">
              {activity.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[1.85rem] top-1.5 h-2 w-2 rounded-full border border-dt-sage bg-dt-bg" aria-hidden="true" />
                  <p className="text-sm font-medium text-dt-ink-strong">{a.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-dt-muted-text">{a.description}</p>
                  <p className="mt-1 font-mono text-xs text-dt-muted-text">
                    {relativeTime(a.timestamp)} · {a.source}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {hotspots.length > 0 ? (
        <section aria-labelledby="hotspots-heading" className="border-t border-dt-line pt-8">
          <div className="flex items-baseline justify-between">
            <div id="hotspots-heading">
              <Eyebrow>Files shaped by the most decisions</Eyebrow>
            </div>
            <button type="button" onClick={() => onNavigate("code")} className={linkButton}>
              All code relationships
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-3 divide-y divide-dt-line border-y border-dt-line">
            {hotspots.map((f) => (
              <li key={f.path} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <FilePath path={f.path} lines={f.lines} />
                <span className="shrink-0 text-xs text-dt-muted-text">
                  {f.decisions.length} decisions ·{" "}
                  <span className="font-mono">{f.decisions.map((d) => d.id).join(", ")}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
