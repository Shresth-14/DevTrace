import type { Octokit } from "octokit";
import {
  discussionsEnabled,
  fetchCommits,
  fetchDiscussions,
  fetchIssues,
  fetchPrCommits,
  fetchPrFiles,
  fetchPullRequests,
  fetchRepoComments,
  fetchRepoTree,
  fetchReviewComments,
  fetchReviewThreads,
  fetchReviews,
  type RepoRef,
} from "./github.fetchers";
import { SyncAccessError, describeError } from "./github.errors";
import type {
  ResourceName,
  ResourceResult,
  ResourceResults,
  SyncStore,
} from "./github.sync.types";

export interface RunSyncInput {
  octokit: Octokit;
  store: SyncStore;
  project: { id: string; owner: string; repo: string; defaultBranch: string };
  /** full ignores stored checkpoints; incremental only fetches what changed. */
  mode: "full" | "incremental";
  /** Max PRs whose details (reviews, files, ...) are fetched in parallel. */
  concurrency?: number;
  now?: () => Date;
}

export interface RunSyncOutput {
  status: "completed" | "partial" | "failed";
  resources: ResourceResults;
}

// Back off a little so items updated while the run was in flight are re-read next time.
const CHECKPOINT_SKEW_MS = 60_000;

async function pool<T>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function runSync(input: RunSyncInput): Promise<RunSyncOutput> {
  const { octokit, store, project, mode } = input;
  const concurrency = input.concurrency ?? 4;
  const startedAt = (input.now ?? (() => new Date()))();
  const checkpoint = new Date(
    startedAt.getTime() - CHECKPOINT_SKEW_MS
  ).toISOString();
  const ref: RepoRef = { owner: project.owner, repo: project.repo };
  const resources: ResourceResults = {};

  // 1. Validate that the installation can actually read the repository.
  try {
    await octokit.rest.repos.get(ref);
  } catch (err) {
    throw new SyncAccessError(
      `Cannot access ${ref.owner}/${ref.repo}: ${describeError(err)}`
    );
  }

  const stored = mode === "full" ? {} : await store.getCursor(project.id);

  const advance = async (name: ResourceName) => {
    if (resources[name]?.status === "ok") {
      await store.setCursor(project.id, name, checkpoint);
    }
  };

  const track = async (
    name: ResourceName,
    work: (result: ResourceResult) => Promise<void>
  ) => {
    const result: ResourceResult = { status: "ok", count: 0 };
    resources[name] = result;
    try {
      await work(result);
    } catch (err) {
      result.status = "error";
      result.error = describeError(err);
    }
  };

  // 2. Issues
  await track("issues", async (r) => {
    for await (const rows of fetchIssues(octokit, ref, stored.issues)) {
      await store.upsertIssues(project.id, rows);
      r.count += rows.length;
    }
  });
  await advance("issues");

  // 3. Pull requests
  const changedPrs: { number: number; headSha: string }[] = [];
  await track("pullRequests", async (r) => {
    for await (const rows of fetchPullRequests(
      octokit,
      ref,
      stored.pullRequests
    )) {
      await store.upsertPullRequests(project.id, rows);
      r.count += rows.length;
      for (const p of rows) {
        changedPrs.push({ number: p.number, headSha: p.headSha });
      }
    }
  });

  // 4. Issue comments and PR conversation comments (kept in separate tables)
  await track("issueComments", async (r) => {
    resources.prComments = { status: "ok", count: 0 };
    const prResult = resources.prComments;
    const known = await store.getKnownNumbers(project.id);
    let orphaned = 0;
    for await (const rows of fetchRepoComments(
      octokit,
      ref,
      stored.issueComments
    )) {
      const issueRows = rows.filter((c) => known.issues.has(c.parentNumber));
      const prRows = rows.filter((c) => known.pullRequests.has(c.parentNumber));
      orphaned += rows.length - issueRows.length - prRows.length;
      await store.upsertIssueComments(project.id, issueRows);
      await store.upsertPrComments(project.id, prRows);
      r.count += issueRows.length;
      prResult.count += prRows.length;
    }
    if (orphaned > 0) {
      const msg = `${orphaned} comment(s) skipped because their issue/PR does not exist in the import.`;
      // Orphans are only a problem when a parent resource failed; a comment on a
      // deleted or transferred issue is expected and must not mark every sync partial.
      const parentsOk =
        resources.issues?.status === "ok" &&
        resources.pullRequests?.status === "ok";
      for (const res of [r, prResult]) {
        if (parentsOk) {
          res.note = msg;
        } else {
          res.status = "partial";
          res.error = msg;
        }
      }
    }
  });
  await advance("issueComments");
  if (resources.prComments?.status === "ok") {
    await store.setCursor(project.id, "prComments", checkpoint);
  }

  // 5. Per-PR details: reviews, inline comments (+threads), files, commits
  const detail = (name: ResourceName): ResourceResult => {
    const r: ResourceResult = { status: "ok", count: 0 };
    resources[name] = r;
    return r;
  };
  const reviewsR = detail("prReviews");
  const inlineR = detail("reviewComments");
  const filesR = detail("prFiles");
  const prCommitsR = detail("prCommits");
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

  await pool(changedPrs, concurrency, async ({ number, headSha }) => {
    await attempt("prReviews", reviewsR, async () => {
      const rows = await fetchReviews(octokit, ref, number);
      await store.upsertReviews(project.id, rows);
      return rows.length;
    });
    await attempt("reviewComments", inlineR, async () => {
      // Thread info is best-effort: inline comments are still saved without it.
      const threads = await fetchReviewThreads(octokit, ref, number).catch(
        () => new Map()
      );
      const rows = await fetchReviewComments(octokit, ref, number, threads);
      await store.upsertReviewComments(project.id, rows);
      return rows.length;
    });
    await attempt("prFiles", filesR, async () => {
      const rows = await fetchPrFiles(octokit, ref, number, headSha);
      await store.upsertPrFiles(project.id, rows);
      return rows.length;
    });
    await attempt("prCommits", prCommitsR, async () => {
      const commits = await fetchPrCommits(octokit, ref, number);
      await store.upsertCommits(project.id, commits);
      await store.upsertPrCommits(
        project.id,
        commits.map((c) => ({ prNumber: number, sha: c.sha }))
      );
      return commits.length;
    });
  });

  const detailResults: Array<[ResourceName, ResourceResult]> = [
    ["prReviews", reviewsR],
    ["reviewComments", inlineR],
    ["prFiles", filesR],
    ["prCommits", prCommitsR],
  ];
  for (const [name, r] of detailResults) {
    const f = failures[name];
    if (!f) continue;
    r.status = f.failed >= changedPrs.length ? "error" : "partial";
    r.error = `${f.failed} of ${changedPrs.length} pull request(s) failed: ${f.first}`;
  }

  // The PR checkpoint only advances once every PR detail resource is complete,
  // so a failed detail fetch is retried on the next incremental sync.
  if (
    resources.pullRequests?.status === "ok" &&
    detailResults.every(([, r]) => r.status === "ok")
  ) {
    await store.setCursor(project.id, "pullRequests", checkpoint);
  }

  // 6. Default-branch commit history
  await track("commits", async (r) => {
    for await (const rows of fetchCommits(
      octokit,
      ref,
      project.defaultBranch,
      stored.commits
    )) {
      await store.upsertCommits(project.id, rows);
      r.count += rows.length;
    }
  });
  await advance("commits");

  // 7. Discussions (may be disabled; that is not a failure)
  await track("discussions", async (r) => {
    if (!(await discussionsEnabled(octokit, ref))) {
      r.status = "skipped";
      r.error = "Discussions are not enabled for this repository.";
      return;
    }
    for await (const batch of fetchDiscussions(
      octokit,
      ref,
      stored.discussions
    )) {
      await store.upsertDiscussions(project.id, batch.discussions);
      await store.upsertDiscussionComments(project.id, batch.comments);
      r.count += batch.discussions.length;
    }
  });
  if (resources.discussions?.status === "ok") {
    await store.setCursor(project.id, "discussions", checkpoint);
  }

  // 8. Repository tree snapshot
  await track("repoFiles", async (r) => {
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
