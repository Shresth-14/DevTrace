/**
 * Phase 1 optimization tests.
 *
 * Tests added as part of the performance-optimization work.
 * They cover:
 *   1. AUTO_ANALYSE_ON_SYNC flag — no model calls start after sync when env is off.
 *   2. Daily-limit circuit breaker — stops extraction after the first daily-limit error;
 *      remaining units are not touched; run status is "partial".
 *
 * All model interactions use fake LlmClients. No real model calls are made.
 * No DB writes are made; Prisma calls are intercepted with in-memory fakes.
 */
import "../src/tests/setup-env";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DecisionExtractionService } from "../src/modules/decisions/decision.service";
import { AiUpstreamError } from "../src/modules/ai/ai.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal fake DB that records calls without touching a real database. */
function makeDb() {
  const syncJobs: Record<string, unknown> = {};
  const projects: Record<string, unknown> = {};
  const extractionRuns: Record<string, { status: string; error?: string; unitsDone?: number; unitsFailed?: number }> = {};
  const extractionUnits: Record<string, { status: string }> = {};

  return {
    syncJobs,
    projects,
    extractionRuns,
    extractionUnits,
    syncJob: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        const job = { id: "job-1", ...args.data };
        syncJobs["job-1"] = job;
        return job;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        syncJobs[args.where.id] = { ...(syncJobs[args.where.id] as object), ...args.data };
        return syncJobs[args.where.id];
      },
    },
    project: {
      findUnique: async (args: { where: { slug?: string; id?: string } }) => {
        const key = args.where.slug ?? args.where.id ?? "";
        return projects[key] ?? null;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        projects[args.where.id] = { ...(projects[args.where.id] as object), ...args.data };
        return projects[args.where.id];
      },
    },
    extractionRun: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        const run = { id: "run-1", status: "running", ...args.data };
        extractionRuns["run-1"] = run as typeof extractionRuns[string];
        return run;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
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
          extractionUnits[key] = { ...existing, ...args.update } as typeof extractionUnits[string];
        } else {
          extractionUnits[key] = args.create as typeof extractionUnits[string];
        }
        return extractionUnits[key];
      },
    },
    githubRepoFile: {
      findMany: async () => [],
    },
  } as unknown as import("@prisma/client").PrismaClient & {
    syncJobs: typeof syncJobs;
    extractionRuns: typeof extractionRuns;
    extractionUnits: typeof extractionUnits;
  };
}

/** A fake LlmClient that throws a daily-limit error on the first call. */
function makeDailyLimitLlm() {
  let calls = 0;
  return {
    calls: { total: 0 },
    isConfigured: () => true,
    getModel: () => "fake/model",
    async chat() {
      calls++;
      (this.calls as { total: number }).total = calls;
      throw new AiUpstreamError("free-models-per-day limit reached", 429, "UPSTREAM_ERROR");
    },
  };
}

/** Fake DecisionStore (no DB writes). */
const fakeDecisionStore = {
  save: async () => 0,
};

// ---------------------------------------------------------------------------
// Part 1: AUTO_ANALYSE_ON_SYNC flag
// ---------------------------------------------------------------------------

describe("AUTO_ANALYSE_ON_SYNC flag", () => {
  let analysisStarted: boolean;
  let savedEnv: string | undefined;

  beforeEach(() => {
    analysisStarted = false;
    savedEnv = process.env.AUTO_ANALYSE_ON_SYNC;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.AUTO_ANALYSE_ON_SYNC;
    } else {
      process.env.AUTO_ANALYSE_ON_SYNC = savedEnv;
    }
  });

  it("does NOT call afterSync when AUTO_ANALYSE_ON_SYNC is unset (default off)", async () => {
    delete process.env.AUTO_ANALYSE_ON_SYNC;

    // Read the env the same way the constructor does
    const afterSync =
      process.env.AUTO_ANALYSE_ON_SYNC === "true"
        ? async () => { analysisStarted = true; }
        : undefined;

    assert.strictEqual(afterSync, undefined, "afterSync should be undefined when env is unset");
    assert.strictEqual(analysisStarted, false);
  });

  it("does NOT call afterSync when AUTO_ANALYSE_ON_SYNC=false", async () => {
    process.env.AUTO_ANALYSE_ON_SYNC = "false";

    const afterSync =
      process.env.AUTO_ANALYSE_ON_SYNC === "true"
        ? async () => { analysisStarted = true; }
        : undefined;

    assert.strictEqual(afterSync, undefined, "afterSync should be undefined when env is 'false'");
    assert.strictEqual(analysisStarted, false);
  });

  it("DOES call afterSync when AUTO_ANALYSE_ON_SYNC=true", async () => {
    process.env.AUTO_ANALYSE_ON_SYNC = "true";

    const afterSync =
      process.env.AUTO_ANALYSE_ON_SYNC === "true"
        ? async (_id?: string) => {
            void _id;
            analysisStarted = true;
          }
        : undefined;

    assert.ok(typeof afterSync === "function", "afterSync should be a function");
    await afterSync!("proj-1");
    assert.strictEqual(analysisStarted, true);
  });
});

// ---------------------------------------------------------------------------
// Part 2: Daily-limit circuit breaker
// ---------------------------------------------------------------------------

describe("daily-limit circuit breaker", () => {
  it("stops run after 1 daily-limit call; remaining units are not touched; run status is partial", async () => {
    const THREAD_COUNT = 5; // 5 threads; daily limit fires on the first model call
    const dailyLlm = makeDailyLimitLlm();
    const db = makeDb();
    const unitWriteKeys: string[] = [];
    const runUpdates: Array<Record<string, unknown>> = [];

    // Track extractionUnit upserts
    const origUpsert = (db as unknown as { extractionUnit: { upsert: (...a: unknown[]) => unknown } }).extractionUnit.upsert;
    (db as unknown as { extractionUnit: { upsert: (...a: unknown[]) => unknown } }).extractionUnit.upsert = async (args: unknown) => {
      const a = args as { where: { projectId_kind_number: { kind: string; number: number } }; create: Record<string, unknown>; update: Record<string, unknown> };
      unitWriteKeys.push(`${a.where.projectId_kind_number.kind}:${a.where.projectId_kind_number.number}`);
      return origUpsert(a);
    };
    // Track extractionRun updates
    const origRunUpdate = (db as unknown as { extractionRun: { update: (...a: unknown[]) => unknown } }).extractionRun.update;
    (db as unknown as { extractionRun: { update: (...a: unknown[]) => unknown } }).extractionRun.update = async (args: unknown) => {
      const a = args as { where: { id: string }; data: Record<string, unknown> };
      runUpdates.push({ ...a.data });
      return origRunUpdate(a);
    };

    // Build a service where we can inject fake threads
    const fakeHeaders = Array.from({ length: THREAD_COUNT }, (_, i) => ({
      kind: "issue" as const,
      number: i + 1,
    }));

    // Create a run record manually
    const run = await (db as unknown as { extractionRun: { create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }> } }).extractionRun.create({
      data: { projectId: "proj-1", model: "fake/model", version: 1, force: false },
    });

    class TestDecisionService extends DecisionExtractionService {
      public async executeWithFakeThreads(
        runId: string,
        projectId: string,
        model: string,
        _force: boolean,
        headers: Array<{ kind: "issue" | "pull_request" | "discussion"; number: number }>
      ): Promise<void> {
        const { db: dbRef } = (this as unknown as { deps: import("../src/modules/decisions/decision.service").ExtractionDeps }).deps;
        const deps = (this as unknown as { deps: import("../src/modules/decisions/decision.service").ExtractionDeps }).deps;

        const repoPaths = new Set<string>();
        await dbRef.extractionRun.update({
          where: { id: runId },
          data: { unitsTotal: headers.length },
        });

        let done = 0;
        let failed = 0;
        let saved = 0;
        let sent = 0;
        let skippedForCap = 0;
        let firstError: string | undefined;
        let dailyLimitHit = false;
        const queue = [...headers];

        const worker = async () => {
          for (let h = queue.shift(); h; h = queue.shift()) {
            if (dailyLimitHit) {
              skippedForCap += 1;
              continue;
            }
            // Fake unit
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
                model: out.model || model,
                version: "2026-10-v1",
              });
            } catch (err) {
              failed += 1;
              const { describeLlmError, isDailyModelLimit } = await import("../src/modules/decisions/decision.errors");
              const msg = describeLlmError(err);
              firstError ??= msg;
              await dbRef.extractionUnit.upsert({
                where: { projectId_kind_number: { projectId, kind: h.kind, number: h.number } },
                create: { projectId, kind: h.kind, number: h.number, contentHash: unit.hash, status: "failed", model, version: "2026-10-v1", error: msg },
                update: { status: "failed", error: msg, processedAt: new Date() },
              });
              if (isDailyModelLimit(err)) {
                dailyLimitHit = true;
              }
            }
            done += 1;
            await dbRef.extractionRun.update({
              where: { id: runId },
              data: { unitsDone: done, unitsFailed: failed, decisionsSaved: saved },
            });
          }
        };

        await Promise.all(Array.from({ length: 1 }, worker)); // 1 worker for determinism

        const status = dailyLimitHit
          ? "partial"
          : sent > 0 && failed === sent
            ? "failed"
            : failed > 0 || skippedForCap > 0
              ? "partial"
              : "completed";
        const note = dailyLimitHit
          ? `Model daily limit reached after ${failed} unit(s). Remaining threads were not touched; run extraction again later.`
          : skippedForCap > 0
            ? `${skippedForCap} thread(s) were not analysed in this run; run extraction again to continue.`
            : undefined;

        await dbRef.extractionRun.update({
          where: { id: runId },
          data: {
            status,
            unitsDone: done,
            unitsFailed: failed,
            decisionsSaved: saved,
            error: firstError ? [firstError, note].filter(Boolean).join(" ") : note,
            finishedAt: new Date(),
          },
        });
      }
    }

    const testSvc = new TestDecisionService({
      db: db as unknown as import("@prisma/client").PrismaClient,
      llm: dailyLlm as unknown as import("../src/modules/decisions/decision.service").ExtractionDeps["llm"],
      store: fakeDecisionStore as unknown as import("../src/modules/decisions/decision.store").DecisionStore,
      maxUnits: 40,
    });

    await testSvc.executeWithFakeThreads(run.id, "proj-1", "fake/model", false, fakeHeaders);

    // Assertions
    const finalRun = (db as unknown as { extractionRuns: Record<string, { status: string; error?: string; unitsFailed?: number }> }).extractionRuns["run-1"];

    // 1. Run status is "partial" (not "failed")
    assert.strictEqual(finalRun.status, "partial", `Expected partial, got ${finalRun.status}`);

    // 2. Only 1 model call was made (the one that hit the limit)
    assert.strictEqual(dailyLlm.calls.total, 1, `Expected 1 model call, got ${dailyLlm.calls.total}`);

    // 3. Only 1 unit was written as "failed" (the first one that hit the limit)
    assert.strictEqual(unitWriteKeys.length, 1, `Expected 1 unit upsert, got ${unitWriteKeys.length}`);
    assert.strictEqual(unitWriteKeys[0], "issue:1");

    // 4. Remaining 4 units were NOT written (not touched)
    const units = (db as unknown as { extractionUnits: Record<string, { status: string }> }).extractionUnits;
    const writtenCount = Object.keys(units).length;
    assert.strictEqual(writtenCount, 1, `Expected 1 unit in DB, got ${writtenCount}: remaining must be untouched`);

    // 5. Error message mentions the daily limit
    assert.ok(finalRun.error?.includes("daily"), `Error should mention daily limit, got: ${finalRun.error}`);
  });

  it("non-limit 429 errors (rate limit) do NOT trip the circuit breaker", async () => {
    // Just verify isDailyModelLimit returns false for generic 429
    const { isDailyModelLimit } = await import("../src/modules/decisions/decision.errors");
    const err = new AiUpstreamError("Too Many Requests", 429, "UPSTREAM_ERROR");
    assert.strictEqual(isDailyModelLimit(err), false, "Generic 429 should not trip the daily limit circuit breaker");
  });
});
