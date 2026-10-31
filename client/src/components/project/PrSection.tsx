"use client";

import { AlertTriangle, ExternalLink, GitPullRequest } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { DecisionRecord, PrIntelligenceItem } from "./types";
import {
  EmptyState,
  FOCUS,
  FilePath,
  SectionHeader,
  StatusDot,
} from "./ui";

interface PrSectionProps {
  prs: PrIntelligenceItem[];
  scanned: number;
  decisions: DecisionRecord[];
  onOpenDecision: (id: string) => void;
}

const PR_STATUS: Record<PrIntelligenceItem["status"], string> = {
  open: "Open",
  merged: "Merged",
  closed: "Closed",
};

export function PrSection({ prs, scanned, decisions, onOpenDecision }: PrSectionProps) {
  return (
    <div className="space-y-8">
      <SectionHeader
        title="PR intelligence"
        description="Pull requests whose changed files are tied to an earlier decision, so reviewers can read the history first. Matching uses file paths only."
      />

      {prs.length === 0 ? (
        <EmptyState icon={GitPullRequest} title="No pull requests matched">
          {decisions.length === 0
            ? "There are no decisions with linked code yet, so no pull request can be matched."
            : `None of the ${scanned} most recent pull requests change a file that a recorded decision is linked to.`}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-dt-muted-text">
            <span className="font-medium text-dt-ink-strong">{prs.length}</span> of{" "}
            {scanned} recent pull request{scanned === 1 ? "" : "s"} touch files
            governed by an earlier decision.
          </p>

          <ul className="divide-y divide-dt-line border-y border-dt-line">
            {prs.map((pr) => {
              const touchesRejected = pr.matches.some((m) => m.decisionStatus === "REJECTED");
              return (
                <li key={pr.prNumber} className="space-y-4 py-7">
                  <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-2 font-mono text-xs text-dt-muted-text">
                      <GitPullRequest className="h-3.5 w-3.5 text-dt-accept" aria-hidden="true" />
                      #{pr.prNumber} · {PR_STATUS[pr.status]}
                    </p>
                    <h3 className="text-base font-semibold leading-snug text-dt-ink-strong">
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 rounded hover:underline ${FOCUS}`}
                      >
                        {pr.title}
                        <ExternalLink className="h-3.5 w-3.5 text-dt-muted-text" aria-hidden="true" />
                      </a>
                    </h3>
                    <p className="text-xs text-dt-muted-text">
                      {pr.author ? `@${pr.author} · ` : ""}
                      updated {formatDate(pr.date)}
                    </p>
                  </div>

                  {touchesRejected ? (
                    <div
                      role="note"
                      className="flex gap-3 border-l-2 border-dt-unresolved bg-dt-unresolved-bg/50 py-3 pl-4 pr-4"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dt-unresolved" aria-hidden="true" />
                      <p className="text-sm leading-relaxed text-dt-ink-strong">
                        This pull request touches code tied to a decision whose
                        status is Rejected. Check it before merging.
                      </p>
                    </div>
                  ) : null}

                  <ul className="space-y-4">
                    {pr.matches.map((m) => (
                      <li key={m.decisionId} className="space-y-2 rounded-xl bg-dt-surface p-4">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm">
                          <button
                            type="button"
                            onClick={() => onOpenDecision(m.decisionId)}
                            className={`cursor-pointer rounded text-left font-medium text-dt-forest hover:underline ${FOCUS}`}
                          >
                            <span className="font-mono text-xs">{m.decisionId}</span> {m.decisionTitle}
                          </button>
                          <StatusDot status={m.decisionStatus} />
                        </p>
                        <p className="text-sm leading-relaxed text-dt-muted-text">{m.reason}</p>
                        <ul className="space-y-1">
                          {m.matchedFiles.map((p) => (
                            <li key={p}>
                              <FilePath path={p} />
                            </li>
                          ))}
                        </ul>
                        {m.sources.length > 0 ? (
                          <p className="flex flex-wrap gap-x-3 text-xs text-dt-muted-text">
                            Evidence:
                            {m.sources.map((s) => (
                              <a
                                key={s.url}
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`rounded text-dt-forest hover:underline ${FOCUS}`}
                              >
                                {s.title}
                              </a>
                            ))}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
