"use client";

import { ExternalLink, MessageSquare, Search } from "lucide-react";
import type { SourceType, SourceWithRefs } from "./types";
import {
  EmptyState,
  FOCUS,
  Quote,
  SOURCE_META,
  SectionHeader,
} from "./ui";

export type SourceFilter = "ALL" | SourceType;

const FILTERS: { id: SourceFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "discussion", label: "Discussions" },
  { id: "pr", label: "Pull requests" },
  { id: "issue", label: "Issues" },
  { id: "discord", label: "Discord" },
];

interface SourcesSectionProps {
  sources: SourceWithRefs[];
  filtered: SourceWithRefs[];
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: SourceFilter;
  onTypeFilterChange: (value: SourceFilter) => void;
  onOpenDecision: (id: string) => void;
}

export function SourcesSection({
  sources,
  filtered,
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  onOpenDecision,
}: SourcesSectionProps) {
  const countFor = (f: SourceFilter) =>
    f === "ALL" ? sources.length : sources.filter((s) => s.type === f).length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Sources"
        description="The original issues, pull requests and discussions that decisions were recovered from, with the passage that mattered."
      />

      {sources.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No sources connected yet">
          Sources appear here after Dev Trace ingests this repository&apos;s
          issues, pull requests and discussions.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dt-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                aria-label="Search sources by title, author or message"
                placeholder="Search by title, author or message"
                className="w-full rounded-lg border border-dt-line-strong bg-dt-surface py-2 pl-9 pr-3 text-sm text-dt-ink-strong placeholder:text-dt-muted-text focus:border-dt-sage focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-dt-forest"
              />
            </div>

            <div
              role="group"
              aria-label="Filter by source type"
              className="dt-scroll-none -mx-1 flex gap-1 overflow-x-auto px-1"
            >
              {FILTERS.map((f) => {
                const on = typeFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onTypeFilterChange(f.id)}
                    className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${FOCUS} ${
                      on
                        ? "bg-dt-forest text-dt-bg"
                        : "text-dt-muted-text hover:bg-dt-bg2 hover:text-dt-ink-strong"
                    }`}
                  >
                    {f.label}
                    <span className={`font-mono ${on ? "text-dt-pistachio" : ""}`}>
                      {countFor(f.id)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-dt-line-strong px-4 py-10 text-center text-sm text-dt-muted-text">
              No sources match this search and filter.
            </p>
          ) : (
            <ul className="divide-y divide-dt-line border-y border-dt-line">
              {filtered.map((s) => {
                const meta = SOURCE_META[s.type];
                const Icon = meta.icon;
                return (
                  <li key={s.id} className="py-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-dt-accept">
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {meta.label}
                        </p>
                        <h3 className="text-base font-semibold leading-snug text-dt-ink-strong">
                          {s.title}
                        </h3>
                        <p className="text-xs text-dt-muted-text">
                          {s.author} · {s.date}
                        </p>
                      </div>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-dt-forest hover:bg-dt-sage-pale ${FOCUS}`}
                      >
                        Open original
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>

                    <div className="mt-4">
                      <Quote>{s.quote}</Quote>
                    </div>

                    <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dt-muted-text">
                      Used in
                      {s.referencedDecisions.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onOpenDecision(id)}
                          className={`cursor-pointer rounded font-mono font-medium text-dt-forest hover:underline ${FOCUS}`}
                        >
                          {id}
                        </button>
                      ))}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
