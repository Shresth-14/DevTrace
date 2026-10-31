import "../src/tests/setup-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DevTraceOctokit } from "../src/modules/github/github.octokit";
import { runSync } from "../src/modules/github/sync/github.sync.runner";
import { SyncAccessError } from "../src/modules/github/sync/github.errors";
import {
  fetchIssues,
  fetchDiscussions,
  isRelevantPath,
} from "../src/modules/github/sync/github.fetchers";
import { baseData, createFakeGitHub } from "./helpers/fake-github";
import { MemoryStore } from "./helpers/memory-store";

const project = {
  id: "p1",
  owner: "acme",
  repo: "widgets",
  defaultBranch: "main",
};
const run = (
  gh: ReturnType<typeof createFakeGitHub>,
  store: MemoryStore,
  mode: "full" | "incremental" = "full",
  now = new Date("2024-06-01T00:00:00Z"),
  throttle = false
) =>
  runSync({
    octokit: gh.octokit({ throttle }),
    store,
    project,
    mode,
    now: () => now,
  });

describe("Octokit client", () => {
  it("is the official Octokit with REST, GraphQL, pagination and plugins", () => {
    const o = createFakeGitHub(baseData()).octokit();
    assert.equal(typeof o.rest.issues.listForRepo, "function");
    assert.equal(typeof o.paginate.iterator, "function");
    assert.equal(typeof o.graphql, "function");
    assert.ok(o instanceof DevTraceOctokit);
  });
});

describe("REST pagination", () => {
  it("follows every page and drops pull requests from issues", async () => {
    const gh = createFakeGitHub(baseData(), { pageSize: 2 });
    const numbers: number[] = [];
    for await (const rows of fetchIssues(gh.octokit(), project)) {
      numbers.push(...rows.map((r) => r.number));
    }
    assert.deepEqual(
      numbers.sort((a, b) => a - b),
      [1, 2, 3]
    );
    const issuePages = gh.calls.filter((c) => c.includes("/issues?"));
    assert.equal(issuePages.length, 3, "5 raw items / 2 per page = 3 requests");
  });

  it("paginates installation repositories (namespaced response)", async () => {
    const repos = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `r${i}`,
    }));
    const fetch = async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      );
      const page = Number(url.searchParams.get("page") ?? 1);
      const slice = repos.slice((page - 1) * 2, page * 2);
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (page * 2 < repos.length) {
        url.searchParams.set("page", String(page + 1));
        headers.link = `<${url.toString()}>; rel="next"`;
      }
      const res = new Response(
        JSON.stringify({ total_count: repos.length, repositories: slice }),
        { status: 200, headers }
      );
      // real fetch responses carry their URL; paginate-rest reads it
      Object.defineProperty(res, "url", { value: url.toString() });
      return res;
    };
    const o = new DevTraceOctokit({ auth: "t", request: { fetch } });
    const all = await o.paginate(
      o.rest.apps.listInstallationReposForAuthenticatedUser,
      { installation_id: 1, per_page: 2 }
    );
    assert.equal(all.length, 5);
  });
});

describe("GraphQL pagination", () => {
  it("follows nested comment and reply cursors", async () => {
    const gh = createFakeGitHub(baseData());
    const comments: { id: string; parent: string | null }[] = [];
    const discussions: number[] = [];
    for await (const b of fetchDiscussions(gh.octokit(), project)) {
      discussions.push(...b.discussions.map((d) => d.number));
      comments.push(
        ...b.comments.map((c) => ({
          id: c.githubNodeId,
          parent: c.parentNodeId,
        }))
      );
    }
    assert.deepEqual(discussions.sort(), [1, 2]);
    // discussion 1 has 3 comments (2 per page) and DC_1 has 3 replies (2 per page)
    assert.deepEqual(
      comments
        .filter((c) => !c.parent)
        .map((c) => c.id)
        .sort(),
      ["DC_1", "DC_2", "DC_3"]
    );
    assert.deepEqual(
      comments
        .filter((c) => c.parent === "DC_1")
        .map((c) => c.id)
        .sort(),
      ["DR_1", "DR_2", "DR_3"]
    );
  });
});

describe("full ingestion", () => {
  it("imports every resource type and keeps comment kinds separate", async () => {
    const store = new MemoryStore();
    const out = await run(createFakeGitHub(baseData()), store);

    assert.equal(out.status, "completed", JSON.stringify(out.resources));
    assert.deepEqual([...store.issues.keys()].sort(), [1, 2, 3]);
    assert.deepEqual([...store.pullRequests.keys()].sort(), [10, 11]);

    // Issue comments vs PR conversation comments; orphan comment (#99) is reported, not silently dropped
    assert.deepEqual([...store.issueComments.keys()].sort(), ["1001", "1002"]);
    assert.deepEqual([...store.prComments.keys()], ["1003"]);
    assert.equal(out.resources.issueComments?.status, "ok");
    assert.match(out.resources.issueComments?.note ?? "", /1 comment/);

    // Review submissions with distinct states
    const states = [...store.reviews.values()]
      .map((r) => (r as { state: string }).state)
      .sort();
    assert.deepEqual(states, ["APPROVED", "CHANGES_REQUESTED"]);
  });

  it("preserves inline review thread structure and resolution", async () => {
    const store = new MemoryStore();
    await run(createFakeGitHub(baseData()), store);
    const root = store.reviewComments.get("4001");
    const reply = store.reviewComments.get("4002");
    assert.equal(root?.threadId, "PRT_1");
    assert.equal(root?.isResolved, true);
    assert.equal(reply?.threadId, "PRT_1");
    assert.equal(reply?.inReplyToId, 4001n);
  });

  it("stores changed files, tolerating missing patches and renames", async () => {
    const store = new MemoryStore();
    await run(createFakeGitHub(baseData()), store);
    assert.equal(
      store.prFiles.get("10:src/a.ts")?.patch,
      "@@ -1 +1 @@\n-a\n+b"
    );
    assert.equal(store.prFiles.get("10:assets/logo.png")?.patch, null);
    const renamed = store.prFiles.get("10:src/new-name.ts");
    assert.equal(renamed?.status, "renamed");
    assert.equal(renamed?.previousFilename, "src/old-name.ts");
  });

  it("stores commits, PR-commit links, discussions and a filtered tree", async () => {
    const store = new MemoryStore();
    await run(createFakeGitHub(baseData()), store);
    assert.deepEqual([...store.commits.keys()].sort(), [
      "c0",
      "c1",
      "c2",
      "c3",
    ]);
    assert.deepEqual([...store.prCommits.keys()].sort(), [
      "10:c1",
      "10:c2",
      "11:c3",
    ]);
    assert.equal(store.discussions.size, 2);
    assert.equal(store.discussionComments.size, 3 + 3);
    assert.deepEqual([...store.repoFiles.keys()].sort(), ["src", "src/a.ts"]);
  });

  it("never duplicates rows when the import is repeated", async () => {
    const store = new MemoryStore();
    await run(createFakeGitHub(baseData()), store);
    const sizes = () =>
      [
        store.issues,
        store.issueComments,
        store.pullRequests,
        store.prComments,
        store.reviews,
        store.reviewComments,
        store.prFiles,
        store.prCommits,
        store.commits,
        store.discussions,
        store.discussionComments,
        store.repoFiles,
      ].map((m) => m.size);
    const before = sizes();
    await run(createFakeGitHub(baseData()), store);
    assert.deepEqual(sizes(), before);
  });
});

describe("incremental sync", () => {
  it("only fetches resources changed since the checkpoint", async () => {
    const store = new MemoryStore();
    await run(
      createFakeGitHub(baseData()),
      store,
      "full",
      new Date("2024-06-01T00:00:00Z")
    );
    assert.ok(store.cursor.issues);

    const data = baseData();
    data.issues[1] = {
      ...data.issues[1],
      title: "Issue 2 edited",
      updated_at: "2024-06-15T00:00:00Z",
    };
    data.issues.push({
      ...data.issues[0],
      id: 104,
      number: 4,
      title: "Issue 4",
      updated_at: "2024-06-20T00:00:00Z",
    });
    // PR 11 has new activity; PR 10 does not
    data.pulls[1] = { ...data.pulls[1], updated_at: "2024-06-16T00:00:00Z" };
    const gh = createFakeGitHub(data);
    await run(gh, store, "incremental", new Date("2024-07-01T00:00:00Z"));

    assert.deepEqual([...store.issues.keys()].sort(), [1, 2, 3, 4]);
    assert.equal(
      (store.issues.get(2) as { title: string }).title,
      "Issue 2 edited"
    );
    assert.ok(
      gh.calls.some(
        (c) => c.includes("/issues?") && c.includes("since=2024-05-31")
      )
    );
    assert.ok(gh.calls.some((c) => c.includes("/pulls/11/files")));
    assert.ok(
      !gh.calls.some((c) => c.includes("/pulls/10/files")),
      "unchanged PR is not re-fetched"
    );
    assert.equal(store.issues.size, 4);
  });
});

describe("partial failures and rate limits", () => {
  it("keeps successful data, flags the failed resource and retries it next time", async () => {
    const store = new MemoryStore();
    const gh = createFakeGitHub(baseData(), {
      failures: [{ match: /\/pulls\/11\/files$/, status: 404 }],
    });
    const out = await run(gh, store);

    assert.equal(out.status, "partial");
    assert.equal(out.resources.prFiles?.status, "partial");
    assert.match(out.resources.prFiles?.error ?? "", /1 of 2 pull request/);
    assert.equal(store.issues.size, 3, "issues survive");
    assert.ok(store.prFiles.has("10:src/a.ts"), "PR 10 files survive");
    assert.equal(
      store.cursor.pullRequests,
      undefined,
      "PR checkpoint not advanced"
    );

    const retry = createFakeGitHub(baseData());
    const out2 = await run(
      retry,
      store,
      "incremental",
      new Date("2024-06-02T00:00:00Z")
    );
    assert.equal(out2.resources.prFiles?.status, "ok");
    assert.ok(store.prFiles.has("11:README.md"));
  });

  it("treats disabled Discussions as skipped, not failed", async () => {
    const data = baseData();
    data.discussionsEnabled = false;
    const out = await run(createFakeGitHub(data), new MemoryStore());
    assert.equal(out.resources.discussions?.status, "skipped");
    assert.equal(out.status, "completed");
  });

  it("surfaces exhausted rate limits as an error on that resource only", async () => {
    const reset = String(Math.floor(Date.now() / 1000) + 3600);
    const gh = createFakeGitHub(baseData(), {
      failures: [
        {
          match: /\/issues$/,
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset },
        },
      ],
    });
    const store = new MemoryStore();
    const out = await run(
      gh,
      store,
      "full",
      new Date("2024-06-01T00:00:00Z"),
      true
    );
    assert.equal(out.resources.issues?.status, "error");
    assert.match(out.resources.issues?.error ?? "", /403/);
    assert.equal(out.status, "partial");
    assert.equal(store.pullRequests.size, 2, "other resources still import");
    assert.equal(store.cursor.issues, undefined);
  });

  it("aborts before writing anything when the repository is not accessible", async () => {
    const store = new MemoryStore();
    const gh = createFakeGitHub(baseData(), {
      failures: [{ match: /^\/repos\/acme\/widgets$/, status: 404 }],
    });
    await assert.rejects(
      run(gh, store),
      (e: unknown) => e instanceof SyncAccessError && /404/.test(e.message)
    );
    assert.equal(store.issues.size, 0);
  });
});

describe("tree filtering", () => {
  it("skips vendored, binary and oversized paths", () => {
    assert.equal(isRelevantPath("src/a.ts", "blob", 10), true);
    assert.equal(isRelevantPath("src", "tree", null), true);
    assert.equal(isRelevantPath("node_modules/x.js", "blob", 10), false);
    assert.equal(isRelevantPath("logo.png", "blob", 10), false);
    assert.equal(isRelevantPath("big.txt", "blob", 5_000_000), false);
  });
});
