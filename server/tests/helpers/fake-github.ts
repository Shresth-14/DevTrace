import { DevTraceOctokit } from "../../src/modules/github/github.octokit";
import type { Octokit } from "octokit";

/** Minimal in-memory GitHub: REST (with Link-header pagination) + GraphQL. */

type Json = Record<string, unknown>;

const user = (login: string) => ({ login, id: login.length });
const T = (s: string) => `${s}T00:00:00Z`;

export interface FakeData {
  issues: Json[];
  repoComments: Json[];
  pulls: Json[];
  reviews: Record<number, Json[]>;
  reviewComments: Record<number, Json[]>;
  files: Record<number, Json[]>;
  prCommits: Record<number, Json[]>;
  commits: Json[];
  tree: Json[];
  discussionsEnabled: boolean;
  /** PR number -> issue numbers it closes (GitHub's closingIssuesReferences). */
  closing?: Record<number, number[]>;
  /** Pretend GraphQL pages can only carry this many comments, to exercise REST completion. */
  bulkCommentCap?: number;
  /** Overrides for the GET /repos/acme/widgets payload (e.g. { private: true }). */
  repoInfo?: Json;
  discussions: GqlDiscussion[];
  /** REST id -> thread */
  threads: Record<
    number,
    { id: string; isResolved: boolean; comments: number[] }[]
  >;
}

export interface GqlDiscussion {
  id: string;
  number: number;
  title: string;
  updatedAt: string;
  comments: GqlComment[];
}
export interface GqlComment {
  id: string;
  body: string;
  replies: { id: string; body: string }[];
}

export interface FakeOptions {
  pageSize?: number;
  /** Make the bulk issue/PR GraphQL queries fail, to exercise the REST fallback. */
  failBulk?: boolean;
  /** Extra delay for matching paths (to make one resource slower than the rest). */
  delays?: { match: RegExp; ms: number }[];
  /** Simulated network latency per request, in ms (used by the import benchmark). */
  latencyMs?: { rest: number; graphql: number };
  /** path regex -> status override (e.g. 404, 403 rate limit) */
  failures?: {
    match: RegExp;
    status: number;
    headers?: Record<string, string>;
  }[];
}

export function baseData(): FakeData {
  const issue = (
    n: number,
    id: number,
    updated: string,
    isPr = false,
    opts: { state?: "open" | "closed"; body?: string } = {}
  ): Json => ({
    id,
    number: n,
    title: `${isPr ? "PR" : "Issue"} ${n}`,
    body: opts.body ?? `Body ${n}`,
    user: user("alice"),
    state: opts.state ?? "open",
    state_reason: opts.state === "closed" ? "completed" : null,
    labels: [{ name: "bug" }, "triage"],
    assignees: [user("bob")],
    html_url: `https://github.com/acme/widgets/${isPr ? "pull" : "issues"}/${n}`,
    created_at: T("2024-01-01"),
    updated_at: updated,
    closed_at: opts.state === "closed" ? updated : null,
    ...(isPr ? { pull_request: { url: "x" } } : {}),
  });
  const pr = (
    n: number,
    id: number,
    updated: string,
    kind: "open" | "draft" | "merged",
    body = `PR body ${n}`
  ): Json => ({
    id,
    number: n,
    title: `PR ${n}`,
    body,
    user: user("carol"),
    state: kind === "merged" ? "closed" : "open",
    draft: kind === "draft",
    base: { ref: "main", sha: `base${n}` },
    head: { ref: `feature-${n}`, sha: `head${n}` },
    merge_commit_sha: kind === "merged" ? `merge${n}` : null,
    labels: [{ name: "feature" }],
    requested_reviewers: [user("dave")],
    html_url: `https://github.com/acme/widgets/pull/${n}`,
    created_at: T("2024-01-02"),
    updated_at: updated,
    closed_at: kind === "merged" ? T("2024-01-05") : null,
    merged_at: kind === "merged" ? T("2024-01-05") : null,
  });
  const comment = (id: number, n: number, updated: string): Json => ({
    id,
    issue_url: `https://api.github.com/repos/acme/widgets/issues/${n}`,
    body: `Comment ${id}`,
    user: user("erin"),
    html_url: `https://github.com/acme/widgets/issues/${n}#issuecomment-${id}`,
    created_at: T("2024-01-03"),
    updated_at: updated,
  });
  const commit = (sha: string, date: string): Json => ({
    sha,
    html_url: `https://github.com/acme/widgets/commit/${sha}`,
    commit: {
      message: `Commit ${sha}`,
      author: { name: "Alice", email: "a@x.io", date },
      committer: { name: "Alice", date },
    },
    author: user("alice"),
    committer: user("alice"),
  });
  return {
    issues: [
      issue(1, 101, T("2024-01-10"), false, {
        body: "Body 1. See #4 for the earlier idea we ruled out.",
      }),
      issue(2, 102, T("2024-01-11")),
      issue(3, 103, T("2024-01-12")),
      // older, closed history: only #4 is linked from current work
      issue(4, 104, T("2023-06-01"), false, { state: "closed" }),
      issue(5, 105, T("2023-06-02"), false, { state: "closed" }),
      issue(8, 108, T("2023-06-03"), true, { state: "closed" }),
      issue(9, 109, T("2023-06-04"), true, { state: "closed" }),
      issue(10, 110, T("2024-01-13"), true),
      issue(11, 111, T("2024-01-14"), true),
    ],
    repoComments: [
      comment(1001, 1, T("2024-01-10")),
      comment(1002, 2, T("2024-01-11")),
      comment(1003, 10, T("2024-01-12")), // PR conversation comment
      comment(1004, 99, T("2024-01-13")), // parent never imported
      comment(1005, 4, T("2023-06-01")), // linked history
      comment(1006, 4, T("2023-06-01")),
      comment(1007, 5, T("2023-06-02")), // unrelated history
      comment(1008, 5, T("2023-06-02")),
      comment(1009, 9, T("2023-06-04")), // linked history (PR 9)
      comment(1010, 9, T("2023-06-04")),
    ],
    pulls: [
      pr(8, 208, T("2023-06-03"), "merged"),
      pr(9, 209, T("2023-06-04"), "merged"),
      pr(10, 210, T("2024-01-13"), "open", "PR body 10"),
      pr(11, 211, T("2024-01-14"), "draft", "PR body 11. Follow-up to #9."),
    ],
    reviews: {
      10: [
        {
          id: 3001,
          user: user("dave"),
          body: "LGTM",
          state: "APPROVED",
          commit_id: "head10",
          html_url: "https://github.com/r/3001",
          submitted_at: T("2024-01-04"),
        },
        {
          id: 3002,
          user: user("frank"),
          body: "Fix",
          state: "CHANGES_REQUESTED",
          commit_id: "head10",
          html_url: "https://github.com/r/3002",
          submitted_at: T("2024-01-03"),
        },
      ],
      11: [],
      9: [
        {
          id: 3091,
          user: user("dave"),
          body: "I prefer approach Z here",
          state: "CHANGES_REQUESTED",
          commit_id: "head9",
          html_url: "https://github.com/r/3091",
          submitted_at: T("2023-06-04"),
        },
        {
          id: 3092,
          user: user("erin"),
          body: "Agreed, merging with Z",
          state: "APPROVED",
          commit_id: "head9",
          html_url: "https://github.com/r/3092",
          submitted_at: T("2023-06-04"),
        },
      ],
      8: [],
    },
    reviewComments: {
      10: [
        {
          id: 4001,
          pull_request_review_id: 3002,
          in_reply_to_id: null,
          body: "Why?",
          user: user("frank"),
          path: "src/a.ts",
          line: 12,
          original_line: 10,
          diff_hunk: "@@ -1 +1 @@",
          commit_id: "head10",
          html_url: "https://github.com/c/4001",
          created_at: T("2024-01-03"),
          updated_at: T("2024-01-03"),
        },
        {
          id: 4002,
          pull_request_review_id: 3002,
          in_reply_to_id: 4001,
          body: "Because X",
          user: user("carol"),
          path: "src/a.ts",
          line: 12,
          original_line: 10,
          diff_hunk: "@@ -1 +1 @@",
          commit_id: "head10",
          html_url: "https://github.com/c/4002",
          created_at: T("2024-01-04"),
          updated_at: T("2024-01-04"),
        },
      ],
      11: [],
      9: [
        {
          id: 4091,
          pull_request_review_id: 3091,
          in_reply_to_id: null,
          body: "Z keeps the schema stable",
          user: user("dave"),
          path: "src/old-schema.ts",
          line: 5,
          original_line: 5,
          diff_hunk: "@@ -1 +1 @@",
          commit_id: "head9",
          html_url: "https://github.com/c/4091",
          created_at: T("2023-06-04"),
          updated_at: T("2023-06-04"),
        },
      ],
      8: [],
    },
    files: {
      10: [
        {
          sha: "blob1",
          filename: "src/a.ts",
          status: "modified",
          additions: 3,
          deletions: 1,
          changes: 4,
          patch: "@@ -1 +1 @@\n-a\n+b",
        },
        {
          sha: "blob2",
          filename: "assets/logo.png",
          status: "added",
          additions: 0,
          deletions: 0,
          changes: 0,
        }, // no patch
        {
          sha: "blob3",
          filename: "src/new-name.ts",
          previous_filename: "src/old-name.ts",
          status: "renamed",
          additions: 0,
          deletions: 0,
          changes: 0,
        },
      ],
      11: [
        {
          sha: "blob4",
          filename: "README.md",
          status: "modified",
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: "+hi",
        },
      ],
      9: [
        {
          sha: "blob9",
          filename: "src/old-schema.ts",
          status: "modified",
          additions: 2,
          deletions: 2,
          changes: 4,
          patch: "@@ -1 +1 @@",
        },
      ],
      8: [
        {
          sha: "blob8",
          filename: "docs/unrelated.md",
          status: "modified",
          additions: 1,
          deletions: 0,
          changes: 1,
        },
      ],
    },
    prCommits: {
      10: [commit("c1", T("2024-01-02")), commit("c2", T("2024-01-03"))],
      11: [commit("c3", T("2024-01-06"))],
      9: [commit("c9", T("2023-06-03"))],
      8: [commit("c8", T("2023-06-02"))],
    },
    closing: { 10: [4] },
    commits: [
      commit("c1", T("2024-01-02")),
      commit("c2", T("2024-01-03")),
      commit("c0", T("2024-01-01")),
    ],
    tree: [
      { path: "src", type: "tree", sha: "t1" },
      { path: "src/a.ts", type: "blob", sha: "b1", size: 100 },
      { path: "assets/logo.png", type: "blob", sha: "b2", size: 5000 },
      { path: "node_modules/x/index.js", type: "blob", sha: "b3", size: 10 },
      { path: "big.txt", type: "blob", sha: "b4", size: 5_000_000 },
    ],
    discussionsEnabled: true,
    discussions: [
      {
        id: "D_1",
        number: 1,
        title: "Why Postgres?",
        updatedAt: T("2024-01-09"),
        comments: [
          {
            id: "DC_1",
            body: "Because",
            replies: [
              { id: "DR_1", body: "ok" },
              { id: "DR_2", body: "fine" },
              { id: "DR_3", body: "great" },
            ],
          },
          { id: "DC_2", body: "Also", replies: [] },
          { id: "DC_3", body: "And", replies: [] },
        ],
      },
      {
        id: "D_2",
        number: 2,
        title: "Roadmap",
        updatedAt: T("2024-01-08"),
        comments: [],
      },
    ],
    threads: {
      10: [{ id: "PRT_1", isResolved: true, comments: [4001, 4002] }],
      9: [{ id: "PRT_9", isResolved: false, comments: [4091] }],
      11: [],
    },
  };
}

function paginate(url: URL, items: unknown[], pageSize: number) {
  const page = Number(url.searchParams.get("page") ?? 1);
  const slice = items.slice((page - 1) * pageSize, page * pageSize);
  const headers: Record<string, string> = {};
  if (page * pageSize < items.length) {
    const next = new URL(url);
    next.searchParams.set("page", String(page + 1));
    headers.link = `<${next.toString()}>; rel="next"`;
  }
  return { body: slice, headers };
}

/** Honors `direction=asc|desc` on updated_at like GitHub does (default desc). */
const byUpdated = (items: Json[], url: URL): Json[] => {
  const dir = url.searchParams.get("direction") === "asc" ? 1 : -1;
  return [...items].sort(
    (a, b) =>
      dir *
      (Date.parse(String(a.updated_at)) - Date.parse(String(b.updated_at)))
  );
};

/** GitHub's `state` filter for list endpoints: open (default), closed or all. */
const byState = (items: Json[], url: URL): Json[] => {
  const state = url.searchParams.get("state") ?? "open";
  return state === "all" ? items : items.filter((i) => i.state === state);
};

const sinceFilter = (items: Json[], url: URL, field = "updated_at") => {
  const since = url.searchParams.get("since");
  return since
    ? items.filter((i) => Date.parse(String(i[field])) >= Date.parse(since))
    : items;
};

const conn = <T>(all: T[], first: number, after: string | null) => {
  const start = after ? Number(after) : 0;
  const nodes = all.slice(start, start + first);
  const end = start + first;
  return {
    pageInfo: { hasNextPage: end < all.length, endCursor: String(end) },
    nodes,
  };
};

export function createFakeGitHub(data: FakeData, opts: FakeOptions = {}) {
  const pageSize = opts.pageSize ?? 2;
  const calls: string[] = [];
  const stats = { inFlight: 0, maxInFlight: 0 };

  const reply = (
    status: number,
    body: unknown,
    headers: Record<string, string> = {}
  ) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...headers,
      },
    });

  const gqlComment = (c: GqlComment) => ({
    id: c.id,
    body: c.body,
    url: `https://github.com/d/${c.id}`,
    createdAt: T("2024-01-01"),
    updatedAt: T("2024-01-02"),
    isAnswer: false,
    author: { login: "erin" },
    replies: conn(
      c.replies.map((r) => ({
        id: r.id,
        body: r.body,
        url: `https://github.com/d/${r.id}`,
        createdAt: T("2024-01-01"),
        updatedAt: T("2024-01-02"),
        author: { login: "frank" },
      })),
      2,
      null
    ),
  });

  const actor = (u: unknown) =>
    u && typeof u === "object" ? { login: (u as Json).login } : null;
  const commentsConn = (all: Json[]) => {
    const cap = data.bulkCommentCap ?? Infinity;
    const nodes = all.slice(0, cap).map((c) => ({
      databaseId: c.id,
      body: c.body,
      url: c.html_url,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      author: actor(c.user),
    }));
    return {
      totalCount: all.length,
      pageInfo: { hasNextPage: all.length > cap },
      nodes,
    };
  };
  const threadComments = (n: number) =>
    data.repoComments.filter((c) => String(c.issue_url).endsWith(`/${n}`));
  const labelNodes = (labels: unknown) => ({
    nodes: ((labels as (string | Json)[]) ?? []).map((l) => ({
      name: typeof l === "string" ? l : l.name,
    })),
  });
  const FILE_TYPE: Record<string, string> = {
    added: "ADDED",
    removed: "DELETED",
    modified: "MODIFIED",
    renamed: "RENAMED",
  };

  const prNode = (p: Json) => {
    const n = p.number as number;
    const reviews = data.reviews[n] ?? [];
    const inline = data.reviewComments[n] ?? [];
    const threads = data.threads[n] ?? [];
    const files = data.files[n] ?? [];
    const commits = data.prCommits[n] ?? [];
    const base = p.base as Json;
    const head = p.head as Json;
    return {
      databaseId: p.id,
      number: n,
      title: p.title,
      body: p.body,
      url: p.html_url,
      state: p.merged_at ? "MERGED" : p.state === "open" ? "OPEN" : "CLOSED",
      isDraft: p.draft ?? false,
      baseRefName: base.ref,
      headRefName: head.ref,
      baseRefOid: base.sha,
      headRefOid: head.sha,
      mergeCommit: p.merge_commit_sha ? { oid: p.merge_commit_sha } : null,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      closedAt: p.closed_at,
      mergedAt: p.merged_at,
      author: actor(p.user),
      labels: labelNodes(p.labels),
      closingIssuesReferences: {
        nodes: (data.closing?.[n] ?? []).map((num) => ({
          number: num,
          repository: { nameWithOwner: "acme/widgets" },
        })),
      },
      reviewRequests: {
        nodes: ((p.requested_reviewers as Json[]) ?? []).map((u) => ({
          requestedReviewer: actor(u),
        })),
      },
      comments: commentsConn(threadComments(n)),
      reviews: {
        totalCount: reviews.length,
        pageInfo: { hasNextPage: false },
        nodes: reviews.map((r) => ({
          databaseId: r.id,
          body: r.body,
          state: r.state,
          url: r.html_url,
          submittedAt: r.submitted_at,
          author: actor(r.user),
          commit: { oid: r.commit_id },
        })),
      },
      reviewThreads: {
        totalCount: threads.length,
        pageInfo: { hasNextPage: false },
        nodes: threads.map((t) => {
          const cs = t.comments
            .map((id) => inline.find((c) => c.id === id))
            .filter((c): c is Json => !!c);
          return {
            id: t.id,
            isResolved: t.isResolved,
            comments: {
              totalCount: cs.length,
              pageInfo: { hasNextPage: false },
              nodes: cs.map((c) => ({
                databaseId: c.id,
                body: c.body,
                url: c.html_url,
                createdAt: c.created_at,
                updatedAt: c.updated_at,
                author: actor(c.user),
                path: c.path,
                line: c.line,
                originalLine: c.original_line,
                diffHunk: c.diff_hunk,
                commit: { oid: c.commit_id },
                replyTo: c.in_reply_to_id
                  ? { databaseId: c.in_reply_to_id }
                  : null,
                pullRequestReview: c.pull_request_review_id
                  ? { databaseId: c.pull_request_review_id }
                  : null,
              })),
            },
          };
        }),
      },
      files: {
        totalCount: files.length,
        pageInfo: { hasNextPage: false },
        nodes: files.map((f) => ({
          path: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          changeType: FILE_TYPE[String(f.status)] ?? "CHANGED",
        })),
      },
      commits: {
        totalCount: commits.length,
        pageInfo: { hasNextPage: false },
        nodes: commits.map((c) => {
          const meta = c.commit as Json;
          const a = meta.author as Json;
          const co = meta.committer as Json;
          return {
            commit: {
              oid: c.sha,
              message: meta.message,
              url: c.html_url,
              committedDate: co.date,
              authoredDate: a.date,
              author: { name: a.name, email: a.email, user: actor(c.author) },
              committer: { name: co.name, user: actor(c.committer) },
            },
          };
        }),
      },
    };
  };

  const issueNode = (i: Json) => ({
    databaseId: i.id,
    number: i.number,
    title: i.title,
    body: i.body,
    url: i.html_url,
    state: String(i.state).toUpperCase(),
    stateReason: i.state_reason ? String(i.state_reason).toUpperCase() : null,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    closedAt: i.closed_at,
    author: actor(i.user),
    labels: labelNodes(i.labels),
    assignees: {
      nodes: ((i.assignees as Json[]) ?? []).map((a) => ({ login: a.login })),
    },
    comments: commentsConn(threadComments(i.number as number)),
  });

  const prState = (p: Json) =>
    p.merged_at ? "MERGED" : p.state === "open" ? "OPEN" : "CLOSED";

  const bulkPage = (
    all: Json[],
    node: (x: Json) => unknown,
    key: "pullRequests" | "issues",
    v: Record<string, unknown>
  ) => {
    const sorted = [...all].sort(
      (a, b) =>
        Date.parse(String(b.updated_at)) - Date.parse(String(a.updated_at))
    );
    const since = v.since ? Date.parse(String(v.since)) : null;
    const states = (v.states as string[] | null) ?? null;
    const rows = sorted
      .filter((x) => !since || Date.parse(String(x.updated_at)) >= since)
      .filter((x) => {
        if (!states) return true;
        const st =
          key === "pullRequests" ? prState(x) : String(x.state).toUpperCase();
        return states.includes(st);
      });
    const page = conn(
      rows,
      Number(v.first) || 20,
      (v.after as string | null) ?? null
    );
    return {
      repository: {
        [key]: {
          totalCount: rows.length,
          pageInfo: page.pageInfo,
          nodes: page.nodes.map(node),
        },
      },
    };
  };

  /** issueOrPullRequest(number:) lookups; unknown numbers come back as NOT_FOUND errors. */
  const byNumber = (query: string) => {
    const repository: Record<string, unknown> = {};
    const errors: { type: string; message: string }[] = [];
    for (const m of query.matchAll(
      /(t\d+): issueOrPullRequest\(number: (\d+)\)/g
    )) {
      const n = Number(m[2]);
      const pull = data.pulls.find((p) => p.number === n);
      const iss = data.issues.find((i) => i.number === n && !i.pull_request);
      if (pull)
        repository[m[1]] = { __typename: "PullRequest", ...prNode(pull) };
      else if (iss)
        repository[m[1]] = { __typename: "Issue", ...issueNode(iss) };
      else {
        repository[m[1]] = null;
        errors.push({ type: "NOT_FOUND", message: `Could not resolve #${n}` });
      }
    }
    return errors.length > 0
      ? { data: { repository }, errors }
      : { data: { repository } };
  };

  const graphql = (query: string, v: Record<string, unknown>) => {
    const after = (v.after as string | null) ?? null;
    if (query.includes("issueOrPullRequest(number:")) {
      if (opts.failBulk) throw new Error("bulk query failed");
      return { __partial: byNumber(query) };
    }
    if (query.includes("issues(states: OPEN) { totalCount }")) {
      return {
        repository: {
          issues: {
            totalCount: data.issues.filter(
              (i) => !i.pull_request && i.state === "open"
            ).length,
          },
          pullRequests: {
            totalCount: data.pulls.filter((p) => prState(p) === "OPEN").length,
          },
          discussions: { totalCount: data.discussions.length },
        },
      };
    }
    if (query.includes("pullRequests(first")) {
      if (opts.failBulk) throw new Error("bulk query failed");
      return bulkPage(data.pulls, prNode, "pullRequests", v);
    }
    if (query.includes("issues(first")) {
      if (opts.failBulk) throw new Error("bulk query failed");
      return bulkPage(
        data.issues.filter((i) => !i.pull_request),
        issueNode,
        "issues",
        v
      );
    }
    if (query.includes("hasDiscussionsEnabled")) {
      return { repository: { hasDiscussionsEnabled: data.discussionsEnabled } };
    }
    if (query.includes("reviewThreads")) {
      const threads = data.threads[v.number as number] ?? [];
      return {
        repository: {
          pullRequest: {
            reviewThreads: conn(
              threads.map((t) => ({
                id: t.id,
                isResolved: t.isResolved,
                comments: { nodes: t.comments.map((c) => ({ databaseId: c })) },
              })),
              50,
              after
            ),
          },
        },
      };
    }
    if (query.includes("... on DiscussionComment")) {
      const all = data.discussions
        .flatMap((d) => d.comments)
        .find((c) => c.id === v.id);
      const rest = (all?.replies ?? []).map((r) => ({
        id: r.id,
        body: r.body,
        url: `https://github.com/d/${r.id}`,
        createdAt: T("2024-01-01"),
        updatedAt: T("2024-01-02"),
        author: { login: "frank" },
      }));
      return { node: { replies: conn(rest, 2, after) } };
    }
    if (query.includes("... on Discussion")) {
      const d = data.discussions.find((x) => x.id === v.id);
      return {
        node: { comments: conn((d?.comments ?? []).map(gqlComment), 2, after) },
      };
    }
    if (query.includes("discussions(")) {
      const sorted = [...data.discussions].sort(
        (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      );
      const page = conn(sorted, 1, after);
      return {
        repository: {
          discussions: {
            pageInfo: page.pageInfo,
            nodes: page.nodes.map((d) => ({
              id: d.id,
              number: d.number,
              title: d.title,
              body: "body",
              url: `https://github.com/d/${d.number}`,
              createdAt: T("2024-01-01"),
              updatedAt: d.updatedAt,
              isAnswered: false,
              answer: null,
              category: { name: "Q&A" },
              author: { login: "alice" },
              comments: conn(d.comments.map(gqlComment), 2, null),
            })),
          },
        },
      };
    }
    throw new Error("Unhandled GraphQL query in fake");
  };

  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push(`${method} ${path}${url.search}`);
    stats.inFlight += 1;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    try {
      return await handle(url, path, method, init);
    } finally {
      stats.inFlight -= 1;
    }
  };

  const handle = async (
    url: URL,
    path: string,
    method: string,
    init?: RequestInit
  ): Promise<Response> => {
    for (const d of opts.delays ?? []) {
      if (d.match.test(path)) await new Promise((r) => setTimeout(r, d.ms));
    }
    if (opts.latencyMs) {
      const ms =
        path === "/graphql" ? opts.latencyMs.graphql : opts.latencyMs.rest;
      await new Promise((r) => setTimeout(r, ms));
    }

    for (const f of opts.failures ?? []) {
      if (f.match.test(path)) {
        return reply(f.status, { message: "forced failure" }, f.headers);
      }
    }

    if (method === "POST" && path === "/graphql") {
      const { query, variables } = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      try {
        const out = graphql(query, variables ?? {}) as { __partial?: unknown };
        if (out && out.__partial) return reply(200, out.__partial);
        return reply(200, { data: out });
      } catch (e) {
        return reply(200, { data: null, errors: [{ message: String(e) }] });
      }
    }

    const send = (items: unknown[]) => {
      const p = paginate(url, items, pageSize);
      return reply(200, p.body, p.headers);
    };

    if (path === "/repos/acme/widgets") {
      return reply(200, {
        id: 1,
        name: "widgets",
        full_name: "acme/widgets",
        owner: { login: "acme" },
        private: false,
        description: "Widgets",
        html_url: "https://github.com/acme/widgets",
        default_branch: "main",
        language: "TypeScript",
        ...data.repoInfo,
      });
    }
    if (path === "/repos/acme/widgets/issues")
      return send(byUpdated(sinceFilter(byState(data.issues, url), url), url));
    const threadComments = path.match(
      /^\/repos\/acme\/widgets\/issues\/(\d+)\/comments$/
    );
    if (threadComments) {
      return send(
        data.repoComments.filter((c) =>
          String(c.issue_url).endsWith(`/${threadComments[1]}`)
        )
      );
    }
    if (path === "/repos/acme/widgets/issues/comments")
      return send(sinceFilter(data.repoComments, url));
    if (path === "/repos/acme/widgets/pulls")
      return send(byUpdated(byState(data.pulls, url), url));
    if (path === "/repos/acme/widgets/commits")
      return send(
        sinceFilter(
          data.commits.map((c) => ({
            ...c,
            updated_at: (c.commit as { committer: { date: string } }).committer
              .date,
          })),
          url
        )
      );
    if (path === "/repos/acme/widgets/git/trees/main")
      return reply(200, { sha: "root", tree: data.tree, truncated: false });

    const m = path.match(
      /^\/repos\/acme\/widgets\/pulls\/(\d+)\/(reviews|comments|files|commits)$/
    );
    if (m) {
      const n = Number(m[1]);
      const source = {
        reviews: data.reviews,
        comments: data.reviewComments,
        files: data.files,
        commits: data.prCommits,
      }[m[2] as "reviews" | "comments" | "files" | "commits"];
      return send(source[n] ?? []);
    }
    return reply(404, { message: `Not Found (fake): ${path}` });
  };

  /**
   * Throttling is disabled by default: the plugin spaces GraphQL calls 1s apart, which
   * would make the suite slow. Pass `{ throttle: true }` to exercise the real plugin.
   */
  const octokit = (opts: { throttle?: boolean } = {}): Octokit =>
    new DevTraceOctokit({
      auth: "test-token",
      request: { fetch },
      ...(opts.throttle ? {} : { throttle: { enabled: false } }),
    });

  return { fetch, calls, octokit, stats };
}
