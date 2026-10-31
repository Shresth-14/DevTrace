"use client";

import { ExternalLink, Loader2, MessageSquare, Search } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { SourceCategory, SourceFeedItem } from "./types";
import { EmptyState, FOCUS, Quote, SOURCE_META, SectionHeader } from "./ui";

const FILTERS: { id: SourceCategory; label: string }[] = [
  { id: "all", label: "Recent" },
  { id: "issues", label: "Issues" },
  { id: "pull_requests", label: "Pull requests" },
  { id: "discussions", label: "Discussions" },
  { id: "comments", label: "Comments" },
  { id: "reviews", label: "Reviews" },
  { id: "commits", label: "Commits" },
];

interface SourcesSectionProps {
  items: SourceFeedItem[];
  counts: Record<SourceCategory, number> | null;
  category: SourceCategory;
  onCategoryChange: (c: SourceCategory) => void;
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onOpenDecision: (id: string) => void;
}

export function SourcesSection({
  items,
  counts,
  category,
  onCategoryChange,
  search,
  onSearchChange,
  loading,
  error,
  hasMore,
  onLoadMore,
  onOpenDecision,
}: SourcesSectionProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Sources"
        description="The issues, pull requests, discussions, comments, reviews and commits imported from GitHub. Records cited by a decision say so."
      />

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
            aria-label="Search imported sources"
            placeholder="Search titles and text"
            className="w-full rounded-lg border border-dt-line-strong bg-dt-surface py-2 pl-9 pr-3 text-sm text-dt-ink-strong placeholder:text-dt-muted-text focus:border-dt-sage focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-dt-forest"
          />
        </div>

        <div
          role="group"
          aria-label="Filter by source type"
          className="dt-scroll-none -mx-1 flex gap-1 overflow-x-auto px-1"
        >
          {FILTERS.map((f) => {
            const on = category === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => onCategoryChange(f.id)}
                className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${FOCUS} ${
                  on
                    ? "bg-dt-forest text-dt-bg"
                    : "text-dt-muted-text hover:bg-dt-bg2 hover:text-dt-ink-strong"
                }`}
              >
                {f.label}
                {counts ? (
                  <span className={`font-mono ${on ? "text-dt-pistachio" : ""}`}>
                    {counts[f.id === "all" ? "all" : f.id] ?? 0}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load sources: {error}
        </p>
      ) : null}

      {!error && !loading && items.length === 0 ? (
        search || (counts && counts.all > 0) ? (
          <p className="rounded-xl border border-dashed border-dt-line-strong px-4 py-10 text-center text-sm text-dt-muted-text">
            No imported sources match this search and filter.
          </p>
        ) : (
          <EmptyState icon={MessageSquare} title="Nothing imported yet">
            Sources appear here after Dev Trace imports this repository&apos;s
            history from GitHub.
          </EmptyState>
        )
      ) : (
        <ul className="divide-y divide-dt-line border-y border-dt-line">
          {items.map((s) => {
            const meta = SOURCE_META[s.type];
            const Icon = meta.icon;
            return (
              <li key={s.id} className="py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-dt-accept">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {s.badge}
                    </p>
                    <h3 className="break-words text-base font-semibold leading-snug text-dt-ink-strong">
                      {s.title}
                    </h3>
                    <p className="text-xs text-dt-muted-text">
                      @{s.author} · {formatDate(s.date)}
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

                {s.referencedDecisions.length > 0 ? (
                  <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dt-muted-text">
                    Cited by
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
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-dt-muted-text">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading sources…
        </p>
      ) : hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          className={`cursor-pointer rounded-lg border border-dt-line-strong bg-dt-surface px-4 py-2 text-sm font-medium text-dt-ink-strong hover:bg-dt-bg2/60 ${FOCUS}`}
        >
          Load more
        </button>
      ) : category === "all" && items.length > 0 ? (
        <p className="text-xs text-dt-muted-text">
          Showing the most recent records. Pick a type to browse everything.
        </p>
      ) : null}
    </div>
  );
}
