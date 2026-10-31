import { randomUUID } from "node:crypto";
import type { Octokit } from "octokit";
import type { PrismaClient } from "@prisma/client";
import { HttpError } from "../../utils/http-error";
import { describeError } from "../github/sync/github.errors";
import {
  fetchPrCommits,
  fetchPrFiles,
  fetchReviewComments,
  fetchReviews,
  fetchThreadComments,
  type RepoRef,
} from "../github/sync/github.fetchers";
import {
  fetchThreadsByNumber,
  type IssueBundle,
  type PrBundle,
} from "../github/sync/github.bulk";
import type { SyncStore } from "../github/sync/github.sync.types";
import { describeLlmError, isDailyModelLimit } from "../decisions/decision.errors";
import {
  extractUnit,
  type ExtractorOptions,
  type LlmClient,
} from "../decisions/decision.extractor";
import {
  EXTRACTION_VERSION,
  type Candidate,
  type ThreadKind,
  type ThreadUnit,
} from "../decisions/decision.types";
import { loadUnit } from "../decisions/decision.units";
import { decisionCode } from "../decisions/decision.read";
import {
  SUMMARY_VERSION,
  summariseThread,
  type ThreadSummary,
} from "./investigation.summary";
import { parseSourceInput, type SourceKind } from "./investigation.input";
import { classifyGithubError, type GithubFailure } from "./investigation.errors";

export type InvestigationStatus =
  | "queued"
  | "fetching"
  | "analysing"
  | "done"
  | "rate_limited"
  | "forbidden"
  | "not_found"
  | "network"
  | "failed"
  | "partial";

export const ACTIVE: ReadonlySet<InvestigationStatus> = new Set([
  "queued",
  "fetching",
  "analysing",
]);

const FAILURE_MESSAGES: Record<GithubFailure, string> = {
  rate_limited: "GitHub rate limit reached. Try again after it resets.",
  forbidden: "GitHub denied access to this repository for this account or installation.",
  not_found: "GitHub could not find this repository or thread, or it is not visible to this account.",
  network: "Could not reach GitHub. Check the connection and try again.",
  failed: "",
};

export interface ThreadItemDto {
  ref: string;
  sourceType: string;
  author: string | null;
  text: string;
  url: string;
  at: string | null;
  path?: string;
  line?: number | null;
}

/** A stored decision found in the investigated thread, with its evidence. */
export interface ThreadDecision {
  id: string;
  code: string;
  title: string;
  summary: string;
  status: string;
  reasoning: { category: string; explanation: string }[];
  openQuestions: string | null;
  confidence: number | null;
  alternatives: {
    title: string;
    proposedBy: string | null;
    reason: string | null;
    status: string;
    chosenInstead: string | null;
  }[];
  evidence: {
    sourceType: string;
    author: string | null;
    quote: string;
    url: string;
    at: string | null;
  }[];
}

export interface InvestigationResult {
  /** The conversation exactly as stored from GitHub, oldest first. */
  thread: {
    kind: ThreadKind;
    number: number;
    title: string;
    url: string;
    state: string;
    itemCount: number;
    items: ThreadItemDto[];
  };
  /** Evidence-cited account of what happened; null when it could not be produced. */
  summary: ThreadSummary | null;
  summaryError?: string;
  decisions: ThreadDecision[];
}

export interface Investigation {
  id: string;
  projectId: string;
  input: string;
  status: InvestigationStatus;
  source: { number: number; kind?: SourceKind; title?: string; url?: string };
  /** Explicitly referenced issues/PRs fetched for context (depth 1). */
  linked: { number: number; kind: "issue" | "pull_request"; url: string }[];
  /** Explicit references found but not followed because of the limit. */
  linkedNotFollowed: number;
  /** True when the stored analysis matched the thread's content hash (no model call). */
  cacheHit: boolean | null;
  decisionsSaved: number;
  model?: string;
  error?: string;
  /** Seconds GitHub asked us to wait, when rate limited. */
  retryAfterSeconds?: number;
  /** Present once the run has finished and the thread could be read. */
  result?: InvestigationResult;
  createdAt: string;
  updatedAt: string;
}

interface UnitState {
  status: string;
  contentHash: string;
  version: string;
}

/** The database operations investigation needs; a Prisma version is provided below. */
export interface InvestigationDb {
  loadUnit(
    projectId: string,
    kind: ThreadKind,
    number: number
  ): Promise<ThreadUnit | null>;
  getUnitState(
    projectId: string,
    kind: ThreadKind,
    number: number
  ): Promise<UnitState | null>;
  saveUnitState(
    projectId: string,
    kind: ThreadKind,
    number: number,
    state: UnitState & { model: string; error?: string }
  ): Promise<void>;
  repoPaths(projectId: string): Promise<Set<string>>;
  decisionsForThread(
    projectId: string,
    kind: ThreadKind,
    number: number
  ): Promise<ThreadDecision[]>;
}

export function prismaInvestigationDb(db: PrismaClient): InvestigationDb {
  const key = (projectId: string, kind: string, number: number) => ({
    projectId_kind_number: { projectId, kind, number },
  });
  return {
    loadUnit: (projectId, kind, number) =>
      loadUnit(db, projectId, kind, number),
    getUnitState: (projectId, kind, number) =>
      db.extractionUnit.findUnique({
        where: key(projectId, kind, number),
        select: { status: true, contentHash: true, version: true },
      }),
    saveUnitState: async (projectId, kind, number, s) => {
      const data = {
        contentHash: s.contentHash,
        status: s.status,
        model: s.model,
        version: s.version,
        error: s.error ?? null,
      };
      await db.extractionUnit.upsert({
        where: key(projectId, kind, number),
        create: { projectId, kind, number, ...data },
        update: { ...data, processedAt: new Date() },
      });
    },
    repoPaths: async (projectId) => {
      const rows = await db.githubRepoFile.findMany({
        where: { projectId, type: "blob" },
        select: { path: true },
      });
      return new Set(rows.map((r) => r.path));
    },
    decisionsForThread: async (projectId, kind, number) => {
      const rows = await db.decision.findMany({
        where: {
          projectId,
          evidence: { some: { threadKind: kind, threadNumber: number } },
        },
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          title: true,
          summary: true,
          status: true,
          reasoning: true,
          openQuestions: true,
          confidence: true,
          alternatives: {
            select: {
              title: true,
              proposedBy: true,
              reason: true,
              status: true,
              chosenInstead: true,
            },
          },
          evidence: {
            orderBy: { occurredAt: "asc" },
            select: {
              sourceType: true,
              author: true,
              quote: true,
              url: true,
              occurredAt: true,
            },
          },
        },
      });
      return rows.map((d) => ({
        id: d.id,
        code: decisionCode(d.seq),
        title: d.title,
        summary: d.summary,
        status: d.status,
        reasoning: (Array.isArray(d.reasoning) ? d.reasoning : []).flatMap((r) => {
          const o = r as { category?: unknown; explanation?: unknown };
          return typeof o?.explanation === "string"
            ? [{ category: String(o.category ?? "other"), explanation: o.explanation }]
            : [];
        }),
        openQuestions: d.openQuestions,
        confidence: d.confidence,
        alternatives: d.alternatives,
        evidence: d.evidence.map((e) => ({
          sourceType: e.sourceType,
          author: e.author,
          quote: e.quote,
          url: e.url,
          at: e.occurredAt ? e.occurredAt.toISOString() : null,
        })),
      }));
    },
  };
}

export interface InvestigationDeps {
  db: InvestigationDb;
  store: SyncStore;
  decisions: {
    save(
      projectId: string,
      candidates: Candidate[],
      meta: { model: string; version: string }
    ): Promise<number>;
  };
  llm: LlmClient & { isConfigured(): boolean; getModel(): string };
  extractor?: ExtractorOptions;
  /** Max explicitly referenced threads fetched for context. */
  maxLinked?: number;
  /** Investigations talking to GitHub at once. Default: GITHUB_MAX_CONCURRENCY or 4. */
  maxConcurrent?: number;
}

const DEFAULT_MAX_LINKED = 10;
const DEFAULT_MAX_CONCURRENT = 4;

function concurrencyFromEnv(): number {
  const n = Number(process.env.GITHUB_MAX_CONCURRENCY);
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : DEFAULT_MAX_CONCURRENT;
}

/** At most `size` tasks run at once; the rest wait in arrival order. */
function createGate(size: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= size) await new Promise<void>((r) => waiting.push(r));
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}
/** Finished investigations are kept in memory for status polling; results live in the DB. */
const MAX_KEPT = 500;

export interface StartInput {
  project: { id: string; owner: string; repo: string };
  input: string;
  octokit: () => Promise<Octokit>;
}

export class InvestigationService {
  private readonly runs = new Map<string, Investigation>();
  /** `projectId:number` -> id of the investigation currently working on that thread. */
  private readonly inFlight = new Map<string, string>();
  /** id -> promise that settles when that run finishes (for callers that need to wait). */
  private readonly finished = new Map<string, Promise<void>>();
  /** Generated summaries by content hash. Decisions persist in the database; this is a cache. */
  private readonly summaries = new Map<string, ThreadSummary>();
  private readonly gate: ReturnType<typeof createGate>;

  constructor(private readonly deps: InvestigationDeps) {
    this.gate = createGate(deps.maxConcurrent ?? concurrencyFromEnv());
  }

  /** Validates the input, records the investigation and starts it in the background. */
  public start({ project, input, octokit }: StartInput): Investigation {
    const ref = { owner: project.owner, repo: project.repo };
    const parsed = parseSourceInput(input, ref);
    if (!parsed) {
      throw new HttpError(
        400,
        `Enter an issue or pull request of ${ref.owner}/${ref.repo}: a github.com URL, ${ref.owner}/${ref.repo}#123, #123 or 123.`
      );
    }
    if (parsed.kind === "discussion") {
      throw new HttpError(
        422,
        "Investigating a single discussion is not supported yet. Use an issue or pull request."
      );
    }
    if (!this.deps.llm.isConfigured()) {
      throw new HttpError(
        503,
        "AI extraction is not configured. Ensure Ollama is running ('ollama serve') and model is available."
      );
    }

    // The same thread already being investigated: share that run (and its GitHub calls).
    const key = `${project.id}:${parsed.number}`;
    const runningId = this.inFlight.get(key);
    const running = runningId ? this.runs.get(runningId) : undefined;
    if (running && ACTIVE.has(running.status)) return { ...running };

    const now = new Date().toISOString();
    const inv: Investigation = {
      id: randomUUID(),
      projectId: project.id,
      input,
      status: "queued",
      source: { number: parsed.number, kind: parsed.kind },
      linked: [],
      linkedNotFollowed: 0,
      cacheHit: null,
      decisionsSaved: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.keep(inv);
    this.inFlight.set(key, inv.id);
    const finished = this.gate(() => this.run(inv, ref, octokit)).finally(() => {
      if (this.inFlight.get(key) === inv.id) this.inFlight.delete(key);
      this.finished.delete(inv.id);
    });
    this.finished.set(inv.id, finished);
    return { ...inv };
  }

  /** Resolves with the final record once the run has finished (immediately if it has). */
  public async whenFinished(
    id: string,
    projectId: string
  ): Promise<Investigation | null> {
    await this.finished.get(id);
    return this.get(id, projectId);
  }

  /** Returns a copy, only when it belongs to the given project. */
  public get(id: string, projectId: string): Investigation | null {
    const inv = this.runs.get(id);
    return inv && inv.projectId === projectId ? { ...inv } : null;
  }

  /** Runs one investigation to the end. Never throws; the outcome is on the record. */
  public async run(
    inv: Investigation,
    ref: RepoRef,
    getOctokit: () => Promise<Octokit>
  ): Promise<void> {
    const set = (patch: Partial<Investigation>) => {
      Object.assign(inv, patch, { updatedAt: new Date().toISOString() });
    };
    const { db, store } = this.deps;
    const projectId = inv.projectId;

    // ---- 1. fetch the requested thread and its direct references from GitHub ----
    let kind: ThreadKind;
    let linkedError: string | undefined;
    try {
      set({ status: "fetching" });
      const octokit = await getOctokit();
      const main = await fetchThreadsByNumber(octokit, ref, [inv.source.number], {
        reason: "referenced",
        fullConversation: true,
      });
      const issue = main.issues[0];
      const pr = main.pullRequests[0];
      if (!issue && !pr) {
        set({
          status: "not_found",
          error: `#${inv.source.number} was not found in ${ref.owner}/${ref.repo}, or is not visible to this account.`,
        });
        return;
      }
      kind = pr ? "pull_request" : "issue";
      set({
        source: {
          number: inv.source.number,
          kind,
          title: pr ? pr.pr.title : issue.issue.title,
          url: pr ? pr.pr.url : issue.issue.url,
        },
      });
      await storeThreads(octokit, ref, store, projectId, main.issues, main.pullRequests);

      // depth 1, explicit references only, never the thread itself
      const refs = (pr ?? issue).references;
      const wanted = [
        ...new Set(refs.map((r) => r.toNumber).filter((n) => n !== inv.source.number)),
      ];
      const limit = this.deps.maxLinked ?? DEFAULT_MAX_LINKED;
      const follow = wanted.slice(0, limit);
      let linked: Awaited<ReturnType<typeof fetchThreadsByNumber>> = {
        issues: [],
        pullRequests: [],
        missing: [],
      };
      try {
        if (follow.length) {
          linked = await fetchThreadsByNumber(octokit, ref, follow, {
            reason: "referenced",
            fullConversation: true,
          });
          await storeThreads(octokit, ref, store, projectId, linked.issues, linked.pullRequests);
        }
      } catch (err) {
        // The requested thread is stored; analyse it, but the result is only partial.
        const c = classifyGithubError(err);
        linkedError = `Linked threads could not be fetched (${c.status}): ${describeError(err)}`;
        linked = { issues: [], pullRequests: [], missing: [] };
      }
      const found = new Set<number>([
        inv.source.number,
        ...linked.issues.map((b) => b.issue.number),
        ...linked.pullRequests.map((b) => b.pr.number),
      ]);
      await store.upsertReferences(
        projectId,
        refs.filter((r) => found.has(r.toNumber))
      );
      set({
        linked: [
          ...linked.issues.map((b) => ({
            number: b.issue.number,
            kind: "issue" as const,
            url: b.issue.url,
          })),
          ...linked.pullRequests.map((b) => ({
            number: b.pr.number,
            kind: "pull_request" as const,
            url: b.pr.url,
          })),
        ],
        linkedNotFollowed: wanted.length - follow.length,
      });
    } catch (err) {
      const c = classifyGithubError(err);
      set({
        status: c.status,
        error: FAILURE_MESSAGES[c.status] || describeError(err),
        retryAfterSeconds: c.retryAfterSeconds,
      });
      return;
    }

    // Anything short of a complete result is reported as partial, never as done.
    const finish = (patch: Partial<Investigation>) =>
      set(
        linkedError && patch.status === "done"
          ? { ...patch, status: "partial", error: patch.error ?? linkedError }
          : patch
      );

    // ---- 2. read the stored conversation, then analyse the requested thread only ----
    try {
      set({ status: "analysing" });
      const unit = await db.loadUnit(projectId, kind, inv.source.number);
      if (!unit || unit.items.length === 0) {
        finish({ status: "done", cacheHit: false, error: "The thread has no text to analyse." });
        return;
      }
      const thread = threadView(unit);
      const problems: string[] = [];
      let modelLimit: string | undefined;

      // 2a. decisions: reuse the stored analysis when the content hash is unchanged
      let cacheHit = false;
      let saved = 0;
      let model: string | undefined;
      const prev = await db.getUnitState(projectId, kind, inv.source.number);
      if (
        prev?.status === "done" &&
        prev.contentHash === unit.hash &&
        prev.version === EXTRACTION_VERSION
      ) {
        cacheHit = true;
      } else {
        const fallbackModel = this.deps.llm.getModel();
        try {
          const out = await extractUnit(
            this.deps.llm,
            unit,
            await db.repoPaths(projectId),
            this.deps.extractor ?? {}
          );
          model = out.model || fallbackModel;
          saved = await this.deps.decisions.save(projectId, out.candidates, {
            model,
            version: EXTRACTION_VERSION,
          });
          await db.saveUnitState(projectId, kind, inv.source.number, {
            contentHash: unit.hash,
            status: "done",
            model,
            version: EXTRACTION_VERSION,
          });
        } catch (err) {
          const msg = describeLlmError(err);
          modelLimit = isDailyModelLimit(err) ? msg : undefined;
          problems.push(`Decision analysis failed: ${msg}`);
          await db.saveUnitState(projectId, kind, inv.source.number, {
            contentHash: unit.hash,
            status: "failed",
            model: fallbackModel,
            version: EXTRACTION_VERSION,
            error: msg,
          });
        }
      }

      // 2b. the evidence-cited account of what happened (kept in memory per content hash)
      let summary: ThreadSummary | null = null;
      let summaryError: string | undefined;
      const cacheKey = `${projectId}:${kind}:${inv.source.number}:${unit.hash}:${SUMMARY_VERSION}`;
      const cached = this.summaries.get(cacheKey);
      if (cached) {
        summary = cached;
      } else if (modelLimit) {
        // the same daily quota covers the summary: do not make a second doomed call
        summaryError = modelLimit;
      } else {
        try {
          const out = await summariseThread(this.deps.llm, unit, this.deps.extractor ?? {});
          summary = out.summary;
          model ??= out.model;
          this.rememberSummary(cacheKey, summary);
        } catch (err) {
          summaryError = describeLlmError(err);
          problems.push(`Summary failed: ${summaryError}`);
        }
      }

      const decisions = await db.decisionsForThread(projectId, kind, inv.source.number);
      set({
        result: { thread, summary, summaryError, decisions },
        cacheHit,
        decisionsSaved: saved,
        model,
      });
      // Anything short of a complete result is reported as partial, never as done.
      if (problems.length > 0) {
        set({ status: "partial", error: problems.join(" ") });
      } else {
        finish({ status: "done" });
      }
    } catch (err) {
      set({ status: "failed", error: describeError(err) });
    }
  }

  private rememberSummary(key: string, summary: ThreadSummary) {
    this.summaries.set(key, summary);
    while (this.summaries.size > MAX_KEPT) {
      const oldest = this.summaries.keys().next().value;
      if (oldest === undefined) break;
      this.summaries.delete(oldest);
    }
  }

  private keep(inv: Investigation) {
    this.runs.set(inv.id, inv);
    while (this.runs.size > MAX_KEPT) {
      const oldest = this.runs.keys().next().value;
      if (oldest === undefined) break;
      this.runs.delete(oldest);
    }
  }
}

/** The conversation as stored, for display: every message with its author, time and GitHub link. */
function threadView(unit: ThreadUnit): InvestigationResult["thread"] {
  return {
    kind: unit.kind,
    number: unit.number,
    title: unit.title,
    url: unit.url,
    state: unit.state,
    itemCount: unit.items.length,
    items: unit.items.map((i) => ({
      ref: i.ref,
      sourceType: i.sourceType,
      author: i.author,
      text: i.text,
      url: i.url,
      at: i.at ? i.at.toISOString() : null,
      ...(i.path != null ? { path: i.path, line: i.line ?? null } : {}),
    })),
  };
}

/** Stores fetched threads like the importer does, completing what one GraphQL page could not carry. */
async function storeThreads(
  octokit: Octokit,
  ref: RepoRef,
  store: SyncStore,
  projectId: string,
  issues: IssueBundle[],
  prs: PrBundle[]
): Promise<void> {
  // An open thread is current work; anything else is history.
  for (const b of issues) b.issue.fetchReason = b.issue.state === "open" ? "open" : "referenced";
  for (const b of prs) b.pr.fetchReason = b.pr.state === "open" ? "open" : "referenced";

  if (issues.length) {
    await store.upsertIssues(projectId, issues.map((b) => b.issue));
    await store.upsertIssueComments(projectId, issues.flatMap((b) => b.comments));
    for (const b of issues.filter((x) => x.incomplete)) {
      await store.upsertIssueComments(
        projectId,
        await fetchThreadComments(octokit, ref, b.issue.number)
      );
    }
  }
  if (!prs.length) return;

  await store.upsertPullRequests(projectId, prs.map((b) => b.pr));
  await store.upsertPrComments(projectId, prs.flatMap((b) => b.comments));
  await store.upsertReviews(projectId, prs.flatMap((b) => b.reviews));
  await store.upsertReviewComments(projectId, prs.flatMap((b) => b.reviewComments));
  // files REST will rewrite (renames need the previous path) are skipped here
  await store.upsertPrFiles(
    projectId,
    prs.filter((b) => !b.incomplete.includes("files")).flatMap((b) => b.files)
  );
  await store.upsertCommits(projectId, prs.flatMap((b) => b.commits));
  await store.upsertPrCommits(
    projectId,
    prs.flatMap((b) => b.commits.map((c) => ({ prNumber: b.pr.number, sha: c.sha })))
  );

  for (const b of prs) {
    const n = b.pr.number;
    for (const part of b.incomplete) {
      if (part === "comments") {
        await store.upsertPrComments(projectId, await fetchThreadComments(octokit, ref, n));
      } else if (part === "reviews") {
        await store.upsertReviews(projectId, await fetchReviews(octokit, ref, n));
      } else if (part === "inline") {
        await store.upsertReviewComments(projectId, await fetchReviewComments(octokit, ref, n));
      } else if (part === "files") {
        await store.upsertPrFiles(projectId, await fetchPrFiles(octokit, ref, n, b.pr.headSha));
      } else if (part === "commits") {
        const commits = await fetchPrCommits(octokit, ref, n);
        await store.upsertCommits(projectId, commits);
        await store.upsertPrCommits(
          projectId,
          commits.map((c) => ({ prNumber: n, sha: c.sha }))
        );
      }
    }
  }
}
