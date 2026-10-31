import { Prisma, PrismaClient } from "@prisma/client";
import type { ResourceName, SyncCursor, SyncStore } from "./github.sync.types";

const CHUNK = 100;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK)
    out.push(rows.slice(i, i + CHUNK));
  return out;
}

/**
 * Prisma-backed store. Every write is an upsert on GitHub's stable identifiers,
 * batched in transactions, so repeated syncs never create duplicates.
 */
export class PrismaSyncStore implements SyncStore {
  constructor(private readonly db: PrismaClient) {}

  private async run(ops: Prisma.PrismaPromise<unknown>[][]): Promise<void> {
    for (const batch of ops) {
      if (batch.length > 0) await this.db.$transaction(batch);
    }
  }

  async getCursor(projectId: string): Promise<SyncCursor> {
    const p = await this.db.project.findUnique({
      where: { id: projectId },
      select: { syncCursor: true },
    });
    const c = p?.syncCursor;
    return c && typeof c === "object" && !Array.isArray(c)
      ? (c as SyncCursor)
      : {};
  }

  async setCursor(
    projectId: string,
    resource: ResourceName,
    value: string
  ): Promise<void> {
    const current = await this.getCursor(projectId);
    await this.db.project.update({
      where: { id: projectId },
      data: { syncCursor: { ...current, [resource]: value } },
    });
  }

  async getKnownNumbers(projectId: string) {
    const [issues, prs] = await Promise.all([
      this.db.githubIssue.findMany({
        where: { projectId },
        select: { number: true },
      }),
      this.db.githubPullRequest.findMany({
        where: { projectId },
        select: { number: true },
      }),
    ]);
    return {
      issues: new Set(issues.map((i) => i.number)),
      pullRequests: new Set(prs.map((p) => p.number)),
    };
  }

  upsertIssues: SyncStore["upsertIssues"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) =>
          this.db.githubIssue.upsert({
            where: { projectId_number: { projectId, number: r.number } },
            create: { projectId, ...r },
            update: r,
          })
        )
      )
    );

  upsertIssueComments: SyncStore["upsertIssueComments"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) => {
          const { parentNumber, ...rest } = r;
          const data = { ...rest, issueNumber: parentNumber };
          return this.db.githubIssueComment.upsert({
            where: { projectId_githubId: { projectId, githubId: r.githubId } },
            create: { projectId, ...data },
            update: data,
          });
        })
      )
    );

  upsertPullRequests: SyncStore["upsertPullRequests"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) =>
          this.db.githubPullRequest.upsert({
            where: { projectId_number: { projectId, number: r.number } },
            create: { projectId, ...r },
            update: r,
          })
        )
      )
    );

  upsertPrComments: SyncStore["upsertPrComments"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) => {
          const { parentNumber, ...rest } = r;
          const data = { ...rest, prNumber: parentNumber };
          return this.db.githubPrComment.upsert({
            where: { projectId_githubId: { projectId, githubId: r.githubId } },
            create: { projectId, ...data },
            update: data,
          });
        })
      )
    );

  upsertReviews: SyncStore["upsertReviews"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) =>
          this.db.githubPrReview.upsert({
            where: { projectId_githubId: { projectId, githubId: r.githubId } },
            create: { projectId, ...r },
            update: r,
          })
        )
      )
    );

  upsertReviewComments: SyncStore["upsertReviewComments"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) =>
          this.db.githubReviewComment.upsert({
            where: { projectId_githubId: { projectId, githubId: r.githubId } },
            create: { projectId, ...r },
            update: r,
          })
        )
      )
    );

  upsertPrFiles: SyncStore["upsertPrFiles"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) =>
          this.db.githubPrFile.upsert({
            where: {
              projectId_prNumber_filename: {
                projectId,
                prNumber: r.prNumber,
                filename: r.filename,
              },
            },
            create: { projectId, ...r },
            update: r,
          })
        )
      )
    );

  upsertPrCommits: SyncStore["upsertPrCommits"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) =>
          this.db.githubPrCommit.upsert({
            where: {
              projectId_prNumber_sha: {
                projectId,
                prNumber: r.prNumber,
                sha: r.sha,
              },
            },
            create: { projectId, ...r },
            update: {},
          })
        )
      )
    );

  upsertCommits: SyncStore["upsertCommits"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) =>
          this.db.githubCommit.upsert({
            where: { projectId_sha: { projectId, sha: r.sha } },
            create: { projectId, ...r },
            update: r,
          })
        )
      )
    );

  upsertDiscussions: SyncStore["upsertDiscussions"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) =>
          this.db.githubDiscussion.upsert({
            where: { projectId_number: { projectId, number: r.number } },
            create: { projectId, ...r },
            update: r,
          })
        )
      )
    );

  upsertDiscussionComments: SyncStore["upsertDiscussionComments"] = (
    projectId,
    rows
  ) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) =>
          this.db.githubDiscussionComment.upsert({
            where: {
              projectId_githubNodeId: {
                projectId,
                githubNodeId: r.githubNodeId,
              },
            },
            create: { projectId, ...r },
            update: r,
          })
        )
      )
    );

  upsertRepoFilesOnly: SyncStore["upsertRepoFilesOnly"] = (projectId, rows) =>
    this.run(
      chunks(rows).map((c) =>
        c.map((r) =>
          this.db.githubRepoFile.upsert({
            where: { projectId_path: { projectId, path: r.path } },
            create: { projectId, ...r },
            update: r,
          })
        )
      )
    );

  async replaceRepoFiles(
    projectId: string,
    rows: Parameters<SyncStore["replaceRepoFiles"]>[1]
  ): Promise<void> {
    await this.upsertRepoFilesOnly(projectId, rows);
    const keep = new Set(rows.map((r) => r.path));
    const existing = await this.db.githubRepoFile.findMany({
      where: { projectId },
      select: { path: true },
    });
    const stale = existing.map((e) => e.path).filter((p) => !keep.has(p));
    for (const c of chunks(stale)) {
      await this.db.githubRepoFile.deleteMany({
        where: { projectId, path: { in: c } },
      });
    }
  }
}
