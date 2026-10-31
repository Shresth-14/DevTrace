import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CommentRow,
  FetchReason,
  ReferenceRow,
  ResourceName,
  SyncCursor,
  SyncStore,
  WriteStats,
} from "./github.sync.types";

const REASON_RANK: Record<string, number> = {
  open: 3,
  referenced: 2,
  legacy: 1,
};
/** A thread keeps the strongest reason it was ever imported for (open > referenced > legacy). */
const bestReason = (
  a: string | null | undefined,
  b: string | null | undefined
) =>
  (REASON_RANK[a ?? "legacy"] ?? 1) >= (REASON_RANK[b ?? "legacy"] ?? 1)
    ? (a ?? "legacy")
    : (b ?? "legacy");
const reasonImproves = (incoming: string | undefined, existing: string) =>
  (REASON_RANK[incoming ?? "legacy"] ?? 1) > (REASON_RANK[existing] ?? 1);

const CHUNK = 500;

const same = (a: Date | null | undefined, b: Date | null | undefined) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

interface DiffUpsert<Row, Existing> {
  rows: Row[];
  keyOfRow: (r: Row) => string;
  /** Existing rows for (at most) these incoming rows, with just enough fields to compare. */
  find: (rows: Row[]) => Promise<Existing[]>;
  keyOfExisting: (e: Existing) => string;
  changed: (row: Row, existing: Existing) => boolean;
  /** One multi-row INSERT ... ON CONFLICT DO NOTHING for rows that do not exist yet. */
  create: (rows: Row[]) => Promise<unknown>;
  update: (row: Row, existing: Existing) => Prisma.PrismaPromise<unknown>;
}

/**
 * Prisma-backed store. Instead of one upsert per row, each batch does:
 *   1 SELECT of the existing rows, 1 multi-row INSERT for the new ones, and an
 *   UPDATE only for rows whose content actually changed. Unchanged rows cost nothing,
 *   so re-syncing a repository is almost write-free. Keys are GitHub's stable
 *   identifiers, so repeated or overlapping syncs never create duplicates.
 */
export class PrismaSyncStore implements SyncStore {
  constructor(private readonly db: PrismaClient) {}

  private async diffUpsert<Row, Existing>(
    cfg: DiffUpsert<Row, Existing>
  ): Promise<WriteStats> {
    const stats: WriteStats = { created: 0, updated: 0, unchanged: 0 };
    for (let i = 0; i < cfg.rows.length; i += CHUNK) {
      // last occurrence wins if a batch repeats a key
      const byKey = new Map<string, Row>();
      for (const r of cfg.rows.slice(i, i + CHUNK))
        byKey.set(cfg.keyOfRow(r), r);
      const chunk = [...byKey.values()];
      if (chunk.length === 0) continue;

      const existing = new Map(
        (await cfg.find(chunk)).map((e) => [cfg.keyOfExisting(e), e])
      );
      const fresh: Row[] = [];
      const stale: [Row, Existing][] = [];
      for (const r of chunk) {
        const e = existing.get(cfg.keyOfRow(r));
        if (!e) fresh.push(r);
        else if (cfg.changed(r, e)) stale.push([r, e]);
      }
      if (fresh.length > 0) await cfg.create(fresh);
      if (stale.length > 0) {
        await this.db.$transaction(stale.map(([r, e]) => cfg.update(r, e)));
      }
      stats.created += fresh.length;
      stats.updated += stale.length;
      stats.unchanged += chunk.length - fresh.length - stale.length;
    }
    return stats;
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
    // Resources finish concurrently, so merge atomically instead of read-modify-write.
    await this.db.$executeRaw`
      UPDATE "Project"
      SET "syncCursor" = COALESCE("syncCursor", '{}'::jsonb) || jsonb_build_object(${resource}::text, ${value}::text)
      WHERE "id" = ${projectId}`;
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
    this.diffUpsert({
      rows,
      keyOfRow: (r) => String(r.number),
      find: (c) =>
        this.db.githubIssue.findMany({
          where: { projectId, number: { in: c.map((r) => r.number) } },
          select: { number: true, updatedAtGh: true, fetchReason: true },
        }),
      keyOfExisting: (e) => String(e.number),
      changed: (r, e) =>
        !same(r.updatedAtGh, e.updatedAtGh) ||
        reasonImproves(r.fetchReason, e.fetchReason),
      create: (c) =>
        this.db.githubIssue.createMany({
          data: c.map((r) => ({
            projectId,
            ...r,
            fetchReason: r.fetchReason ?? "legacy",
          })),
          skipDuplicates: true,
        }),
      update: (r, e) =>
        this.db.githubIssue.update({
          where: { projectId_number: { projectId, number: r.number } },
          data: { ...r, fetchReason: bestReason(e.fetchReason, r.fetchReason) },
        }),
    });

  private commentRows = (rows: CommentRow[]) => rows;

  upsertIssueComments: SyncStore["upsertIssueComments"] = (projectId, rows) =>
    this.diffUpsert({
      rows: this.commentRows(rows),
      keyOfRow: (r) => String(r.githubId),
      find: (c) =>
        this.db.githubIssueComment.findMany({
          where: { projectId, githubId: { in: c.map((r) => r.githubId) } },
          select: { githubId: true, updatedAtGh: true },
        }),
      keyOfExisting: (e) => String(e.githubId),
      changed: (r, e) => !same(r.updatedAtGh, e.updatedAtGh),
      create: (c) =>
        this.db.githubIssueComment.createMany({
          data: c.map(({ parentNumber, ...r }) => ({
            projectId,
            ...r,
            issueNumber: parentNumber,
          })),
          skipDuplicates: true,
        }),
      update: ({ parentNumber, ...r }) =>
        this.db.githubIssueComment.update({
          where: { projectId_githubId: { projectId, githubId: r.githubId } },
          data: { ...r, issueNumber: parentNumber },
        }),
    });

  upsertPullRequests: SyncStore["upsertPullRequests"] = (projectId, rows) =>
    this.diffUpsert({
      rows,
      keyOfRow: (r) => String(r.number),
      find: (c) =>
        this.db.githubPullRequest.findMany({
          where: { projectId, number: { in: c.map((r) => r.number) } },
          select: { number: true, updatedAtGh: true, fetchReason: true },
        }),
      keyOfExisting: (e) => String(e.number),
      changed: (r, e) =>
        !same(r.updatedAtGh, e.updatedAtGh) ||
        reasonImproves(r.fetchReason, e.fetchReason),
      create: (c) =>
        this.db.githubPullRequest.createMany({
          data: c.map((r) => ({
            projectId,
            ...r,
            fetchReason: r.fetchReason ?? "legacy",
          })),
          skipDuplicates: true,
        }),
      update: (r, e) =>
        this.db.githubPullRequest.update({
          where: { projectId_number: { projectId, number: r.number } },
          data: { ...r, fetchReason: bestReason(e.fetchReason, r.fetchReason) },
        }),
    });

  upsertPrComments: SyncStore["upsertPrComments"] = (projectId, rows) =>
    this.diffUpsert({
      rows: this.commentRows(rows),
      keyOfRow: (r) => String(r.githubId),
      find: (c) =>
        this.db.githubPrComment.findMany({
          where: { projectId, githubId: { in: c.map((r) => r.githubId) } },
          select: { githubId: true, updatedAtGh: true },
        }),
      keyOfExisting: (e) => String(e.githubId),
      changed: (r, e) => !same(r.updatedAtGh, e.updatedAtGh),
      create: (c) =>
        this.db.githubPrComment.createMany({
          data: c.map(({ parentNumber, ...r }) => ({
            projectId,
            ...r,
            prNumber: parentNumber,
          })),
          skipDuplicates: true,
        }),
      update: ({ parentNumber, ...r }) =>
        this.db.githubPrComment.update({
          where: { projectId_githubId: { projectId, githubId: r.githubId } },
          data: { ...r, prNumber: parentNumber },
        }),
    });

  upsertReviews: SyncStore["upsertReviews"] = (projectId, rows) =>
    this.diffUpsert({
      rows,
      keyOfRow: (r) => String(r.githubId),
      find: (c) =>
        this.db.githubPrReview.findMany({
          where: { projectId, githubId: { in: c.map((r) => r.githubId) } },
          select: { githubId: true, state: true, body: true },
        }),
      keyOfExisting: (e) => String(e.githubId),
      // a review can be dismissed or edited after submission
      changed: (r, e) =>
        r.state !== e.state || (r.body ?? "") !== (e.body ?? ""),
      create: (c) =>
        this.db.githubPrReview.createMany({
          data: c.map((r) => ({ projectId, ...r })),
          skipDuplicates: true,
        }),
      update: (r) =>
        this.db.githubPrReview.update({
          where: { projectId_githubId: { projectId, githubId: r.githubId } },
          data: r,
        }),
    });

  upsertReviewComments: SyncStore["upsertReviewComments"] = (projectId, rows) =>
    this.diffUpsert({
      rows,
      keyOfRow: (r) => String(r.githubId),
      find: (c) =>
        this.db.githubReviewComment.findMany({
          where: { projectId, githubId: { in: c.map((r) => r.githubId) } },
          select: {
            githubId: true,
            updatedAtGh: true,
            isResolved: true,
            threadId: true,
          },
        }),
      keyOfExisting: (e) => String(e.githubId),
      // resolving a thread does not bump the comment's updated_at
      changed: (r, e) =>
        !same(r.updatedAtGh, e.updatedAtGh) ||
        r.isResolved !== e.isResolved ||
        r.threadId !== e.threadId,
      create: (c) =>
        this.db.githubReviewComment.createMany({
          data: c.map((r) => ({ projectId, ...r })),
          skipDuplicates: true,
        }),
      update: (r) =>
        this.db.githubReviewComment.update({
          where: { projectId_githubId: { projectId, githubId: r.githubId } },
          data: r,
        }),
    });

  upsertPrFiles: SyncStore["upsertPrFiles"] = (projectId, rows) =>
    this.diffUpsert({
      rows,
      keyOfRow: (r) => `${r.prNumber}\u0000${r.filename}`,
      find: (c) =>
        this.db.githubPrFile.findMany({
          where: {
            projectId,
            prNumber: { in: [...new Set(c.map((r) => r.prNumber))] },
          },
          select: {
            prNumber: true,
            filename: true,
            status: true,
            additions: true,
            deletions: true,
            previousFilename: true,
            blobSha: true,
          },
        }),
      keyOfExisting: (e) => `${e.prNumber}\u0000${e.filename}`,
      changed: (r, e) =>
        r.status !== e.status ||
        r.additions !== e.additions ||
        r.deletions !== e.deletions ||
        (r.previousFilename ?? null) !== e.previousFilename ||
        (r.blobSha ?? null) !== e.blobSha,
      create: (c) =>
        this.db.githubPrFile.createMany({
          data: c.map((r) => ({ projectId, ...r })),
          skipDuplicates: true,
        }),
      update: (r) =>
        this.db.githubPrFile.update({
          where: {
            projectId_prNumber_filename: {
              projectId,
              prNumber: r.prNumber,
              filename: r.filename,
            },
          },
          data: r,
        }),
    });

  /**
   * Commits and PR-commit links are immutable: only rows that do not exist yet are
   * inserted (one SELECT to find them, one multi-row INSERT for the rest), so a
   * repeated sync issues no write at all.
   */
  async upsertPrCommits(
    projectId: string,
    rows: { prNumber: number; sha: string }[]
  ): Promise<WriteStats> {
    return this.diffUpsert({
      rows,
      keyOfRow: (r) => `${r.prNumber}\u0000${r.sha}`,
      find: (c) =>
        this.db.githubPrCommit.findMany({
          where: {
            projectId,
            prNumber: { in: [...new Set(c.map((r) => r.prNumber))] },
          },
          select: { prNumber: true, sha: true },
        }),
      keyOfExisting: (e) => `${e.prNumber}\u0000${e.sha}`,
      changed: () => false,
      create: (c) =>
        this.db.githubPrCommit.createMany({
          data: c.map((r) => ({ projectId, ...r })),
          skipDuplicates: true,
        }),
      update: () => {
        throw new Error("immutable");
      },
    });
  }

  upsertCommits: SyncStore["upsertCommits"] = (projectId, rows) =>
    this.diffUpsert({
      rows,
      keyOfRow: (r) => r.sha,
      find: (c) =>
        this.db.githubCommit.findMany({
          where: { projectId, sha: { in: c.map((r) => r.sha) } },
          select: { sha: true },
        }),
      keyOfExisting: (e) => e.sha,
      changed: () => false,
      create: (c) =>
        this.db.githubCommit.createMany({
          data: c.map((r) => ({ projectId, ...r })),
          skipDuplicates: true,
        }),
      update: () => {
        throw new Error("immutable");
      },
    });

  upsertDiscussions: SyncStore["upsertDiscussions"] = (projectId, rows) =>
    this.diffUpsert({
      rows,
      keyOfRow: (r) => String(r.number),
      find: (c) =>
        this.db.githubDiscussion.findMany({
          where: { projectId, number: { in: c.map((r) => r.number) } },
          select: { number: true, updatedAtGh: true },
        }),
      keyOfExisting: (e) => String(e.number),
      changed: (r, e) => !same(r.updatedAtGh, e.updatedAtGh),
      create: (c) =>
        this.db.githubDiscussion.createMany({
          data: c.map((r) => ({ projectId, ...r })),
          skipDuplicates: true,
        }),
      update: (r) =>
        this.db.githubDiscussion.update({
          where: { projectId_number: { projectId, number: r.number } },
          data: r,
        }),
    });

  upsertDiscussionComments: SyncStore["upsertDiscussionComments"] = (
    projectId,
    rows
  ) =>
    this.diffUpsert({
      rows,
      keyOfRow: (r) => r.githubNodeId,
      find: (c) =>
        this.db.githubDiscussionComment.findMany({
          where: {
            projectId,
            githubNodeId: { in: c.map((r) => r.githubNodeId) },
          },
          select: { githubNodeId: true, updatedAtGh: true },
        }),
      keyOfExisting: (e) => e.githubNodeId,
      changed: (r, e) => !same(r.updatedAtGh, e.updatedAtGh),
      create: (c) =>
        this.db.githubDiscussionComment.createMany({
          data: c.map((r) => ({ projectId, ...r })),
          skipDuplicates: true,
        }),
      update: (r) =>
        this.db.githubDiscussionComment.update({
          where: {
            projectId_githubNodeId: {
              projectId,
              githubNodeId: r.githubNodeId,
            },
          },
          data: r,
        }),
    });

  upsertRepoFilesOnly: SyncStore["upsertRepoFilesOnly"] = (projectId, rows) =>
    this.diffUpsert({
      rows,
      keyOfRow: (r) => r.path,
      find: (c) =>
        this.db.githubRepoFile.findMany({
          where: { projectId, path: { in: c.map((r) => r.path) } },
          select: { path: true, sha: true },
        }),
      keyOfExisting: (e) => e.path,
      changed: (r, e) => r.sha !== e.sha,
      create: (c) =>
        this.db.githubRepoFile.createMany({
          data: c.map((r) => ({ projectId, ...r })),
          skipDuplicates: true,
        }),
      update: (r) =>
        this.db.githubRepoFile.update({
          where: { projectId_path: { projectId, path: r.path } },
          data: r,
        }),
    });

  upsertReferences = (projectId: string, rows: ReferenceRow[]) =>
    this.diffUpsert({
      rows,
      keyOfRow: (r) => `${r.fromKind}:${r.fromNumber}:${r.toNumber}:${r.basis}`,
      find: (c) =>
        this.db.threadReference.findMany({
          where: {
            projectId,
            fromNumber: { in: [...new Set(c.map((r) => r.fromNumber))] },
          },
          select: {
            fromKind: true,
            fromNumber: true,
            toNumber: true,
            basis: true,
          },
        }),
      keyOfExisting: (e) =>
        `${e.fromKind}:${e.fromNumber}:${e.toNumber}:${e.basis}`,
      changed: () => false,
      create: (c) =>
        this.db.threadReference.createMany({
          data: c.map((r) => ({ projectId, ...r, relationship: "direct" })),
          skipDuplicates: true,
        }),
      update: () => {
        throw new Error("immutable");
      },
    });

  async listOpenNumbers(projectId: string) {
    const [issues, prs] = await Promise.all([
      this.db.githubIssue.findMany({
        where: { projectId, state: "open" },
        select: { number: true },
      }),
      this.db.githubPullRequest.findMany({
        where: { projectId, state: "open" },
        select: { number: true },
      }),
    ]);
    return {
      issues: issues.map((i) => i.number),
      pullRequests: prs.map((p) => p.number),
    };
  }

  async findStored(
    projectId: string,
    kind: "issue" | "pull_request",
    numbers: number[]
  ): Promise<Map<number, FetchReason>> {
    if (numbers.length === 0) return new Map();
    const where = { projectId, number: { in: numbers } };
    const select = { number: true, fetchReason: true } as const;
    const rows =
      kind === "issue"
        ? await this.db.githubIssue.findMany({ where, select })
        : await this.db.githubPullRequest.findMany({ where, select });
    return new Map(rows.map((r) => [r.number, r.fetchReason as FetchReason]));
  }

  async markReferenced(
    projectId: string,
    kind: "issue" | "pull_request",
    numbers: number[]
  ): Promise<void> {
    if (numbers.length === 0) return;
    const where = {
      projectId,
      number: { in: numbers },
      fetchReason: "legacy",
    };
    const data = { fetchReason: "referenced" };
    if (kind === "issue") await this.db.githubIssue.updateMany({ where, data });
    else await this.db.githubPullRequest.updateMany({ where, data });
  }

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
    for (let i = 0; i < stale.length; i += CHUNK) {
      await this.db.githubRepoFile.deleteMany({
        where: { projectId, path: { in: stale.slice(i, i + CHUNK) } },
      });
    }
  }
}
