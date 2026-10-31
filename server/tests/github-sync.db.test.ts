/**
 * Database-backed integration tests (real Postgres through Prisma).
 *
 * They only run when TEST_DATABASE_URL points at a LOCAL, disposable database
 * whose schema was created with `prisma db push`; otherwise they are skipped.
 * The app's own DATABASE_URL is never used.
 */
import "../src/tests/setup-env";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { runSync } from "../src/modules/github/sync/github.sync.runner";
import { recoverInterruptedWork } from "../src/modules/project/recovery";
import { PrismaSyncStore } from "../src/modules/github/sync/github.sync.store";
import {
  GithubSyncService,
  HttpError,
} from "../src/modules/github/sync/github.sync.service";
import { baseData, createFakeGitHub } from "./helpers/fake-github";

const url = process.env.TEST_DATABASE_URL;
const isLocal = url ? /@(localhost|127\.0\.0\.1)[:/]/.test(url) : false;
const enabled = Boolean(url) && isLocal;
const skip = enabled
  ? false
  : "set TEST_DATABASE_URL to a local disposable Postgres to run";

describe("Prisma persistence + sync service", { skip }, () => {
  let db: PrismaClient;
  let store: PrismaSyncStore;
  const suffix = Date.now().toString(36);
  let ownerId = "";
  let strangerId = "";
  let projectId = "";
  const slug = `widgets-${suffix}`;

  before(async () => {
    db = new PrismaClient({ datasources: { db: { url: url as string } } });
    store = new PrismaSyncStore(db);
    const owner = await db.user.create({
      data: { githubId: BigInt(Date.now()), githubUsername: `owner-${suffix}` },
    });
    const stranger = await db.user.create({
      data: {
        githubId: BigInt(Date.now() + 1),
        githubUsername: `stranger-${suffix}`,
      },
    });
    ownerId = owner.id;
    strangerId = stranger.id;
    const inst = await db.githubInstallation.create({
      data: {
        installationId: 777n,
        accountLogin: "acme",
        accountId: 1n,
        accountType: "Organization",
        userId: owner.id,
      },
    });
    const project = await db.project.create({
      data: {
        name: "widgets",
        slug,
        userId: owner.id,
        githubRepoId: 1n,
        githubRepoFullName: "acme/widgets",
        githubRepoName: "widgets",
        githubRepoOwner: "acme",
        githubRepoUrl: "https://github.com/acme/widgets",
        installationId: inst.id,
      },
    });
    projectId = project.id;
  });

  after(async () => {
    await db.user.deleteMany({
      where: { id: { in: [ownerId, strangerId] } },
    });
    await db.$disconnect();
  });

  const counts = async () => ({
    issues: await db.githubIssue.count({ where: { projectId } }),
    issueComments: await db.githubIssueComment.count({ where: { projectId } }),
    prs: await db.githubPullRequest.count({ where: { projectId } }),
    prComments: await db.githubPrComment.count({ where: { projectId } }),
    reviews: await db.githubPrReview.count({ where: { projectId } }),
    reviewComments: await db.githubReviewComment.count({
      where: { projectId },
    }),
    files: await db.githubPrFile.count({ where: { projectId } }),
    commits: await db.githubCommit.count({ where: { projectId } }),
    discussions: await db.githubDiscussion.count({ where: { projectId } }),
    discussionComments: await db.githubDiscussionComment.count({
      where: { projectId },
    }),
    repoFiles: await db.githubRepoFile.count({ where: { projectId } }),
  });

  const target = {
    id: "",
    owner: "acme",
    repo: "widgets",
    defaultBranch: "main",
  };

  it("persists a full import with correct relations and is idempotent", async () => {
    target.id = projectId;
    const out = await runSync({
      octokit: createFakeGitHub(baseData()).octokit(),
      store,
      project: target,
      mode: "full",
    });
    assert.equal(out.status, "completed", JSON.stringify(out.resources));

    const first = await counts();
    assert.deepEqual(first, {
      issues: 4, // 3 open + #4 (linked from current work)
      issueComments: 2, // #4's conversation; open threads with one short reply are metadata only
      prs: 3, // 2 open + #9 (linked from #11)
      prComments: 3,
      reviews: 4,
      reviewComments: 3,
      files: 5,
      commits: 4,
      discussions: 2,
      discussionComments: 6,
      repoFiles: 2,
    });

    // current work vs history, straight from the rows
    const reasons = await db.githubIssue.groupBy({
      by: ["state", "fetchReason"],
      where: { projectId },
      _count: { _all: true },
    });
    const byReason = Object.fromEntries(
      reasons.map((g) => [`${g.state}/${g.fetchReason}`, g._count._all])
    );
    assert.deepEqual(byReason, { "open/open": 3, "closed/referenced": 1 });
    assert.equal(
      await db.githubIssue.count({ where: { projectId, number: 5 } }),
      0,
      "unrelated history is not imported"
    );
    assert.equal(
      await db.githubPullRequest.count({ where: { projectId, number: 8 } }),
      0
    );
    assert.equal(await db.threadReference.count({ where: { projectId } }), 3);
    const refs = await db.threadReference.findMany({
      where: { projectId },
      orderBy: [{ fromNumber: "asc" }],
    });
    assert.deepEqual(
      refs.map(
        (r) =>
          `${r.fromKind}#${r.fromNumber}->${r.toNumber}:${r.basis}:${r.relationship}`
      ),
      [
        "issue#1->4:reference_in_body:direct",
        "pull_request#10->4:closing_reference:direct",
        "pull_request#11->9:reference_in_body:direct",
      ]
    );

    const reply = await db.githubReviewComment.findFirstOrThrow({
      where: { projectId, githubId: 4002n },
    });
    assert.equal(reply.inReplyToId, 4001n);
    assert.equal(reply.threadId, "PRT_1");
    assert.equal(reply.isResolved, true);

    const noPatch = await db.githubPrFile.findFirstOrThrow({
      where: { projectId, filename: "assets/logo.png" },
    });
    assert.equal(noPatch.patch, null);

    // Same import again: no duplicates anywhere.
    await runSync({
      octokit: createFakeGitHub(baseData()).octokit(),
      store,
      project: target,
      mode: "full",
    });
    assert.deepEqual(await counts(), first);

    const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    assert.ok(
      (p.syncCursor as Record<string, string>).issues,
      "checkpoint persisted"
    );
  });

  it("incremental sync updates changed rows only", async () => {
    const data = baseData();
    data.issues[1] = {
      ...data.issues[1],
      title: "Edited",
      updated_at: "2099-01-01T00:00:00Z",
    };
    const gh = createFakeGitHub(data);
    await runSync({
      octokit: gh.octokit(),
      store,
      project: target,
      mode: "incremental",
    });
    const issue = await db.githubIssue.findFirstOrThrow({
      where: { projectId, number: 2 },
    });
    assert.equal(issue.title, "Edited");
    assert.equal((await counts()).issues, 4);
  });

  it("enforces project ownership", async () => {
    const svc = new GithubSyncService({
      db,
      store,
      getOctokit: async () => createFakeGitHub(baseData()).octokit(),
    });
    await assert.rejects(
      svc.startSync(slug, strangerId),
      (e: unknown) => e instanceof HttpError && e.status === 403
    );
    await assert.rejects(
      svc.getStatus(slug, strangerId),
      (e: unknown) => e instanceof HttpError && e.status === 403
    );
    await assert.rejects(
      svc.listSource(slug, strangerId, "issues", 1, 10),
      (e: unknown) => e instanceof HttpError && e.status === 403
    );
    await assert.rejects(
      svc.startSync("nope-" + suffix, ownerId),
      (e: unknown) => e instanceof HttpError && e.status === 404
    );
  });

  it("runs a job end to end, blocks concurrent runs and pages through sources", async () => {
    const svc = new GithubSyncService({
      db,
      store,
      getOctokit: async () => createFakeGitHub(baseData()).octokit(),
    });
    const job = await svc.startSync(slug, ownerId, { full: true });
    assert.equal(job.status, "running");
    await assert.rejects(
      svc.startSync(slug, ownerId),
      (e: unknown) => e instanceof HttpError && e.status === 409
    );

    let status = await svc.getStatus(slug, ownerId);
    for (let i = 0; i < 100 && status.latestJob?.status === "running"; i++) {
      await new Promise((r) => setTimeout(r, 50));
      status = await svc.getStatus(slug, ownerId);
    }
    assert.equal(status.latestJob?.status, "completed");
    assert.equal(status.syncStatus, "completed");
    assert.ok(status.lastSyncedAt);

    const page1 = await svc.listSource(slug, ownerId, "commits", 1, 2);
    const page2 = await svc.listSource(slug, ownerId, "commits", 2, 2);
    assert.equal(page1.total, 4);
    assert.equal(page1.items.length, 2);
    assert.equal(page1.hasMore, true);
    assert.equal(page2.items.length, 2);
    assert.equal(page2.hasMore, false);
  });

  it("records a failed job with a safe message when GitHub denies access", async () => {
    const svc = new GithubSyncService({
      db,
      store,
      getOctokit: async () =>
        createFakeGitHub(baseData(), {
          failures: [{ match: /^\/repos\/acme\/widgets$/, status: 404 }],
        }).octokit(),
    });
    await svc.startSync(slug, ownerId, { full: true });
    let status = await svc.getStatus(slug, ownerId);
    for (let i = 0; i < 100 && status.latestJob?.status === "running"; i++) {
      await new Promise((r) => setTimeout(r, 50));
      status = await svc.getStatus(slug, ownerId);
    }
    assert.equal(status.latestJob?.status, "failed");
    assert.equal(status.syncStatus, "failed");
    assert.match(status.latestJob?.error ?? "", /Cannot access acme\/widgets/);
    assert.doesNotMatch(status.latestJob?.error ?? "", /token|Bearer/i);
  });
  it("marks work interrupted by a restart as failed so nothing spins forever", async () => {
    await db.syncJob.create({
      data: { projectId, status: "running", trigger: "manual", mode: "full" },
    });
    await db.extractionRun.create({
      data: { projectId, status: "running", model: "m", version: "v" },
    });
    await db.project.update({
      where: { id: projectId },
      data: { syncStatus: "running", aiStatus: "running" },
    });

    const out = await recoverInterruptedWork(db);
    assert.ok(out.syncJobs >= 1 && out.extractionRuns >= 1);
    const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    assert.equal(p.syncStatus, "failed");
    assert.equal(p.aiStatus, "failed");
    assert.equal(
      await db.syncJob.count({ where: { projectId, status: "running" } }),
      0
    );
    const run = await db.extractionRun.findFirstOrThrow({
      where: { projectId },
      orderBy: { startedAt: "desc" },
    });
    assert.match(run.error ?? "", /Interrupted by a server restart/);
  });

  it("writes in batches, and a repeated sync of unchanged data writes nothing", async () => {
    const counted = new PrismaClient({
      datasources: { db: { url: url as string } },
      log: [{ emit: "event", level: "query" }],
    });
    const writes: string[] = [];
    (
      counted as unknown as {
        $on: (e: string, cb: (q: { query: string }) => void) => void;
      }
    ).$on("query", (q) => {
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(q.query)) writes.push(q.query);
    });
    const user = await db.user.create({
      data: {
        githubId: BigInt(Date.now() + 5),
        githubUsername: `batch-${suffix}`,
      },
    });
    const p = await db.project.create({
      data: {
        name: "batch",
        slug: `batch-${suffix}`,
        userId: user.id,
        githubRepoId: 55n,
        githubRepoFullName: "acme/widgets",
        githubRepoName: "widgets",
        githubRepoOwner: "acme",
        githubRepoUrl: "https://github.com/acme/widgets",
      },
    });
    const { bigData } = await import("./helpers/big-data");
    const data = bigData(60, 60);
    const sync = () =>
      runSync({
        octokit: createFakeGitHub(data, { pageSize: 100 }).octokit(),
        store: new PrismaSyncStore(counted),
        project: {
          id: p.id,
          owner: "acme",
          repo: "widgets",
          defaultBranch: "main",
        },
        mode: "full",
      });

    await sync();
    const rows =
      (await db.githubIssue.count({ where: { projectId: p.id } })) +
      (await db.githubPullRequest.count({ where: { projectId: p.id } })) +
      (await db.githubPrFile.count({ where: { projectId: p.id } })) +
      (await db.githubCommit.count({ where: { projectId: p.id } }));
    const inserts = writes.filter(
      (w) => /^\s*INSERT/i.test(w) && !/Project/.test(w)
    ).length;
    assert.ok(rows > 200, `imported ${rows} rows`);
    assert.ok(
      inserts < rows / 5,
      `${inserts} INSERT statements for ${rows} rows: rows are batched`
    );

    writes.length = 0;
    await sync();
    const sourceWrites = writes.filter(
      (w) => /"Github[A-Za-z]+"/.test(w) && !/^\s*UPDATE "Project"/i.test(w)
    );
    assert.deepEqual(
      sourceWrites.map((w) => w.slice(0, 60)),
      [],
      "unchanged rows are neither inserted nor updated"
    );

    await counted.$disconnect();
    await db.user.delete({ where: { id: user.id } });
  });

  it("lets only the owner disconnect a project, removing its imported data", async () => {
    const svc = new GithubSyncService({
      db,
      store,
      getOctokit: async () => createFakeGitHub(baseData()).octokit(),
    });
    await assert.rejects(
      svc.deleteProject(slug, strangerId),
      (e: unknown) => e instanceof HttpError && e.status === 403
    );
    assert.ok((await db.githubIssue.count({ where: { projectId } })) > 0);

    await svc.deleteProject(slug, ownerId);
    assert.equal(await db.project.count({ where: { id: projectId } }), 0);
    assert.equal(await db.githubIssue.count({ where: { projectId } }), 0);
    assert.equal(await db.githubCommit.count({ where: { projectId } }), 0);
  });
});
