import type { PrismaClient, Prisma } from "@prisma/client";

// ---- DTOs (mirrored by client/src/lib/api.ts and components/project/types.ts) ----

export type DecisionStatusDto =
  "ACCEPTED" | "REJECTED" | "PROPOSED" | "WITHDRAWN" | "UNRESOLVED";
export type SourceTypeDto =
  "discussion" | "issue" | "pr" | "comment" | "review" | "commit";

export interface SourceDto {
  id: string;
  type: SourceTypeDto;
  title: string;
  author: string;
  date: string | null;
  quote: string;
  url: string;
  badge: string;
}

export interface AlternativeDto {
  name: string;
  proposedBy: string | null;
  reason: string | null;
  status: DecisionStatusDto;
  chosenApproach: string | null;
  evidenceQuotes: {
    author: string;
    source: string;
    quote: string;
    url: string;
  }[];
  affectedFiles: string[];
}

export interface CodeFileDto {
  path: string;
  previousPath: string | null;
  lines: string;
  description: string;
  relationship: "direct" | "inferred";
  basis: string;
  commitSha: string | null;
}

export interface DecisionDto {
  id: string;
  seq: number;
  title: string;
  status: DecisionStatusDto;
  date: string | null;
  author: string | null;
  participants: string[];
  summary: string;
  reasoning: { category: string; explanation: string }[];
  openQuestions: string | null;
  confidence: number | null;
  alternatives: AlternativeDto[];
  sources: SourceDto[];
  codeFiles: CodeFileDto[];
  relatedThreads: {
    kind: string;
    number: number;
    title: string;
    url: string;
  }[];
  model: string;
  version: string;
}

export interface ActivityEventDto {
  id: string;
  type: "decision_updated" | "sync_completed" | "extraction_completed";
  title: string;
  description: string;
  timestamp: string;
  source: string;
}

export const decisionCode = (seq: number): string =>
  `DEC-${String(seq).padStart(3, "0")}`;

const BADGE: Record<string, string> = {
  issue: "GitHub Issue",
  issue_comment: "Issue comment",
  pull_request: "Pull Request",
  pr_comment: "PR comment",
  review: "PR review",
  review_comment: "Inline review comment",
  discussion: "GitHub Discussion",
  discussion_comment: "Discussion comment",
  commit: "Commit",
};

export function sourceTypeOf(t: string): SourceTypeDto {
  if (t === "issue") return "issue";
  if (t === "pull_request") return "pr";
  if (t === "discussion") return "discussion";
  if (t === "review" || t === "review_comment") return "review";
  if (t === "commit") return "commit";
  return "comment";
}

const upper = (s: string): DecisionStatusDto =>
  s.toUpperCase() as DecisionStatusDto;
const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

async function threadInfo(
  db: PrismaClient,
  projectId: string,
  refs: { kind: string; number: number }[]
): Promise<Map<string, { title: string; url: string }>> {
  const nums = (kind: string) => [
    ...new Set(refs.filter((r) => r.kind === kind).map((r) => r.number)),
  ];
  const [issues, prs, discussions] = await Promise.all([
    db.githubIssue.findMany({
      where: { projectId, number: { in: nums("issue") } },
      select: { number: true, title: true, url: true },
    }),
    db.githubPullRequest.findMany({
      where: { projectId, number: { in: nums("pull_request") } },
      select: { number: true, title: true, url: true },
    }),
    db.githubDiscussion.findMany({
      where: { projectId, number: { in: nums("discussion") } },
      select: { number: true, title: true, url: true },
    }),
  ]);
  const map = new Map<string, { title: string; url: string }>();
  issues.forEach((i) => map.set(`issue:${i.number}`, i));
  prs.forEach((i) => map.set(`pull_request:${i.number}`, i));
  discussions.forEach((i) => map.set(`discussion:${i.number}`, i));
  return map;
}

const KIND_PREFIX: Record<string, string> = {
  issue: "Issue",
  pull_request: "PR",
  discussion: "Discussion",
};

type DecisionRow = Prisma.DecisionGetPayload<{
  include: {
    evidence: true;
    alternatives: { include: { evidence: true } };
    codeLinks: true;
  };
}>;

function toDto(
  d: DecisionRow,
  threads: Map<string, { title: string; url: string }>
): DecisionDto {
  const label = (e: DecisionRow["evidence"][number]) => {
    const t = threads.get(`${e.threadKind}:${e.threadNumber}`);
    return `${KIND_PREFIX[e.threadKind] ?? "Thread"} #${e.threadNumber}${t ? ` · ${t.title}` : ""}`;
  };
  const evidence = [...d.evidence].sort(
    (a, b) => (a.occurredAt?.getTime() ?? 0) - (b.occurredAt?.getTime() ?? 0)
  );
  const seenThreads = new Map<string, DecisionDto["relatedThreads"][number]>();
  for (const e of evidence) {
    const k = `${e.threadKind}:${e.threadNumber}`;
    const t = threads.get(k);
    if (t && !seenThreads.has(k)) {
      seenThreads.set(k, {
        kind: e.threadKind,
        number: e.threadNumber,
        title: t.title,
        url: t.url,
      });
    }
  }
  const paths = d.codeLinks.map((l) => l.path);
  return {
    id: decisionCode(d.seq),
    seq: d.seq,
    title: d.title,
    status: upper(d.status),
    date: iso(d.decidedAt),
    author: evidence[0]?.author ?? null,
    participants: Array.isArray(d.participants)
      ? (d.participants as string[])
      : [],
    summary: d.summary,
    reasoning: Array.isArray(d.reasoning)
      ? (d.reasoning as { category: string; explanation: string }[])
      : [],
    openQuestions: d.openQuestions,
    confidence: d.confidence,
    alternatives: d.alternatives.map((a) => ({
      name: a.title,
      proposedBy: a.proposedBy,
      reason: a.reason,
      status: upper(a.status),
      chosenApproach: a.chosenInstead,
      evidenceQuotes: a.evidence
        .map((l) => d.evidence.find((e) => e.id === l.evidenceId))
        .filter((e): e is DecisionRow["evidence"][number] => !!e)
        .map((e) => ({
          author: e.author ?? "unknown",
          source: label(e),
          quote: e.quote,
          url: e.url,
        })),
      affectedFiles: paths,
    })),
    sources: evidence.map((e) => ({
      id: e.id,
      type: sourceTypeOf(e.sourceType),
      title: label(e),
      author: e.author ?? "unknown",
      date: iso(e.occurredAt),
      quote: e.quote,
      url: e.url,
      badge: BADGE[e.sourceType] ?? e.sourceType,
    })),
    codeFiles: d.codeLinks.map((l) => ({
      path: l.path,
      previousPath: l.previousPath,
      lines: l.line ? `L${l.line}` : "",
      description: l.description ?? "",
      relationship: l.relationship as "direct" | "inferred",
      basis: l.basis,
      commitSha: l.commitSha,
    })),
    relatedThreads: [...seenThreads.values()],
    model: d.model,
    version: d.version,
  };
}

const include = {
  evidence: true,
  alternatives: { include: { evidence: true } },
  codeLinks: true,
} as const;

export async function listDecisions(
  db: PrismaClient,
  projectId: string,
  page: number,
  perPage: number
) {
  const where = { projectId };
  const [rows, total] = await Promise.all([
    db.decision.findMany({
      where,
      include,
      orderBy: [{ decidedAt: "desc" }, { seq: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.decision.count({ where }),
  ]);
  const threads = await threadInfo(
    db,
    projectId,
    rows.flatMap((r) =>
      r.evidence.map((e) => ({ kind: e.threadKind, number: e.threadNumber }))
    )
  );
  return {
    decisions: rows.map((r) => toDto(r, threads)),
    total,
    page,
    perPage,
    hasMore: (page - 1) * perPage + rows.length < total,
  };
}

interface ThreadBreakdown {
  total: number;
  /** Open on GitHub as of the last sync: current work. */
  open: number;
  /** Closed or merged, but imported as current work and since resolved. */
  resolvedCurrent: number;
  /** Older threads imported because current work links to them. */
  linkedHistory: number;
  /** Older threads from earlier imports that nothing current links to. */
  otherHistory: number;
}

/** Counts straight from the stored rows, split so current work and history never mix. */
async function threadBreakdown(
  db: PrismaClient,
  projectId: string,
  kind: "issue" | "pull_request"
): Promise<ThreadBreakdown> {
  const groups =
    kind === "issue"
      ? await db.githubIssue.groupBy({
          by: ["state", "fetchReason"],
          where: { projectId },
          _count: { _all: true },
        })
      : await db.githubPullRequest.groupBy({
          by: ["state", "fetchReason"],
          where: { projectId },
          _count: { _all: true },
        });
  const out: ThreadBreakdown = {
    total: 0,
    open: 0,
    resolvedCurrent: 0,
    linkedHistory: 0,
    otherHistory: 0,
  };
  for (const g of groups) {
    const n = g._count._all;
    out.total += n;
    if (g.state === "open") out.open += n;
    else if (g.fetchReason === "open") out.resolvedCurrent += n;
    else if (g.fetchReason === "referenced") out.linkedHistory += n;
    else out.otherHistory += n;
  }
  return out;
}

export async function getOverview(db: PrismaClient, projectId: string) {
  const [
    byStatus,
    rejectedAlternatives,
    project,
    latestJob,
    latestRun,
    recent,
    issues,
    issueComments,
    pullRequests,
    prComments,
    reviews,
    reviewComments,
    discussions,
    discussionComments,
    commits,
    files,
    prFiles,
    decisionsWithCode,
    issueBreakdown,
    prBreakdown,
    linkCount,
  ] = await Promise.all([
    db.decision.groupBy({
      by: ["status"],
      where: { projectId },
      _count: { _all: true },
    }),
    db.decisionAlternative.count({
      where: { status: "rejected", decision: { projectId } },
    }),
    db.project.findUniqueOrThrow({ where: { id: projectId } }),
    db.syncJob.findFirst({
      where: { projectId },
      orderBy: { startedAt: "desc" },
    }),
    db.extractionRun.findFirst({
      where: { projectId },
      orderBy: { startedAt: "desc" },
    }),
    db.decision.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    db.githubIssue.count({ where: { projectId } }),
    db.githubIssueComment.count({ where: { projectId } }),
    db.githubPullRequest.count({ where: { projectId } }),
    db.githubPrComment.count({ where: { projectId } }),
    db.githubPrReview.count({ where: { projectId } }),
    db.githubReviewComment.count({ where: { projectId } }),
    db.githubDiscussion.count({ where: { projectId } }),
    db.githubDiscussionComment.count({ where: { projectId } }),
    db.githubCommit.count({ where: { projectId } }),
    db.githubRepoFile.count({ where: { projectId, type: "blob" } }),
    db.githubPrFile.count({ where: { projectId } }),
    db.decisionCodeLink.count({ where: { decision: { projectId } } }),
    threadBreakdown(db, projectId, "issue"),
    threadBreakdown(db, projectId, "pull_request"),
    db.threadReference.count({ where: { projectId } }),
  ]);

  const counts: Record<
    "accepted" | "rejected" | "proposed" | "withdrawn" | "unresolved",
    number
  > = {
    accepted: 0,
    rejected: 0,
    proposed: 0,
    withdrawn: 0,
    unresolved: 0,
  };
  for (const g of byStatus) {
    if (g.status in counts)
      counts[g.status as keyof typeof counts] = g._count._all;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const activity: ActivityEventDto[] = [];
  if (latestJob?.finishedAt) {
    activity.push({
      id: `sync-${latestJob.id}`,
      type: "sync_completed",
      title: `GitHub sync ${latestJob.status}`,
      description:
        latestJob.error ??
        `Imported repository history (${latestJob.mode} sync).`,
      timestamp: latestJob.finishedAt.toISOString(),
      source: "GitHub",
    });
  }
  if (latestRun?.finishedAt) {
    activity.push({
      id: `run-${latestRun.id}`,
      type: "extraction_completed",
      title: `Decision extraction ${latestRun.status}`,
      description: `${latestRun.unitsDone} thread(s) reviewed, ${latestRun.decisionsSaved} decision record(s) saved.`,
      timestamp: latestRun.finishedAt.toISOString(),
      source: latestRun.model,
    });
  }
  for (const d of recent) {
    activity.push({
      id: `dec-${d.id}`,
      type: "decision_updated",
      title: d.title,
      description: `${decisionCode(d.seq)} is ${d.status}.`,
      timestamp: d.updatedAt.toISOString(),
      source: "Decision",
    });
  }
  activity.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    counts: { total, ...counts, rejectedAlternatives },
    sources: {
      issues,
      issueComments,
      pullRequests,
      prComments,
      reviews,
      reviewComments,
      discussions,
      discussionComments,
      commits,
      files,
      prFiles,
    },
    /** Current work and history never share a number: see ThreadBreakdown. */
    threads: {
      issues: issueBreakdown,
      pullRequests: prBreakdown,
      references: linkCount,
    },
    codeLinks: decisionsWithCode,
    status: {
      syncStatus: project.syncStatus,
      aiStatus: project.aiStatus,
      lastSyncedAt: iso(project.lastSyncedAt),
      lastExtractedAt: iso(project.lastExtractedAt),
      latestJob,
      latestRun,
    },
    activity: activity.slice(0, 8),
  };
}

// ---- PR intelligence --------------------------------------------------------

export interface PrMatchDto {
  decisionId: string;
  decisionTitle: string;
  decisionStatus: DecisionStatusDto;
  matchedFiles: string[];
  relationship: "direct" | "inferred";
  reason: string;
  sources: { title: string; url: string }[];
}

export interface PrIntelligenceDto {
  prNumber: number;
  title: string;
  author: string | null;
  date: string;
  status: "open" | "merged" | "closed";
  url: string;
  changedFiles: string[];
  matches: PrMatchDto[];
}

export async function getPrIntelligence(
  db: PrismaClient,
  projectId: string,
  page: number,
  perPage: number
) {
  const links = await db.decisionCodeLink.findMany({
    where: { decision: { projectId } },
    include: { decision: { include: { evidence: true } } },
  });
  const byPath = new Map<string, typeof links>();
  for (const l of links) {
    for (const p of [l.path, l.previousPath]) {
      if (p) byPath.set(p, [...(byPath.get(p) ?? []), l]);
    }
  }

  const prs = await db.githubPullRequest.findMany({
    where: { projectId },
    orderBy: { updatedAtGh: "desc" },
    take: 300,
    include: { files: true },
  });

  const matched: PrIntelligenceDto[] = [];
  for (const pr of prs) {
    const perDecision = new Map<
      string,
      { link: (typeof links)[number]; files: Set<string> }
    >();
    for (const f of pr.files) {
      for (const l of [
        ...(byPath.get(f.filename) ?? []),
        ...(f.previousFilename ? (byPath.get(f.previousFilename) ?? []) : []),
      ]) {
        // Decisions that were themselves recovered from this PR are not "history" for it.
        if (
          l.decision.evidence.some(
            (e) =>
              e.threadKind === "pull_request" && e.threadNumber === pr.number
          )
        )
          continue;
        const cur = perDecision.get(l.decisionId) ?? {
          link: l,
          files: new Set<string>(),
        };
        cur.files.add(f.filename);
        if (l.relationship === "direct") cur.link = l;
        perDecision.set(l.decisionId, cur);
      }
    }
    if (perDecision.size === 0) continue;
    matched.push({
      prNumber: pr.number,
      title: pr.title,
      author: pr.authorLogin,
      date: pr.updatedAtGh.toISOString(),
      status: pr.mergedAtGh
        ? "merged"
        : pr.state === "open"
          ? "open"
          : "closed",
      url: pr.url,
      changedFiles: pr.files.map((f) => f.filename),
      matches: [...perDecision.values()].map(({ link, files }) => {
        const d = link.decision;
        return {
          decisionId: decisionCode(d.seq),
          decisionTitle: d.title,
          decisionStatus: upper(d.status),
          matchedFiles: [...files],
          relationship: link.relationship as "direct" | "inferred",
          reason: `This PR changes ${[...files].slice(0, 3).join(", ")}${files.size > 3 ? ` and ${files.size - 3} more` : ""}, which ${decisionCode(d.seq)} is linked to (${link.relationship === "direct" ? "directly evidenced by " + link.basis.replace("_", " ") : "inferred, not directly evidenced"}).`,
          sources: d.evidence.slice(0, 3).map((e) => ({
            title: `${KIND_PREFIX[e.threadKind] ?? "Thread"} #${e.threadNumber}`,
            url: e.url,
          })),
        };
      }),
    });
  }

  const start = (page - 1) * perPage;
  return {
    items: matched.slice(start, start + perPage),
    total: matched.length,
    scanned: prs.length,
    page,
    perPage,
    hasMore: start + perPage < matched.length,
  };
}

// ---- Source feed ------------------------------------------------------------

export const SOURCE_CATEGORIES = [
  "all",
  "issues",
  "pull_requests",
  "discussions",
  "comments",
  "reviews",
  "commits",
] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

const excerpt = (s: string | null | undefined, n = 400): string =>
  (s ?? "").trim().slice(0, n);

interface FeedItem extends SourceDto {
  sortAt: number;
  evidenceKey: string;
}

export async function getSourceFeed(
  db: PrismaClient,
  projectId: string,
  opts: { category: SourceCategory; q?: string; page: number; perPage: number }
) {
  const { category, q, page, perPage } = opts;
  const contains = (field: string) =>
    q ? { [field]: { contains: q, mode: "insensitive" as const } } : {};
  const take = category === "all" ? perPage : perPage;
  const skip = category === "all" ? 0 : (page - 1) * perPage;
  const base = { projectId };
  const want = (c: SourceCategory) => category === "all" || category === c;

  const feeds: Promise<FeedItem[]>[] = [];
  const dt = (d: Date | null) => d?.getTime() ?? 0;

  if (want("issues")) {
    feeds.push(
      db.githubIssue
        .findMany({
          where: {
            ...base,
            ...(q
              ? {
                  OR: [
                    { title: { contains: q, mode: "insensitive" } },
                    { body: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: { updatedAtGh: "desc" },
          skip,
          take,
        })
        .then((r) =>
          r.map((i) => ({
            id: `issue-${i.number}`,
            type: "issue" as const,
            title: `Issue #${i.number} · ${i.title}`,
            author: i.authorLogin ?? "unknown",
            date: iso(i.updatedAtGh),
            quote: excerpt(i.body) || "(no description)",
            url: i.url,
            badge: `GitHub Issue · ${i.state}${i.fetchReason === "referenced" ? " · linked history" : ""}`,
            sortAt: dt(i.updatedAtGh),
            evidenceKey: `issue:${i.number}`,
          }))
        )
    );
  }
  if (want("pull_requests")) {
    feeds.push(
      db.githubPullRequest
        .findMany({
          where: {
            ...base,
            ...(q
              ? {
                  OR: [
                    { title: { contains: q, mode: "insensitive" } },
                    { body: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: { updatedAtGh: "desc" },
          skip,
          take,
        })
        .then((r) =>
          r.map((i) => ({
            id: `pr-${i.number}`,
            type: "pr" as const,
            title: `PR #${i.number} · ${i.title}`,
            author: i.authorLogin ?? "unknown",
            date: iso(i.updatedAtGh),
            quote: excerpt(i.body) || "(no description)",
            url: i.url,
            badge: `Pull Request · ${i.state}${i.fetchReason === "referenced" ? " · linked history" : ""}`,
            sortAt: dt(i.updatedAtGh),
            evidenceKey: `pull_request:${i.number}`,
          }))
        )
    );
  }
  if (want("discussions")) {
    feeds.push(
      db.githubDiscussion
        .findMany({
          where: {
            ...base,
            ...(q
              ? {
                  OR: [
                    { title: { contains: q, mode: "insensitive" } },
                    { body: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: { updatedAtGh: "desc" },
          skip,
          take,
        })
        .then((r) =>
          r.map((i) => ({
            id: `disc-${i.number}`,
            type: "discussion" as const,
            title: `Discussion #${i.number} · ${i.title}`,
            author: i.authorLogin ?? "unknown",
            date: iso(i.updatedAtGh),
            quote: excerpt(i.body) || "(no description)",
            url: i.url,
            badge: `GitHub Discussion${i.category ? " · " + i.category : ""}`,
            sortAt: dt(i.updatedAtGh),
            evidenceKey: `discussion:${i.number}`,
          }))
        )
    );
  }
  if (want("comments")) {
    const half = category === "all" ? Math.ceil(take / 3) : Math.ceil(take / 3);
    const cs = category === "all" ? 0 : skip;
    const w = { ...base, ...contains("body") };
    feeds.push(
      Promise.all([
        db.githubIssueComment.findMany({
          where: w,
          orderBy: { updatedAtGh: "desc" },
          skip: Math.floor(cs / 3),
          take: half,
        }),
        db.githubPrComment.findMany({
          where: w,
          orderBy: { updatedAtGh: "desc" },
          skip: Math.floor(cs / 3),
          take: half,
        }),
        db.githubDiscussionComment.findMany({
          where: w,
          orderBy: { updatedAtGh: "desc" },
          skip: Math.floor(cs / 3),
          take: half,
        }),
      ]).then(([a, b, c]) => [
        ...a.map((i) => ({
          id: `ic-${i.githubId}`,
          type: "comment" as const,
          title: `Comment on issue #${i.issueNumber}`,
          author: i.authorLogin ?? "unknown",
          date: iso(i.createdAtGh),
          quote: excerpt(i.body),
          url: i.url,
          badge: "Issue comment",
          sortAt: dt(i.createdAtGh),
          evidenceKey: `issue_comment:${i.githubId}`,
        })),
        ...b.map((i) => ({
          id: `pc-${i.githubId}`,
          type: "comment" as const,
          title: `Comment on PR #${i.prNumber}`,
          author: i.authorLogin ?? "unknown",
          date: iso(i.createdAtGh),
          quote: excerpt(i.body),
          url: i.url,
          badge: "PR comment",
          sortAt: dt(i.createdAtGh),
          evidenceKey: `pr_comment:${i.githubId}`,
        })),
        ...c.map((i) => ({
          id: `dc-${i.githubNodeId}`,
          type: "comment" as const,
          title: `${i.parentNodeId ? "Reply" : "Comment"} on discussion #${i.discussionNumber}`,
          author: i.authorLogin ?? "unknown",
          date: iso(i.createdAtGh),
          quote: excerpt(i.body),
          url: i.url,
          badge: i.parentNodeId ? "Discussion reply" : "Discussion comment",
          sortAt: dt(i.createdAtGh),
          evidenceKey: `discussion_comment:${i.githubNodeId}`,
        })),
      ])
    );
  }
  if (want("reviews")) {
    const half = Math.ceil(take / 2);
    const cs = category === "all" ? 0 : Math.floor(skip / 2);
    feeds.push(
      Promise.all([
        db.githubPrReview.findMany({
          where: { ...base, ...contains("body") },
          orderBy: { submittedAt: "desc" },
          skip: cs,
          take: half,
        }),
        db.githubReviewComment.findMany({
          where: { ...base, ...contains("body") },
          orderBy: { createdAtGh: "desc" },
          skip: cs,
          take: half,
        }),
      ]).then(([a, b]) => [
        ...a.map((i) => ({
          id: `rv-${i.githubId}`,
          type: "review" as const,
          title: `Review on PR #${i.prNumber} · ${i.state.toLowerCase().replace("_", " ")}`,
          author: i.reviewerLogin ?? "unknown",
          date: iso(i.submittedAt),
          quote: excerpt(i.body) || "(no review text)",
          url: i.url,
          badge: "PR review",
          sortAt: dt(i.submittedAt),
          evidenceKey: `review:${i.githubId}`,
        })),
        ...b.map((i) => ({
          id: `rc-${i.githubId}`,
          type: "review" as const,
          title: `Inline comment on ${i.path}${i.line ? ":" + i.line : ""} (PR #${i.prNumber})`,
          author: i.authorLogin ?? "unknown",
          date: iso(i.createdAtGh),
          quote: excerpt(i.body),
          url: i.url,
          badge: i.isResolved
            ? "Inline review comment · resolved"
            : "Inline review comment",
          sortAt: dt(i.createdAtGh),
          evidenceKey: `review_comment:${i.githubId}`,
        })),
      ])
    );
  }
  if (want("commits")) {
    feeds.push(
      db.githubCommit
        .findMany({
          where: { ...base, ...contains("message") },
          orderBy: { committedAt: "desc" },
          skip,
          take,
        })
        .then((r) =>
          r.map((i) => ({
            id: `cm-${i.sha}`,
            type: "commit" as const,
            title: `Commit ${i.sha.slice(0, 7)}`,
            author: i.authorLogin ?? i.authorName ?? "unknown",
            date: iso(i.committedAt),
            quote: excerpt(i.message),
            url: i.url,
            badge: "Commit",
            sortAt: dt(i.committedAt),
            evidenceKey: `commit:${i.sha}`,
          }))
        )
    );
  }

  const items = (await Promise.all(feeds))
    .flat()
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, perPage);

  // Which decisions cite each item
  const cites = await db.decisionEvidence.findMany({
    where: {
      decision: { projectId },
      OR: items.flatMap((i) => {
        const [sourceType, ...rest] = i.evidenceKey.split(":");
        return [{ sourceType, sourceKey: rest.join(":") }];
      }),
    },
    select: {
      sourceType: true,
      sourceKey: true,
      decision: { select: { seq: true } },
    },
  });
  const refs = new Map<string, Set<string>>();
  for (const c of cites) {
    const k = `${c.sourceType}:${c.sourceKey}`;
    refs.set(k, (refs.get(k) ?? new Set()).add(decisionCode(c.decision.seq)));
  }

  const counts = await sourceCounts(db, projectId);
  return {
    items: items.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      author: i.author,
      date: i.date,
      quote: i.quote,
      url: i.url,
      badge: i.badge,
      referencedDecisions: [...(refs.get(i.evidenceKey) ?? [])],
    })),
    counts,
    category,
    page,
    perPage,
    // "all" is a recent-activity mix and is not paginated
    hasMore: category !== "all" && items.length === perPage,
  };
}

export async function sourceCounts(db: PrismaClient, projectId: string) {
  const w = { projectId };
  const [i, pr, d, ic, pc, dc, rv, rc, cm] = await Promise.all([
    db.githubIssue.count({ where: w }),
    db.githubPullRequest.count({ where: w }),
    db.githubDiscussion.count({ where: w }),
    db.githubIssueComment.count({ where: w }),
    db.githubPrComment.count({ where: w }),
    db.githubDiscussionComment.count({ where: w }),
    db.githubPrReview.count({ where: w }),
    db.githubReviewComment.count({ where: w }),
    db.githubCommit.count({ where: w }),
  ]);
  return {
    all: i + pr + d + ic + pc + dc + rv + rc + cm,
    issues: i,
    pull_requests: pr,
    discussions: d,
    comments: ic + pc + dc,
    reviews: rv + rc,
    commits: cm,
  };
}

// ---- Dashboard summary (all of a user's projects) ---------------------------

export async function getDashboardSummary(db: PrismaClient, userId: string) {
  const projects = await db.project.findMany({
    where: { userId },
    select: { id: true, name: true, slug: true },
  });
  const ids = projects.map((p) => p.id);
  const [decisions, recent] = await Promise.all([
    db.decision.count({ where: { projectId: { in: ids } } }),
    db.decision.findMany({
      where: { projectId: { in: ids } },
      orderBy: [{ decidedAt: "desc" }, { updatedAt: "desc" }],
      take: 3,
    }),
  ]);
  const byId = new Map(projects.map((p) => [p.id, p]));
  return {
    projects: projects.length,
    decisions,
    recentDecisions: recent.map((d) => ({
      id: decisionCode(d.seq),
      title: d.title,
      status: upper(d.status),
      date: iso(d.decidedAt),
      summary: d.summary,
      projectName: byId.get(d.projectId)?.name ?? "",
      slug: byId.get(d.projectId)?.slug ?? "",
    })),
  };
}
