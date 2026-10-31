import type { RepoRef } from "../github/sync/github.fetchers";

export type SourceKind = "issue" | "pull_request" | "discussion";

export interface ParsedSource {
  number: number;
  /** Known from a URL; undefined for `#12` / `owner/repo#12`, where GitHub decides. */
  kind?: SourceKind;
}

const URL_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull|discussions)\/(\d{1,7})(?:[/?#].*)?$/i;
const QUALIFIED_RE = /^([\w.-]+)\/([\w.-]+)#(\d{1,7})$/;
const BARE_RE = /^#?(\d{1,7})$/;

const KINDS: Record<string, SourceKind> = {
  issues: "issue",
  pull: "pull_request",
  discussions: "discussion",
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Parses what a user typed into one issue / PR / discussion of THIS project's repository.
 * Accepts a github.com URL, `owner/repo#N`, `#N` or `N`. Returns null for anything else,
 * including a valid reference to a different repository.
 */
export function parseSourceInput(
  input: string,
  repo: RepoRef
): ParsedSource | null {
  const text = input.trim();
  const num = (raw: string) => {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  const url = URL_RE.exec(text);
  if (url) {
    if (!same(url[1], repo.owner) || !same(url[2], repo.repo)) return null;
    const n = num(url[4]);
    return n ? { number: n, kind: KINDS[url[3].toLowerCase()] } : null;
  }
  const qualified = QUALIFIED_RE.exec(text);
  if (qualified) {
    if (!same(qualified[1], repo.owner) || !same(qualified[2], repo.repo)) {
      return null;
    }
    const n = num(qualified[3]);
    return n ? { number: n } : null;
  }
  const bare = BARE_RE.exec(text);
  if (bare) {
    const n = num(bare[1]);
    return n ? { number: n } : null;
  }
  return null;
}
