import { RequestError, type Octokit } from "octokit";
import { isRelevantThread } from "./github.relevance";
import { extractReferences } from "./github.references";
import type { RepoRef } from "./github.fetchers";
import type {
  CommentRow,
  FetchReason,
  ReferenceRow,
  CommitRow,
  IssueRow,
  PrFileRow,
  PullRequestRow,
  ReviewCommentRow,
  ReviewRow,
} from "./github.sync.types";

/**
 * Bulk import over GraphQL. One request returns a page of threads together with their
 * comments, reviews, inline review threads, changed files and commits, replacing the
 * five or six REST calls per pull request (and the per-thread comment calls) that the
 * REST path needs. Relevance is decided from the counts in the same response, so quiet
 * threads are stored as lightweight metadata only.
 */

interface Actor {
  login: string;
}
interface Conn<T> {
  totalCount: number;
  pageInfo: { hasNextPage: boolean };
  nodes: (T | null)[];
}
interface GqlComment {
  databaseId: number | null;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: Actor | null;
}
interface GqlPr {
  databaseId: number;
  number: number;
  title: string;
  body: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  baseRefOid: string;
  headRefOid: string;
  mergeCommit: { oid: string } | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  author: Actor | null;
  labels: { nodes: ({ name: string } | null)[] };
  reviewRequests: {
    nodes: ({ requestedReviewer: { login?: string } | null } | null)[];
  };
  closingIssuesReferences?: {
    nodes: ({ number: number; repository: { nameWithOwner: string } } | null)[];
  };
  comments: Conn<GqlComment>;
  reviews: Conn<{
    databaseId: number | null;
    body: string;
    state: string;
    url: string;
    submittedAt: string | null;
    author: Actor | null;
    commit: { oid: string } | null;
  }>;
  reviewThreads: Conn<{
    id: string;
    isResolved: boolean;
    comments: Conn<
      GqlComment & {
        path: string;
        line: number | null;
        originalLine: number | null;
        diffHunk: string;
        commit: { oid: string } | null;
        replyTo: { databaseId: number | null } | null;
        pullRequestReview: { databaseId: number | null } | null;
      }
    >;
  }>;
  files: Conn<{
    path: string;
    additions: number;
    deletions: number;
    changeType: string;
  }>;
  commits: Conn<{
    commit: {
      oid: string;
      message: string;
      url: string;
      committedDate: string;
      authoredDate: string;
      author: {
        name: string | null;
        email: string | null;
        user: Actor | null;
      } | null;
      committer: { name: string | null; user: Actor | null } | null;
    };
  }>;
}
interface GqlIssue {
  databaseId: number;
  number: number;
  title: string;
  body: string;
  url: string;
  state: "OPEN" | "CLOSED";
  stateReason: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  author: Actor | null;
  labels: { nodes: ({ name: string } | null)[] };
  assignees: { nodes: ({ login: string } | null)[] };
  comments: Conn<GqlComment>;
}

const COMMENT = `databaseId body url createdAt updatedAt author { login }`;

const PR_FIELDS = `
  databaseId number title body url state isDraft
  baseRefName headRefName baseRefOid headRefOid
  mergeCommit { oid }
  createdAt updatedAt closedAt mergedAt
  author { login }
  labels(first: 20) { nodes { name } }
  reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
  closingIssuesReferences(first: 10) { nodes { number repository { nameWithOwner } } }
  comments(first: 100) { totalCount pageInfo { hasNextPage } nodes { ${COMMENT} } }
  reviews(first: 50) {
    totalCount pageInfo { hasNextPage }
    nodes { databaseId body state url submittedAt author { login } commit { oid } }
  }
  reviewThreads(first: 30) {
    totalCount pageInfo { hasNextPage }
    nodes {
      id isResolved
      comments(first: 30) {
        totalCount pageInfo { hasNextPage }
        nodes {
          ${COMMENT} path line originalLine diffHunk
          commit { oid } replyTo { databaseId } pullRequestReview { databaseId }
        }
      }
    }
  }
  files(first: 100) { totalCount pageInfo { hasNextPage } nodes { path additions deletions changeType } }
  commits(first: 100) {
    totalCount pageInfo { hasNextPage }
    nodes { commit { oid message url committedDate authoredDate author { name email user { login } } committer { name user { login } } } }
  }`;

const ISSUE_FIELDS = `
  databaseId number title body url state stateReason
  createdAt updatedAt closedAt
  author { login }
  labels(first: 20) { nodes { name } }
  assignees(first: 10) { nodes { login } }
  comments(first: 100) { totalCount pageInfo { hasNextPage } nodes { ${COMMENT} } }`;

const PRS_QUERY = `
  query ($owner: String!, $repo: String!, $after: String, $first: Int!, $states: [PullRequestState!]) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: $first, after: $after, states: $states, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { ${PR_FIELDS} }
      }
    }
  }`;

const ISSUES_QUERY = `
  query ($owner: String!, $repo: String!, $after: String, $first: Int!, $since: DateTime, $states: [IssueState!]) {
    repository(owner: $owner, name: $repo) {
      issues(first: $first, after: $after, states: $states, orderBy: { field: UPDATED_AT, direction: DESC }, filterBy: { since: $since }) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { ${ISSUE_FIELDS} }
      }
    }
  }`;

interface PageResponse<N> {
  repository: {
    pullRequests?: PageOf<N>;
    issues?: PageOf<N>;
  } | null;
}
interface PageOf<N> {
  totalCount?: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: (N | null)[];
}

const login = (a: Actor | null | undefined) => a?.login ?? null;
const present = <T>(list: (T | null)[]): T[] =>
  list.filter((x): x is T => x !== null);
const date = (v: string | null | undefined) => (v ? new Date(v) : null);

/** Auth/permission/rate-limit problems are not schema problems: a REST fallback cannot fix them. */
export function isAccessProblem(err: unknown): boolean {
  return (
    err instanceof RequestError &&
    (err.status === 401 ||
      err.status === 403 ||
      err.status === 404 ||
      err.status === 429)
  );
}

/** Fetches one page, retrying once with a much smaller page if GitHub chokes on the big one. */
async function page<N>(
  octokit: Octokit,
  query: string,
  vars: Record<string, unknown>,
  size: { n: number },
  pick: (r: PageResponse<N>) => PageOf<N> | undefined
): Promise<PageOf<N>> {
  for (;;) {
    try {
      const res = await octokit.graphql<PageResponse<N>>(query, {
        ...vars,
        first: size.n,
      });
      const p = pick(res);
      if (!p) throw new Error("GitHub returned no data for this repository.");
      return p;
    } catch (err) {
      if (size.n > 5 && !isAccessProblem(err)) {
        size.n = 5;
        continue;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Shared options / helpers
// ---------------------------------------------------------------------------
export interface BulkOptions {
  /** OPEN for current work; omit for "everything updated since" (to catch closures). */
  states?: string[];
  since?: string;
  limit?: number;
  /** Receives GitHub's own total for this selection (e.g. all open issues). */
  onTotal?: (total: number) => void;
  reason: FetchReason;
}

export interface ThreadRefs {
  /** Same-repo threads this thread explicitly points to, with how we know. */
  references: ReferenceRow[];
}

function collectRefs(
  kind: "issue" | "pull_request",
  number: number,
  repo: RepoRef,
  body: string | null,
  comments: GqlComment[],
  closing: number[] = []
): ReferenceRow[] {
  const out = new Map<string, ReferenceRow>();
  const add = (to: number, basis: ReferenceRow["basis"]) => {
    if (to === number) return;
    out.set(`${to}:${basis}`, {
      fromKind: kind,
      fromNumber: number,
      toNumber: to,
      basis,
    });
  };
  for (const n of extractReferences(body, repo, number))
    add(n, "reference_in_body");
  for (const c of comments) {
    for (const n of extractReferences(c.body, repo, number))
      add(n, "reference_in_comment");
  }
  for (const n of closing) add(n, "closing_reference");
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------
export interface IssueBundle extends ThreadRefs {
  issue: IssueRow;
  relevant: boolean;
  comments: CommentRow[];
  /** More comments exist than one GraphQL page carried; complete via REST. */
  incomplete: boolean;
}

function toIssueBundle(
  n: GqlIssue,
  repo: RepoRef,
  reason: FetchReason,
  forceRelevant: boolean
): IssueBundle {
  const comments = present(n.comments.nodes);
  const relevant =
    forceRelevant ||
    isRelevantThread({
      kind: "issue",
      bodyLength: n.body?.length ?? 0,
      talk: n.comments.totalCount,
    });
  return {
    issue: {
      fetchReason: reason,
      githubId: BigInt(n.databaseId),
      number: n.number,
      title: n.title,
      body: n.body || null,
      authorLogin: login(n.author),
      state: n.state.toLowerCase(),
      stateReason: n.stateReason ? n.stateReason.toLowerCase() : null,
      labels: present(n.labels.nodes).map((l) => l.name),
      assignees: present(n.assignees.nodes).map((a) => a.login),
      url: n.url,
      createdAtGh: new Date(n.createdAt),
      updatedAtGh: new Date(n.updatedAt),
      closedAtGh: date(n.closedAt),
    },
    relevant,
    comments: relevant ? comments.flatMap((c) => toComment(c, n.number)) : [],
    incomplete: relevant && n.comments.pageInfo.hasNextPage,
    // references are read from everything GitHub returned, stored or not
    references: collectRefs("issue", n.number, repo, n.body, comments),
  };
}

export async function* fetchIssuesBulk(
  octokit: Octokit,
  ref: RepoRef,
  opts: BulkOptions
): AsyncGenerator<IssueBundle[]> {
  const limit = opts.limit ?? Infinity;
  const size = { n: 40 };
  let after: string | null = null;
  let seen = 0;
  let totalReported = false;
  const cursors = new Set<string>();
  for (;;) {
    const p: PageOf<GqlIssue> = await page<GqlIssue>(
      octokit,
      ISSUES_QUERY,
      { ...ref, after, since: opts.since ?? null, states: opts.states ?? null },
      size,
      (r) => r.repository?.issues
    );
    if (!totalReported && typeof p.totalCount === "number") {
      totalReported = true;
      opts.onTotal?.(p.totalCount);
    }
    const bundles: IssueBundle[] = [];
    for (const n of present(p.nodes)) {
      if (seen >= limit) break;
      seen += 1;
      bundles.push(toIssueBundle(n, ref, opts.reason, false));
    }
    if (bundles.length > 0) yield bundles;
    const next = p.pageInfo.endCursor;
    if (
      seen >= limit ||
      !p.pageInfo.hasNextPage ||
      !next ||
      cursors.has(next)
    ) {
      return;
    }
    cursors.add(next);
    after = next;
  }
}

function toComment(c: GqlComment, parentNumber: number): CommentRow[] {
  if (c.databaseId === null) return [];
  return [
    {
      githubId: BigInt(c.databaseId),
      parentNumber,
      body: c.body ?? "",
      authorLogin: login(c.author),
      url: c.url,
      createdAtGh: new Date(c.createdAt),
      updatedAtGh: new Date(c.updatedAt),
    },
  ];
}

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------
export interface PrBundle extends ThreadRefs {
  pr: PullRequestRow;
  relevant: boolean;
  comments: CommentRow[];
  reviews: ReviewRow[];
  reviewComments: ReviewCommentRow[];
  files: PrFileRow[];
  commits: CommitRow[];
  /** Parts GraphQL could not fully carry; the runner completes these through REST. */
  incomplete: ("comments" | "reviews" | "inline" | "files" | "commits")[];
}

const FILE_STATUS: Record<string, string> = {
  ADDED: "added",
  DELETED: "removed",
  MODIFIED: "modified",
  RENAMED: "renamed",
  COPIED: "copied",
  CHANGED: "changed",
};

export async function* fetchPullRequestsBulk(
  octokit: Octokit,
  ref: RepoRef,
  opts: BulkOptions
): AsyncGenerator<PrBundle[]> {
  const limit = opts.limit ?? Infinity;
  const sinceMs = opts.since ? Date.parse(opts.since) : null;
  const size = { n: 20 };
  let after: string | null = null;
  let seen = 0;
  let totalReported = false;
  const cursors = new Set<string>();
  for (;;) {
    const p: PageOf<GqlPr> = await page<GqlPr>(
      octokit,
      PRS_QUERY,
      { ...ref, after, states: opts.states ?? null },
      size,
      (r) => r.repository?.pullRequests
    );
    if (!totalReported && typeof p.totalCount === "number") {
      totalReported = true;
      opts.onTotal?.(p.totalCount);
    }
    const bundles: PrBundle[] = [];
    let reachedOld = false;
    for (const n of present(p.nodes)) {
      if (sinceMs !== null && Date.parse(n.updatedAt) < sinceMs) {
        reachedOld = true; // newest first: everything after this is already synced
        break;
      }
      if (seen >= limit) {
        reachedOld = true;
        break;
      }
      seen += 1;
      bundles.push(toPrBundle(n, ref, opts.reason, false));
    }
    if (bundles.length > 0) yield bundles;
    const next = p.pageInfo.endCursor;
    if (reachedOld || !p.pageInfo.hasNextPage || !next || cursors.has(next)) {
      return;
    }
    cursors.add(next);
    after = next;
  }
}

function toPrBundle(
  n: GqlPr,
  repo: RepoRef,
  reason: FetchReason,
  forceRelevant: boolean
): PrBundle {
  const threads = present(n.reviewThreads.nodes);
  const inlineCount = threads.reduce((t, th) => t + th.comments.totalCount, 0);
  const relevant =
    forceRelevant ||
    isRelevantThread({
      kind: "pull_request",
      bodyLength: n.body?.length ?? 0,
      talk: n.comments.totalCount + n.reviews.totalCount + inlineCount,
    });
  const slug = `${repo.owner}/${repo.repo}`.toLowerCase();
  const closing = present(n.closingIssuesReferences?.nodes ?? [])
    .filter((c) => c.repository.nameWithOwner.toLowerCase() === slug)
    .map((c) => c.number);
  const rawComments = present(n.comments.nodes);
  const references = collectRefs(
    "pull_request",
    n.number,
    repo,
    n.body,
    rawComments,
    closing
  );
  const pr: PullRequestRow = {
    fetchReason: reason,
    githubId: BigInt(n.databaseId),
    number: n.number,
    title: n.title,
    body: n.body || null,
    authorLogin: login(n.author),
    state: n.state === "MERGED" ? "merged" : n.state.toLowerCase(),
    isDraft: n.isDraft,
    baseRef: n.baseRefName,
    headRef: n.headRefName,
    baseSha: n.baseRefOid,
    headSha: n.headRefOid,
    mergeCommitSha: n.mergeCommit?.oid ?? null,
    labels: present(n.labels.nodes).map((l) => l.name),
    reviewers: present(n.reviewRequests.nodes).flatMap((r) =>
      r.requestedReviewer?.login ? [r.requestedReviewer.login] : []
    ),
    url: n.url,
    createdAtGh: new Date(n.createdAt),
    updatedAtGh: new Date(n.updatedAt),
    closedAtGh: date(n.closedAt),
    mergedAtGh: date(n.mergedAt),
  };

  // Changed files are kept for every PR (they power PR intelligence); everything else
  // only for relevant threads.
  const files: PrFileRow[] = present(n.files.nodes).map((f) => ({
    prNumber: n.number,
    filename: f.path,
    previousFilename: null,
    status: FILE_STATUS[f.changeType] ?? f.changeType.toLowerCase(),
    additions: f.additions,
    deletions: f.deletions,
    changes: f.additions + f.deletions,
    blobSha: null,
    patch: null, // diffs are large and unused by the analysis; not imported
    headSha: n.headRefOid,
  }));

  const incomplete: PrBundle["incomplete"] = [];
  if (
    n.files.pageInfo.hasNextPage ||
    files.some((f) => f.status === "renamed")
  ) {
    incomplete.push("files"); // renames need REST for the previous path
  }
  if (!relevant) {
    return {
      pr,
      relevant,
      comments: [],
      reviews: [],
      reviewComments: [],
      files,
      commits: [],
      incomplete,
      references,
    };
  }

  const reviewComments: ReviewCommentRow[] = threads.flatMap((th) =>
    present(th.comments.nodes).flatMap((c) =>
      c.databaseId === null
        ? []
        : [
            {
              githubId: BigInt(c.databaseId),
              prNumber: n.number,
              reviewGithubId:
                c.pullRequestReview?.databaseId != null
                  ? BigInt(c.pullRequestReview.databaseId)
                  : null,
              inReplyToId:
                c.replyTo?.databaseId != null
                  ? BigInt(c.replyTo.databaseId)
                  : null,
              threadId: th.id,
              isResolved: th.isResolved,
              body: c.body ?? "",
              authorLogin: login(c.author),
              path: c.path,
              line: c.line,
              originalLine: c.originalLine,
              diffHunk: c.diffHunk || null,
              commitSha: c.commit?.oid ?? null,
              url: c.url,
              createdAtGh: new Date(c.createdAt),
              updatedAtGh: new Date(c.updatedAt),
            },
          ]
    )
  );

  const commits: CommitRow[] = present(n.commits.nodes).map(
    ({ commit: c }) => ({
      sha: c.oid,
      message: c.message,
      authorName: c.author?.name ?? null,
      authorEmail: c.author?.email ?? null,
      authorLogin: login(c.author?.user),
      committerName: c.committer?.name ?? null,
      committerLogin: login(c.committer?.user),
      authoredAt: date(c.authoredDate),
      committedAt: date(c.committedDate),
      url: c.url,
    })
  );

  if (n.comments.pageInfo.hasNextPage) incomplete.push("comments");
  if (n.reviews.pageInfo.hasNextPage) incomplete.push("reviews");
  if (
    n.reviewThreads.pageInfo.hasNextPage ||
    threads.some((t) => t.comments.pageInfo.hasNextPage)
  ) {
    incomplete.push("inline");
  }
  if (n.commits.pageInfo.hasNextPage) incomplete.push("commits");

  return {
    pr,
    relevant,
    comments: rawComments.flatMap((c) => toComment(c, n.number)),
    reviews: present(n.reviews.nodes).flatMap((r) =>
      r.databaseId === null
        ? []
        : [
            {
              githubId: BigInt(r.databaseId),
              prNumber: n.number,
              reviewerLogin: login(r.author),
              body: r.body || null,
              state: r.state,
              commitSha: r.commit?.oid ?? null,
              url: r.url,
              submittedAt: date(r.submittedAt),
            },
          ]
    ),
    reviewComments,
    files,
    commits,
    incomplete,
    references,
  };
}

// ---------------------------------------------------------------------------
// Specific threads by number (referenced history, and refreshing stale "open" rows)
// ---------------------------------------------------------------------------
interface ByNumberResponse {
  repository: Record<
    string,
    ((GqlIssue | GqlPr) & { __typename: string }) | null
  > | null;
}

/** GraphQL reports unknown numbers as NOT_FOUND errors next to partial data. */
function partialData<T>(err: unknown): T | null {
  const e = err as { data?: T; errors?: { type?: string }[] };
  if (
    e &&
    typeof e === "object" &&
    e.data &&
    Array.isArray(e.errors) &&
    e.errors.length > 0 &&
    e.errors.every((x) => x.type === "NOT_FOUND")
  ) {
    return e.data;
  }
  return null;
}

export interface ThreadsByNumber {
  issues: IssueBundle[];
  pullRequests: PrBundle[];
  /** Numbers that do not exist in this repository (or are not visible). */
  missing: number[];
}

/**
 * Fetches specific issues/PRs, 10 per request. `fullConversation` keeps the whole
 * discussion (for explicitly referenced history); otherwise only metadata is stored.
 */
export async function fetchThreadsByNumber(
  octokit: Octokit,
  ref: RepoRef,
  numbers: number[],
  opts: { reason: FetchReason; fullConversation: boolean }
): Promise<ThreadsByNumber> {
  const out: ThreadsByNumber = { issues: [], pullRequests: [], missing: [] };
  const unique = [...new Set(numbers)];
  for (let i = 0; i < unique.length; i += 10) {
    const batch = unique.slice(i, i + 10);
    const fields = batch
      .map(
        (n, k) =>
          `t${k}: issueOrPullRequest(number: ${n}) { __typename ... on Issue { ${ISSUE_FIELDS} } ... on PullRequest { ${PR_FIELDS} } }`
      )
      .join("\n");
    const query = `query ($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { ${fields} } }`;
    let data: ByNumberResponse | null;
    try {
      data = await octokit.graphql<ByNumberResponse>(query, { ...ref });
    } catch (err) {
      data = partialData<ByNumberResponse>(err);
      if (!data) throw err;
    }
    const repoData = data?.repository ?? {};
    batch.forEach((n, k) => {
      const node = repoData[`t${k}`];
      if (!node) out.missing.push(n);
      else if (node.__typename === "PullRequest") {
        out.pullRequests.push(
          toPrBundle(node as GqlPr, ref, opts.reason, opts.fullConversation)
        );
      } else {
        out.issues.push(
          toIssueBundle(
            node as GqlIssue,
            ref,
            opts.reason,
            opts.fullConversation
          )
        );
      }
    });
  }
  return out;
}

/** GitHub's own counts of current work, used to report what was discovered vs imported. */
export async function fetchOpenTotals(
  octokit: Octokit,
  ref: RepoRef
): Promise<{ issues: number; pullRequests: number; discussions: number }> {
  const res = await octokit.graphql<{
    repository: {
      issues: { totalCount: number };
      pullRequests: { totalCount: number };
      discussions: { totalCount: number };
    } | null;
  }>(
    `query ($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(states: OPEN) { totalCount }
        pullRequests(states: OPEN) { totalCount }
        discussions { totalCount }
      }
    }`,
    { ...ref }
  );
  return {
    issues: res.repository?.issues.totalCount ?? 0,
    pullRequests: res.repository?.pullRequests.totalCount ?? 0,
    discussions: res.repository?.discussions.totalCount ?? 0,
  };
}
