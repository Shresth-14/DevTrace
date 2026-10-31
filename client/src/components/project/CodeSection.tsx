"use client";

import { useMemo } from "react";
import { FileCode2, Search } from "lucide-react";
import type { CodeRelationship } from "./types";
import { EmptyState, FOCUS, FilePath, SectionHeader, STATUS_META } from "./ui";

interface CodeSectionProps {
  files: CodeRelationship[];
  filtered: CodeRelationship[];
  search: string;
  onSearchChange: (value: string) => void;
  onOpenDecision: (id: string) => void;
}

function groupKey(path: string): string {
  const i = path.indexOf("/");
  return i > 0 ? path.slice(0, i) : "Repository root";
}

export function CodeSection({
  files,
  filtered,
  search,
  onSearchChange,
  onOpenDecision,
}: CodeSectionProps) {
  const groups = useMemo(() => {
    const map = new Map<string, CodeRelationship[]>();
    filtered.forEach((f) => {
      const key = groupKey(f.path);
      map.set(key, [...(map.get(key) ?? []), f]);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Code relationships"
        description="Start from a file and see which decisions shaped it, so a change can be checked against the reasoning behind it."
      />

      {files.length === 0 ? (
        <EmptyState icon={FileCode2} title="No code relationships yet">
          Files appear here only when a recovered decision is tied to code by a
          pull request, an inline review comment, or a verified file reference.
        </EmptyState>
      ) : (
        <>
          <div className="relative w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dt-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search repository files"
              placeholder="Search files by path"
              className="w-full rounded-lg border border-dt-line-strong bg-dt-surface py-2 pl-9 pr-3 text-sm text-dt-ink-strong placeholder:text-dt-muted-text focus:border-dt-sage focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-dt-forest"
            />
          </div>

          {groups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-dt-line-strong px-4 py-10 text-center text-sm text-dt-muted-text">
              No files match this search.
            </p>
          ) : (
            <div className="space-y-10">
              {groups.map(([group, items]) => (
                <section key={group} aria-label={group}>
                  <h3 className="flex items-baseline gap-2 border-b border-dt-line-strong pb-2 text-sm font-semibold text-dt-ink-strong">
                    <span className="font-mono">{group}</span>
                    <span className="text-xs font-normal text-dt-muted-text">
                      {items.length} file{items.length === 1 ? "" : "s"}
                    </span>
                  </h3>
                  <ul className="divide-y divide-dt-line">
                    {items.map((f) => (
                      <li key={f.path} className="space-y-2 py-4">
                        <FilePath path={f.path} lines={f.lines} />
                        <p className="pl-5 text-xs text-dt-muted-text">
                          <span
                            className={`mr-2 rounded px-1.5 py-0.5 font-medium ${
                              f.relationship === "direct"
                                ? "bg-dt-sage-pale text-dt-forest"
                                : "bg-dt-unresolved-bg text-dt-unresolved"
                            }`}
                          >
                            {f.relationship === "direct" ? "Direct evidence" : "Inferred"}
                          </span>
                          {f.previousPath ? `previously ${f.previousPath}` : null}
                        </p>
                        {f.description ? (
                          <p className="pl-5 text-sm leading-relaxed text-dt-muted-text">
                            {f.description}
                          </p>
                        ) : null}
                        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 pl-5">
                          {f.decisions.map((d) => (
                            <li key={d.id} className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onOpenDecision(d.id)}
                                className={`group inline-flex max-w-full cursor-pointer items-center gap-2 rounded text-left text-sm ${FOCUS}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_META[d.status].dot}`}
                                  aria-hidden="true"
                                />
                                <span className="font-mono text-xs font-medium text-dt-forest">
                                  {d.id}
                                </span>
                                <span className="min-w-0 truncate text-dt-ink group-hover:underline">
                                  {d.title}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
