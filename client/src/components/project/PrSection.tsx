"use client";

import { AlertTriangle, GitPullRequest } from "lucide-react";
import type { DecisionRecord, PrIntelligenceItem } from "./types";
import { EmptyState, FOCUS, FilePath, SectionHeader } from "./ui";

interface PrSectionProps {
  prs: PrIntelligenceItem[];
  decisions: DecisionRecord[];
  onOpenDecision: (id: string) => void;
}

const PR_STATUS: Record<PrIntelligenceItem["status"], string> = {
  open: "Open",
  merged: "Merged",
  closed: "Closed",
};

export function PrSection({ prs, decisions, onOpenDecision }: PrSectionProps) {
  const needsReview = prs.filter((p) => p.checkStatus === "NEEDS_REVIEW").length;

  return (
    <div className="space-y-8">
      <SectionHeader
        title="PR intelligence"
        description="Pull requests that change code governed by an earlier decision, matched to that decision so reviewers see the history first."
      />

      {prs.length === 0 ? (
        <EmptyState icon={GitPullRequest} title="No pull requests matched yet">
          When a pull request touches files tied to a recorded decision, it will
          appear here with the decision it relates to.
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-dt-muted-text">
            <span className="font-medium text-dt-ink-strong">{prs.length}</span>{" "}
            matched pull request{prs.length === 1 ? "" : "s"}
            {needsReview > 0 ? (
              <>
                {" · "}
                <span className="font-medium text-dt-unresolved">
                  {needsReview} need{needsReview === 1 ? "s" : ""} review
                </span>
              </>
            ) : null}
          </p>

          <ul className="divide-y divide-dt-line border-y border-dt-line">
            {prs.map((pr) => {
              const known = decisions.some((d) => d.id === pr.matchedDecisionId);
              return (
                <li key={pr.prNumber} className="space-y-4 py-7">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="min-w-0 space-y-1">
                      <p className="flex items-center gap-2 font-mono text-xs text-dt-muted-text">
                        <GitPullRequest
                          className="h-3.5 w-3.5 text-dt-accept"
                          aria-hidden="true"
                        />
                        #{pr.prNumber} · {PR_STATUS[pr.status]}
                      </p>
                      <h3 className="text-base font-semibold leading-snug text-dt-ink-strong">
                        {pr.title}
                      </h3>
                      <p className="text-xs text-dt-muted-text">
                        {pr.author} · {pr.date}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        pr.checkStatus === "PASSING"
                          ? "bg-dt-sage-pale text-dt-forest"
                          : "bg-dt-unresolved-bg text-dt-unresolved"
                      }`}
                    >
                      {pr.checkStatus === "PASSING" ? "Passing" : "Needs review"}
                    </span>
                  </div>

                  {pr.rejectionWarning ? (
                    <div
                      role="note"
                      className="flex gap-3 border-l-2 border-dt-unresolved bg-dt-unresolved-bg/50 py-3 pl-4 pr-4"
                    >
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-dt-unresolved"
                        aria-hidden="true"
                      />
                      <p className="text-sm leading-relaxed text-dt-ink-strong">
                        {pr.rejectionWarning}
                      </p>
                    </div>
                  ) : null}

                  <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-dt-muted-text">
                        Changed files
                      </p>
                      <ul className="space-y-1">
                        {pr.changedFiles.map((p) => (
                          <li key={p}>
                            <FilePath path={p} />
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-dt-muted-text">
                        Related decision
                      </p>
                      <p className="text-sm">
                        {known ? (
                          <button
                            type="button"
                            onClick={() => onOpenDecision(pr.matchedDecisionId)}
                            className={`cursor-pointer rounded text-left font-medium text-dt-forest hover:underline ${FOCUS}`}
                          >
                            <span className="font-mono text-xs">
                              {pr.matchedDecisionId}
                            </span>{" "}
                            {pr.matchedDecisionTitle}
                          </button>
                        ) : (
                          <span className="font-medium text-dt-ink-strong">
                            <span className="font-mono text-xs">
                              {pr.matchedDecisionId}
                            </span>{" "}
                            {pr.matchedDecisionTitle}
                          </span>
                        )}
                      </p>
                      <p className="text-sm leading-relaxed text-dt-muted-text">
                        {pr.importanceNote}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
