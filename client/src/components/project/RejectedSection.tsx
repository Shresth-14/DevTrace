"use client";

import { XCircle } from "lucide-react";
import type { RejectedApproach } from "./types";
import {
  EmptyState,
  Eyebrow,
  FOCUS,
  FilePath,
  Quote,
  SectionHeader,
  StatusDot,
} from "./ui";

interface RejectedSectionProps {
  approaches: RejectedApproach[];
  onOpenDecision: (id: string) => void;
}

export function RejectedSection({
  approaches,
  onOpenDecision,
}: RejectedSectionProps) {
  return (
    <div className="space-y-8">
      <SectionHeader
        title="Rejected approaches"
        description="Alternatives that were proposed and explicitly ruled out, with the reasons recorded at the time. Check here before reopening an old debate."
      />

      {approaches.length === 0 ? (
        <EmptyState icon={XCircle} title="No rejected approaches recorded">
          When a discussion explicitly rules out an alternative, it will appear
          here with its rejection reason and supporting evidence.
        </EmptyState>
      ) : (
        <ol className="divide-y divide-dt-line border-y border-dt-line">
          {approaches.map((item) => (
            <li
              key={`${item.decisionId}-${item.alternative.name}`}
              className="grid gap-x-10 gap-y-5 py-8 md:grid-cols-12"
            >
              <header className="space-y-2 md:col-span-4">
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-dt-reject">
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Rejected
                </p>
                <h3 className="text-base font-semibold leading-snug text-dt-ink-strong">
                  {item.alternative.name}
                </h3>
                <p className="text-sm text-dt-muted-text">
                  Proposed by {item.alternative.proposedBy}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dt-muted-text">
                  <span>In decision</span>
                  <button
                    type="button"
                    onClick={() => onOpenDecision(item.decisionId)}
                    className={`cursor-pointer rounded font-mono text-xs font-medium text-dt-forest hover:underline ${FOCUS}`}
                  >
                    {item.decisionId}
                  </button>
                  <StatusDot status={item.status} />
                </p>
                <p className="text-sm leading-snug text-dt-ink">
                  {item.decisionTitle}
                </p>
              </header>

              <div className="min-w-0 space-y-6 md:col-span-8">
                <section className="space-y-1.5">
                  <Eyebrow>Why it was rejected</Eyebrow>
                  <p className="text-sm leading-relaxed text-dt-ink">
                    {item.alternative.reason}
                  </p>
                </section>

                <section className="space-y-1.5 border-l-2 border-dt-sage pl-4">
                  <Eyebrow>Chosen instead</Eyebrow>
                  <p className="text-sm font-medium leading-relaxed text-dt-ink-strong">
                    {item.alternative.chosenApproach}
                  </p>
                </section>

                {item.alternative.evidenceQuotes.length > 0 ? (
                  <section className="space-y-3">
                    <Eyebrow>Supporting discussion</Eyebrow>
                    <div className="space-y-4">
                      {item.alternative.evidenceQuotes.map((q) => (
                        <Quote
                          key={`${q.author}-${q.quote.slice(0, 24)}`}
                          attribution={`${q.author} · ${q.source}`}
                        >
                          {q.quote}
                        </Quote>
                      ))}
                    </div>
                  </section>
                ) : null}

                {item.alternative.affectedFiles.length > 0 ? (
                  <section className="space-y-2">
                    <Eyebrow>Affected files</Eyebrow>
                    <ul className="space-y-1.5">
                      {item.alternative.affectedFiles.map((p) => (
                        <li key={p}>
                          <FilePath path={p} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
