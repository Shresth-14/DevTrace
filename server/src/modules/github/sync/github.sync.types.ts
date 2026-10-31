import type { Prisma } from "@prisma/client";

export type JsonList = Prisma.InputJsonValue;

export interface IssueRow {
  githubId: bigint;
  number: number;
  title: string;
  body: string | null;
  authorLogin: string | null;
  state: string;
  stateReason: string | null;
  labels: string[];
  assignees: string[];
  url: string;
  createdAtGh: Date;
  updatedAtGh: Date;
  closedAtGh: Date | null;
}

export interface CommentRow {
  githubId: bigint;
  /** Issue number or PR number the comment belongs to. */
  parentNumber: number;
  body: string;
  authorLogin: string | null;
  url: string;
  createdAtGh: Date;
  updatedAtGh: Date;
}

export interface PullRequestRow {
  githubId: bigint;
  number: number;
  title: string;
  body: string | null;
  authorLogin: string | null;
  state: string;
  isDraft: boolean;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  mergeCommitSha: string | null;
  labels: string[];
  reviewers: string[];
  url: string;
  createdAtGh: Date;
  updatedAtGh: Date;
  closedAtGh: Date | null;
  mergedAtGh: Date | null;
}

export interface ReviewRow {
  githubId: bigint;
  prNumber: number;
  reviewerLogin: string | null;
  body: string | null;
  state: string;
  commitSha: string | null;
  url: string;
  submittedAt: Date | null;
}

export interface ReviewCommentRow {
  githubId: bigint;
  prNumber: number;
  reviewGithubId: bigint | null;
  inReplyToId: bigint | null;
  threadId: string | null;
  isResolved: boolean | null;
  body: string;
  authorLogin: string | null;
  path: string;
  line: number | null;
  originalLine: number | null;
  diffHunk: string | null;
  commitSha: string | null;
  url: string;
  createdAtGh: Date;
  updatedAtGh: Date;
}

export interface PrFileRow {
  prNumber: number;
  filename: string;
  previousFilename: string | null;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  blobSha: string | null;
  patch: string | null;
  headSha: string | null;
}

export interface CommitRow {
  sha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  authorLogin: string | null;
  committerName: string | null;
  committerLogin: string | null;
  authoredAt: Date | null;
  committedAt: Date | null;
  url: string;
}

export interface DiscussionRow {
  githubNodeId: string;
  number: number;
  title: string;
  body: string | null;
  category: string | null;
  authorLogin: string | null;
  isAnswered: boolean;
  answerCommentNodeId: string | null;
  url: string;
  createdAtGh: Date;
  updatedAtGh: Date;
}

export interface DiscussionCommentRow {
  githubNodeId: string;
  discussionNumber: number;
  parentNodeId: string | null;
  body: string;
  authorLogin: string | null;
  isAnswer: boolean;
  url: string;
  createdAtGh: Date;
  updatedAtGh: Date;
}

export interface RepoFileRow {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size: number | null;
  ref: string;
}

export type ResourceName =
  | "issues"
  | "issueComments"
  | "pullRequests"
  | "prComments"
  | "prReviews"
  | "reviewComments"
  | "prFiles"
  | "prCommits"
  | "commits"
  | "discussions"
  | "repoFiles";

export interface ResourceResult {
  status: "ok" | "partial" | "error" | "skipped";
  count: number;
  error?: string;
  /** Non-fatal information that does not change the status. */
  note?: string;
}

export type ResourceResults = Partial<Record<ResourceName, ResourceResult>>;

export type SyncCursor = Partial<Record<ResourceName, string>>;

export interface SyncStore {
  getCursor(projectId: string): Promise<SyncCursor>;
  setCursor(
    projectId: string,
    resource: ResourceName,
    value: string
  ): Promise<void>;
  /** Issue / PR numbers already persisted, used to classify and parent-check comments. */
  getKnownNumbers(
    projectId: string
  ): Promise<{ issues: Set<number>; pullRequests: Set<number> }>;
  upsertIssues(projectId: string, rows: IssueRow[]): Promise<void>;
  upsertIssueComments(projectId: string, rows: CommentRow[]): Promise<void>;
  upsertPullRequests(projectId: string, rows: PullRequestRow[]): Promise<void>;
  upsertPrComments(projectId: string, rows: CommentRow[]): Promise<void>;
  upsertReviews(projectId: string, rows: ReviewRow[]): Promise<void>;
  upsertReviewComments(
    projectId: string,
    rows: ReviewCommentRow[]
  ): Promise<void>;
  upsertPrFiles(projectId: string, rows: PrFileRow[]): Promise<void>;
  upsertPrCommits(
    projectId: string,
    rows: { prNumber: number; sha: string }[]
  ): Promise<void>;
  upsertCommits(projectId: string, rows: CommitRow[]): Promise<void>;
  upsertDiscussions(projectId: string, rows: DiscussionRow[]): Promise<void>;
  upsertDiscussionComments(
    projectId: string,
    rows: DiscussionCommentRow[]
  ): Promise<void>;
  /** Replaces the tree snapshot: upserts rows and removes paths no longer present. */
  replaceRepoFiles(projectId: string, rows: RepoFileRow[]): Promise<void>;
  /** Upsert without deleting (used when GitHub truncated the tree). */
  upsertRepoFilesOnly(projectId: string, rows: RepoFileRow[]): Promise<void>;
}
