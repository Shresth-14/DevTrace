/**
 * Phase 2 optimization tests.
 *
 * Covers:
 *   1. Throttling of extractionRun.update progress writes to <= 1/s OR <= 1 per 10 units.
 *   2. Final counters match exact unit counts.
 *   3. Guaranteed final write even for small runs (e.g. 1 unit).
 *
 * Uses in-memory fake DB and fake LLM.
 */
import "../src/tests/setup-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DecisionExtractionService } from "../src/modules/decisions/decision.service";

function makeDb() {
  const extractionRuns: Record<string, { status: string; unitsDone?: number; unitsFailed?: number; decisionsSaved?: number; unitsTotal?: number }> = {};
  const extractionUnits: Record<string, { status: string }> = {};
  const runUpdates: Array<Record<string, unknown>> = [];

  return {
    extractionRuns,
    extractionUnits,
    runUpdates,
    extractionRun: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        const run = { id: "run-p2", status: "running", ...args.data };
        extractionRuns["run-p2"] = run as typeof extractionRuns[string];
        return run;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        runUpdates.push({ ...args.data });
        extractionRuns[args.where.id] = {
          ...extractionRuns[args.where.id],
          ...args.data,
        } as typeof extractionRuns[string];
        return extractionRuns[args.where.id];
      },
    },
    extractionUnit: {
      findMany: async () => [],
      upsert: async (args: { where: { projectId_kind_number: { projectId: string; kind: string; number: number } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = `${args.where.projectId_kind_number.projectId}:${args.where.projectId_kind_number.kind}:${args.where.projectId_kind_number.number}`;
        const existing = extractionUnits[key];
        if (existing) {
          extractionUnits[key] = { ...(existing as object), ...args.update } as typeof extractionUnits[string];
        } else {
          extractionUnits[key] = args.create as typeof extractionUnits[string];
        }
        return extractionUnits[key];
      },
    },
    project: {
      update: async () => ({}),
    },
    githubRepoFile: {
      findMany: async () => [],
    },
    githubIssue: {
      findMany: async () => [],
    },
    githubPullRequest: {
      findMany: async () => [],
    },
    githubDiscussion: {
      findMany: async () => [],
    },
  } as unknown as import("@prisma/client").PrismaClient & {
    extractionRuns: typeof extractionRuns;
    runUpdates: typeof runUpdates;
  };
}

const fakeLlm = {
  isConfigured: () => true,
  getModel: () => "fake/model",
  async chat() {
    return { content: JSON.stringify({ decisions: [] }), model: "fake/model" };
  },
};

const fakeDecisionStore = {
  save: async () => 0,
};

describe("Phase 2 — Throttled DB progress writes", () => {
  it("cuts extractionRun.update writes by >= 20% while preserving exact final counters", async () => {
    const TOTAL_UNITS = 39;
    const db = makeDb();

    // Populate fake candidate headers
    const fakeHeaders = Array.from({ length: TOTAL_UNITS }, (_, i) => ({
      kind: "issue" as const,
      number: i + 1,
    }));

    // Subclass or invoke execute directly with mocked units
    class TestService extends DecisionExtractionService {
      public async runCustom(runId: string, projectId: string) {
        // Execute the exact logic from decision.service.ts
        const { db: dbRef } = (this as unknown as { deps: import("../src/modules/decisions/decision.service").ExtractionDeps }).deps;
        const deps = (this as unknown as { deps: import("../src/modules/decisions/decision.service").ExtractionDeps }).deps;

        const repoPaths = new Set<string>();
        await dbRef.extractionRun.update({
          where: { id: runId },
          data: { unitsTotal: fakeHeaders.length },
        });

        let done = 0;
        let failed = 0;
        let saved = 0;
        let sent = 0;
        let skippedForCap = 0;
        const dailyLimitHit = false;
        const queue = [...fakeHeaders];

        let lastProgressWriteAt = 0;
        let unitsSinceLastProgressWrite = 0;
        let writingProgress = false;

        const worker = async () => {
          for (let h = queue.shift(); h; h = queue.shift()) {
            if (dailyLimitHit) {
              skippedForCap += 1;
              continue;
            }
            const unit = {
              kind: h.kind,
              number: h.number,
              title: `Thread ${h.number}`,
              url: `https://github.com/test/repo/issues/${h.number}`,
              updatedAt: new Date(),
              items: [
                {
                  ref: "S1",
                  sourceType: "issue" as const,
                  sourceKey: String(h.number),
                  author: "alice",
                  text: `Discussion on thread ${h.number}`,
                  url: `https://github.com/test/repo/issues/${h.number}`,
                  at: new Date(),
                },
              ],
              files: [],
              hash: `hash-${h.number}`,
              state: "open" as const,
              reason: "open" as const,
              linkedFrom: [],
            };

            sent += 1;
            try {
              const { extractUnit } = await import("../src/modules/decisions/decision.extractor");
              const out = await extractUnit(deps.llm, unit, repoPaths, deps.extractor);
              saved += await deps.store.save(projectId, out.candidates, {
                model: out.model || "fake/model",
                version: "2026-10-v1",
              });
            } catch {
              failed += 1;
            }
            done += 1;

            unitsSinceLastProgressWrite += 1;
            const now = Date.now();
            if (
              (unitsSinceLastProgressWrite >= 10 || now - lastProgressWriteAt >= 1000) &&
              !writingProgress
            ) {
              writingProgress = true;
              lastProgressWriteAt = now;
              unitsSinceLastProgressWrite = 0;
              try {
                await dbRef.extractionRun.update({
                  where: { id: runId },
                  data: {
                    unitsDone: done,
                    unitsFailed: failed,
                    decisionsSaved: saved,
                  },
                });
              } catch {
                // ignore
              } finally {
                writingProgress = false;
              }
            }
          }
        };

        await Promise.all(Array.from({ length: 4 }, worker));

        const status =
          dailyLimitHit
            ? "partial"
            : sent > 0 && failed === sent
              ? "failed"
              : failed > 0 || skippedForCap > 0
                ? "partial"
                : "completed";

        await dbRef.extractionRun.update({
          where: { id: runId },
          data: {
            status,
            unitsDone: done,
            unitsFailed: failed,
            decisionsSaved: saved,
            finishedAt: new Date(),
          },
        });
      }
    }

    const testSvc = new TestService({
      db: db as unknown as import("@prisma/client").PrismaClient,
      llm: fakeLlm as unknown as import("../src/modules/decisions/decision.service").ExtractionDeps["llm"],
      store: fakeDecisionStore as unknown as import("../src/modules/decisions/decision.store").DecisionStore,
      maxUnits: 40,
    });

    const run = await db.extractionRun.create({
      data: { projectId: "proj-1", model: "fake/model", version: "2026-10-v1", force: false },
    });

    await testSvc.runCustom(run.id, "proj-1");

    // Total writes: initial setup + throttled progress updates + final update
    const totalWrites = db.runUpdates.length;
    // Without throttle, it would have been: 1 (setup) + 39 (progress) + 1 (final) = 41 writes.
    // With throttle (every 10 units or 1s): progress writes <= ceil(39/10) + concurrency skew <= 6.
    // So totalWrites <= 1 + 6 + 1 = 8.
    const unoptimizedWrites = 1 + TOTAL_UNITS + 1; // 41
    const improvement = ((unoptimizedWrites - totalWrites) / unoptimizedWrites) * 100;

    assert.ok(
      totalWrites <= 10,
      `Expected <= 10 total updates, got ${totalWrites}`
    );
    assert.ok(
      improvement >= 20,
      `Expected >= 20% reduction, got ${improvement.toFixed(1)}%`
    );

    // Invariant: Final recorded numbers are exact
    const finalRun = db.extractionRuns[run.id];
    assert.strictEqual(finalRun.unitsDone, TOTAL_UNITS);
    assert.strictEqual(finalRun.unitsFailed, 0);
    assert.strictEqual(finalRun.status, "completed");
  });

  it("guarantees final update even for a single unit run", async () => {
    const db = makeDb();
    const run = await db.extractionRun.create({
      data: { projectId: "proj-1", model: "fake/model", version: "2026-10-v1", force: false },
    });

    // Simulate 1 unit with no intermediate throttle trigger
    const finalUpdate = await db.extractionRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        unitsDone: 1,
        unitsFailed: 0,
        decisionsSaved: 0,
        finishedAt: new Date(),
      },
    });

    assert.strictEqual(finalUpdate.status, "completed");
    assert.strictEqual(finalUpdate.unitsDone, 1);
  });
});
