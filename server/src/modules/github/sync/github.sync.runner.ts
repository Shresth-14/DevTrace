import type { Octokit } from "octokit";
import {
  discussionsEnabled,
  fetchCommits,
  fetchDiscussions,
  fetchIssues,
  fetchPrCommits,
  fetchPrFiles,
  fetchPullRequests,
  fetchRepoTree,
  fetchReviewComments,
  fetchReviews,
  fetchThreadComments,
  type RepoRef,
} from "./github.fetchers";
import {
  fetchIssuesBulk,
  fetchOpenTotals,
  fetchPullRequestsBulk,
  fetchThreadsByNumber,
  isAccessProblem,
  type IssueBundle,
  type PrBundle,
} from "./github.bulk";
import { SyncAccessError, describeError } from "./github.errors";
import type {
  FetchReason,
  ReferenceRow,
  ResourceName,
  ResourceResult,
  ResourceResults,
  SyncStore,
  WriteStats,
} from "./github.sync.types";

export interface ImportLimits {
  /** Max open issues / open PRs imported (most recently updated first). */
  issues: number;
  pullRequests: number;
  commits: number;
  discussions: number;
  /** Max older issues/PRs fetched because current work links to them. */
  referenced: number;
}

export type ThreadsReadyPhase = "current" | "history";

export interface RunSyncInput {
  octokit: Octokit;
  store: SyncStore;
  project: { id: string; owner: string; repo: string; defaultBranch: string };
  /** full ignores stored checkpoints; incremental only fetches what changed. */
  mode: "full" | "incremental";
  /** Max threads handled in parallel when completing or falling back to REST. */
  concurrency?: number;
  /** Per-resource caps. Unlimited when omitted. */
  limits?: Partial<ImportLimits>;
  /** Called after resources finish so the UI can show live progress. Errors are ignored. */
  onProgress?: (resources: ResourceResults) => void | Promise<void>;
  /**
   * Called when analysis can start: first as soon as the CURRENT work (open issues and
   * PRs, open discussions, file tree) is stored, again once linked history is stored.
   */
  onThreadsReady?: (phase: ThreadsReadyPhase) => void | Promise<void>;
  /** Use the per-thread REST path instead of bulk GraphQL (also the automatic fallback). */
  forceRest?: boolean;
  now?: () => Date;
}

export interface RunSyncOutput {
  status: "completed" | "partial" | "failed";
  resources: ResourceResults;
}

// Back off a little so items updated while the run was in flight are re-read next time.
const CHECKPOINT_SKEW_MS = 60_000;
const PROGRESS_INTERVAL_MS = 400;
/** Closed-since threads that were never part of current work are refreshed in batches of this size. */
const MAX_RECONCILE = 100;

/** Caps how many thread-level requests are in flight, shared by every importer. */
function createGate(size: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= size) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

const isOpen = (state: string) => state === "open";
const CURRENT: ReadonlySet<FetchReason> = new Set(["open", "referenced"]);

export async function runSync(input: RunSyncInput): Promise<RunSyncOutput> {
  const { octokit, store, project, mode } = input;
  const concurrency = input.concurrency ?? 6;
  const gate = createGate(concurrency);
  const pool = async <T>(
    items: T[],
    worker: (item: T) => Promise<void>
  ): Promise<void> => {
    await Promise.all(items.map((item) => gate(() => worker(item))));
  };
  const limits: ImportLimits = {
    issues: input.limits?.issues ?? Infinity,
    pullRequests: input.limits?.pullRequests ?? Infinity,
    commits: input.limits?.commits ?? Infinity,
    discussions: input.limits?.discussions ?? Infinity,
    referenced: input.limits?.referenced ?? Infinity,
  };
  const startedAt = (input.now ?? (() => new Date()))();
  const checkpoint = new Date(
    startedAt.getTime() - CHECKPOINT_SKEW_MS
  ).toISOString();
  const ref: RepoRef = { owner: project.owner, repo: project.repo };
  const resources: ResourceResults = {};

  let lastReport = 0;
  const report = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < PROGRESS_INTERVAL_MS) return;
    lastReport = now;
    try {
      await input.onProgress?.(resources);
    } catch {
      // progress reporting must never break the import
    }
  };

  // 1. Validate that the credentials can actually read the repository.
  try {
    await octokit.rest.repos.get(ref);
  } catch (err) {
    throw new SyncAccessError(
      `Cannot access ${ref.owner}/${ref.repo}: ${describeError(err)}`
    );
  }

  const stored = mode === "full" ? {} : await store.getCursor(project.id);
  // First run (or forced full): everything that is OPEN. Afterwards: whatever changed
  // since the checkpoint in ANY state, so closures and merges are noticed.
  const openOnlyIssues = mode === "full" || !stored.issues;
  const openOnlyPrs = mode === "full" || !stored.pullRequests;
  const openOnly = openOnlyIssues && openOnlyPrs;

  const begin = (name: ResourceName): ResourceResult => {
    const r: ResourceResult = { status: "ok", count: 0 };
    resources[name] = r;
    return r;
  };
  const addStats = (r: ResourceResult, s: WriteStats) => {
    r.stored = (r.stored ?? 0) + s.created + s.updated;
    r.unchanged = (r.unchanged ?? 0) + s.unchanged;
  };
  const advance = async (name: ResourceName) => {
    if (resources[name]?.status === "ok") {
      await store.setCursor(project.id, name, checkpoint);
    }
  };
  const track = async (
    name: ResourceName,
    work: (result: ResourceResult) => Promise<void>
  ) => {
    const result = begin(name);
    try {
      await work(result);
    } catch (err) {
      result.status = "error";
      result.error = describeError(err);
    }
    await report();
  };

  // Failures are counted per thread: one bad thread must not hide the rest.
  const failures: Record<string, { failed: number; first?: string }> = {};
  const attempt = async (
    name: ResourceName,
    result: ResourceResult,
    work: () => Promise<number>
  ) => {
    try {
      result.count += await work();
    } catch (err) {
      const f = (failures[name] ??= { failed: 0 });
      f.failed += 1;
      f.first ??= describeError(err);
    }
  };
  const settle = (
    name: ResourceName,
    result: ResourceResult,
    total: number
  ) => {
    const f = failures[name];
    if (!f) return;
    result.failed = f.failed;
    result.status = f.failed >= total ? "error" : "partial";
    result.error = `${f.failed} of ${total} thread(s) failed: ${f.first}`;
  };

  // GitHub's own totals, so we can say what exists vs what we imported.
  let totals: {
    issues: number;
    pullRequests: number;
    discussions: number;
  } | null = null;
  try {
    totals = await fetchOpenTotals(octokit, ref);
  } catch {
    // unknown totals are reported as unknown, never guessed
  }

  // ---- shared state for reference discovery ----------------------------------------
  const currentIssues = new Set<number>();
  const currentPrs = new Set<number>();
  const references: ReferenceRow[] = [];

  // ---- REST building blocks (complete bulk pages, and the fallback path) ------------
  /**
   * Accounts for rows fetched through REST. When the rows were NOT already written by a
   * bulk page (fallback path, changed-files completion) they are counted in full; when
   * REST is only completing a page the bulk query partly carried, just the additional
   * records count, so nothing is counted twice.
   */
  const accountRest = (
    r: ResourceResult,
    rows: number,
    stats: WriteStats,
    exclusive: boolean
  ) => {
    if (exclusive) {
      r.count += rows;
      addStats(r, stats);
    } else {
      r.count += stats.created;
      r.stored = (r.stored ?? 0) + stats.created + stats.updated;
    }
  };

  const restPrParts = async (
    number: number,
    headSha: string,
    parts: ReadonlyArray<
      "comments" | "reviews" | "inline" | "files" | "commits"
    >,
    r: {
      comments: ResourceResult;
      reviews: ResourceResult;
      inline: ResourceResult;
      files: ResourceResult;
      commits: ResourceResult;
    },
    fallback: boolean
  ) => {
    const has = (p: (typeof parts)[number]) => parts.includes(p);
    if (has("comments")) {
      await attempt("prComments", r.comments, async () => {
        const rows = await fetchThreadComments(octokit, ref, number);
        const st = await store.upsertPrComments(project.id, rows);
        accountRest(r.comments, rows.length, st, fallback);
        return 0;
      });
    }
    if (has("reviews")) {
      await attempt("prReviews", r.reviews, async () => {
        const rows = await fetchReviews(octokit, ref, number);
        const st = await store.upsertReviews(project.id, rows);
        accountRest(r.reviews, rows.length, st, fallback);
        return 0;
      });
    }
    if (has("inline")) {
      await attempt("reviewComments", r.inline, async () => {
        const rows = await fetchReviewComments(octokit, ref, number);
        const st = await store.upsertReviewComments(project.id, rows);
        accountRest(r.inline, rows.length, st, fallback);
        return 0;
      });
    }
    if (has("files")) {
      await attempt("prFiles", r.files, async () => {
        const rows = await fetchPrFiles(octokit, ref, number, headSha);
        const st = await store.upsertPrFiles(project.id, rows);
        // bulk pages skip these rows entirely, so REST is their only source
        accountRest(r.files, rows.length, st, true);
        return 0;
      });
    }
    if (has("commits")) {
      await attempt("prCommits", r.commits, async () => {
        const commits = await fetchPrCommits(octokit, ref, number);
        await store.upsertCommits(project.id, commits);
        const st = await store.upsertPrCommits(
          project.id,
          commits.map((c) => ({ prNumber: number, sha: c.sha }))
        );
        accountRest(r.commits, commits.length, st, fallback);
        return 0;
      });
    }
  };

  // ---- writers: one place that stores a page of bundles and keeps the counts --------
  const issueResults = {
    issues: begin("issues"),
    comments: begin("issueComments"),
  };
  const prResults = {
    pr: begin("pullRequests"),
    comments: begin("prComments"),
    reviews: begin("prReviews"),
    inline: begin("reviewComments"),
    files: begin("prFiles"),
    commits: begin("prCommits"),
  };
  const incompleteIssueThreads: number[] = [];
  const completions: {
    number: number;
    headSha: string;
    parts: PrBundle["incomplete"];
  }[] = [];
  let usedRestIssues = input.forceRest === true;
  let usedRestPrs = input.forceRest === true;

  /**
   * Threads that closed since they were last seen keep their full conversation only if
   * they were part of current work before; anything else becomes metadata only.
   */
  const settleClosed = async <T extends IssueBundle | PrBundle>(
    kind: "issue" | "pull_request",
    bundles: T[]
  ): Promise<T[]> => {
    const row = (b: T) => ("issue" in b ? b.issue : b.pr);
    const closed = bundles.filter((b) => !isOpen(row(b).state));
    if (closed.length === 0) return bundles;
    const known = await store.findStored(
      project.id,
      kind,
      closed.map((b) => row(b).number)
    );
    for (const b of closed) {
      const reason = known.get(row(b).number);
      if (reason && CURRENT.has(reason)) continue; // stays current: keep everything
      row(b).fetchReason = "legacy";
      b.references = [];
      if ("issue" in b) {
        b.comments = [];
        b.relevant = false;
        b.incomplete = false;
      } else {
        b.comments = [];
        b.reviews = [];
        b.reviewComments = [];
        b.commits = [];
        b.relevant = false;
        b.incomplete = b.incomplete.filter((p) => p === "files");
      }
    }
    return bundles;
  };

  const writeIssueBundles = async (
    bundles: IssueBundle[],
    r: typeof issueResults,
    countAsCurrent: boolean
  ) => {
    addStats(
      r.issues,
      await store.upsertIssues(
        project.id,
        bundles.map((b) => b.issue)
      )
    );
    r.issues.count += bundles.length;
    r.issues.selected =
      (r.issues.selected ?? 0) + bundles.filter((b) => b.relevant).length;
    r.issues.skipped =
      (r.issues.skipped ?? 0) + bundles.filter((b) => !b.relevant).length;
    const comments = bundles.flatMap((b) => b.comments);
    addStats(r.comments, await store.upsertIssueComments(project.id, comments));
    r.comments.count += comments.length;
    for (const b of bundles) {
      if (b.incomplete) incompleteIssueThreads.push(b.issue.number);
      if (countAsCurrent) currentIssues.add(b.issue.number);
      references.push(...b.references);
    }
  };

  const writePrBundles = async (
    bundles: PrBundle[],
    r: typeof prResults,
    countAsCurrent: boolean
  ) => {
    addStats(
      r.pr,
      await store.upsertPullRequests(
        project.id,
        bundles.map((b) => b.pr)
      )
    );
    const comments = bundles.flatMap((b) => b.comments);
    const reviews = bundles.flatMap((b) => b.reviews);
    const inline = bundles.flatMap((b) => b.reviewComments);
    // Files that REST will rewrite (renames need the previous path, which GraphQL
    // lacks) are skipped here, otherwise they would flip between two versions.
    const files = bundles
      .filter((b) => !b.incomplete.includes("files"))
      .flatMap((b) => b.files);
    const commits = bundles.flatMap((b) => b.commits);
    const [sc, sr, si, sf, , sk] = await Promise.all([
      store.upsertPrComments(project.id, comments),
      store.upsertReviews(project.id, reviews),
      store.upsertReviewComments(project.id, inline),
      store.upsertPrFiles(project.id, files),
      store.upsertCommits(project.id, commits),
      store.upsertPrCommits(
        project.id,
        bundles.flatMap((b) =>
          b.commits.map((c) => ({ prNumber: b.pr.number, sha: c.sha }))
        )
      ),
    ]);
    addStats(r.comments, sc);
    addStats(r.reviews, sr);
    addStats(r.inline, si);
    addStats(r.files, sf);
    addStats(r.commits, sk);
    r.pr.count += bundles.length;
    r.pr.selected =
      (r.pr.selected ?? 0) + bundles.filter((b) => b.relevant).length;
    r.pr.skipped =
      (r.pr.skipped ?? 0) + bundles.filter((b) => !b.relevant).length;
    r.comments.count += comments.length;
    r.reviews.count += reviews.length;
    r.inline.count += inline.length;
    r.files.count += files.length;
    r.commits.count += commits.length;
    for (const b of bundles) {
      if (b.incomplete.length > 0) {
        completions.push({
          number: b.pr.number,
          headSha: b.pr.headSha,
          parts: b.incomplete,
        });
      }
      if (countAsCurrent) currentPrs.add(b.pr.number);
      references.push(...b.references);
    }
  };

  // ---- CURRENT WORK: open issues ----------------------------------------------------
  const importIssues = async () => {
    const r = issueResults;
    if (totals) r.issues.discovered = totals.issues;

    const viaBulk = async () => {
      for await (const raw of fetchIssuesBulk(octokit, ref, {
        states: openOnlyIssues ? ["OPEN"] : undefined,
        since: openOnlyIssues ? undefined : stored.issues,
        limit: limits.issues,
        reason: "open",
      })) {
        const bundles = openOnlyIssues ? raw : await settleClosed("issue", raw);
        await writeIssueBundles(bundles, r, true);
        await report();
      }
    };
    const viaRest = async () => {
      const changed: number[] = [];
      for await (const rows of fetchIssues(
        octokit,
        ref,
        openOnlyIssues ? undefined : stored.issues,
        limits.issues,
        openOnlyIssues ? "open" : "all"
      )) {
        const tagged = rows.map((x) => ({
          ...x,
          fetchReason: (isOpen(x.state) ? "open" : "legacy") as FetchReason,
        }));
        addStats(r.issues, await store.upsertIssues(project.id, tagged));
        r.issues.count += rows.length;
        for (const i of tagged) {
          if (i.fetchReason === "open") {
            changed.push(i.number);
            currentIssues.add(i.number);
          }
        }
      }
      r.issues.selected = changed.length;
      incompleteIssueThreads.push(...changed);
    };

    try {
      if (input.forceRest) await viaRest();
      else await viaBulk();
    } catch (err) {
      if (input.forceRest || isAccessProblem(err)) {
        r.issues.status = "error";
        r.issues.error = describeError(err);
      } else {
        try {
          usedRestIssues = true;
          r.issues.count = 0;
          r.comments.count = 0;
          incompleteIssueThreads.length = 0;
          await viaRest();
          r.issues.note =
            "Imported with the slower REST path (bulk query failed); linked history was not followed.";
        } catch (restErr) {
          r.issues.status = "error";
          r.issues.error = describeError(restErr);
        }
      }
    }

    // Threads GraphQL could not fully carry (or REST fallback threads): per-thread comments.
    await pool(incompleteIssueThreads, (number) =>
      attempt("issueComments", r.comments, async () => {
        const rows = await fetchThreadComments(octokit, ref, number);
        const st = await store.upsertIssueComments(project.id, rows);
        accountRest(r.comments, rows.length, st, usedRestIssues);
        return 0;
      })
    );
    settle("issueComments", r.comments, incompleteIssueThreads.length);
    if (r.issues.status !== "ok" && r.comments.status === "ok") {
      r.comments.status = "skipped";
    }
    await report(true);
    if (r.issues.status === "ok" && r.comments.status === "ok") {
      await store.setCursor(project.id, "issues", checkpoint);
      await store.setCursor(project.id, "issueComments", checkpoint);
    }
  };

  // ---- CURRENT WORK: open pull requests ---------------------------------------------
  const importPullRequests = async () => {
    const r = prResults;
    if (totals) r.pr.discovered = totals.pullRequests;

    const viaBulk = async () => {
      for await (const raw of fetchPullRequestsBulk(octokit, ref, {
        states: openOnlyPrs ? ["OPEN"] : undefined,
        since: openOnlyPrs ? undefined : stored.pullRequests,
        limit: limits.pullRequests,
        reason: "open",
      })) {
        const bundles = openOnlyPrs
          ? raw
          : await settleClosed("pull_request", raw);
        await writePrBundles(bundles, r, true);
        await report();
      }
    };
    const viaRest = async () => {
      const changed: { number: number; headSha: string }[] = [];
      for await (const rows of fetchPullRequests(
        octokit,
        ref,
        openOnlyPrs ? undefined : stored.pullRequests,
        limits.pullRequests,
        openOnlyPrs ? "open" : "all"
      )) {
        const tagged = rows.map((x) => ({
          ...x,
          fetchReason: (isOpen(x.state) ? "open" : "legacy") as FetchReason,
        }));
        addStats(r.pr, await store.upsertPullRequests(project.id, tagged));
        r.pr.count += rows.length;
        for (const p of tagged) {
          if (p.fetchReason === "open") {
            changed.push({ number: p.number, headSha: p.headSha });
            currentPrs.add(p.number);
          }
        }
      }
      r.pr.selected = changed.length;
      for (const c of changed) {
        completions.push({
          ...c,
          parts: ["comments", "reviews", "inline", "files", "commits"],
        });
      }
    };

    try {
      if (input.forceRest) await viaRest();
      else await viaBulk();
    } catch (err) {
      if (input.forceRest || isAccessProblem(err)) {
        r.pr.status = "error";
        r.pr.error = describeError(err);
      } else {
        try {
          usedRestPrs = true;
          for (const x of Object.values(r)) x.count = 0;
          completions.length = 0;
          await viaRest();
          r.pr.note =
            "Imported with the slower REST path (bulk query failed); linked history was not followed.";
        } catch (restErr) {
          r.pr.status = "error";
          r.pr.error = describeError(restErr);
        }
      }
    }
    await completePrs(r);
    await report(true);
    if (Object.values(r).every((x) => x.status === "ok")) {
      for (const name of ["pullRequests", "prComments"] as const) {
        await store.setCursor(project.id, name, checkpoint);
      }
    }
  };

  const completePrs = async (r: typeof prResults) => {
    const batch = completions.splice(0, completions.length);
    await pool(batch, (c) =>
      restPrParts(c.number, c.headSha, c.parts, r, usedRestPrs)
    );
    settle("prComments", r.comments, batch.length);
    settle("prReviews", r.reviews, batch.length);
    settle("reviewComments", r.inline, batch.length);
    settle("prFiles", r.files, batch.length);
    settle("prCommits", r.commits, batch.length);
  };

  // ---- Commits, discussions, tree ----------------------------------------------------
  const importCommits = () =>
    track("commits", async (r) => {
      for await (const rows of fetchCommits(
        octokit,
        ref,
        project.defaultBranch,
        stored.commits,
        limits.commits
      )) {
        addStats(r, await store.upsertCommits(project.id, rows));
        r.count += rows.length;
      }
      if (Number.isFinite(limits.commits) && r.count >= limits.commits) {
        r.note = `Limited to the ${limits.commits} most recent.`;
      }
    }).then(() => advance("commits"));

  const importDiscussions = () =>
    track("discussions", async (r) => {
      if (totals) r.discovered = totals.discussions;
      if (!(await discussionsEnabled(octokit, ref))) {
        r.status = "skipped";
        r.error = "Discussions are not enabled for this repository.";
        return;
      }
      for await (const batch of fetchDiscussions(
        octokit,
        ref,
        stored.discussions,
        limits.discussions
      )) {
        addStats(
          r,
          await store.upsertDiscussions(project.id, batch.discussions)
        );
        await store.upsertDiscussionComments(project.id, batch.comments);
        r.count += batch.discussions.length;
      }
      if (
        Number.isFinite(limits.discussions) &&
        r.count >= limits.discussions
      ) {
        r.note = `Limited to the ${limits.discussions} most recently updated.`;
      }
    }).then(() => advance("discussions"));

  const importTree = () =>
    track("repoFiles", async (r) => {
      const { rows, truncated } = await fetchRepoTree(
        octokit,
        ref,
        project.defaultBranch
      );
      if (truncated) {
        // A truncated tree must not be used to delete paths from the snapshot.
        await store.upsertRepoFilesOnly(project.id, rows);
        r.status = "partial";
        r.error =
          "Repository tree was truncated by GitHub; snapshot is incomplete.";
      } else {
        await store.replaceRepoFiles(project.id, rows);
      }
      r.count = rows.length;
    });

  // ---- PRIORITY 2: older threads that current work explicitly links to ---------------
  const importLinkedHistory = async () => {
    if (input.forceRest || usedRestIssues || usedRestPrs) return;
    const histIssues = begin("historicalIssues");
    const histPrs = begin("historicalPullRequests");
    const refsR = begin("references");
    try {
      // candidate targets: not already part of current work, strongest evidence first
      const rank = {
        closing_reference: 0,
        reference_in_body: 1,
        reference_in_comment: 2,
      };
      const byTarget = new Map<number, number>();
      for (const x of references) {
        if (currentIssues.has(x.toNumber) || currentPrs.has(x.toNumber))
          continue;
        const r = rank[x.basis];
        byTarget.set(x.toNumber, Math.min(byTarget.get(x.toNumber) ?? 9, r));
      }
      const ordered = [...byTarget.entries()]
        .sort((a, b) => a[1] - b[1] || b[0] - a[0])
        .map(([n]) => n);
      refsR.discovered = ordered.length;

      // what is already stored needs no request
      const [si, sp] = await Promise.all([
        store.findStored(project.id, "issue", ordered),
        store.findStored(project.id, "pull_request", ordered),
      ]);
      await Promise.all([
        store.markReferenced(
          project.id,
          "issue",
          ordered.filter((n) => si.get(n) === "legacy")
        ),
        store.markReferenced(
          project.id,
          "pull_request",
          ordered.filter((n) => sp.get(n) === "legacy")
        ),
      ]);
      const alreadyStored = ordered.filter((n) => si.has(n) || sp.has(n));
      const toFetch = ordered
        .filter((n) => !si.has(n) && !sp.has(n))
        .slice(0, limits.referenced);
      const notFollowed =
        ordered.length - alreadyStored.length - toFetch.length;
      refsR.skipped = alreadyStored.length;

      const found = await fetchThreadsByNumber(octokit, ref, toFetch, {
        reason: "referenced",
        fullConversation: true,
      });
      histIssues.discovered = found.issues.length;
      histPrs.discovered = found.pullRequests.length;
      await writeIssueBundles(
        found.issues,
        { issues: histIssues, comments: issueResults.comments },
        false
      );
      await writePrBundles(
        found.pullRequests,
        { ...prResults, pr: histPrs },
        false
      );
      await completePrs({ ...prResults, pr: histPrs });

      // record only relationships whose target exists locally
      const targets = new Set<number>([
        ...si.keys(),
        ...sp.keys(),
        ...found.issues.map((b) => b.issue.number),
        ...found.pullRequests.map((b) => b.pr.number),
      ]);
      const established = references.filter((x) => targets.has(x.toNumber));
      addStats(refsR, await store.upsertReferences(project.id, established));
      refsR.count = established.length;
      refsR.note =
        [
          alreadyStored.length > 0
            ? `${alreadyStored.length} linked thread(s) were already stored.`
            : "",
          notFollowed > 0
            ? `${notFollowed} more linked thread(s) were not followed (limit ${limits.referenced}).`
            : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined;
    } catch (err) {
      for (const x of [histIssues, histPrs, refsR]) {
        x.status = "error";
        x.error = describeError(err);
      }
    }
    await report(true);
  };
  // ---- keep "open" accurate: rows we stored as open that GitHub no longer lists ------
  const reconcileStaleOpen = async () => {
    if (!openOnly || input.forceRest || usedRestIssues || usedRestPrs) return;
    const open = await store.listOpenNumbers(project.id);
    const staleIssues = open.issues.filter((n) => !currentIssues.has(n));
    const stalePrs = open.pullRequests.filter((n) => !currentPrs.has(n));
    const wanted = [...staleIssues, ...stalePrs].slice(0, MAX_RECONCILE);
    if (wanted.length === 0) return;
    // "legacy" never overrides the reason a row already has: this only refreshes state.
    const found = await fetchThreadsByNumber(octokit, ref, wanted, {
      reason: "legacy",
      fullConversation: false,
    });
    await store.upsertIssues(
      project.id,
      found.issues.map((b) => b.issue)
    );
    await store.upsertPullRequests(
      project.id,
      found.pullRequests.map((b) => b.pr)
    );
  };

  // ---- run: independent resources concurrently, current work first -------------------
  const commitsTask = importCommits();
  await Promise.all([
    importTree(),
    importIssues(),
    importPullRequests(),
    importDiscussions(),
  ]);
  try {
    await input.onThreadsReady?.("current");
  } catch {
    // starting the analysis early is an optimisation; the caller starts it again if needed
  }

  await Promise.all([
    importLinkedHistory(),
    reconcileStaleOpen().catch(() => undefined),
  ]);
  try {
    await input.onThreadsReady?.("history");
  } catch {
    // see above
  }
  await commitsTask;

  // Honest accounting: compare what GitHub says is open with what is stored as open.
  if (openOnly && totals) {
    const open = await store.listOpenNumbers(project.id);
    for (const [name, storedOpen, expected, limit] of [
      ["issues", open.issues.length, totals.issues, limits.issues],
      [
        "pullRequests",
        open.pullRequests.length,
        totals.pullRequests,
        limits.pullRequests,
      ],
    ] as const) {
      const r = resources[name];
      if (!r || r.status !== "ok" || storedOpen === expected) continue;
      const limited = Number.isFinite(limit) && r.count >= limit;
      r.note = limited
        ? `Showing the ${limit} most recently updated of ${expected} open on GitHub.`
        : storedOpen < expected
          ? `GitHub lists ${expected} open; ${storedOpen} are stored (changes made during the import).`
          : `GitHub lists ${expected} open; ${storedOpen} are stored as open (some may have just closed).`;
    }
  }
  await report(true);

  const results = Object.values(resources);
  const hardFail = results.filter((r) => r.status === "error").length;
  const status =
    hardFail === 0 && results.every((r) => r.status !== "partial")
      ? "completed"
      : hardFail === results.length
        ? "failed"
        : "partial";

  return { status, resources };
}
