import type { Octokit } from "octokit";
import type {
  CommentRow,
  CommitRow,
  DiscussionCommentRow,
  DiscussionRow,
  IssueRow,
  PrFileRow,
  PullRequestRow,
  RepoFileRow,
  ReviewCommentRow,
  ReviewRow,
} from "./github.sync.types";

export type RepoRef = { owner: string; repo: string };

const login = (u: { login?: string } | null | undefined): string | null =>
  u?.login ?? null;

const date = (v: string | null | undefined): Date | null =>
  v ? new Date(v) : null;

const toBigInt = (v: number | string | null | undefined): bigint | null =>
  v === null || v === undefined ? null : BigInt(v);

function labelNames(
  labels: ReadonlyArray<string | { name?: string | null }>
): string[] {
  return labels
    .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
    .filter((n) => n.length > 0);
}

/** Issue number from an `issue_url` such as .../issues/42 */
export function numberFromUrl(url: string): number {
  const n = Number(url.slice(url.lastIndexOf("/") + 1));
  if (!Number.isInteger(n)) {
    throw new Error("Unexpected GitHub issue_url format.");
  }
  return n;
}

// ---------------------------------------------------------------------------
// Issues (the Issues API also returns PRs; those are filtered out)
// ---------------------------------------------------------------------------
export async function* fetchIssues(
  octokit: Octokit,
  ref: RepoRef,
  since?: string
): AsyncGenerator<IssueRow[]> {
  const pages = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
    ...ref,
    state: "all",
    sort: "updated",
    direction: "asc",
    since,
    per_page: 100,
  });
  for await (const { data } of pages) {
    const rows = data
      .filter((i) => !i.pull_request)
      .map((i): IssueRow => ({
        githubId: BigInt(i.id),
        number: i.number,
        title: i.title,
        body: i.body ?? null,
        authorLogin: login(i.user),
        state: i.state,
        stateReason: i.state_reason ?? null,
        labels: labelNames(i.labels),
        assignees: (i.assignees ?? []).map((a) => a.login),
        url: i.html_url,
        createdAtGh: new Date(i.created_at),
        updatedAtGh: new Date(i.updated_at),
        closedAtGh: date(i.closed_at),
      }));
    if (rows.length > 0) yield rows;
  }
}

/**
 * Repo-wide issue comments. GitHub returns comments on issues AND on pull
 * requests here; the orchestrator classifies them by parent number.
 */
export async function* fetchRepoComments(
  octokit: Octokit,
  ref: RepoRef,
  since?: string
): AsyncGenerator<CommentRow[]> {
  const pages = octokit.paginate.iterator(
    octokit.rest.issues.listCommentsForRepo,
    {
      ...ref,
      sort: "updated",
      direction: "asc",
      since,
      per_page: 100,
    }
  );
  for await (const { data } of pages) {
    const rows = data.map((c): CommentRow => ({
      githubId: BigInt(c.id),
      parentNumber: numberFromUrl(c.issue_url),
      body: c.body ?? "",
      authorLogin: login(c.user),
      url: c.html_url,
      createdAtGh: new Date(c.created_at),
      updatedAtGh: new Date(c.updated_at),
    }));
    if (rows.length > 0) yield rows;
  }
}

// ---------------------------------------------------------------------------
// Pull requests. pulls.list has no `since`, so we walk newest-updated first and
// stop once we pass the checkpoint.
// ---------------------------------------------------------------------------
export async function* fetchPullRequests(
  octokit: Octokit,
  ref: RepoRef,
  since?: string
): AsyncGenerator<PullRequestRow[]> {
  const sinceMs = since ? Date.parse(since) : null;
  const pages = octokit.paginate.iterator(octokit.rest.pulls.list, {
    ...ref,
    state: "all",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });
  for await (const { data } of pages) {
    const fresh =
      sinceMs === null
        ? data
        : data.filter((p) => Date.parse(p.updated_at) >= sinceMs);
    const rows = fresh.map((p): PullRequestRow => ({
      githubId: BigInt(p.id),
      number: p.number,
      title: p.title,
      body: p.body ?? null,
      authorLogin: login(p.user),
      state: p.merged_at ? "merged" : p.state,
      isDraft: p.draft ?? false,
      baseRef: p.base.ref,
      headRef: p.head.ref,
      baseSha: p.base.sha,
      headSha: p.head.sha,
      mergeCommitSha: p.merge_commit_sha ?? null,
      labels: labelNames(p.labels),
      reviewers: (p.requested_reviewers ?? []).map((r) => r.login),
      url: p.html_url,
      createdAtGh: new Date(p.created_at),
      updatedAtGh: new Date(p.updated_at),
      closedAtGh: date(p.closed_at),
      mergedAtGh: date(p.merged_at),
    }));
    if (rows.length > 0) yield rows;
    if (fresh.length < data.length) return; // reached already-synced PRs
  }
}

export async function fetchReviews(
  octokit: Octokit,
  ref: RepoRef,
  prNumber: number
): Promise<ReviewRow[]> {
  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    ...ref,
    pull_number: prNumber,
    per_page: 100,
  });
  return reviews.map((r): ReviewRow => ({
    githubId: BigInt(r.id),
    prNumber,
    reviewerLogin: login(r.user),
    body: r.body ?? null,
    state: r.state,
    commitSha: r.commit_id ?? null,
    url: r.html_url,
    submittedAt: date(r.submitted_at),
  }));
}

interface ThreadInfo {
  threadId: string;
  isResolved: boolean;
}

interface ThreadsResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          isResolved: boolean;
          comments: { nodes: Array<{ databaseId: number | null }> };
        }>;
      };
    } | null;
  } | null;
}

const THREADS_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 50, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            comments(first: 100) { nodes { databaseId } }
          }
        }
      }
    }
  }`;

/** Map of REST review-comment id -> GraphQL thread (id + resolved flag). */
export async function fetchReviewThreads(
  octokit: Octokit,
  ref: RepoRef,
  prNumber: number
): Promise<Map<string, ThreadInfo>> {
  const map = new Map<string, ThreadInfo>();
  let after: string | null = null;
  const seen = new Set<string>();
  for (;;) {
    const res: ThreadsResponse = await octokit.graphql<ThreadsResponse>(
      THREADS_QUERY,
      { ...ref, number: prNumber, after }
    );
    const threads = res.repository?.pullRequest?.reviewThreads;
    if (!threads) return map;
    for (const t of threads.nodes) {
      for (const c of t.comments.nodes) {
        if (c.databaseId !== null) {
          map.set(String(c.databaseId), {
            threadId: t.id,
            isResolved: t.isResolved,
          });
        }
      }
    }
    const next = threads.pageInfo.endCursor;
    if (!threads.pageInfo.hasNextPage || !next || seen.has(next)) break;
    seen.add(next);
    after = next;
  }
  return map;
}

export async function fetchReviewComments(
  octokit: Octokit,
  ref: RepoRef,
  prNumber: number,
  threads: Map<string, ThreadInfo>
): Promise<ReviewCommentRow[]> {
  const comments = await octokit.paginate(
    octokit.rest.pulls.listReviewComments,
    { ...ref, pull_number: prNumber, per_page: 100 }
  );
  return comments.map((c): ReviewCommentRow => {
    const thread = threads.get(String(c.id));
    return {
      githubId: BigInt(c.id),
      prNumber,
      reviewGithubId: toBigInt(c.pull_request_review_id),
      inReplyToId: toBigInt(c.in_reply_to_id),
      threadId: thread?.threadId ?? null,
      isResolved: thread?.isResolved ?? null,
      body: c.body,
      authorLogin: login(c.user),
      path: c.path,
      line: c.line ?? null,
      originalLine: c.original_line ?? null,
      diffHunk: c.diff_hunk ?? null,
      commitSha: c.commit_id ?? null,
      url: c.html_url,
      createdAtGh: new Date(c.created_at),
      updatedAtGh: new Date(c.updated_at),
    };
  });
}

export async function fetchPrFiles(
  octokit: Octokit,
  ref: RepoRef,
  prNumber: number,
  headSha: string | null
): Promise<PrFileRow[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    ...ref,
    pull_number: prNumber,
    per_page: 100,
  });
  return files.map((f): PrFileRow => ({
    prNumber,
    filename: f.filename,
    previousFilename: f.previous_filename ?? null,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    blobSha: f.sha ?? null,
    // GitHub omits `patch` for binary or very large diffs
    patch: f.patch ?? null,
    headSha,
  }));
}

interface CommitLike {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { name?: string; email?: string; date?: string } | null;
    committer?: { name?: string; date?: string } | null;
  };
  author?: { login?: string } | null;
  committer?: { login?: string } | null;
}

export function toCommitRow(c: CommitLike): CommitRow {
  return {
    sha: c.sha,
    message: c.commit.message,
    authorName: c.commit.author?.name ?? null,
    authorEmail: c.commit.author?.email ?? null,
    authorLogin: login(c.author),
    committerName: c.commit.committer?.name ?? null,
    committerLogin: login(c.committer),
    authoredAt: date(c.commit.author?.date),
    committedAt: date(c.commit.committer?.date),
    url: c.html_url,
  };
}

export async function fetchPrCommits(
  octokit: Octokit,
  ref: RepoRef,
  prNumber: number
): Promise<CommitRow[]> {
  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    ...ref,
    pull_number: prNumber,
    per_page: 100,
  });
  return commits.map(toCommitRow);
}

export async function* fetchCommits(
  octokit: Octokit,
  ref: RepoRef,
  branch: string,
  since?: string
): AsyncGenerator<CommitRow[]> {
  const pages = octokit.paginate.iterator(octokit.rest.repos.listCommits, {
    ...ref,
    sha: branch,
    since,
    per_page: 100,
  });
  for await (const { data } of pages) {
    if (data.length > 0) yield data.map(toCommitRow);
  }
}

// ---------------------------------------------------------------------------
// Discussions (GraphQL, explicit cursor pagination incl. nested comments/replies)
// ---------------------------------------------------------------------------
interface Connection<T> {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: T[];
}

interface GqlReply {
  id: string;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  isAnswer?: boolean;
  author: { login: string } | null;
}

interface GqlComment extends GqlReply {
  replies: Connection<GqlReply>;
}

interface GqlDiscussion {
  id: string;
  number: number;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  isAnswered: boolean | null;
  answer: { id: string } | null;
  category: { name: string } | null;
  author: { login: string } | null;
  comments: Connection<GqlComment>;
}

const COMMENT_FIELDS = `
  id body url createdAt updatedAt isAnswer author { login }
  replies(first: 50) {
    pageInfo { hasNextPage endCursor }
    nodes { id body url createdAt updatedAt author { login } }
  }`;

const DISCUSSIONS_QUERY = `
  query ($owner: String!, $repo: String!, $after: String) {
    repository(owner: $owner, name: $repo) {
      discussions(first: 20, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id number title body url createdAt updatedAt isAnswered
          answer { id }
          category { name }
          author { login }
          comments(first: 50) {
            pageInfo { hasNextPage endCursor }
            nodes { ${COMMENT_FIELDS} }
          }
        }
      }
    }
  }`;

const MORE_COMMENTS_QUERY = `
  query ($id: ID!, $after: String) {
    node(id: $id) {
      ... on Discussion {
        comments(first: 50, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { ${COMMENT_FIELDS} }
        }
      }
    }
  }`;

const MORE_REPLIES_QUERY = `
  query ($id: ID!, $after: String) {
    node(id: $id) {
      ... on DiscussionComment {
        replies(first: 50, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id body url createdAt updatedAt author { login } }
        }
      }
    }
  }`;

export async function discussionsEnabled(
  octokit: Octokit,
  ref: RepoRef
): Promise<boolean> {
  const res = await octokit.graphql<{
    repository: { hasDiscussionsEnabled: boolean } | null;
  }>(
    `query ($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) { hasDiscussionsEnabled }
    }`,
    { ...ref }
  );
  return res.repository?.hasDiscussionsEnabled ?? false;
}

/** Follows a cursor connection until exhausted, guarding against repeated cursors. */
async function drainConnection<T>(
  first: Connection<T>,
  loadMore: (after: string) => Promise<Connection<T> | null>
): Promise<T[]> {
  const all = [...first.nodes];
  const seen = new Set<string>();
  let page = first.pageInfo;
  while (page.hasNextPage && page.endCursor && !seen.has(page.endCursor)) {
    seen.add(page.endCursor);
    const next = await loadMore(page.endCursor);
    if (!next) break;
    all.push(...next.nodes);
    page = next.pageInfo;
  }
  return all;
}

function replyRow(
  r: GqlReply,
  discussionNumber: number,
  parentNodeId: string | null
): DiscussionCommentRow {
  return {
    githubNodeId: r.id,
    discussionNumber,
    parentNodeId,
    body: r.body,
    authorLogin: r.author?.login ?? null,
    isAnswer: r.isAnswer ?? false,
    url: r.url,
    createdAtGh: new Date(r.createdAt),
    updatedAtGh: new Date(r.updatedAt),
  };
}

export interface DiscussionBatch {
  discussions: DiscussionRow[];
  comments: DiscussionCommentRow[];
}

export async function* fetchDiscussions(
  octokit: Octokit,
  ref: RepoRef,
  since?: string
): AsyncGenerator<DiscussionBatch> {
  const sinceMs = since ? Date.parse(since) : null;
  let after: string | null = null;
  const seenCursors = new Set<string>();

  for (;;) {
    const res: {
      repository: { discussions: Connection<GqlDiscussion> } | null;
    } = await octokit.graphql(DISCUSSIONS_QUERY, { ...ref, after });
    const conn = res.repository?.discussions;
    if (!conn) return;

    const batch: DiscussionBatch = { discussions: [], comments: [] };
    let reachedOld = false;

    for (const d of conn.nodes) {
      if (sinceMs !== null && Date.parse(d.updatedAt) < sinceMs) {
        reachedOld = true;
        continue;
      }
      batch.discussions.push({
        githubNodeId: d.id,
        number: d.number,
        title: d.title,
        body: d.body,
        category: d.category?.name ?? null,
        authorLogin: d.author?.login ?? null,
        isAnswered: d.isAnswered ?? false,
        answerCommentNodeId: d.answer?.id ?? null,
        url: d.url,
        createdAtGh: new Date(d.createdAt),
        updatedAtGh: new Date(d.updatedAt),
      });

      const comments = await drainConnection(d.comments, async (cursor) => {
        const more = await octokit.graphql<{
          node: { comments: Connection<GqlComment> } | null;
        }>(MORE_COMMENTS_QUERY, { id: d.id, after: cursor });
        return more.node?.comments ?? null;
      });

      for (const c of comments) {
        batch.comments.push(replyRow(c, d.number, null));
        const replies = await drainConnection(c.replies, async (cursor) => {
          const more = await octokit.graphql<{
            node: { replies: Connection<GqlReply> } | null;
          }>(MORE_REPLIES_QUERY, { id: c.id, after: cursor });
          return more.node?.replies ?? null;
        });
        for (const r of replies) {
          batch.comments.push(replyRow(r, d.number, c.id));
        }
      }
    }

    if (batch.discussions.length > 0) yield batch;

    const next = conn.pageInfo.endCursor;
    if (
      reachedOld ||
      !conn.pageInfo.hasNextPage ||
      !next ||
      seenCursors.has(next)
    ) {
      return;
    }
    seenCursors.add(next);
    after = next;
  }
}

// ---------------------------------------------------------------------------
// Repository tree (paths + blob SHAs only; file contents are never downloaded)
// ---------------------------------------------------------------------------
const IGNORED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".next",
  "coverage",
]);

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "svg",
  "pdf",
  "zip",
  "gz",
  "tar",
  "mp3",
  "mp4",
  "mov",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "jar",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "lock",
]);

const MAX_BLOB_BYTES = 1_000_000;

export function isRelevantPath(
  path: string,
  type: string,
  size: number | null
) {
  const segments = path.split("/");
  if (segments.some((s) => IGNORED_SEGMENTS.has(s))) return false;
  if (type === "tree") return true;
  const ext = segments[segments.length - 1]?.split(".").pop()?.toLowerCase();
  if (ext && BINARY_EXTENSIONS.has(ext)) return false;
  return size === null || size <= MAX_BLOB_BYTES;
}

export async function fetchRepoTree(
  octokit: Octokit,
  ref: RepoRef,
  branch: string
): Promise<{ rows: RepoFileRow[]; truncated: boolean }> {
  const { data } = await octokit.rest.git.getTree({
    ...ref,
    tree_sha: branch,
    recursive: "true",
  });
  const rows: RepoFileRow[] = [];
  for (const node of data.tree) {
    if (!node.path || !node.sha) continue;
    if (node.type !== "blob" && node.type !== "tree") continue;
    const size = node.size ?? null;
    if (!isRelevantPath(node.path, node.type, size)) continue;
    rows.push({
      path: node.path,
      type: node.type,
      sha: node.sha,
      size,
      ref: branch,
    });
  }
  return { rows, truncated: data.truncated };
}
