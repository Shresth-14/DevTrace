import type { Prisma } from "@prisma/client";

export type JsonList = Prisma.InputJsonValue;

/** Why a thread was imported. open = current work; referenced = linked from current work. */
export type FetchReason = "open" | "referenced" | "legacy";

export interface IssueRow {
  fetchReason?: FetchReason;
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
  fetchReason?: FetchReason;
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

export interface WriteStats {
  created: number;
  updated: number;
  unchanged: number;
}

export interface ReferenceRow {
  fromKind: "issue" | "pull_request";
  fromNumber: number;
  toNumber: number;
  basis: "reference_in_body" | "reference_in_comment" | "closing_reference";
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
  | "repoFiles"
  | "references"
  | "historicalIssues"
  | "historicalPullRequests";

export interface ResourceResult {
  status: "ok" | "partial" | "error" | "skipped";
  /** Records fetched from GitHub and handed to the database. */
  count: number;
  /** Records GitHub reports exist for this selection (e.g. all open issues), when known. */
  discovered?: number;
  /** Records chosen for a full conversation import (the rest keep metadata only). */
  selected?: number;
  /** Records that were new or changed in the database (count - unchanged). */
  stored?: number;
  /** Records already up to date in the database; nothing was written. */
  unchanged?: number;
  /** Records deliberately not imported in full (quiet threads, closed discussions...). */
  skipped?: number;
  /** Records that could not be fetched or stored. */
  failed?: number;
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
  upsertIssues(projectId: string, rows: IssueRow[]): Promise<WriteStats>;
  upsertIssueComments(
    projectId: string,
    rows: CommentRow[]
  ): Promise<WriteStats>;
  upsertPullRequests(
    projectId: string,
    rows: PullRequestRow[]
  ): Promise<WriteStats>;
  upsertPrComments(projectId: string, rows: CommentRow[]): Promise<WriteStats>;
  upsertReviews(projectId: string, rows: ReviewRow[]): Promise<WriteStats>;
  upsertReviewComments(
    projectId: string,
    rows: ReviewCommentRow[]
  ): Promise<WriteStats>;
  upsertPrFiles(projectId: string, rows: PrFileRow[]): Promise<WriteStats>;
  upsertPrCommits(
    projectId: string,
    rows: { prNumber: number; sha: string }[]
  ): Promise<WriteStats>;
  upsertCommits(projectId: string, rows: CommitRow[]): Promise<WriteStats>;
  upsertDiscussions(
    projectId: string,
    rows: DiscussionRow[]
  ): Promise<WriteStats>;
  upsertDiscussionComments(
    projectId: string,
    rows: DiscussionCommentRow[]
  ): Promise<WriteStats>;
  upsertReferences(
    projectId: string,
    rows: ReferenceRow[]
  ): Promise<WriteStats>;
  /** Numbers of threads currently stored as open (to detect ones closed since). */
  listOpenNumbers(
    projectId: string
  ): Promise<{ issues: number[]; pullRequests: number[] }>;
  /** Which of these numbers are already stored, and under which fetch reason. */
  findStored(
    projectId: string,
    kind: "issue" | "pull_request",
    numbers: number[]
  ): Promise<Map<number, FetchReason>>;
  /** Legacy rows that turn out to be linked from current work become "referenced". */
  markReferenced(
    projectId: string,
    kind: "issue" | "pull_request",
    numbers: number[]
  ): Promise<void>;
  /** Replaces the tree snapshot: upserts rows and removes paths no longer present. */
  replaceRepoFiles(projectId: string, rows: RepoFileRow[]): Promise<void>;
  /** Upsert without deleting (used when GitHub truncated the tree). */
  upsertRepoFilesOnly(
    projectId: string,
    rows: RepoFileRow[]
  ): Promise<WriteStats>;
}
