"use client";

import { useRef } from "react";
import { ExternalLink, FileText, Search } from "lucide-react";
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
} from "./ui";

export type StatusFilter = "ALL" | DecisionStatus;

const FILTERS: StatusFilter[] = [
  "ALL",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "UNRESOLVED",
];

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
      <EmptyState icon={FileText} title="No decisions yet">
        Decisions Dev Trace recovers from this repository&apos;s discussions will
        be listed here with their status, reasoning and evidence.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Decisions"
        description="Each record keeps the decision, why it was made, what was ruled out, and where the evidence lives."
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
                        <span className="font-mono text-xs text-dt-muted-text">
                          {d.id}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs ${STATUS_META[d.status].text}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${STATUS_META[d.status].dot}`}
                            aria-hidden="true"
                          />
                          {STATUS_META[d.status].label}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-sm font-medium leading-snug text-dt-ink-strong">
                        {d.title}
                      </span>
                      <span className="mt-1 block text-xs text-dt-muted-text">
                        {d.date}
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
                    {active.id} · {active.date} · {active.author}
                  </span>
                </div>
                <h3 className="text-xl font-semibold leading-snug tracking-tight text-dt-ink-strong sm:text-2xl">
                  {active.title}
                </h3>
                <p className="text-base leading-relaxed text-dt-ink">
                  {active.summary}
                </p>
              </header>

              <section className="space-y-2">
                <Eyebrow>Reasoning</Eyebrow>
                <p className="text-sm leading-relaxed text-dt-ink">
                  {active.rationale}
                </p>
              </section>

              {active.rejectedAlternative ? (
                <section className="space-y-2">
                  <Eyebrow>Alternative considered</Eyebrow>
                  <div className="border-l-2 border-dt-reject/40 pl-4">
                    <p className="text-sm font-medium text-dt-ink-strong">
                      {active.rejectedAlternative.name}
                      <span className="font-normal text-dt-muted-text">
                        {" "}
                        · proposed by {active.rejectedAlternative.proposedBy}
                      </span>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-dt-ink">
                      {active.rejectedAlternative.reason}
                    </p>
                    <p className="mt-2 text-sm text-dt-muted-text">
                      Chosen instead:{" "}
                      <span className="text-dt-ink-strong">
                        {active.rejectedAlternative.chosenApproach}
                      </span>
                    </p>
                  </div>
                </section>
              ) : null}

              <section className="space-y-4">
                <Eyebrow>Sources ({active.sources.length})</Eyebrow>
                {active.sources.length === 0 ? (
                  <p className="text-sm text-dt-muted-text">
                    No sources are linked to this decision.
                  </p>
                ) : (
                  <ul className="space-y-5">
                    {active.sources.map((s) => {
                      const Icon = SOURCE_META[s.type].icon;
                      return (
                        <li key={s.id} className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <p className="flex min-w-0 items-start gap-2 text-sm font-medium text-dt-ink-strong">
                              <Icon
                                className="mt-0.5 h-4 w-4 shrink-0 text-dt-accept"
                                aria-hidden="true"
                              />
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
                          <Quote
                            attribution={`${s.author} · ${s.date} · ${SOURCE_META[s.type].label}`}
                          >
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
                    No code locations are linked to this decision.
                  </p>
                ) : (
                  <ul className="divide-y divide-dt-line border-y border-dt-line">
                    {active.codeFiles.map((f) => (
                      <li key={f.path} className="space-y-1 py-3">
                        <FilePath path={f.path} lines={f.lines} />
                        <p className="pl-5 text-sm text-dt-muted-text">
                          {f.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
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
