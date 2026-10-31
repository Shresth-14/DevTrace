/**
 * End-to-end pipeline against a real (local, disposable) Postgres:
 * fake GitHub -> source tables -> fake LLM -> decisions -> read APIs.
 * Skipped unless TEST_DATABASE_URL points at a local database.
 */
import "../src/tests/setup-env";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { runSync } from "../src/modules/github/sync/github.sync.runner";
import { PrismaSyncStore } from "../src/modules/github/sync/github.sync.store";
import { DecisionExtractionService } from "../src/modules/decisions/decision.service";
import { DecisionStore } from "../src/modules/decisions/decision.store";
import {
  getOverview,
  getPrIntelligence,
  getSourceFeed,
  listDecisions,
} from "../src/modules/decisions/decision.read";
import { HttpError } from "../src/utils/http-error";
import { AiUpstreamError, type ChatMessage } from "../src/modules/ai/ai.types";
import { baseData, createFakeGitHub } from "./helpers/fake-github";

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url) && /@(localhost|127\.0\.0\.1)[:/]/.test(url ?? "");
const skip = enabled
  ? false
  : "set TEST_DATABASE_URL to a local disposable Postgres to run";

/** Finds the local ref (S3...) of the thread item whose text contains `snippet`. */
function refOf(prompt: string, snippet: string): string {
  const block = prompt
    .split(/\n\n(?=\[S\d+\])/)
    .find((b) => b.split("\n").slice(1).join("\n").includes(snippet));
  const ref = block?.match(/^\[(S\d+)\]/)?.[1];
  if (!ref) throw new Error(`fake LLM: no item containing "${snippet}"`);
  return ref;
}

interface FakeLlm {
  calls: string[];
  failFor?: RegExp;
  alwaysFail?: boolean;
  configured: boolean;
  chat(messages: ChatMessage[]): Promise<{ content: string; model: string }>;
  isConfigured(): boolean;
  getModel(): string;
}

function makeLlm(): FakeLlm {
  const llm: FakeLlm = {
    calls: [],
    configured: true,
    isConfigured: () => llm.configured,
    getModel: () => "fake/open-model",
    async chat(messages) {
      const prompt = messages[messages.length - 1].content;
      llm.calls.push(prompt.split("\n")[1] ?? "");
      if (llm.alwaysFail) throw new AiUpstreamError("boom", 500);
      if (llm.failFor?.test(prompt)) throw new AiUpstreamError("boom", 500);
      let decisions: unknown[] = [];
      if (prompt.includes("Pull request #10")) {
        decisions = [
          {
            title: "Use approach X in the storage layer",
            summary: "The reviewers settled on approach X.",
            status: "accepted",
            reasoning: [
              {
                category: "maintainability",
                explanation: "Simpler to reason about.",
              },
            ],
            open_questions: null,
            rejected_alternatives: [
              {
                title: "Approach Y",
                proposed_by: "frank",
                reason: "Reviewer questioned it and X was explained.",
                status: "rejected",
                chosen_instead: "Approach X",
                evidence_ids: [refOf(prompt, "Why?")],
              },
            ],
            evidence: [
              { source_id: refOf(prompt, "Because X"), quote: "Because X" },
              { source_id: refOf(prompt, "LGTM"), quote: "LGTM" },
            ],
            related_files: [
              { path: "src/a.ts", relationship: "Implements approach X." },
              { path: "src/ghost.ts", relationship: "made up" },
            ],
            confidence: 0.8,
          },
        ];
      } else if (prompt.includes("Discussion #1:")) {
        decisions = [
          {
            title: "Adopt Postgres",
            summary: "Discussion leans towards Postgres but nobody confirmed.",
            status: "accepted", // the quote below is NOT in the source -> must be downgraded
            reasoning: [],
            open_questions: "Hosting not agreed.",
            rejected_alternatives: [],
            evidence: [
              {
                source_id: refOf(prompt, "Because"),
                quote: "we all agreed on postgres",
              },
            ],
            related_files: [],
            confidence: 0.4,
          },
        ];
      }
      return {
        content: JSON.stringify({ decisions }),
        model: "fake/open-model",
      };
    },
  };
  return llm;
}

describe("decision extraction pipeline", { skip }, () => {
  let db: PrismaClient;
  let svc: DecisionExtractionService;
  let llm: FakeLlm;
  let ownerId = "";
  let strangerId = "";
  let projectId = "";
  const suffix = Date.now().toString(36);
  const slug = `widgets-ai-${suffix}`;
  const target = {
    id: "",
    owner: "acme",
    repo: "widgets",
    defaultBranch: "main",
  };

  const waitRun = async (id: string) => {
    for (let i = 0; i < 200; i++) {
      const run = await db.extractionRun.findUniqueOrThrow({ where: { id } });
      if (run.status !== "running") return run;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("extraction did not finish");
  };
  const extract = async (force = false) => {
    const run = await svc.start(slug, ownerId, { force });
    return waitRun(run.id);
  };

  before(async () => {
    db = new PrismaClient({ datasources: { db: { url: url as string } } });
    const owner = await db.user.create({
      data: { githubId: BigInt(Date.now()), githubUsername: `o-${suffix}` },
    });
    const stranger = await db.user.create({
      data: { githubId: BigInt(Date.now() + 1), githubUsername: `s-${suffix}` },
    });
    ownerId = owner.id;
    strangerId = stranger.id;
    const project = await db.project.create({
      data: {
        name: "widgets",
        slug,
        userId: owner.id,
        githubRepoId: 2n,
        githubRepoFullName: "acme/widgets",
        githubRepoName: "widgets",
        githubRepoOwner: "acme",
        githubRepoUrl: "https://github.com/acme/widgets",
      },
    });
    projectId = project.id;
    target.id = projectId;
    await runSync({
      octokit: createFakeGitHub(baseData()).octokit(),
      store: new PrismaSyncStore(db),
      project: target,
      mode: "full",
    });

    llm = makeLlm();
    svc = new DecisionExtractionService({
      db,
      llm,
      store: new DecisionStore(db),
      extractor: { sleep: async () => undefined },
    });
  });

  after(async () => {
    await db.user.deleteMany({ where: { id: { in: [ownerId, strangerId] } } });
    await db.$disconnect();
  });

  it("analyses real threads, validates output and stores evidence-backed decisions", async () => {
    const run = await extract();
    assert.equal(run.status, "completed", run.error ?? "");
    assert.equal(run.model, "fake/open-model");
    assert.equal(
      llm.calls.length,
      4,
      "open PR 10, linked issue 4 and PR 9, and discussion 1; quiet threads and unlinked history are skipped"
    );

    const decisions = await db.decision.findMany({
      where: { projectId },
      orderBy: { seq: "asc" },
    });
    assert.equal(decisions.length, 2);
    const x = decisions.find((d) => d.title.includes("approach X"));
    const pg = decisions.find((d) => d.title === "Adopt Postgres");
    assert.equal(x?.status, "accepted");
    assert.equal(
      pg?.status,
      "proposed",
      "unverifiable quote -> never 'accepted'"
    );
    assert.equal(pg?.openQuestions, "Hosting not agreed.");

    const evidence = await db.decisionEvidence.findMany({
      where: { decisionId: x?.id },
    });
    const because = evidence.find((e) => e.sourceKey === "4002");
    assert.equal(
      because?.url,
      "https://github.com/c/4002",
      "URL comes from the imported record"
    );
    assert.equal(because?.sourceType, "review_comment");

    const alt = await db.decisionAlternative.findFirstOrThrow({
      where: { decisionId: x?.id },
      include: { evidence: true },
    });
    assert.equal(alt.status, "rejected");
    assert.equal(alt.evidence.length, 1);

    const links = await db.decisionCodeLink.findMany({
      where: { decisionId: x?.id },
    });
    assert.ok(
      links.some((l) => l.path === "src/a.ts" && l.relationship === "direct")
    );
    assert.ok(
      !links.some((l) => l.path === "src/ghost.ts"),
      "invented file dropped"
    );

    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    assert.equal(project.aiStatus, "completed");
    assert.ok(project.lastExtractedAt);
  });

  it("does not re-analyse unchanged threads unless forced, and never duplicates decisions", async () => {
    const before = llm.calls.length;
    await extract();
    assert.equal(llm.calls.length, before, "unchanged threads are skipped");

    await extract(true);
    assert.equal(llm.calls.length, before + 4, "force re-analyses everything");
    const seqs = (await db.decision.findMany({ where: { projectId } }))
      .map((d) => d.seq)
      .sort();
    assert.deepEqual(seqs, [1, 2], "same decisions are merged, not duplicated");
  });

  it("serves the real records through the read APIs", async () => {
    const list = await listDecisions(db, projectId, 1, 50);
    assert.equal(list.total, 2);
    const x = list.decisions.find((d) => d.title.includes("approach X"));
    assert.match(x?.id ?? "", /^DEC-\d{3}$/);
    assert.equal(x?.status, "ACCEPTED");
    assert.equal(x?.alternatives[0].status, "REJECTED");
    assert.deepEqual(x?.alternatives[0].affectedFiles, ["src/a.ts"]);
    assert.ok(x?.sources.every((s) => s.url.startsWith("https://github.com/")));
    assert.ok(
      x?.relatedThreads.some(
        (t) => t.kind === "pull_request" && t.number === 10
      )
    );

    const ov = await getOverview(db, projectId);
    assert.equal(ov.counts.total, 2);
    assert.equal(ov.counts.accepted, 1);
    assert.equal(ov.counts.proposed, 1);
    assert.equal(ov.counts.rejectedAlternatives, 1);
    assert.equal(ov.sources.issues, 4);
    assert.deepEqual(
      [
        ov.threads.issues.open,
        ov.threads.issues.linkedHistory,
        ov.threads.issues.total,
      ],
      [3, 1, 4]
    );
    assert.deepEqual(
      [ov.threads.pullRequests.open, ov.threads.pullRequests.linkedHistory],
      [2, 1]
    );
    assert.equal(ov.threads.references, 3);
    assert.equal(ov.sources.pullRequests, 3);
    assert.equal(ov.status.aiStatus, "completed");

    const reviews = await getSourceFeed(db, projectId, {
      category: "reviews",
      page: 1,
      perPage: 10,
    });
    const cited = reviews.items.find((i) => i.id === "rc-4002");
    assert.deepEqual(cited?.referencedDecisions, [x?.id]);
    assert.equal(reviews.counts.issues, 4);
    const issues = await getSourceFeed(db, projectId, {
      category: "issues",
      q: "Issue 2",
      page: 1,
      perPage: 10,
    });
    assert.deepEqual(
      issues.items.map((i) => i.id),
      ["issue-2"]
    );
    const pages = await getSourceFeed(db, projectId, {
      category: "issues",
      page: 2,
      perPage: 2,
    });
    assert.equal(pages.items.length, 2);
  });

  it("matches later PRs to earlier decisions only through shared files", async () => {
    const approachXId = (
      await listDecisions(db, projectId, 1, 50)
    ).decisions.find((d) => d.title.includes("approach X"))?.id;
    assert.equal(
      (await getPrIntelligence(db, projectId, 1, 10)).total,
      0,
      "no other PR touches decision files yet"
    );
    await db.githubPullRequest.create({
      data: {
        projectId,
        githubId: 999n,
        number: 12,
        title: "Touch a.ts again",
        body: null,
        authorLogin: "zed",
        state: "open",
        baseRef: "main",
        headRef: "f",
        baseSha: "b",
        headSha: "h",
        labels: [],
        reviewers: [],
        url: "https://github.com/acme/widgets/pull/12",
        createdAtGh: new Date(),
        updatedAtGh: new Date(),
      },
    });
    await db.githubPrFile.create({
      data: {
        projectId,
        prNumber: 12,
        filename: "src/a.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        changes: 1,
      },
    });
    const intel = await getPrIntelligence(db, projectId, 1, 10);
    assert.equal(intel.total, 1);
    const m = intel.items[0].matches[0];
    assert.equal(intel.items[0].prNumber, 12);
    assert.equal(m.decisionId, approachXId);
    assert.equal(m.relationship, "direct");
    assert.deepEqual(m.matchedFiles, ["src/a.ts"]);
    assert.match(m.reason, /src\/a\.ts/);
  });

  it("keeps imported sources and reports an honest failure when the model fails", async () => {
    const issuesBefore = await db.githubIssue.count({ where: { projectId } });
    llm.alwaysFail = true;
    const run = await extract(true);
    llm.alwaysFail = false;
    assert.equal(run.status, "failed");
    assert.match(run.error ?? "", /AI provider returned an error/);
    assert.doesNotMatch(run.error ?? "", /sk-|Bearer/);
    assert.equal(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } }))
        .aiStatus,
      "failed"
    );
    assert.equal(
      await db.githubIssue.count({ where: { projectId } }),
      issuesBefore
    );
    assert.equal(
      await db.decision.count({ where: { projectId } }),
      2,
      "earlier decisions are untouched"
    );
    assert.ok(
      (await db.extractionUnit.count({
        where: { projectId, status: "failed" },
      })) > 0
    );
  });

  it("reports a partial run when only some threads fail, and resumes the failed ones", async () => {
    llm.failFor = /Pull request #10/;
    const partial = await extract(true);
    assert.equal(partial.status, "partial");
    assert.equal(partial.unitsFailed, 1);
    llm.failFor = undefined;
    const before = llm.calls.length;
    const resumed = await extract(); // no force: only the failed thread is retried
    assert.equal(resumed.status, "completed");
    assert.equal(llm.calls.length, before + 1);
  });

  it("refuses to run when OpenRouter is not configured", async () => {
    llm.configured = false;
    await assert.rejects(
      svc.start(slug, ownerId),
      (e: unknown) => e instanceof HttpError && e.status === 503
    );
    assert.equal(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } }))
        .aiStatus,
      "not_configured"
    );
    llm.configured = true;
  });

  it("enforces ownership", async () => {
    await assert.rejects(
      svc.start(slug, strangerId),
      (e: unknown) => e instanceof HttpError && e.status === 403
    );
    await assert.rejects(
      svc.start("nope-" + suffix, ownerId),
      (e: unknown) => e instanceof HttpError && e.status === 404
    );
  });
});
