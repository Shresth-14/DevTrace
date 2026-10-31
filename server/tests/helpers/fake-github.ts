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
  /** path regex -> status override (e.g. 404, 403 rate limit) */
  failures?: {
    match: RegExp;
    status: number;
    headers?: Record<string, string>;
  }[];
}

export function baseData(): FakeData {
  const issue = (n: number, id: number, updated: string, pr = false): Json => ({
    id,
    number: n,
    title: `Issue ${n}`,
    body: `Body ${n}`,
    user: user("alice"),
    state: "open",
    state_reason: null,
    labels: [{ name: "bug" }, "triage"],
    assignees: [user("bob")],
    html_url: `https://github.com/acme/widgets/issues/${n}`,
    created_at: T("2024-01-01"),
    updated_at: updated,
    closed_at: null,
    ...(pr ? { pull_request: { url: "x" } } : {}),
  });
  const pr = (
    n: number,
    id: number,
    updated: string,
    merged: boolean
  ): Json => ({
    id,
    number: n,
    title: `PR ${n}`,
    body: `PR body ${n}`,
    user: user("carol"),
    state: merged ? "closed" : "open",
    draft: !merged,
    base: { ref: "main", sha: `base${n}` },
    head: { ref: `feature-${n}`, sha: `head${n}` },
    merge_commit_sha: merged ? `merge${n}` : null,
    labels: [{ name: "feature" }],
    requested_reviewers: [user("dave")],
    html_url: `https://github.com/acme/widgets/pull/${n}`,
    created_at: T("2024-01-02"),
    updated_at: updated,
    closed_at: merged ? T("2024-01-05") : null,
    merged_at: merged ? T("2024-01-05") : null,
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
      issue(1, 101, T("2024-01-10")),
      issue(2, 102, T("2024-01-11")),
      issue(3, 103, T("2024-01-12")),
      issue(10, 110, T("2024-01-13"), true),
      issue(11, 111, T("2024-01-14"), true),
    ],
    repoComments: [
      comment(1001, 1, T("2024-01-10")),
      comment(1002, 2, T("2024-01-11")),
      comment(1003, 10, T("2024-01-12")), // PR conversation comment
      comment(1004, 99, T("2024-01-13")), // parent never imported
    ],
    pulls: [
      pr(10, 210, T("2024-01-13"), true),
      pr(11, 211, T("2024-01-14"), false),
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
    },
    prCommits: {
      10: [commit("c1", T("2024-01-02")), commit("c2", T("2024-01-03"))],
      11: [commit("c3", T("2024-01-06"))],
    },
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

  const graphql = (query: string, v: Record<string, unknown>) => {
    const after = (v.after as string | null) ?? null;
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
        return reply(200, { data: graphql(query, variables ?? {}) });
      } catch (e) {
        return reply(200, { data: null, errors: [{ message: String(e) }] });
      }
    }

    const send = (items: unknown[]) => {
      const p = paginate(url, items, pageSize);
      return reply(200, p.body, p.headers);
    };

    if (path === "/repos/acme/widgets")
      return reply(200, { id: 1, full_name: "acme/widgets" });
    if (path === "/repos/acme/widgets/issues")
      return send(sinceFilter(data.issues, url));
    if (path === "/repos/acme/widgets/issues/comments")
      return send(sinceFilter(data.repoComments, url));
    if (path === "/repos/acme/widgets/pulls") return send(data.pulls);
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

  return { fetch, calls, octokit };
}
