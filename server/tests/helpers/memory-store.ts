import type {
  CommentRow,
  CommitRow,
  DiscussionCommentRow,
  DiscussionRow,
  FetchReason,
  IssueRow,
  PrFileRow,
  PullRequestRow,
  RepoFileRow,
  ReviewCommentRow,
  ReviewRow,
  ReferenceRow,
  ResourceName,
  SyncCursor,
  SyncStore,
  WriteStats,
} from "../../src/modules/github/sync/github.sync.types";

const RANK: Record<string, number> = { open: 3, referenced: 2, legacy: 1 };
const sig = (row: unknown) =>
  JSON.stringify(row, (_k, v) => (typeof v === "bigint" ? `${v}n` : v));

/**
 * In-memory SyncStore that enforces the same natural keys as the Prisma unique
 * constraints and reports created/updated/unchanged like the real store does.
 */
export class MemoryStore implements SyncStore {
  cursor: SyncCursor = {};
  issues = new Map<number, IssueRow>();
  issueComments = new Map<string, CommentRow>();
  pullRequests = new Map<number, PullRequestRow>();
  prComments = new Map<string, CommentRow>();
  reviews = new Map<string, ReviewRow>();
  reviewComments = new Map<string, ReviewCommentRow>();
  prFiles = new Map<string, PrFileRow>();
  prCommits = new Map<string, { prNumber: number; sha: string }>();
  commits = new Map<string, CommitRow>();
  discussions = new Map<number, DiscussionRow>();
  discussionComments = new Map<string, DiscussionCommentRow>();
  repoFiles = new Map<string, RepoFileRow>();
  references = new Map<string, ReferenceRow>();
  /** Every write batch, for assertions on how much was written. */
  writes: { table: string; stats: WriteStats }[] = [];

  private put<K, V extends object>(
    table: string,
    map: Map<K, V>,
    rows: V[],
    key: (r: V) => K,
    merge?: (existing: V, incoming: V) => V
  ): Promise<WriteStats> {
    const stats: WriteStats = { created: 0, updated: 0, unchanged: 0 };
    for (const r of rows) {
      const k = key(r);
      const prev = map.get(k);
      if (!prev) {
        map.set(k, r);
        stats.created++;
      } else {
        const next = merge ? merge(prev, r) : r;
        if (sig(next) === sig(prev)) stats.unchanged++;
        else {
          map.set(k, next);
          stats.updated++;
        }
      }
    }
    this.writes.push({ table, stats });
    return Promise.resolve(stats);
  }

  private keepStrongestReason = <V extends { fetchReason?: FetchReason }>(
    prev: V,
    next: V
  ): V => {
    const a = prev.fetchReason ?? "legacy";
    const b = next.fetchReason ?? "legacy";
    return { ...next, fetchReason: (RANK[a] ?? 1) >= (RANK[b] ?? 1) ? a : b };
  };

  async getCursor() {
    return { ...this.cursor };
  }
  async setCursor(_p: string, r: ResourceName, v: string) {
    this.cursor[r] = v;
  }
  async getKnownNumbers() {
    return {
      issues: new Set(this.issues.keys()),
      pullRequests: new Set(this.pullRequests.keys()),
    };
  }
  async listOpenNumbers() {
    const open = (m: Map<number, { state: string }>) =>
      [...m.entries()].filter(([, v]) => v.state === "open").map(([k]) => k);
    return { issues: open(this.issues), pullRequests: open(this.pullRequests) };
  }
  async findStored(
    _p: string,
    kind: "issue" | "pull_request",
    numbers: number[]
  ) {
    const m = kind === "issue" ? this.issues : this.pullRequests;
    const out = new Map<number, FetchReason>();
    for (const n of numbers) {
      const row = m.get(n);
      if (row) out.set(n, row.fetchReason ?? "legacy");
    }
    return out;
  }
  async markReferenced(
    _p: string,
    kind: "issue" | "pull_request",
    numbers: number[]
  ) {
    const m = kind === "issue" ? this.issues : this.pullRequests;
    for (const n of numbers) {
      const row = m.get(n);
      if (row && (row.fetchReason ?? "legacy") === "legacy")
        row.fetchReason = "referenced";
    }
  }

  upsertIssues: SyncStore["upsertIssues"] = (_p, rows) =>
    this.put(
      "issues",
      this.issues,
      rows,
      (r) => r.number,
      this.keepStrongestReason
    );
  upsertIssueComments: SyncStore["upsertIssueComments"] = (_p, rows) =>
    this.put("issueComments", this.issueComments, rows, (r) =>
      String(r.githubId)
    );
  upsertPullRequests: SyncStore["upsertPullRequests"] = (_p, rows) =>
    this.put(
      "pullRequests",
      this.pullRequests,
      rows,
      (r) => r.number,
      this.keepStrongestReason
    );
  upsertPrComments: SyncStore["upsertPrComments"] = (_p, rows) =>
    this.put("prComments", this.prComments, rows, (r) => String(r.githubId));
  upsertReviews: SyncStore["upsertReviews"] = (_p, rows) =>
    this.put("reviews", this.reviews, rows, (r) => String(r.githubId));
  upsertReviewComments: SyncStore["upsertReviewComments"] = (_p, rows) =>
    this.put("reviewComments", this.reviewComments, rows, (r) =>
      String(r.githubId)
    );
  upsertPrFiles: SyncStore["upsertPrFiles"] = (_p, rows) =>
    this.put(
      "prFiles",
      this.prFiles,
      rows,
      (r) => `${r.prNumber}:${r.filename}`
    );
  upsertPrCommits: SyncStore["upsertPrCommits"] = (_p, rows) =>
    this.put(
      "prCommits",
      this.prCommits,
      rows,
      (r) => `${r.prNumber}:${r.sha}`
    );
  upsertCommits: SyncStore["upsertCommits"] = (_p, rows) =>
    this.put("commits", this.commits, rows, (r) => r.sha);
  upsertDiscussions: SyncStore["upsertDiscussions"] = (_p, rows) =>
    this.put("discussions", this.discussions, rows, (r) => r.number);
  upsertDiscussionComments: SyncStore["upsertDiscussionComments"] = (
    _p,
    rows
  ) =>
    this.put(
      "discussionComments",
      this.discussionComments,
      rows,
      (r) => r.githubNodeId
    );
  upsertReferences: SyncStore["upsertReferences"] = (_p, rows) =>
    this.put(
      "references",
      this.references,
      rows,
      (r) => `${r.fromKind}:${r.fromNumber}:${r.toNumber}:${r.basis}`
    );
  upsertRepoFilesOnly: SyncStore["upsertRepoFilesOnly"] = (_p, rows) =>
    this.put("repoFiles", this.repoFiles, rows, (r) => r.path);
  async replaceRepoFiles(p: string, rows: RepoFileRow[]) {
    const keep = new Set(rows.map((r) => r.path));
    for (const k of this.repoFiles.keys())
      if (!keep.has(k)) this.repoFiles.delete(k);
    await this.upsertRepoFilesOnly(p, rows);
  }
}
