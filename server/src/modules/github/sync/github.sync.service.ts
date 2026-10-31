import type { Octokit } from "octokit";
import { prisma } from "../../../database";
import {
  createThrottledUserOctokit,
  getInstallationOctokit,
} from "../github.octokit";
import { githubAuthService } from "../github.auth.service";
import { decisionExtractionService } from "../../decisions/decision.service";
import { githubRepositoryService } from "../github.repository.service";
import { HttpError } from "../../../utils/http-error";
import { SyncAccessError, describeError } from "./github.errors";
import { runSync, type ImportLimits } from "./github.sync.runner";
import { PrismaSyncStore } from "./github.sync.store";
import type { SyncStore } from "./github.sync.types";
import type { Prisma, PrismaClient, SyncJob } from "@prisma/client";

export { HttpError };

// A "running" job older than this is assumed dead (e.g. the server restarted).
const STALE_JOB_MS = 30 * 60 * 1000;

export const SOURCE_RESOURCES = [
  "issues",
  "issue-comments",
  "pull-requests",
  "pr-comments",
  "reviews",
  "review-comments",
  "pr-files",
  "commits",
  "discussions",
  "discussion-comments",
  "files",
] as const;
export type SourceResource = (typeof SOURCE_RESOURCES)[number];

export function isSourceResource(v: string): v is SourceResource {
  return (SOURCE_RESOURCES as readonly string[]).includes(v);
}

export interface SyncDeps {
  db: PrismaClient;
  /** Called after a sync that imported data, e.g. to start AI extraction. */
  afterSync?: (projectId: string) => Promise<unknown>;
  store: SyncStore;
  /**
   * Client for a project's import: the GitHub App installation when the project has
   * one, otherwise the owner's own GitHub token (public repositories added by URL).
   */
  getOctokit: (ctx: {
    installationId: bigint | null;
    userId: string;
  }) => Promise<Octokit>;
  limits?: Partial<ImportLimits>;
}

/** Import caps keep a first sync of a very large public repository quick. */
export function defaultImportLimits(): ImportLimits {
  const n = Number(process.env.IMPORT_MAX_ITEMS);
  const threads = Number.isInteger(n) && n > 0 ? n : 500;
  return {
    issues: threads,
    pullRequests: threads,
    discussions: Math.min(threads, 100),
    commits: 300,
    referenced: 60,
  };
}

export class GithubSyncService {
  constructor(
    private readonly deps: SyncDeps = {
      db: prisma,
      // AUTO_ANALYSE_ON_SYNC=true is required to start AI extraction after sync.
      // Default is off to avoid running heavy bulk inference unprompted on
      // every import. Set AUTO_ANALYSE_ON_SYNC=true in server/.env to enable.
      afterSync:
        process.env.AUTO_ANALYSE_ON_SYNC === "true"
          ? (id) => decisionExtractionService.requestRun(id)
          : undefined,
      store: new PrismaSyncStore(prisma),
      getOctokit: async ({ installationId, userId }) =>
        installationId
          ? getInstallationOctokit(installationId)
          : createThrottledUserOctokit(
              await githubAuthService.getValidAccessToken(userId)
            ),
    }
  ) {}

  /** Loads a project and enforces that `userId` owns it. */
  public async requireOwnedProject(slug: string, userId: string) {
    const project = await this.deps.db.project.findUnique({
      where: { slug },
      include: { installation: true },
    });
    if (!project) throw new HttpError(404, "Project not found.");
    if (project.userId !== userId) {
      throw new HttpError(403, "You do not have access to this project.");
    }
    return project;
  }

  /**
   * Creates a sync job and runs it in the background. Returns immediately.
   */
  public async startSync(
    slug: string,
    userId: string,
    opts: { full?: boolean; trigger?: "initial" | "manual" } = {}
  ): Promise<SyncJob> {
    const project = await this.requireOwnedProject(slug, userId);
    const running = await this.deps.db.syncJob.findFirst({
      where: {
        projectId: project.id,
        status: "running",
        startedAt: { gt: new Date(Date.now() - STALE_JOB_MS) },
      },
    });
    if (running) {
      throw new HttpError(409, "A synchronization is already running.");
    }

    const mode = opts.full || !project.lastSyncedAt ? "full" : "incremental";
    const job = await this.deps.db.syncJob.create({
      data: {
        projectId: project.id,
        trigger: opts.trigger ?? "manual",
        mode,
        status: "running",
      },
    });
    await this.deps.db.project.update({
      where: { id: project.id },
      data: { syncStatus: "running" },
    });

    const target = {
      id: project.id,
      owner: project.githubRepoOwner,
      repo: project.githubRepoName,
      defaultBranch: project.defaultBranch,
    };
    void this.execute(
      job.id,
      target,
      {
        installationId: project.installation?.installationId ?? null,
        userId: project.userId,
      },
      mode
    );
    return job;
  }

  /** Runs one job to completion. Never throws; failures are recorded on the job. */
  public async execute(
    jobId: string,
    project: { id: string; owner: string; repo: string; defaultBranch: string },
    ctx: { installationId: bigint | null; userId: string },
    mode: "full" | "incremental"
  ): Promise<void> {
    // Analysis starts as soon as the discussion threads are stored, not when the
    // whole import (commit history etc.) has finished.
    let analysisStarted = false;
    const startAnalysis = async () => {
      if (!this.deps.afterSync) return;
      analysisStarted = true;
      await this.deps.afterSync(project.id).catch((err) =>
        // "not configured" and "already running" are reported through aiStatus / the API
        console.warn(
          "[GitHub Sync] AI extraction not started:",
          err instanceof Error ? err.message : err
        )
      );
    };

    try {
      const octokit = await this.deps.getOctokit(ctx);
      const out = await runSync({
        octokit,
        store: this.deps.store,
        project,
        mode,
        limits: this.deps.limits ?? defaultImportLimits(),
        onThreadsReady: startAnalysis,
        // Live progress: the project page shows each resource as it finishes.
        onProgress: async (resources) => {
          await this.deps.db.syncJob.update({
            where: { id: jobId },
            data: { resources: resources as unknown as Prisma.InputJsonValue },
          });
        },
      });
      await this.deps.db.syncJob.update({
        where: { id: jobId },
        data: {
          status: out.status,
          resources: out.resources as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      await this.deps.db.project.update({
        where: { id: project.id },
        data: {
          syncStatus: out.status,
          ...(out.status !== "failed" ? { lastSyncedAt: new Date() } : {}),
        },
      });
      // Normally already started by onThreadsReady; this covers a run that never got there.
      if (out.status !== "failed" && !analysisStarted) await startAnalysis();
    } catch (err) {
      const message =
        err instanceof SyncAccessError ? err.message : describeError(err);
      console.error(`[GitHub Sync] Job ${jobId} failed: ${message}`);
      await this.deps.db.syncJob
        .update({
          where: { id: jobId },
          data: { status: "failed", error: message, finishedAt: new Date() },
        })
        .catch(() => undefined);
      await this.deps.db.project
        .update({ where: { id: project.id }, data: { syncStatus: "failed" } })
        .catch(() => undefined);
    }
  }

  /** Disconnects a project. Imported records and decisions are removed with it (FK cascade). */
  public async deleteProject(slug: string, userId: string): Promise<void> {
    const project = await this.requireOwnedProject(slug, userId);
    await this.deps.db.project.delete({ where: { id: project.id } });
    githubRepositoryService.invalidateCache(userId);
  }

  public async getStatus(slug: string, userId: string) {
    const project = await this.requireOwnedProject(slug, userId);
    const latestJob = await this.deps.db.syncJob.findFirst({
      where: { projectId: project.id },
      orderBy: { startedAt: "desc" },
    });
    const latestRun = await this.deps.db.extractionRun.findFirst({
      where: { projectId: project.id },
      orderBy: { startedAt: "desc" },
    });
    return {
      syncStatus: project.syncStatus,
      lastSyncedAt: project.lastSyncedAt,
      latestJob,
      aiStatus: project.aiStatus,
      lastExtractedAt: project.lastExtractedAt,
      latestRun,
    };
  }

  public async listSource(
    slug: string,
    userId: string,
    resource: SourceResource,
    page: number,
    perPage: number
  ) {
    const project = await this.requireOwnedProject(slug, userId);
    const where = { projectId: project.id };
    const skip = (page - 1) * perPage;
    const take = perPage;
    const db = this.deps.db;

    const reads: Record<SourceResource, () => Promise<[unknown[], number]>> = {
      issues: () =>
        Promise.all([
          db.githubIssue.findMany({
            where,
            orderBy: { number: "desc" },
            skip,
            take,
          }),
          db.githubIssue.count({ where }),
        ]),
      "issue-comments": () =>
        Promise.all([
          db.githubIssueComment.findMany({
            where,
            orderBy: { createdAtGh: "asc" },
            skip,
            take,
          }),
          db.githubIssueComment.count({ where }),
        ]),
      "pull-requests": () =>
        Promise.all([
          db.githubPullRequest.findMany({
            where,
            orderBy: { number: "desc" },
            skip,
            take,
          }),
          db.githubPullRequest.count({ where }),
        ]),
      "pr-comments": () =>
        Promise.all([
          db.githubPrComment.findMany({
            where,
            orderBy: { createdAtGh: "asc" },
            skip,
            take,
          }),
          db.githubPrComment.count({ where }),
        ]),
      reviews: () =>
        Promise.all([
          db.githubPrReview.findMany({
            where,
            orderBy: { submittedAt: "asc" },
            skip,
            take,
          }),
          db.githubPrReview.count({ where }),
        ]),
      "review-comments": () =>
        Promise.all([
          db.githubReviewComment.findMany({
            where,
            orderBy: { createdAtGh: "asc" },
            skip,
            take,
          }),
          db.githubReviewComment.count({ where }),
        ]),
      "pr-files": () =>
        Promise.all([
          db.githubPrFile.findMany({
            where,
            orderBy: [{ prNumber: "desc" }, { filename: "asc" }],
            skip,
            take,
          }),
          db.githubPrFile.count({ where }),
        ]),
      commits: () =>
        Promise.all([
          db.githubCommit.findMany({
            where,
            orderBy: { committedAt: "desc" },
            skip,
            take,
          }),
          db.githubCommit.count({ where }),
        ]),
      discussions: () =>
        Promise.all([
          db.githubDiscussion.findMany({
            where,
            orderBy: { number: "desc" },
            skip,
            take,
          }),
          db.githubDiscussion.count({ where }),
        ]),
      "discussion-comments": () =>
        Promise.all([
          db.githubDiscussionComment.findMany({
            where,
            orderBy: { createdAtGh: "asc" },
            skip,
            take,
          }),
          db.githubDiscussionComment.count({ where }),
        ]),
      files: () =>
        Promise.all([
          db.githubRepoFile.findMany({
            where,
            orderBy: { path: "asc" },
            skip,
            take,
          }),
          db.githubRepoFile.count({ where }),
        ]),
    };

    const [items, total] = await reads[resource]();
    return {
      items,
      total,
      page,
      perPage,
      hasMore: skip + items.length < total,
    };
  }
}

export const githubSyncService = new GithubSyncService();
