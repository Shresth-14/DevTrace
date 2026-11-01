"use client";

import { AlertTriangle, CheckCircle2, Loader2, RotateCw } from "lucide-react";
import { AI_LABEL, SYNC_LABEL, relativeTime } from "@/lib/format";
import type { ProjectStatus } from "./types";
import { FOCUS } from "./ui";

const button = `inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dt-line-strong bg-dt-surface px-3 py-1.5 text-xs font-medium text-dt-ink-strong transition-colors hover:bg-dt-bg2/60 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;

function Icon({ status }: { status: string }) {
  if (status === "running" || status === "queued") {
    return <Loader2 className="h-4 w-4 animate-spin text-dt-forest" aria-hidden="true" />;
  }
  if (status === "completed") {
    return <CheckCircle2 className="h-4 w-4 text-dt-accept" aria-hidden="true" />;
  }
  if (status === "pending" || status === "never") {
    return <span className="h-2 w-2 rounded-full bg-dt-muted" aria-hidden="true" />;
  }
  return <AlertTriangle className="h-4 w-4 text-dt-unresolved" aria-hidden="true" />;
}

const RESOURCE_LABEL: Record<string, string> = {
  issues: "Issues",
  issueComments: "Issue comments",
  pullRequests: "Pull requests",
  prComments: "PR comments",
  prReviews: "Reviews",
  reviewComments: "Inline comments",
  prFiles: "Changed files",
  prCommits: "PR commits",
  commits: "Commits",
  discussions: "Discussions",
  repoFiles: "Files",
  references: "Links",
  historicalIssues: "Linked older issues",
  historicalPullRequests: "Linked older PRs",
};

const COUNT_LABEL: Record<string, string> = {
  issues: "open issues",
  pullRequests: "open PRs",
  discussions: "discussions",
};

interface StatusPanelProps {
  status: ProjectStatus;
  isOwner: boolean;
  busy: boolean;
  onSync: () => void;
  onExtract: (force: boolean) => void;
}

/** GitHub import and AI analysis are separate steps and are reported separately. */
export function StatusPanel({ status, isOwner, busy, onSync, onExtract }: StatusPanelProps) {
  const syncing = status.syncStatus === "running" || status.syncStatus === "queued";
  const analysing = status.aiStatus === "running";
  const failedResources = Object.entries(status.latestJob?.resources ?? {}).filter(
    ([, r]) => r.status === "error" || r.status === "partial"
  );
  const run = status.latestRun;

  return (
    <section
      aria-label="Processing status"
      className="grid gap-x-10 gap-y-5 border-y border-dt-line py-5 md:grid-cols-2"
    >
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-sm font-medium text-dt-ink-strong">
          <Icon status={status.syncStatus} />
          1 · GitHub import: {SYNC_LABEL[status.syncStatus] ?? status.syncStatus}
        </p>
        <p className="text-xs text-dt-muted-text">
          {status.lastSyncedAt
            ? `Last imported ${relativeTime(status.lastSyncedAt)}.`
            : "Nothing has been imported yet."}
        </p>
        {syncing && status.latestJob?.resources ? (
          <p className="text-xs text-dt-muted-text" aria-live="polite">
            Imported so far:{" "}
            {Object.entries(status.latestJob.resources)
              .map(([name, r]) =>
                r.status === "error"
                  ? `${RESOURCE_LABEL[name] ?? name} failed`
                  : r.discovered !== undefined && COUNT_LABEL[name]
                    ? `${r.count} of ${r.discovered} ${COUNT_LABEL[name]}`
                    : `${RESOURCE_LABEL[name] ?? name} ${r.count}`
              )
              .join(" · ") || "starting…"}
          </p>
        ) : null}
        {status.latestJob?.error ? (
          <p role="alert" className="text-xs text-dt-reject">{status.latestJob.error}</p>
        ) : null}
        {failedResources.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-dt-unresolved">
            {failedResources.map(([name, r]) => (
              <li key={name}>
                {name}: {r.status}
                {r.error ? ` — ${r.error}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {isOwner ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={onSync} disabled={busy || syncing} className={button}>
              <RotateCw className={`h-3.5 w-3.5 text-dt-muted-text ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
              {syncing ? "Importing…" : "Sync now"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-sm font-medium text-dt-ink-strong">
          <Icon status={status.aiStatus} />
          2 · Decision analysis: {AI_LABEL[status.aiStatus] ?? status.aiStatus}
        </p>
        <p className="text-xs text-dt-muted-text">
          {analysing && run
            ? `${run.unitsDone} of ${run.unitsTotal} discussions reviewed · ${run.decisionsSaved} decision record${run.decisionsSaved === 1 ? "" : "s"} saved.`
            : status.lastExtractedAt
              ? `Last analysed ${relativeTime(status.lastExtractedAt)}${run ? ` with ${run.model}` : ""}.`
              : status.aiStatus === "not_configured"
                ? "Configure Ollama in server/.env to enable analysis."
                : "Waits for the GitHub import to finish."}
        </p>
        {analysing && run && run.unitsTotal > 0 ? (
          <div
            role="progressbar"
            aria-label="Discussions reviewed"
            aria-valuemin={0}
            aria-valuemax={run.unitsTotal}
            aria-valuenow={run.unitsDone}
            className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-dt-bg2"
          >
            <div
              className="h-full bg-dt-forest transition-[width] duration-500"
              style={{ width: `${Math.min(100, (run.unitsDone / run.unitsTotal) * 100)}%` }}
            />
          </div>
        ) : null}
        {run?.error && !analysing ? (
          <p role="alert" className="text-xs text-dt-unresolved">{run.error}</p>
        ) : null}
        {run && run.unitsFailed > 0 && !analysing ? (
          <p className="text-xs text-dt-unresolved">
            {run.unitsFailed} discussion{run.unitsFailed === 1 ? "" : "s"} failed and will be retried on the next run. Imported sources are unaffected.
          </p>
        ) : null}
        {isOwner ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => onExtract(false)}
              disabled={busy || analysing || syncing}
              className={button}
              title="Analyse new or changed discussions, and retry failed ones"
            >
              {analysing ? "Analysing…" : "Run analysis"}
            </button>
            <button
              type="button"
              onClick={() => onExtract(true)}
              disabled={busy || analysing || syncing}
              className={button}
              title="Re-analyse every discussion, even unchanged ones"
            >
              Re-analyse all
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
