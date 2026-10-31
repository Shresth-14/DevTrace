/**
 * HTTP-level authorization of the project/decision endpoints against a real local
 * Postgres. The app's own DATABASE_URL is replaced by TEST_DATABASE_URL for this
 * process, and the suite is skipped unless TEST_DATABASE_URL is a local database.
 */
import "../src/tests/setup-env";
import { describe, it, before, after } from "node:test";
import request from "supertest";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url) && /@(localhost|127\.0\.0\.1)[:/]/.test(url ?? "");
if (enabled) {
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
}

const skip = enabled
  ? false
  : "set TEST_DATABASE_URL to a local disposable Postgres to run";

describe("project + decision endpoints (HTTP)", { skip }, () => {
  let app: import("express").Application;
  let prisma: import("@prisma/client").PrismaClient;
  let tokenFor: (id: string, name: string) => string;
  const suffix = Date.now().toString(36);
  const ids = {
    owner: "",
    stranger: "",
    privateProject: "",
    publicProject: "",
  };
  const slugs = { priv: `priv-${suffix}`, pub: `pub-${suffix}` };

  before(async () => {
    const { createApp } = await import("../src/app");
    const db = await import("../src/database");
    const { signSessionToken } = await import("../src/utils/jwt");
    app = createApp();
    prisma = db.prisma;
    tokenFor = (id, name) =>
      signSessionToken({ userId: id, githubId: "1", githubUsername: name });

    const owner = await prisma.user.create({
      data: { githubId: BigInt(Date.now()), githubUsername: `owner-${suffix}` },
    });
    const stranger = await prisma.user.create({
      data: {
        githubId: BigInt(Date.now() + 1),
        githubUsername: `stranger-${suffix}`,
      },
    });
    ids.owner = owner.id;
    ids.stranger = stranger.id;

    const mk = async (slug: string, isPrivate: boolean, repoId: bigint) => {
      const p = await prisma.project.create({
        data: {
          name: slug,
          slug,
          userId: owner.id,
          githubRepoId: repoId,
          isPrivate,
          githubRepoFullName: `acme/${slug}`,
          githubRepoName: slug,
          githubRepoOwner: "acme",
          githubRepoUrl: `https://github.com/acme/${slug}`,
        },
      });
      await prisma.decision.create({
        data: {
          projectId: p.id,
          seq: 1,
          fingerprint: `fp-${slug}`,
          title: `Decision of ${slug}`,
          summary: "s",
          status: "accepted",
          reasoning: [],
          participants: [],
          model: "m",
          version: "v",
        },
      });
      return p.id;
    };
    ids.privateProject = await mk(slugs.priv, true, 10n);
    ids.publicProject = await mk(slugs.pub, false, 11n);
  });

  after(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [ids.owner, ids.stranger] } },
    });
    await prisma.$disconnect();
  });

  const as = (id: string, name: string) => ({
    Authorization: `Bearer ${tokenFor(id, name)}`,
  });

  it("keeps private repository intelligence away from everyone but the owner", async () => {
    const path = `/api/projects/${slugs.priv}/decisions`;
    assert.equal((await request(app).get(path)).status, 403);
    assert.equal(
      (await request(app).get(path).set(as(ids.stranger, "s"))).status,
      403
    );
    const ok = await request(app).get(path).set(as(ids.owner, "o"));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.decisions[0].id, "DEC-001");
    for (const p of ["overview", "pr-intelligence", "source-feed"]) {
      assert.equal(
        (await request(app).get(`/api/projects/${slugs.priv}/${p}`)).status,
        403,
        p
      );
    }
  });

  it("lets anyone read a public repository's decisions", async () => {
    const res = await request(app).get(`/api/projects/${slugs.pub}/decisions`);
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
  });

  it("restricts every mutation to the owner", async () => {
    const stranger = as(ids.stranger, "s");
    assert.equal(
      (
        await request(app)
          .post(`/api/projects/${slugs.pub}/extract`)
          .set(stranger)
      ).status,
      403
    );
    assert.equal(
      (await request(app).post(`/api/projects/${slugs.pub}/sync`).set(stranger))
        .status,
      403
    );
    assert.equal(
      (await request(app).delete(`/api/projects/${slugs.pub}`).set(stranger))
        .status,
      403
    );
    assert.equal(
      await prisma.project.count({ where: { id: ids.publicProject } }),
      1
    );
  });

  it("validates input", async () => {
    const owner = as(ids.owner, "o");
    assert.equal(
      (
        await request(app)
          .get(`/api/projects/${slugs.priv}/source-feed?category=bogus`)
          .set(owner)
      ).status,
      400
    );
    assert.equal(
      (
        await request(app)
          .get(`/api/projects/${slugs.priv}/decisions?page=0`)
          .set(owner)
      ).status,
      400
    );
    assert.equal(
      (await request(app).get(`/api/projects/bad slug!/decisions`).set(owner))
        .status,
      400
    );
    assert.equal(
      (
        await request(app)
          .get(`/api/projects/does-not-exist-${suffix}/decisions`)
          .set(owner)
      ).status,
      404
    );
  });

  it("reports real decision counts per project and in the dashboard summary", async () => {
    const owner = as(ids.owner, "o");
    const list = await request(app).get("/api/projects").set(owner);
    assert.equal(list.status, 200);
    assert.ok(
      list.body.projects.every(
        (p: { decisionsCount: number }) => p.decisionsCount === 1
      )
    );
    const strangerList = await request(app)
      .get("/api/projects")
      .set(as(ids.stranger, "s"));
    assert.deepEqual(strangerList.body.projects, []);

    const summary = await request(app).get("/api/dashboard/summary").set(owner);
    assert.equal(summary.body.projects, 2);
    assert.equal(summary.body.decisions, 2);
    assert.equal(summary.body.recentDecisions.length, 2);
    assert.equal(
      (
        await request(app)
          .get("/api/dashboard/summary")
          .set(as(ids.stranger, "s"))
      ).body.decisions,
      0
    );
  });

  it("reports an unconfigured AI provider instead of pretending to run", async () => {
    // setup-env blanks OPENROUTER_API_KEY, so extraction must refuse with 503.
    const res = await request(app)
      .post(`/api/projects/${slugs.priv}/extract`)
      .set(as(ids.owner, "o"));
    assert.equal(res.status, 503);
    assert.match(res.body.message, /OPENROUTER_API_KEY/);
    const p = await prisma.project.findUniqueOrThrow({
      where: { id: ids.privateProject },
    });
    assert.equal(p.aiStatus, "not_configured");
  });

  it("adds a public repository by URL without any app installation", async () => {
    const { projectService } =
      await import("../src/modules/project/project.service");
    const { baseData, createFakeGitHub } =
      await import("./helpers/fake-github");
    const client = async () => createFakeGitHub(baseData()).octokit();

    const first = await projectService.connectPublicRepository(
      ids.owner,
      "https://github.com/acme/widgets.git",
      client
    );
    assert.equal(first.alreadyConnected, false);
    assert.equal(first.project.githubRepoFullName, "acme/widgets");
    assert.equal(first.project.installationId, null);
    assert.equal(first.project.isPrivate, false);

    const again = await projectService.connectPublicRepository(
      ids.owner,
      "acme/widgets",
      client
    );
    assert.equal(again.alreadyConnected, true, "no duplicate connection");
    assert.equal(again.project.id, first.project.id);
  });

  it("refuses private, missing and malformed repositories with clear messages", async () => {
    const { projectService } =
      await import("../src/modules/project/project.service");
    const { baseData, createFakeGitHub } =
      await import("./helpers/fake-github");
    const priv = baseData();
    priv.repoInfo = { private: true };
    await assert.rejects(
      projectService.connectPublicRepository(
        ids.owner,
        "acme/widgets",
        async () => createFakeGitHub(priv).octokit()
      ),
      /Only public repositories/
    );
    await assert.rejects(
      projectService.connectPublicRepository(
        ids.owner,
        "acme/widgets",
        async () =>
          createFakeGitHub(baseData(), {
            failures: [{ match: /^\/repos\/acme\/widgets$/, status: 404 }],
          }).octokit()
      ),
      /was not found/
    );
    await assert.rejects(
      projectService.connectPublicRepository(ids.owner, "not a url", async () =>
        createFakeGitHub(baseData()).octokit()
      ),
      /public GitHub repository URL/
    );
  });

  it("validates the URL over HTTP and requires a session", async () => {
    assert.equal(
      (
        await request(app)
          .post("/api/projects")
          .send({ repositoryUrl: "https://github.com/a/b" })
      ).status,
      401
    );
    const res = await request(app)
      .post("/api/projects")
      .set(as(ids.owner, "o"))
      .send({ repositoryUrl: "https://gitlab.com/a/b" });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /public GitHub repository URL/);
  });
});
