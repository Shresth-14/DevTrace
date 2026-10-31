import "../src/tests/setup-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runSync } from "../src/modules/github/sync/github.sync.runner";
import {
  baseData,
  createFakeGitHub,
  type FakeOptions,
} from "./helpers/fake-github";
import { bigData } from "./helpers/big-data";
import { MemoryStore } from "./helpers/memory-store";

const project = {
  id: "p1",
  owner: "acme",
  repo: "widgets",
  defaultBranch: "main",
};
const NOW = new Date("2024-06-01T00:00:00Z");

const run = async (
  data = baseData(),
  opts: FakeOptions = {},
  extra: Partial<Parameters<typeof runSync>[0]> = {},
  store = new MemoryStore()
) => {
  const gh = createFakeGitHub(data, { pageSize: 100, ...opts });
  const out = await runSync({
    octokit: gh.octokit(),
    store,
    project,
    mode: "full",
    now: () => NOW,
    ...extra,
  });
  return { gh, out, store };
};

const restThreadCalls = (calls: string[]) =>
  calls.filter((c) =>
    /\/pulls\/\d+\/(reviews|comments|commits)|\/issues\/\d+\/comments/.test(c)
  );

describe("current work first", () => {
  it("imports every OPEN issue and PR, and nothing else, without per-thread REST calls", async () => {
    const { gh, out, store } = await run(
      baseData(),
      {},
      { limits: { referenced: 0 } }
    );
    assert.equal(out.status, "completed", JSON.stringify(out.resources));
    assert.deepEqual(
      [...store.issues.keys()].sort((a, b) => a - b),
      [1, 2, 3]
    );
    assert.deepEqual(
      [...store.pullRequests.keys()].sort((a, b) => a - b),
      [10, 11]
    );
    assert.deepEqual(restThreadCalls(gh.calls), []);
    for (const row of [
      ...store.issues.values(),
      ...store.pullRequests.values(),
    ]) {
      assert.equal(row.state, "open");
      assert.equal(row.fetchReason, "open");
    }
  });

  it("stores full conversations only for relevant open threads", async () => {
    const { store } = await run(baseData(), {}, { limits: { referenced: 0 } });
    assert.equal(
      store.issueComments.size,
      0,
      "single short replies are metadata only"
    );
    assert.deepEqual([...store.prComments.keys()], ["1003"]);
    assert.deepEqual([...store.reviews.keys()].sort(), ["3001", "3002"]);
    assert.deepEqual([...store.reviewComments.keys()].sort(), ["4001", "4002"]);
    assert.ok(
      store.prFiles.has("11:README.md"),
      "files are kept for every open PR"
    );
  });

  it("preserves authors, ids, urls, thread structure and renames", async () => {
    const { store } = await run(baseData(), {}, { limits: { referenced: 0 } });
    const reply = store.reviewComments.get("4002");
    assert.equal(reply?.threadId, "PRT_1");
    assert.equal(reply?.isResolved, true);
    assert.equal(reply?.inReplyToId, 4001n);
    const renamed = store.prFiles.get("10:src/new-name.ts");
    assert.equal(renamed?.previousFilename, "src/old-name.ts");
    const pr = store.pullRequests.get(10);
    assert.equal(pr?.authorLogin, "carol");
    assert.equal(pr?.url, "https://github.com/acme/widgets/pull/10");
    assert.deepEqual(pr?.reviewers, ["dave"]);
    assert.equal(store.pullRequests.get(11)?.isDraft, true);
  });
});

describe("linked history", () => {
  it("fetches an older closed thread only when current work links to it", async () => {
    const { store } = await run();
    // #4 is linked from issue #1's text and closed by PR #10; #9 from PR #11's text
    assert.equal(store.issues.get(4)?.state, "closed");
    assert.equal(store.issues.get(4)?.fetchReason, "referenced");
    assert.equal(store.pullRequests.get(9)?.state, "merged");
    assert.equal(store.pullRequests.get(9)?.fetchReason, "referenced");
    // unrelated history is never imported
    assert.equal(store.issues.has(5), false);
    assert.equal(store.pullRequests.has(8), false);
    assert.ok(
      ![...store.issueComments.values()].some((c) => c.parentNumber === 5)
    );
  });

  it("keeps the whole conversation of linked threads", async () => {
    const { store } = await run();
    assert.deepEqual(
      [...store.issueComments.values()].map((c) => c.parentNumber).sort(),
      [4, 4]
    );
    assert.ok(store.reviews.has("3091") && store.reviews.has("3092"));
    assert.ok(store.reviewComments.has("4091"));
    assert.ok(store.prFiles.has("9:src/old-schema.ts"));
  });

  it("records only explicit, direct relationships (never guessed from titles)", async () => {
    const { store } = await run();
    const refs = [...store.references.values()].map(
      (r) => `${r.fromKind}#${r.fromNumber}->${r.toNumber}:${r.basis}`
    );
    assert.deepEqual(refs.sort(), [
      "issue#1->4:reference_in_body",
      "pull_request#10->4:closing_reference",
      "pull_request#11->9:reference_in_body",
    ]);
  });

  it("does not follow links to numbers that do not exist", async () => {
    const data = baseData();
    data.issues[1] = { ...data.issues[1], body: "See #4242 and #4" };
    const { out, store } = await run(data);
    assert.equal(out.status, "completed", JSON.stringify(out.resources));
    assert.equal(store.issues.has(4242), false);
    assert.ok(![...store.references.values()].some((r) => r.toNumber === 4242));
  });

  it("respects the limit on how much history is followed, and says so", async () => {
    const { out, store } = await run(
      baseData(),
      {},
      { limits: { referenced: 1 } }
    );
    assert.equal(
      store.issues.has(4) !== store.pullRequests.has(9) || store.issues.has(4),
      true
    );
    assert.equal(
      Number(store.issues.has(4)) + Number(store.pullRequests.has(9)),
      1,
      "only one linked thread fetched"
    );
    assert.match(
      out.resources.references?.note ?? "",
      /not followed \(limit 1\)/
    );
  });

  it("does not refetch history that is already stored", async () => {
    const store = new MemoryStore();
    await run(baseData(), {}, {}, store);
    const second = await run(baseData(), {}, {}, store);
    assert.equal(second.out.resources.historicalIssues?.count, 0);
    assert.match(second.out.resources.references?.note ?? "", /already stored/);
  });

  it("promotes older rows that were imported before reasons existed", async () => {
    const store = new MemoryStore();
    // a closed issue stored by an earlier version, before fetch reasons existed
    const old = (
      await run(baseData(), {}, { limits: { referenced: 0 } })
    ).store.issues.get(1);
    assert.ok(old);
    store.issues.set(4, {
      ...old,
      githubId: 104n,
      number: 4,
      state: "closed",
      fetchReason: "legacy",
    });
    await run(baseData(), {}, {}, store);
    assert.equal(store.issues.get(4)?.fetchReason, "referenced");
  });
});

describe("accurate counts", () => {
  it("reports discovered, fetched, selected, skipped and stored separately", async () => {
    const { out } = await run(baseData(), {}, { limits: { referenced: 0 } });
    const issues = out.resources.issues;
    assert.equal(issues?.discovered, 3, "GitHub's own number of open issues");
    assert.equal(issues?.count, 3, "fetched");
    assert.equal(issues?.stored, 3);
    assert.equal(issues?.unchanged, 0);
    assert.equal(issues?.selected, 0, "no open issue has a real discussion");
    assert.equal(issues?.skipped, 3, "quiet threads keep metadata only");
    const prs = out.resources.pullRequests;
    assert.equal(prs?.discovered, 2);
    assert.equal(prs?.selected, 1, "only PR 10 has real discussion");
    assert.equal(prs?.skipped, 1);
  });

  it("counts a repeated import as unchanged, not as new records", async () => {
    const store = new MemoryStore();
    await run(baseData(), {}, {}, store);
    const second = await run(baseData(), {}, {}, store);
    assert.equal(second.out.resources.issues?.stored, 0);
    assert.equal(second.out.resources.issues?.unchanged, 3);
    assert.equal(second.out.resources.pullRequests?.stored, 0);
  });

  it("matches GitHub's open counts and never counts PRs as issues", async () => {
    const data = bigData(120, 90);
    const openIssues = data.issues.filter(
      (i) => !i.pull_request && i.state === "open"
    ).length;
    const openPrs = data.pulls.filter((p) => p.state === "open").length;
    const { out, store } = await run(data);
    assert.equal(store.issues.size, openIssues);
    assert.equal(store.pullRequests.size, openPrs);
    assert.equal(out.resources.issues?.discovered, openIssues);
    assert.equal(out.resources.pullRequests?.discovered, openPrs);
    for (const n of store.issues.keys())
      assert.ok(!store.pullRequests.has(n), "no number is both");
    assert.equal(
      out.resources.issues?.note,
      undefined,
      "counts reconcile, so no warning"
    );
  });

  it("says so when the import limit hides open threads", async () => {
    const { out, store } = await run(
      bigData(60, 60),
      {},
      { limits: { issues: 10, pullRequests: 10 } }
    );
    assert.equal(store.issues.size, 10);
    assert.match(
      out.resources.issues?.note ?? "",
      /Showing the 10 most recently updated of \d+ open on GitHub/
    );
    assert.equal(
      out.resources.issues?.status,
      "ok",
      "a limit is not a failure"
    );
  });

  it("does not count failed or partially fetched resources as fetched", async () => {
    const { out } = await run(
      baseData(),
      {},
      { forceRest: true },
      new MemoryStore()
    );
    assert.equal(out.status, "completed");
    const data = baseData();
    const failing = await run(
      data,
      { failures: [{ match: /\/pulls\/10\/files$/, status: 404 }] },
      { forceRest: true }
    );
    assert.equal(failing.out.resources.prFiles?.status, "partial");
    assert.equal(failing.out.resources.prFiles?.failed, 1);
  });
});

describe("state accuracy", () => {
  it("notices closures and merges since the last sync and keeps their conversation", async () => {
    const store = new MemoryStore();
    await run(baseData(), {}, {}, store);
    assert.equal(store.issues.get(1)?.state, "open");

    const data = baseData();
    const i1 = data.issues.findIndex((i) => i.number === 1);
    data.issues[i1] = {
      ...data.issues[i1],
      state: "closed",
      updated_at: "2024-06-10T00:00:00Z",
      closed_at: "2024-06-10T00:00:00Z",
    };
    const p10 = data.pulls.findIndex((p) => p.number === 10);
    data.pulls[p10] = {
      ...data.pulls[p10],
      state: "closed",
      merged_at: "2024-06-11T00:00:00Z",
      merge_commit_sha: "m10",
      updated_at: "2024-06-11T00:00:00Z",
    };
    const gh = createFakeGitHub(data, { pageSize: 100 });
    await runSync({
      octokit: gh.octokit(),
      store,
      project,
      mode: "incremental",
      now: () => new Date("2024-07-01T00:00:00Z"),
    });

    assert.equal(store.issues.get(1)?.state, "closed");
    assert.equal(
      store.issues.get(1)?.fetchReason,
      "open",
      "it was current work: stays analysable"
    );
    assert.equal(store.pullRequests.get(10)?.state, "merged");
    assert.equal(store.pullRequests.get(10)?.mergeCommitSha, "m10");
    assert.ok(store.reviews.has("3001"), "review history survives the merge");
  });

  it("does not turn an unrelated thread that merely closed into current work", async () => {
    const store = new MemoryStore();
    await run(baseData(), {}, {}, store);
    const data = baseData();
    const i5 = data.issues.findIndex((i) => i.number === 5);
    data.issues[i5] = {
      ...data.issues[i5],
      updated_at: "2024-06-12T00:00:00Z",
    };
    const gh = createFakeGitHub(data, { pageSize: 100 });
    await runSync({
      octokit: gh.octokit(),
      store,
      project,
      mode: "incremental",
      now: () => new Date("2024-07-01T00:00:00Z"),
    });
    assert.equal(store.issues.get(5)?.fetchReason, "legacy");
    assert.equal(
      [...store.issueComments.values()].some((c) => c.parentNumber === 5),
      false
    );
  });

  it("refreshes rows stored as open that GitHub no longer lists as open", async () => {
    const store = new MemoryStore();
    await run(baseData(), {}, {}, store);
    const data = baseData();
    const i3 = data.issues.findIndex((i) => i.number === 3);
    data.issues[i3] = {
      ...data.issues[i3],
      state: "closed",
      updated_at: "2024-06-05T00:00:00Z",
    };
    await run(data, {}, { mode: "full" }, store); // full resync: OPEN query no longer returns #3
    assert.equal(store.issues.get(3)?.state, "closed");
    assert.equal(
      store.issues.get(3)?.fetchReason,
      "open",
      "reason is never downgraded"
    );
  });
});

describe("robustness", () => {
  it("completes what one page cannot carry through REST", async () => {
    const data = baseData();
    data.bulkCommentCap = 0;
    const { gh, store } = await run(data);
    assert.ok(gh.calls.some((c) => c.includes("/issues/10/comments")));
    assert.ok(store.prComments.has("1003"));
  });

  it("falls back to open-only REST when the bulk query fails, and says so", async () => {
    const { out, store } = await run(baseData(), { failBulk: true });
    assert.equal(out.status, "completed", JSON.stringify(out.resources));
    assert.match(out.resources.issues?.note ?? "", /slower REST path/);
    assert.deepEqual(
      [...store.issues.keys()].sort((a, b) => a - b),
      [1, 2, 3],
      "still open-only"
    );
    assert.deepEqual([...store.issueComments.keys()].sort(), ["1001", "1002"]);
    assert.equal(
      store.issues.has(4),
      false,
      "history is not followed on the fallback path"
    );
  });

  it("does not retry permission problems on the slow path", async () => {
    const { out } = await run(baseData(), {
      failures: [{ match: /\/graphql$/, status: 403 }],
    });
    assert.equal(out.resources.issues?.status, "error");
    assert.equal(out.resources.pullRequests?.status, "error");
  });

  it("is idempotent", async () => {
    const store = new MemoryStore();
    await run(baseData(), {}, {}, store);
    const sizes = () => [
      store.issues.size,
      store.pullRequests.size,
      store.prComments.size,
      store.reviews.size,
      store.reviewComments.size,
      store.prFiles.size,
      store.commits.size,
      store.references.size,
    ];
    const before = sizes();
    await run(baseData(), {}, {}, store);
    assert.deepEqual(sizes(), before);
  });

  it("signals when current work is ready, then again when history is stored, before commits finish", async () => {
    const events: string[] = [];
    const store = new MemoryStore();
    const orig = store.upsertCommits.bind(store);
    store.upsertCommits = async (p, rows) => {
      await new Promise((r) => setTimeout(r, 30));
      events.push("commits");
      return orig(p, rows);
    };
    await run(
      baseData(),
      { delays: [{ match: /\/commits$/, ms: 150 }] },
      {
        onThreadsReady: (phase) => {
          events.push(phase);
        },
      },
      store
    );
    assert.ok(events.indexOf("current") < events.indexOf("history"));
    assert.ok(events.indexOf("current") < events.lastIndexOf("commits"));
  });

  it("keeps thread-level requests bounded while resources overlap", async () => {
    const rest = await run(
      bigData(40, 40),
      { latencyMs: { rest: 15, graphql: 15 } },
      { forceRest: true, concurrency: 4 }
    );
    assert.ok(rest.gh.stats.maxInFlight > 1);
    assert.ok(
      rest.gh.stats.maxInFlight <= 4 + 5,
      `saw ${rest.gh.stats.maxInFlight} in flight`
    );
  });

  it("needs far fewer GitHub requests than the REST path for the same open work", async () => {
    const bulk = await run(bigData(60, 60));
    const rest = await run(bigData(60, 60), {}, { forceRest: true });
    assert.ok(
      bulk.gh.calls.length * 3 < rest.gh.calls.length,
      `bulk ${bulk.gh.calls.length} vs rest ${rest.gh.calls.length}`
    );
    assert.deepEqual(
      [...bulk.store.pullRequests.keys()].sort(),
      [...rest.store.pullRequests.keys()].sort()
    );
    assert.deepEqual(
      [...bulk.store.issues.keys()].sort(),
      [...rest.store.issues.keys()].sort()
    );
  });
});
