import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../database";
import { HttpError } from "../../utils/http-error";
import { openRouterService } from "../ai/openrouter.service";
import { describeLlmError } from "./decision.errors";
import {
  extractUnit,
  type ExtractorOptions,
  type LlmClient,
} from "./decision.extractor";
import { DecisionStore } from "./decision.store";
import { EXTRACTION_VERSION } from "./decision.types";
import { listCandidateThreads, loadUnit } from "./decision.units";

// A "running" extraction older than this is assumed dead (server restart etc.).
const STALE_RUN_MS = 60 * 60 * 1000;
const CONCURRENCY = 4;
/** Max threads sent to the model per run; re-running continues where it stopped. */
const DEFAULT_MAX_UNITS = 40;

export interface ExtractionDeps {
  db: PrismaClient;
  llm: LlmClient & { isConfigured(): boolean; getModel(): string };
  store: DecisionStore;
  extractor: ExtractorOptions;
  maxUnits: number;
}

export class DecisionExtractionService {
  private readonly deps: ExtractionDeps;

  constructor(deps?: Partial<ExtractionDeps>) {
    const db = deps?.db ?? prisma;
    this.deps = {
      db,
      llm: deps?.llm ?? openRouterService,
      store: deps?.store ?? new DecisionStore(db),
      extractor: deps?.extractor ?? {},
      maxUnits:
        deps?.maxUnits ??
        (Number(process.env.EXTRACTION_MAX_UNITS) || DEFAULT_MAX_UNITS),
    };
  }

  /** Projects that asked for a run while one was already running (new threads arrived). */
  private readonly pendingRerun = new Set<string>();

  /**
   * Starts analysis, or, if one is already running, makes sure another follows it:
   * threads stored while the first run was in progress would otherwise be missed.
   */
  public async requestRun(projectId: string) {
    try {
      return await this.startForProject(projectId);
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) {
        this.pendingRerun.add(projectId);
        return null;
      }
      throw err;
    }
  }

  public isConfigured(): boolean {
    return this.deps.llm.isConfigured();
  }

  /** Starts a run in the background. `ownerId` is checked by the caller-facing method. */
  public async start(
    slug: string,
    userId: string,
    opts: { force?: boolean } = {}
  ) {
    const project = await this.deps.db.project.findUnique({ where: { slug } });
    if (!project) throw new HttpError(404, "Project not found.");
    if (project.userId !== userId) {
      throw new HttpError(403, "You do not have access to this project.");
    }
    return this.startForProject(project.id, opts);
  }

  public async startForProject(
    projectId: string,
    opts: { force?: boolean } = {}
  ) {
    if (!this.isConfigured()) {
      await this.deps.db.project.update({
        where: { id: projectId },
        data: { aiStatus: "not_configured" },
      });
      throw new HttpError(
        503,
        "AI extraction is not configured. Set OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL / OPENROUTER_BASE_URL) in server/.env."
      );
    }
    const running = await this.deps.db.extractionRun.findFirst({
      where: {
        projectId,
        status: "running",
        startedAt: { gt: new Date(Date.now() - STALE_RUN_MS) },
      },
    });
    if (running) throw new HttpError(409, "AI extraction is already running.");

    const model = this.deps.llm.getModel();
    const run = await this.deps.db.extractionRun.create({
      data: {
        projectId,
        model,
        version: EXTRACTION_VERSION,
        force: opts.force === true,
      },
    });
    await this.deps.db.project.update({
      where: { id: projectId },
      data: { aiStatus: "running" },
    });
    void this.execute(run.id, projectId, model, opts.force === true);
    return run;
  }

  /** Runs one extraction to completion. Never throws; outcome is recorded on the run. */
  public async execute(
    runId: string,
    projectId: string,
    model: string,
    force: boolean
  ): Promise<void> {
    const { db } = this.deps;
    try {
      const headers = await listCandidateThreads(db, projectId);
      const tree = await db.githubRepoFile.findMany({
        where: { projectId, type: "blob" },
        select: { path: true },
      });
      const repoPaths = new Set(tree.map((f) => f.path));
      await db.extractionRun.update({
        where: { id: runId },
        data: { unitsTotal: headers.length },
      });

      const previous = await db.extractionUnit.findMany({
        where: { projectId },
      });
      const prevByKey = new Map(
        previous.map((u) => [`${u.kind}:${u.number}`, u])
      );

      let done = 0;
      let failed = 0;
      let saved = 0;
      let sent = 0;
      let skippedForCap = 0;
      let firstError: string | undefined;
      const queue = [...headers];

      const worker = async () => {
        for (let h = queue.shift(); h; h = queue.shift()) {
          const unit = await loadUnit(db, projectId, h.kind, h.number);
          if (!unit) {
            done += 1;
            continue;
          }
          const key = `${h.kind}:${h.number}`;
          const prev = prevByKey.get(key);
          if (
            !force &&
            prev?.status === "done" &&
            prev.contentHash === unit.hash &&
            prev.version === EXTRACTION_VERSION
          ) {
            done += 1; // unchanged since last analysis
          } else if (sent >= this.deps.maxUnits) {
            skippedForCap += 1;
          } else {
            sent += 1;
            try {
              const out = await extractUnit(
                this.deps.llm,
                unit,
                repoPaths,
                this.deps.extractor
              );
              saved += await this.deps.store.save(projectId, out.candidates, {
                model: out.model || model,
                version: EXTRACTION_VERSION,
              });
              await db.extractionUnit.upsert({
                where: {
                  projectId_kind_number: {
                    projectId,
                    kind: h.kind,
                    number: h.number,
                  },
                },
                create: {
                  projectId,
                  kind: h.kind,
                  number: h.number,
                  contentHash: unit.hash,
                  status: "done",
                  model: out.model || model,
                  version: EXTRACTION_VERSION,
                },
                update: {
                  contentHash: unit.hash,
                  status: "done",
                  error: null,
                  model: out.model || model,
                  version: EXTRACTION_VERSION,
                  processedAt: new Date(),
                },
              });
            } catch (err) {
              failed += 1;
              const msg = describeLlmError(err);
              firstError ??= msg;
              await db.extractionUnit.upsert({
                where: {
                  projectId_kind_number: {
                    projectId,
                    kind: h.kind,
                    number: h.number,
                  },
                },
                create: {
                  projectId,
                  kind: h.kind,
                  number: h.number,
                  contentHash: unit.hash,
                  status: "failed",
                  model,
                  version: EXTRACTION_VERSION,
                  error: msg,
                },
                update: {
                  status: "failed",
                  error: msg,
                  processedAt: new Date(),
                },
              });
            }
            done += 1;
          }
          await db.extractionRun.update({
            where: { id: runId },
            data: {
              unitsDone: done,
              unitsFailed: failed,
              decisionsSaved: saved,
            },
          });
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      const status =
        sent > 0 && failed === sent
          ? "failed"
          : failed > 0 || skippedForCap > 0
            ? "partial"
            : "completed";
      const note =
        skippedForCap > 0
          ? `${skippedForCap} thread(s) were not analysed in this run; run extraction again to continue.`
          : undefined;
      await db.extractionRun.update({
        where: { id: runId },
        data: {
          status,
          unitsDone: done,
          unitsFailed: failed,
          decisionsSaved: saved,
          error: firstError
            ? [firstError, note].filter(Boolean).join(" ")
            : note,
          finishedAt: new Date(),
        },
      });
      await db.project.update({
        where: { id: projectId },
        data: { aiStatus: status, lastExtractedAt: new Date() },
      });
      if (this.pendingRerun.delete(projectId)) {
        // unchanged threads are skipped, so this only analyses what arrived meanwhile
        void this.startForProject(projectId).catch(() => undefined);
      }
    } catch (err) {
      const msg = describeLlmError(err);
      console.error(`[Extraction] Run ${runId} failed: ${msg}`);
      await db.extractionRun
        .update({
          where: { id: runId },
          data: { status: "failed", error: msg, finishedAt: new Date() },
        })
        .catch(() => undefined);
      await db.project
        .update({ where: { id: projectId }, data: { aiStatus: "failed" } })
        .catch(() => undefined);
    }
  }
}

export const decisionExtractionService = new DecisionExtractionService();
