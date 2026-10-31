import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  MIN_BODY_FOR_SOLO_THREAD,
  MIN_TALK,
} from "../github/sync/github.relevance";
import type {
  ChangedFile,
  ThreadItem,
  ThreadKind,
  ThreadUnit,
} from "./decision.types";

/** Compact inputs: long messages are cut; the decisive part is almost always at the start. */
/** Only threads imported as current work (open) or linked from it are analysed. */
const CURRENT_REASONS = ["open", "referenced"] as const;
const MAX_ITEM_CHARS = 2500;

export interface ThreadHeader {
  kind: ThreadKind;
  number: number;
  updatedAt: Date;
}

const clip = (s: string | null | undefined): string =>
  (s ?? "").trim().slice(0, MAX_ITEM_CHARS);

/**
 * Threads worth analysing: anything with an actual conversation, or a long
 * description (design proposals). Ordered most recently updated first.
 */
export async function listCandidateThreads(
  db: PrismaClient,
  projectId: string
): Promise<ThreadHeader[]> {
  const [issues, prs, discussions] = await Promise.all([
    db.githubIssue.findMany({
      where: { projectId, fetchReason: { in: [...CURRENT_REASONS] } },
      select: {
        number: true,
        updatedAtGh: true,
        body: true,
        _count: { select: { comments: true } },
      },
    }),
    db.githubPullRequest.findMany({
      where: { projectId, fetchReason: { in: [...CURRENT_REASONS] } },
      select: {
        number: true,
        updatedAtGh: true,
        body: true,
        _count: {
          select: { comments: true, reviews: true, reviewComments: true },
        },
      },
    }),
    db.githubDiscussion.findMany({
      where: { projectId },
      select: {
        number: true,
        updatedAtGh: true,
        body: true,
        _count: { select: { comments: true } },
      },
    }),
  ]);

  // A thread is worth a model call when people actually discussed something. Richer
  // discussions go first so a capped run spends its calls where decisions are likely.
  const scored: (ThreadHeader & { weight: number })[] = [];
  const consider = (
    kind: ThreadKind,
    number: number,
    updatedAt: Date,
    body: string | null,
    talk: number,
    minTalk: number
  ) => {
    const len = body?.length ?? 0;
    if (talk < minTalk && len < MIN_BODY_FOR_SOLO_THREAD) return;
    scored.push({
      kind,
      number,
      updatedAt,
      weight: talk * 2 + Math.min(len / MIN_BODY_FOR_SOLO_THREAD, 3),
    });
  };
  for (const i of issues) {
    consider(
      "issue",
      i.number,
      i.updatedAtGh,
      i.body,
      i._count.comments,
      MIN_TALK
    );
  }
  for (const p of prs) {
    const talk = p._count.comments + p._count.reviews + p._count.reviewComments;
    consider("pull_request", p.number, p.updatedAtGh, p.body, talk, MIN_TALK);
  }
  for (const d of discussions) {
    consider(
      "discussion",
      d.number,
      d.updatedAtGh,
      d.body,
      d._count.comments,
      1
    );
  }
  return scored
    .sort(
      (a, b) =>
        b.weight - a.weight || b.updatedAt.getTime() - a.updatedAt.getTime()
    )
    .map(({ kind, number, updatedAt }) => ({ kind, number, updatedAt }));
}

/** Bots (dependabot, CI, release tools) never make design decisions and waste tokens. */
export const isAutomated = (login: string | null) =>
  !!login &&
  // GitHub's GraphQL reports app accounts without the "[bot]" suffix
  /\[bot\]$|-bot$|^(vercel|github-actions|netlify|codecov|codecov-commenter|dependabot|renovate|sonarcloud|allcontributors)$/i.test(
    login
  );

interface ThreadMeta {
  state: string;
  reason: string;
  linkedFrom: { kind: string; number: number }[];
}

function finish(
  kind: ThreadKind,
  number: number,
  title: string,
  url: string,
  updatedAt: Date,
  raw: Omit<ThreadItem, "ref">[],
  files: ChangedFile[],
  meta: ThreadMeta
): ThreadUnit {
  const items: ThreadItem[] = raw
    .filter((r) => r.text.trim().length > 0 && !isAutomated(r.author))
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0))
    .map((r, i) => ({ ...r, ref: `S${i + 1}` }));
  const hash = createHash("sha1")
    .update(
      JSON.stringify({
        t: title,
        i: items.map((i) => [
          i.sourceType,
          i.sourceKey,
          i.text,
          i.at?.toISOString(),
        ]),
        f: files.map((f) => [f.path, f.previousPath, f.status]),
        // an outcome is often recorded when a thread closes or merges: re-analyse then
        s: meta.state,
        r: meta.reason,
        l: meta.linkedFrom.map((l) => `${l.kind}#${l.number}`),
      })
    )
    .digest("hex");
  return {
    kind,
    number,
    title,
    url,
    updatedAt,
    items,
    files,
    hash,
    state: meta.state,
    reason: meta.reason,
    linkedFrom: meta.linkedFrom,
  };
}

async function linkedFrom(
  db: PrismaClient,
  projectId: string,
  toNumber: number
): Promise<ThreadMeta["linkedFrom"]> {
  const rows = await db.threadReference.findMany({
    where: { projectId, toNumber },
    select: { fromKind: true, fromNumber: true },
    take: 5,
  });
  return rows.map((r) => ({ kind: r.fromKind, number: r.fromNumber }));
}

export async function loadUnit(
  db: PrismaClient,
  projectId: string,
  kind: ThreadKind,
  number: number
): Promise<ThreadUnit | null> {
  if (kind === "issue") {
    const issue = await db.githubIssue.findUnique({
      where: { projectId_number: { projectId, number } },
      include: { comments: true },
    });
    if (!issue) return null;
    return finish(
      kind,
      number,
      issue.title,
      issue.url,
      issue.updatedAtGh,
      [
        {
          sourceType: "issue",
          sourceKey: String(issue.number),
          author: issue.authorLogin,
          text: clip(issue.body),
          url: issue.url,
          at: issue.createdAtGh,
        },
        ...issue.comments.map((c) => ({
          sourceType: "issue_comment" as const,
          sourceKey: String(c.githubId),
          author: c.authorLogin,
          text: clip(c.body),
          url: c.url,
          at: c.createdAtGh,
        })),
      ],
      [],
      {
        state: issue.state,
        reason: issue.fetchReason,
        linkedFrom: await linkedFrom(db, projectId, number),
      }
    );
  }

  if (kind === "pull_request") {
    const pr = await db.githubPullRequest.findUnique({
      where: { projectId_number: { projectId, number } },
      include: {
        comments: true,
        reviews: true,
        reviewComments: true,
        files: true,
        commits: true,
      },
    });
    if (!pr) return null;
    const shas = pr.commits.map((c) => c.sha);
    const commits = shas.length
      ? await db.githubCommit.findMany({
          where: { projectId, sha: { in: shas } },
        })
      : [];
    return finish(
      kind,
      number,
      pr.title,
      pr.url,
      pr.updatedAtGh,
      [
        {
          sourceType: "pull_request",
          sourceKey: String(pr.number),
          author: pr.authorLogin,
          text: clip(pr.body),
          url: pr.url,
          at: pr.createdAtGh,
        },
        ...pr.comments.map((c) => ({
          sourceType: "pr_comment" as const,
          sourceKey: String(c.githubId),
          author: c.authorLogin,
          text: clip(c.body),
          url: c.url,
          at: c.createdAtGh,
        })),
        ...pr.reviews.map((r) => ({
          sourceType: "review" as const,
          sourceKey: String(r.githubId),
          author: r.reviewerLogin,
          text: clip(r.body),
          url: r.url,
          at: r.submittedAt,
        })),
        ...pr.reviewComments.map((c) => ({
          sourceType: "review_comment" as const,
          sourceKey: String(c.githubId),
          author: c.authorLogin,
          text: clip(c.body),
          url: c.url,
          at: c.createdAtGh,
          path: c.path,
          line: c.line,
          commitSha: c.commitSha,
        })),
        ...commits.slice(0, 10).map((c) => ({
          sourceType: "commit" as const,
          sourceKey: c.sha,
          author: c.authorLogin,
          text: clip(c.message),
          url: c.url,
          at: c.committedAt,
        })),
      ],
      pr.files.map((f) => ({
        path: f.filename,
        previousPath: f.previousFilename,
        status: f.status,
      })),
      {
        state: pr.state,
        reason: pr.fetchReason,
        linkedFrom: await linkedFrom(db, projectId, number),
      }
    );
  }

  const d = await db.githubDiscussion.findUnique({
    where: { projectId_number: { projectId, number } },
    include: { comments: true },
  });
  if (!d) return null;
  return finish(
    kind,
    number,
    d.title,
    d.url,
    d.updatedAtGh,
    [
      {
        sourceType: "discussion",
        sourceKey: String(d.number),
        author: d.authorLogin,
        text: clip(d.body),
        url: d.url,
        at: d.createdAtGh,
      },
      ...d.comments.map((c) => ({
        sourceType: "discussion_comment" as const,
        sourceKey: c.githubNodeId,
        author: c.authorLogin,
        text: clip(c.body),
        url: c.url,
        at: c.createdAtGh,
      })),
    ],
    [],
    { state: "open", reason: "open", linkedFrom: [] }
  );
}
