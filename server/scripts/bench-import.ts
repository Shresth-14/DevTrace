/**
 * Import benchmark: GitHub (fake, with simulated latency) -> Postgres -> LLM (fake).
 * Both variants run the SAME deterministic repository, so numbers are comparable.
 *
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:55432/devtrace_test \
 *     npx tsx scripts/bench-import.ts <new|legacy> [issues] [prs]
 *
 * "legacy" loads a snapshot of the pre-optimisation code from ./.bench-legacy/src.
 * Only ever point TEST_DATABASE_URL at a disposable local database.
 */
import { PrismaClient } from "@prisma/client";
import { createFakeGitHub } from "../tests/helpers/fake-github";
import { bigData } from "../tests/helpers/big-data";

const variant = process.argv[2] === "legacy" ? "legacy" : "new";
const issues = Number(process.argv[3] ?? 150);
const prs = Number(process.argv[4] ?? 150);
const url = process.env.TEST_DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Set TEST_DATABASE_URL to a LOCAL disposable Postgres.");
  process.exit(1);
}
process.env.EXTRACTION_MAX_UNITS = "40";
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LLM_LATENCY_MS = 600;

async function main() {
  const root = variant === "legacy" ? "../.bench-legacy/src" : "../src";
  const { runSync } = await import(
    `${root}/modules/github/sync/github.sync.runner`
  );
  const { PrismaSyncStore } = await import(
    `${root}/modules/github/sync/github.sync.store`
  );
  const { DecisionExtractionService } = await import(
    `${root}/modules/decisions/decision.service`
  );
  const { DecisionStore } = await import(
    `${root}/modules/decisions/decision.store`
  );

  const stats = { selects: 0, writes: 0 };
  const db = new PrismaClient({
    datasources: { db: { url } },
    log: [{ emit: "event", level: "query" }],
  });
  (
    db as unknown as {
      $on: (e: string, cb: (q: { query: string }) => void) => void;
    }
  ).$on("query", (q) => {
    const sql = q.query.trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return;
    if (/^SELECT/i.test(sql)) stats.selects++;
    else stats.writes++;
  });
  const watcher = new PrismaClient({ datasources: { db: { url } } }); // not counted

  const suffix = Date.now().toString(36);
  const user = await watcher.user.create({
    data: { githubId: BigInt(Date.now()), githubUsername: `bench-${suffix}` },
  });
  const project = await watcher.project.create({
    data: {
      name: "widgets",
      slug: `bench-${suffix}`,
      userId: user.id,
      githubRepoId: 77n,
      githubRepoFullName: "acme/widgets",
      githubRepoName: "widgets",
      githubRepoOwner: "acme",
      githubRepoUrl: "https://github.com/acme/widgets",
    },
  });

  const gh = createFakeGitHub(bigData(issues, prs), {
    pageSize: 100,
    latencyMs: { rest: 80, graphql: 150 },
  });
  let llmCalls = 0;
  const llm = {
    isConfigured: () => true,
    getModel: () => "bench/open-model",
    async chat(messages: { content: string }[]) {
      llmCalls++;
      await sleep(LLM_LATENCY_MS);
      const prompt = messages[messages.length - 1].content;
      const head = prompt.split("\n")[1] ?? "";
      const block = prompt
        .split(/\n\n(?=\[S\d+\])/)
        .find((b) => /approach/.test(b.split("\n").slice(1).join("\n")));
      const ref = block?.match(/^\[(S\d+)\]/)?.[1];
      const decisions = ref
        ? [
            {
              title: `Settle on approach for ${head.replace(/[^A-Za-z0-9 #]/g, "").slice(0, 40)}`,
              summary: "The thread settled on one approach.",
              status: "accepted",
              reasoning: [],
              evidence: [{ source_id: ref, quote: "approach" }],
              rejected_alternatives: [],
              related_files: [],
              confidence: 0.7,
            },
          ]
        : [];
      return {
        content: JSON.stringify({ decisions }),
        model: "bench/open-model",
      };
    },
  };

  const extraction = new DecisionExtractionService({
    db,
    llm,
    store: new DecisionStore(db),
    extractor: {},
  });
  const t0 = Date.now();
  let firstDecisionMs = -1;
  const poll = setInterval(async () => {
    if (firstDecisionMs >= 0) return;
    if (
      (await watcher.decision.count({ where: { projectId: project.id } })) > 0
    )
      firstDecisionMs = Date.now() - t0;
  }, 25);

  let importMs = 0;
  const target = {
    id: project.id,
    owner: "acme",
    repo: "widgets",
    defaultBranch: "main",
  };
  const limits = { issues, pullRequests: prs, commits: 300, discussions: 100 };

  if (variant === "legacy") {
    const out = await runSync({
      octokit: gh.octokit({ throttle: true }),
      store: new PrismaSyncStore(db),
      project: target,
      mode: "full",
      limits,
    });
    importMs = Date.now() - t0;
    if (out.status === "failed") throw new Error("import failed");
    const run = await extraction.startForProject(project.id);
    for (;;) {
      const r = await watcher.extractionRun.findUniqueOrThrow({
        where: { id: run.id },
      });
      if (r.status !== "running") break;
      await sleep(25);
    }
  } else {
    const { GithubSyncService } = await import(
      `${root}/modules/github/sync/github.sync.service`
    );
    const svc = new GithubSyncService({
      db,
      store: new PrismaSyncStore(db),
      limits,
      afterSync: (id: string) => extraction.startForProject(id),
      getOctokit: async () => gh.octokit({ throttle: true }),
    });
    const job = await svc.startSync(`bench-${suffix}`, user.id, { full: true });
    for (;;) {
      const j = await watcher.syncJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (j.status !== "running") {
        importMs = Date.now() - t0;
        break;
      }
      await sleep(25);
    }
    for (;;) {
      const runs = await watcher.extractionRun.findMany({
        where: { projectId: project.id },
      });
      if (runs.length > 0 && runs.every((r) => r.status !== "running")) break;
      await sleep(25);
    }
  }
  const totalMs = Date.now() - t0;
  clearInterval(poll);

  const count = async (m: {
    count: (a: { where: { projectId: string } }) => Promise<number>;
  }) => m.count({ where: { projectId: project.id } });
  const rows = {
    issues: await count(watcher.githubIssue),
    prs: await count(watcher.githubPullRequest),
    issueComments: await count(watcher.githubIssueComment),
    prComments: await count(watcher.githubPrComment),
    reviews: await count(watcher.githubPrReview),
    inline: await count(watcher.githubReviewComment),
    files: await count(watcher.githubPrFile),
    commits: await count(watcher.githubCommit),
    discussions: await count(watcher.githubDiscussion),
    decisions: await count(watcher.decision),
  };
  const rest = gh.calls.filter((c) => !c.startsWith("POST /graphql")).length;
  console.log(
    JSON.stringify(
      {
        variant,
        repo: { issues, prs },
        importMs,
        firstDecisionMs,
        totalMs,
        githubRequests: {
          rest,
          graphql: gh.calls.length - rest,
          total: gh.calls.length,
        },
        dbStatements: { selects: stats.selects, writes: stats.writes },
        llmCalls,
        rows,
      },
      null,
      2
    )
  );

  await watcher.user.deleteMany({ where: { id: user.id } });
  await db.$disconnect();
  await watcher.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
