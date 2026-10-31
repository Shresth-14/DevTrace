import { randomUUID } from "node:crypto";
import type { Octokit } from "octokit";
import type { PrismaClient } from "@prisma/client";
import { HttpError } from "../../utils/http-error";
import {
  ACTIVE,
  type Investigation,
  type InvestigationService,
  type InvestigationStatus,
} from "./investigation.service";

// ---------------------------------------------------------------------------
// Discovery: database only, never GitHub
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "the and for are was were why what which who whom how when where did does doing " +
    "with this that these those from into about over under than then there their they " +
    "our you your has have had been being its it's can could should would will shall " +
    "not but any all some more most other such only own same too very just also use " +
    "used using make made was is am be do of to in on at by or an a as if so we us i " +
    "repo repository project code decision decisions decided chosen choose selected"
  ).split(/\s+/)
);

/** Meaningful words of a question, lowercased, at most 8. */
export function questionTerms(question: string): string[] {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9_.+#-]+/)
    .map((w) => w.replace(/^[.#+-]+|[.#+-]+$/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 8);
}

export interface StoredThread {
  kind: "issue" | "pull_request";
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  url: string;
  updatedAt: Date;
}

export interface DiscoveryRows {
  threads: StoredThread[];
  /** PR file paths that matched a term. */
  files: { prNumber: number; filename: string }[];
  /** Threads cited as evidence by stored decisions whose title/summary matched. */
  decisionThreads: { kind: string; number: number }[];
}

export interface Candidate {
  kind: "issue" | "pull_request";
  number: number;
  title: string;
  url: string;
  score: number;
  /** Why it was picked, e.g. "title: redis". Shown to the user. */
  reasons: string[];
}

const WEIGHT = { title: 3, decision: 3, label: 2, body: 1, file: 1 } as const;

/** Scores stored threads against the question terms. Pure: no I/O. */
export function rankCandidates(
  terms: string[],
  rows: DiscoveryRows,
  limit = 5
): Candidate[] {
  const byKey = new Map<string, Candidate & { updatedAt: number }>();
  const entry = (t: StoredThread) => {
    const key = `${t.kind}:${t.number}`;
    let c = byKey.get(key);
    if (!c) {
      c = {
        kind: t.kind,
        number: t.number,
        title: t.title,
        url: t.url,
        score: 0,
        reasons: [],
        updatedAt: t.updatedAt.getTime(),
      };
      byKey.set(key, c);
    }
    return c;
  };
  const hit = (c: Candidate, w: number, reason: string) => {
    if (c.reasons.includes(reason)) return;
    c.score += w;
    c.reasons.push(reason);
  };

  for (const t of rows.threads) {
    const title = t.title.toLowerCase();
    const body = (t.body ?? "").toLowerCase();
    const labels = t.labels.map((l) => l.toLowerCase());
    for (const term of terms) {
      if (title.includes(term)) hit(entry(t), WEIGHT.title, `title: ${term}`);
      if (labels.includes(term)) hit(entry(t), WEIGHT.label, `label: ${term}`);
      if (body.includes(term)) hit(entry(t), WEIGHT.body, `description: ${term}`);
    }
  }
  const prs = new Map(
    rows.threads.filter((t) => t.kind === "pull_request").map((t) => [t.number, t])
  );
  for (const f of rows.files) {
    const pr = prs.get(f.prNumber);
    if (!pr) continue;
    const path = f.filename.toLowerCase();
    for (const term of terms) {
      if (path.includes(term)) hit(entry(pr), WEIGHT.file, `file: ${f.filename}`);
    }
  }
  for (const d of rows.decisionThreads) {
    const t = rows.threads.find((x) => x.kind === d.kind && x.number === d.number);
    if (t) hit(entry(t), WEIGHT.decision, "cited by a matching decision");
  }

  return [...byKey.values()]
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((c) => ({
      kind: c.kind,
      number: c.number,
      title: c.title,
      url: c.url,
      score: c.score,
      reasons: c.reasons,
    }));
}

// ---------------------------------------------------------------------------
// Answer: built only from stored decisions and their evidence
// ---------------------------------------------------------------------------

export interface StoredDecision {
  id: string;
  seq: number;
  title: string;
  summary: string;
  status: string;
  evidence: {
    threadKind: string;
    threadNumber: number;
    sourceType: string;
    sourceKey: string;
    url: string;
    quote: string;
  }[];
}

export interface Claim {
  decisionId: string;
  ref: string;
  title: string;
  summary: string;
  /** The stored decision status, or "unresolved" when nothing supports it. */
  status: string;
  supported: boolean;
  sources: StoredDecision["evidence"];
}

/** Turns stored decisions into claims; a decision without evidence is never a decision. */
export function buildClaims(decisions: StoredDecision[], terms: string[]): Claim[] {
  const relevance = (d: StoredDecision) => {
    const text = `${d.title} ${d.summary}`.toLowerCase();
    return terms.filter((t) => text.includes(t)).length;
  };
  return [...decisions]
    .sort((a, b) => relevance(b) - relevance(a) || a.seq - b.seq)
    .map((d) => {
      const supported = d.evidence.length > 0;
      return {
        decisionId: d.id,
        ref: `DEC-${String(d.seq).padStart(3, "0")}`,
        title: d.title,
        summary: d.summary,
        status: supported ? d.status : "unresolved",
        supported,
        sources: d.evidence,
      };
    });
}

// ---------------------------------------------------------------------------
// Persistence boundary and orchestration
// ---------------------------------------------------------------------------

export interface QuestionDb {
  discover(projectId: string, terms: string[]): Promise<DiscoveryRows>;
  decisionsForThreads(
    projectId: string,
    threads: { kind: string; number: number }[]
  ): Promise<StoredDecision[]>;
}

const asLabels = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x) => (typeof x === "string" ? x : (x as { name?: string })?.name ?? "")).filter(Boolean)
    : [];

export function prismaQuestionDb(db: PrismaClient): QuestionDb {
  return {
    discover: async (projectId, terms) => {
      if (terms.length === 0) return { threads: [], files: [], decisionThreads: [] };
      const ci = (t: string) => ({ contains: t, mode: "insensitive" as const });
      const where = {
        projectId,
        OR: terms.flatMap((t) => [
          { title: ci(t) },
          { body: ci(t) },
          { labels: { array_contains: [t] } },
        ]),
      };
      const select = {
        number: true,
        title: true,
        body: true,
        labels: true,
        url: true,
        updatedAtGh: true,
      } as const;
      const [issues, prs, files, decisions] = await Promise.all([
        db.githubIssue.findMany({ where, select, orderBy: { updatedAtGh: "desc" }, take: 200 }),
        db.githubPullRequest.findMany({ where, select, orderBy: { updatedAtGh: "desc" }, take: 200 }),
        db.githubPrFile.findMany({
          where: { projectId, OR: terms.map((t) => ({ filename: ci(t) })) },
          select: { prNumber: true, filename: true },
          take: 500,
        }),
        db.decision.findMany({
          where: {
            projectId,
            OR: terms.flatMap((t) => [{ title: ci(t) }, { summary: ci(t) }]),
          },
          select: { evidence: { select: { threadKind: true, threadNumber: true } } },
          take: 100,
        }),
      ]);
      // threads that only matched through a file path or a decision still need their row
      const known = new Set(prs.map((p) => p.number));
      const extraPrNumbers = [
        ...new Set([
          ...files.map((f) => f.prNumber),
          ...decisions.flatMap((d) =>
            d.evidence.filter((e) => e.threadKind === "pull_request").map((e) => e.threadNumber)
          ),
        ]),
      ].filter((n) => !known.has(n));
      const knownIssues = new Set(issues.map((i) => i.number));
      const extraIssueNumbers = [
        ...new Set(
          decisions.flatMap((d) =>
            d.evidence.filter((e) => e.threadKind === "issue").map((e) => e.threadNumber)
          )
        ),
      ].filter((n) => !knownIssues.has(n));
      const [morePrs, moreIssues] = await Promise.all([
        extraPrNumbers.length
          ? db.githubPullRequest.findMany({ where: { projectId, number: { in: extraPrNumbers } }, select })
          : [],
        extraIssueNumbers.length
          ? db.githubIssue.findMany({ where: { projectId, number: { in: extraIssueNumbers } }, select })
          : [],
      ]);
      const toThread =
        (kind: StoredThread["kind"]) =>
        (r: (typeof issues)[number]): StoredThread => ({
          kind,
          number: r.number,
          title: r.title,
          body: r.body,
          labels: asLabels(r.labels),
          url: r.url,
          updatedAt: r.updatedAtGh,
        });
      return {
        threads: [
          ...[...issues, ...moreIssues].map(toThread("issue")),
          ...[...prs, ...morePrs].map(toThread("pull_request")),
        ],
        files,
        decisionThreads: decisions.flatMap((d) =>
          d.evidence.map((e) => ({ kind: e.threadKind, number: e.threadNumber }))
        ),
      };
    },
    decisionsForThreads: async (projectId, threads) => {
      if (threads.length === 0) return [];
      return db.decision.findMany({
        where: {
          projectId,
          evidence: {
            some: {
              OR: threads.map((t) => ({ threadKind: t.kind, threadNumber: t.number })),
            },
          },
        },
        select: {
          id: true,
          seq: true,
          title: true,
          summary: true,
          status: true,
          evidence: {
            select: {
              threadKind: true,
              threadNumber: true,
              sourceType: true,
              sourceKey: true,
              url: true,
              quote: true,
            },
          },
        },
        orderBy: { seq: "asc" },
      });
    },
  };
}

export type QuestionStatus =
  | "discovering"
  | "investigating"
  | "done"
  | "partial"
  | InvestigationStatus;

export interface Question {
  id: string;
  projectId: string;
  question: string;
  status: QuestionStatus;
  terms: string[];
  candidates: Candidate[];
  investigations: { id: string; number: number; status: InvestigationStatus }[];
  claims: Claim[];
  /** Plain statement when nothing could be answered from stored evidence. */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

const MAX_KEPT = 200;
const TOP = 5;

export class QuestionService {
  private readonly questions = new Map<string, Question>();

  constructor(
    private readonly db: QuestionDb,
    private readonly investigations: InvestigationService
  ) {}

  /** Database-only discovery. Never calls GitHub. */
  public async discover(projectId: string, question: string) {
    const terms = questionTerms(question);
    const rows = await this.db.discover(projectId, terms);
    return { terms, candidates: rankCandidates(terms, rows, TOP) };
  }

  public ask(input: {
    project: { id: string; owner: string; repo: string };
    question: string;
    octokit: () => Promise<Octokit>;
  }): Question {
    const question = input.question.trim();
    if (question.length < 3 || question.length > 500) {
      throw new HttpError(400, "Ask a question between 3 and 500 characters.");
    }
    if (questionTerms(question).length === 0) {
      throw new HttpError(400, "The question has no searchable words. Name the technology or area you mean.");
    }
    const now = new Date().toISOString();
    const q: Question = {
      id: randomUUID(),
      projectId: input.project.id,
      question,
      status: "discovering",
      terms: [],
      candidates: [],
      investigations: [],
      claims: [],
      createdAt: now,
      updatedAt: now,
    };
    this.questions.set(q.id, q);
    while (this.questions.size > MAX_KEPT) {
      const oldest = this.questions.keys().next().value;
      if (oldest === undefined) break;
      this.questions.delete(oldest);
    }
    void this.run(q, input);
    return { ...q };
  }

  public get(id: string, projectId: string): Question | null {
    const q = this.questions.get(id);
    return q && q.projectId === projectId ? { ...q } : null;
  }

  private async run(
    q: Question,
    input: { project: { id: string; owner: string; repo: string }; octokit: () => Promise<Octokit> }
  ): Promise<void> {
    const set = (patch: Partial<Question>) =>
      Object.assign(q, patch, { updatedAt: new Date().toISOString() });
    try {
      const { terms, candidates } = await this.discover(q.projectId, q.question);
      set({ terms, candidates });
      if (candidates.length === 0) {
        set({
          status: "done",
          note: "No stored issues or pull requests match this question. Investigate a specific issue or PR first, or sync the repository.",
        });
        return;
      }

      set({ status: "investigating" });
      const started = candidates.map((c) =>
        this.investigations.start({
          project: input.project,
          input: `#${c.number}`,
          octokit: input.octokit,
        })
      );
      const finished = await Promise.all(
        started.map((s) => this.investigations.whenFinished(s.id, q.projectId))
      );
      const results = finished.filter((x): x is Investigation => x !== null);
      set({
        investigations: results.map((r) => ({
          id: r.id,
          number: r.source.number,
          status: r.status,
        })),
      });

      const decisions = await this.db.decisionsForThreads(
        q.projectId,
        candidates.map((c) => ({ kind: c.kind, number: c.number }))
      );
      const claims = buildClaims(decisions, terms);
      const complete = results.filter((r) => r.status === "done").length;
      const firstFailure = results.find((r) => r.status !== "done" && !ACTIVE.has(r.status));
      set({
        claims,
        status:
          complete === results.length
            ? "done"
            : complete === 0 && claims.length === 0 && firstFailure
              ? firstFailure.status
              : "partial",
        note:
          claims.length === 0
            ? "The matching threads contain no recorded decisions, so there is no evidence-backed answer."
            : undefined,
      });
    } catch (err) {
      set({
        status: "failed",
        note: err instanceof Error ? err.message : "The question could not be answered.",
      });
    }
  }
}
