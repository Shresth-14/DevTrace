/**
 * Finds explicit references to other issues / pull requests of the SAME repository in
 * free text: `#123`, `owner/repo#123` and github.com URLs. Code blocks are ignored.
 * Nothing is inferred from similar wording: only what the text states.
 */
const FENCED = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE = /`[^`\n]*`/g;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function extractReferences(
  text: string | null | undefined,
  repo: { owner: string; repo: string },
  selfNumber?: number
): number[] {
  if (!text) return [];
  const clean = text.replace(FENCED, " ").replace(INLINE, " ");
  const found = new Set<number>();
  const add = (raw: string) => {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && n !== selfNumber) found.add(n);
  };

  const slug = `${escapeRegex(repo.owner)}/${escapeRegex(repo.repo)}`;
  const url = new RegExp(
    `https?://(?:www\\.)?github\\.com/${slug}/(?:issues|pull)/(\\d{1,7})(?!\\d)`,
    "gi"
  );
  const qualified = new RegExp(`(?<![\\w/])${slug}#(\\d{1,7})(?!\\d)`, "gi");
  // bare #123 (not part of a word, URL fragment, HTML entity or hex colour)
  const bare = /(?<![\w/&#])#(\d{1,7})(?![\w-])/g;

  for (const re of [url, qualified, bare]) {
    for (const m of clean.matchAll(re)) add(m[1]);
  }
  return [...found];
}
