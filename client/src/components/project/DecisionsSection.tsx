"use client";

import { useRef } from "react";
import { ExternalLink, FileText, Search } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { DecisionRecord, DecisionStatus } from "./types";
import {
  EmptyState,
  Eyebrow,
  FOCUS,
  FilePath,
  Quote,
  SOURCE_META,
  STATUS_META,
  SectionHeader,
  StatusBadge,
  StatusDot,
} from "./ui";

export type StatusFilter = "ALL" | DecisionStatus;

const FILTERS: StatusFilter[] = [
  "ALL",
  "ACCEPTED",
  "REJECTED",
  "PROPOSED",
  "WITHDRAWN",
  "UNRESOLVED",
];

const CATEGORY_LABEL: Record<string, string> = {
  performance: "Performance",
  scalability: "Scalability",
  security: "Security",
  compatibility: "Compatibility",
  maintainability: "Maintainability",
  developer_experience: "Developer experience",
  complexity: "Complexity",
  resource_consumption: "Resource consumption",
  architecture: "Architecture",
  backward_compatibility: "Backward compatibility",
  other: "Reasoning",
};

interface DecisionsSectionProps {
  decisions: DecisionRecord[];
  filtered: DecisionRecord[];
  active: DecisionRecord | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  onSelect: (id: string) => void;
}

export function DecisionsSection({
  decisions,
  filtered,
  active,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onSelect,
}: DecisionsSectionProps) {
  const detailRef = useRef<HTMLElement>(null);

  const select = (id: string) => {
    onSelect(id);
    // On narrow screens the detail sits below the list; bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      detailRef.current?.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  const countFor = (f: StatusFilter) =>
    f === "ALL" ? decisions.length : decisions.filter((d) => d.status === f).length;

  if (decisions.length === 0) {
    return (
      <EmptyState icon={FileText} title="No decisions extracted yet">
        Decisions appear here after the repository has been imported and its
        discussions analysed. Nothing is shown until real evidence exists.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Decisions"
        description="Each record keeps the decision, why it was made, what was ruled out, and links back to the original discussion."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dt-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search decisions by title, summary or file path"
            placeholder="Search by title, summary or file path"
            className="w-full rounded-lg border border-dt-line-strong bg-dt-surface py-2 pl-9 pr-3 text-sm text-dt-ink-strong placeholder:text-dt-muted-text focus:border-dt-sage focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-dt-forest"
          />
        </div>

        <div
          role="group"
          aria-label="Filter by status"
          className="dt-scroll-none -mx-1 flex gap-1 overflow-x-auto px-1"
        >
          {FILTERS.map((f) => {
            const on = statusFilter === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => onStatusFilterChange(f)}
                className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${FOCUS} ${
                  on
                    ? "bg-dt-forest text-dt-bg"
                    : "text-dt-muted-text hover:bg-dt-bg2 hover:text-dt-ink-strong"
                }`}
              >
                {f === "ALL" ? "All" : STATUS_META[f].label}
                <span className={`font-mono ${on ? "text-dt-pistachio" : ""}`}>
                  {countFor(f)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-12">
        <nav
          aria-label="Decision records"
          className="lg:sticky lg:top-28 lg:col-span-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-dt-line-strong px-4 py-8 text-center text-sm text-dt-muted-text">
              No decisions match this search and filter.
            </p>
          ) : (
            <ul className="divide-y divide-dt-line border-y border-dt-line">
              {filtered.map((d) => {
                const selected = d.id === active?.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => select(d.id)}
                      aria-current={selected ? "true" : undefined}
                      className={`block w-full cursor-pointer border-l-2 px-4 py-3.5 text-left transition-colors ${FOCUS} ${
                        selected
                          ? "border-dt-forest bg-dt-surface"
                          : "border-transparent hover:bg-dt-surface/70"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs text-dt-muted-text">{d.id}</span>
                        <StatusDot status={d.status} />
                      </span>
                      <span className="mt-1 line-clamp-2 block text-sm font-medium leading-snug text-dt-ink-strong">
                        {d.title}
                      </span>
                      <span className="mt-1 block text-xs text-dt-muted-text">
                        {formatDate(d.date)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <article
          ref={detailRef}
          aria-label="Decision detail"
          className="min-w-0 scroll-mt-28 lg:col-span-8"
        >
          {active ? (
            <div className="space-y-9 rounded-2xl border border-dt-line-strong bg-dt-surface p-6 sm:p-8">
              <header className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <StatusBadge status={active.status} />
                  <span className="font-mono text-xs text-dt-muted-text">
                    {active.id} · {formatDate(active.date)}
                    {active.confidence != null
                      ? ` · confidence ${Math.round(active.confidence * 100)}%`
                      : ""}
                  </span>
                </div>
                <h3 className="text-xl font-semibold leading-snug tracking-tight text-dt-ink-strong sm:text-2xl">
                  {active.title}
                </h3>
                <p className="text-base leading-relaxed text-dt-ink">{active.summary}</p>
                {active.participants.length > 0 ? (
                  <p className="text-xs text-dt-muted-text">
                    Participants: {active.participants.map((p) => `@${p}`).join(", ")}
                  </p>
                ) : null}
              </header>

              {active.reasoning.length > 0 ? (
                <section className="space-y-3">
                  <Eyebrow>Reasoning</Eyebrow>
                  <ul className="space-y-3">
                    {active.reasoning.map((r, i) => (
                      <li key={i} className="text-sm leading-relaxed text-dt-ink">
                        <span className="mr-2 rounded bg-dt-bg2 px-1.5 py-0.5 text-[11px] font-medium text-dt-ink-strong">
                          {CATEGORY_LABEL[r.category] ?? r.category}
                        </span>
                        {r.explanation}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {active.openQuestions ? (
                <section className="space-y-2">
                  <Eyebrow>Still open</Eyebrow>
                  <p className="text-sm leading-relaxed text-dt-ink">{active.openQuestions}</p>
                </section>
              ) : null}

              {active.alternatives.length > 0 ? (
                <section className="space-y-3">
                  <Eyebrow>Alternatives discussed ({active.alternatives.length})</Eyebrow>
                  <ul className="space-y-4">
                    {active.alternatives.map((a) => (
                      <li key={a.name} className="border-l-2 border-dt-reject/40 pl-4">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-dt-ink-strong">
                          {a.name}
                          <StatusDot status={a.status} />
                          {a.proposedBy ? (
                            <span className="font-normal text-dt-muted-text">· proposed by @{a.proposedBy}</span>
                          ) : null}
                        </p>
                        {a.reason ? (
                          <p className="mt-1 text-sm leading-relaxed text-dt-ink">{a.reason}</p>
                        ) : (
                          <p className="mt-1 text-sm text-dt-muted-text">No reason recorded in the discussion.</p>
                        )}
                        {a.chosenApproach ? (
                          <p className="mt-2 text-sm text-dt-muted-text">
                            Chosen instead: <span className="text-dt-ink-strong">{a.chosenApproach}</span>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="space-y-4">
                <Eyebrow>Evidence ({active.sources.length})</Eyebrow>
                {active.sources.length === 0 ? (
                  <p className="text-sm text-dt-muted-text">No sources are linked to this decision.</p>
                ) : (
                  <ul className="space-y-5">
                    {active.sources.map((s) => {
                      const Icon = SOURCE_META[s.type].icon;
                      return (
                        <li key={s.id} className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <p className="flex min-w-0 items-start gap-2 text-sm font-medium text-dt-ink-strong">
                              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-dt-accept" aria-hidden="true" />
                              <span className="min-w-0">{s.title}</span>
                            </p>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open original: ${s.title}`}
                              className={`shrink-0 rounded p-1 text-dt-forest hover:bg-dt-sage-pale ${FOCUS}`}
                            >
                              <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </a>
                          </div>
                          <Quote attribution={`@${s.author} · ${formatDate(s.date)} · ${s.badge}`}>
                            {s.quote}
                          </Quote>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="space-y-3">
                <Eyebrow>Code ({active.codeFiles.length})</Eyebrow>
                {active.codeFiles.length === 0 ? (
                  <p className="text-sm text-dt-muted-text">
                    No code locations are tied to this decision by the available evidence.
                  </p>
                ) : (
                  <ul className="divide-y divide-dt-line border-y border-dt-line">
                    {active.codeFiles.map((f) => (
                      <li key={`${f.path}-${f.basis}`} className="space-y-1 py-3">
                        <FilePath path={f.path} lines={f.lines} />
                        <p className="pl-5 text-xs text-dt-muted-text">
                          {f.relationship === "direct" ? "Direct evidence" : "Inferred"}
                          {" · "}
                          {f.basis === "pr_file"
                            ? "changed by the pull request"
                            : f.basis === "review_comment"
                              ? "discussed in an inline review comment"
                              : "suggested by analysis, found in the repository"}
                          {f.previousPath ? ` · previously ${f.previousPath}` : ""}
                          {f.commitSha ? ` · at ${f.commitSha.slice(0, 7)}` : ""}
                        </p>
                        {f.description ? (
                          <p className="pl-5 text-sm text-dt-muted-text">{f.description}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {active.relatedThreads.length > 0 ? (
                <section className="space-y-2">
                  <Eyebrow>Discussions</Eyebrow>
                  <ul className="space-y-1.5 text-sm">
                    {active.relatedThreads.map((t) => (
                      <li key={`${t.kind}-${t.number}`}>
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`rounded text-dt-forest hover:underline ${FOCUS}`}
                        >
                          {t.kind === "pull_request" ? "PR" : t.kind === "issue" ? "Issue" : "Discussion"} #{t.number} · {t.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <p className="border-t border-dt-line pt-4 font-mono text-[11px] text-dt-muted-text">
                Extracted by {active.model} · method {active.version}
              </p>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-dt-line-strong px-6 py-16 text-center text-sm text-dt-muted-text">
              Select a decision to read its full record.
            </p>
          )}
        </article>
      </div>
    </div>
  );
}
