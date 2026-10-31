import { baseData, type FakeData } from "./fake-github";

type Json = Record<string, unknown>;

const day = (n: number) =>
  new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString();

/**
 * A repository with `issues` issues and `prs` pull requests, roughly shaped like a
 * real one: most threads are quiet, about a third contain actual discussion.
 * Deterministic, so before/after measurements use identical input.
 */
export function bigData(issues: number, prs: number): FakeData {
  const d = baseData();
  d.issues = [];
  d.repoComments = [];
  d.pulls = [];
  d.reviews = {};
  d.reviewComments = {};
  d.files = {};
  d.prCommits = {};
  d.commits = [];
  d.threads = {};
  d.discussions = [];

  let commentId = 10_000;
  let reviewId = 500_000;
  let inlineId = 900_000;
  const total = issues + prs;
  const user = (login: string) => ({ login, id: login.length });

  const comment = (n: number, at: string): Json => ({
    id: ++commentId,
    issue_url: `https://api.github.com/repos/acme/widgets/issues/${n}`,
    body: `We should pick approach ${n % 5}. It keeps things simple.`,
    user: user(`dev${commentId % 7}`),
    html_url: `https://github.com/acme/widgets/issues/${n}#issuecomment-${commentId}`,
    created_at: at,
    updated_at: at,
  });

  for (let n = 1; n <= issues; n++) {
    const at = day(Math.floor((n / total) * 300));
    d.issues.push({
      id: 1000 + n,
      number: n,
      title: `Issue ${n}`,
      body: n % 5 === 0 ? "Long design discussion. ".repeat(30) : `Body ${n}`,
      user: user("alice"),
      state: n % 3 === 0 ? "closed" : "open",
      state_reason: null,
      labels: [{ name: "design" }],
      assignees: [],
      html_url: `https://github.com/acme/widgets/issues/${n}`,
      created_at: at,
      updated_at: at,
      closed_at: null,
      comments: n % 4 === 0 ? 3 : n % 7 === 0 ? 1 : 0,
    });
    const k = n % 4 === 0 ? 3 : n % 7 === 0 ? 1 : 0;
    for (let c = 0; c < k; c++) d.repoComments.push(comment(n, at));
  }

  for (let p = 1; p <= prs; p++) {
    const n = issues + p;
    const at = day(Math.floor(((issues + p) / total) * 300));
    const busy = p % 3 === 0;
    d.issues.push({
      id: 2000 + n,
      number: n,
      title: `PR ${n}`,
      body: "pr",
      user: user("carol"),
      state: "open",
      labels: [],
      assignees: [],
      pull_request: { url: "x" },
      html_url: `https://github.com/acme/widgets/pull/${n}`,
      created_at: at,
      updated_at: at,
      closed_at: null,
      comments: busy ? 2 : 0,
    });
    d.pulls.push({
      id: 3000 + n,
      number: n,
      title: `PR ${n}`,
      body: busy ? "Design notes. ".repeat(30) : "small fix",
      user: user("carol"),
      state: p % 2 ? "open" : "closed",
      draft: false,
      base: { ref: "main", sha: `base${n}` },
      head: { ref: `feature-${n}`, sha: `head${n}` },
      merge_commit_sha: null,
      labels: [],
      requested_reviewers: [],
      html_url: `https://github.com/acme/widgets/pull/${n}`,
      created_at: at,
      updated_at: at,
      closed_at: null,
      merged_at: p % 2 ? null : at,
    });
    if (busy) for (let c = 0; c < 2; c++) d.repoComments.push(comment(n, at));
    d.reviews[n] = busy
      ? [
          {
            id: ++reviewId,
            user: user("dave"),
            body: "Why this approach?",
            state: "CHANGES_REQUESTED",
            commit_id: `head${n}`,
            html_url: `https://github.com/r/${reviewId}`,
            submitted_at: at,
          },
          {
            id: ++reviewId,
            user: user("erin"),
            body: "Looks good now",
            state: "APPROVED",
            commit_id: `head${n}`,
            html_url: `https://github.com/r/${reviewId}`,
            submitted_at: at,
          },
        ]
      : [
          {
            id: ++reviewId,
            user: user("dave"),
            body: "",
            state: "APPROVED",
            commit_id: `head${n}`,
            html_url: `https://github.com/r/${reviewId}`,
            submitted_at: at,
          },
        ];
    d.reviewComments[n] = busy
      ? [0, 1, 2].map((i) => ({
          id: ++inlineId,
          pull_request_review_id: reviewId,
          in_reply_to_id: i ? inlineId - 1 : null,
          body: i ? "Because it is simpler." : "Why not use a queue here?",
          user: user(i ? "carol" : "dave"),
          path: `src/mod${n % 20}.ts`,
          line: 10 + i,
          original_line: 10,
          diff_hunk: "@@ -1 +1 @@",
          commit_id: `head${n}`,
          html_url: `https://github.com/c/${inlineId}`,
          created_at: at,
          updated_at: at,
        }))
      : [];
    d.threads[n] = busy
      ? [
          {
            id: `PRT_${n}`,
            isResolved: true,
            comments: d.reviewComments[n].map((c) => c.id as number),
          },
        ]
      : [];
    d.files[n] = [
      {
        sha: `b${n}a`,
        filename: `src/mod${n % 20}.ts`,
        status: "modified",
        additions: 3,
        deletions: 1,
        changes: 4,
        patch: "@@ -1 +1 @@\n-a\n+b",
      },
      {
        sha: `b${n}b`,
        filename: `src/util${n % 9}.ts`,
        status: p % 9 === 0 ? "renamed" : "modified",
        additions: 1,
        deletions: 0,
        changes: 1,
        patch: "+x",
        ...(p % 9 === 0 ? { previous_filename: `src/old${n % 9}.ts` } : {}),
      },
    ];
    d.prCommits[n] = Array.from({ length: busy ? 3 : 1 }, (_, i) => ({
      sha: `c${n}_${i}`,
      html_url: `https://github.com/acme/widgets/commit/c${n}_${i}`,
      commit: {
        message: `Commit ${n}.${i}`,
        author: { name: "Carol", email: "c@x.io", date: at },
        committer: { name: "Carol", date: at },
      },
      author: user("carol"),
      committer: user("carol"),
    }));
  }

  d.commits = Array.from({ length: 150 }, (_, i) => ({
    sha: `main${i}`,
    html_url: `https://github.com/acme/widgets/commit/main${i}`,
    commit: {
      message: `Commit ${i}`,
      author: { name: "A", email: "a@x.io", date: day(i) },
      committer: { name: "A", date: day(i) },
    },
    author: user("alice"),
    committer: user("alice"),
  }));
  d.tree = Array.from({ length: 60 }, (_, i) => ({
    path: `src/mod${i}.ts`,
    type: "blob",
    sha: `t${i}`,
    size: 100,
  }));

  d.discussions = Array.from({ length: 12 }, (_, i) => ({
    id: `D_${i}`,
    number: i + 1,
    title: `Discussion ${i + 1}`,
    updatedAt: day(280 + i),
    comments:
      i % 2
        ? []
        : [
            {
              id: `DC_${i}_a`,
              body: "Let us use Postgres",
              replies: [{ id: `DR_${i}`, body: "Agreed" }],
            },
            { id: `DC_${i}_b`, body: "What about hosting?", replies: [] },
          ],
  }));
  return d;
}
