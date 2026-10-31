export type RepoRef = { owner: string; repo: string };

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Extracts owner/repo from what people paste: https://github.com/o/r, .git URLs,
 * links into a branch/issue/PR, scheme-less github.com/o/r, or plain "o/r".
 * Returns null for anything that is not a GitHub repository reference.
 */
export function parseGithubRepoUrl(input: string): RepoRef | null {
  let text = input.trim();
  if (!text || text.length > 300) return null;

  const hostMatch = text.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i
  );
  if (hostMatch) {
    text = hostMatch[1];
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.includes("@")) {
    return null; // another host or an ssh/other scheme
  }

  const [owner, rawRepo] = text.split(/[/?#]/);
  if (!owner || !rawRepo) return null;
  const repo = rawRepo.replace(/\.git$/i, "");
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") {
    return null;
  }
  return { owner, repo };
}
