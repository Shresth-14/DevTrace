import type {
  ResourceName,
  SyncCursor,
  SyncStore,
} from "../../src/modules/github/sync/github.sync.types";

/** In-memory SyncStore that enforces the same natural keys as the Prisma unique constraints. */
export class MemoryStore implements SyncStore {
  cursor: SyncCursor = {};
  issues = new Map<number, unknown>();
  issueComments = new Map<string, { parentNumber: number }>();
  pullRequests = new Map<number, unknown>();
  prComments = new Map<string, { parentNumber: number }>();
  reviews = new Map<string, unknown>();
  reviewComments = new Map<
    string,
    {
      threadId: string | null;
      isResolved: boolean | null;
      inReplyToId: bigint | null;
    }
  >();
  prFiles = new Map<
    string,
    { patch: string | null; previousFilename: string | null; status: string }
  >();
  prCommits = new Map<string, unknown>();
  commits = new Map<string, unknown>();
  discussions = new Map<number, unknown>();
  discussionComments = new Map<string, { parentNodeId: string | null }>();
  repoFiles = new Map<string, unknown>();

  private put<T extends object>(
    map: Map<string | number, unknown>,
    key: string | number,
    row: T
  ) {
    map.set(key, row);
  }

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
  async upsertIssues(_p: string, rows: { number: number }[]) {
    rows.forEach((r) =>
      this.put(this.issues as Map<string | number, unknown>, r.number, r)
    );
  }
  async upsertIssueComments(
    _p: string,
    rows: { githubId: bigint; parentNumber: number }[]
  ) {
    rows.forEach((r) => this.put(this.issueComments, String(r.githubId), r));
  }
  async upsertPullRequests(_p: string, rows: { number: number }[]) {
    rows.forEach((r) =>
      this.put(this.pullRequests as Map<string | number, unknown>, r.number, r)
    );
  }
  async upsertPrComments(
    _p: string,
    rows: { githubId: bigint; parentNumber: number }[]
  ) {
    rows.forEach((r) => this.put(this.prComments, String(r.githubId), r));
  }
  async upsertReviews(_p: string, rows: { githubId: bigint }[]) {
    rows.forEach((r) => this.put(this.reviews, String(r.githubId), r));
  }
  async upsertReviewComments(
    _p: string,
    rows: {
      githubId: bigint;
      threadId: string | null;
      isResolved: boolean | null;
      inReplyToId: bigint | null;
    }[]
  ) {
    rows.forEach((r) => this.put(this.reviewComments, String(r.githubId), r));
  }
  async upsertPrFiles(
    _p: string,
    rows: {
      prNumber: number;
      filename: string;
      patch: string | null;
      previousFilename: string | null;
      status: string;
    }[]
  ) {
    rows.forEach((r) =>
      this.put(this.prFiles, `${r.prNumber}:${r.filename}`, r)
    );
  }
  async upsertPrCommits(_p: string, rows: { prNumber: number; sha: string }[]) {
    rows.forEach((r) => this.put(this.prCommits, `${r.prNumber}:${r.sha}`, r));
  }
  async upsertCommits(_p: string, rows: { sha: string }[]) {
    rows.forEach((r) => this.put(this.commits, r.sha, r));
  }
  async upsertDiscussions(_p: string, rows: { number: number }[]) {
    rows.forEach((r) =>
      this.put(this.discussions as Map<string | number, unknown>, r.number, r)
    );
  }
  async upsertDiscussionComments(
    _p: string,
    rows: { githubNodeId: string; parentNodeId: string | null }[]
  ) {
    rows.forEach((r) => this.put(this.discussionComments, r.githubNodeId, r));
  }
  async upsertRepoFilesOnly(_p: string, rows: { path: string }[]) {
    rows.forEach((r) => this.put(this.repoFiles, r.path, r));
  }
  async replaceRepoFiles(p: string, rows: { path: string }[]) {
    const keep = new Set(rows.map((r) => r.path));
    for (const k of this.repoFiles.keys())
      if (!keep.has(k)) this.repoFiles.delete(k);
    await this.upsertRepoFilesOnly(p, rows);
  }
}
