/**
 * Phase 3 optimization tests.
 *
 * Covers:
 *   1. Parallel repo fetching bounded by GITHUB_MAX_CONCURRENCY.
 *   2. Second call within TTL makes 0 GitHub requests (cache hit).
 *   3. Two concurrent calls share a single in-flight fetch (deduplication).
 *   4. Cache is strictly per-user (no cross-user reuse).
 *   5. Invalidated cache triggers a fresh fetch.
 *   6. Search, visibility, and pagination filters apply correctly to cached data.
 */
import "../src/tests/setup-env";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GithubRepositoryService } from "../src/modules/github/github.repository.service";
import type { Octokit } from "octokit";

function makeFakeRepo(id: number, isPrivate = false, name?: string) {
  return {
    id,
    name: name ?? `repo-${id}`,
    full_name: `acme/${name ?? `repo-${id}`}`,
    owner: { id: 100, login: "acme", avatar_url: "https://avatar" },
    description: `Description for repo ${id}`,
    html_url: `https://github.com/acme/repo-${id}`,
    default_branch: "main",
    private: isPrivate,
    language: "TypeScript",
    fork: false,
    archived: false,
    stargazers_count: 42,
    forks_count: 5,
    created_at: new Date(2024, 0, id).toISOString(),
    updated_at: new Date(2024, 1, id).toISOString(),
  };
}

describe("Phase 3 — Repository listing caching & concurrency", () => {
  let paginateCalls: number;
  let concurrentExecutions: number;
  let maxConcurrentSeen: number;

  function makeMockOctokit(delayMs = 10): Octokit {
    return {
      paginate: async (_endpoint: unknown, params: { installation_id: number }) => {
        paginateCalls++;
        concurrentExecutions++;
        if (concurrentExecutions > maxConcurrentSeen) {
          maxConcurrentSeen = concurrentExecutions;
        }
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        concurrentExecutions--;
        return [
          makeFakeRepo(params.installation_id * 10 + 1, false, `public-${params.installation_id}`),
          makeFakeRepo(params.installation_id * 10 + 2, true, `private-${params.installation_id}`),
        ];
      },
      rest: {
        apps: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          listInstallationReposForAuthenticatedUser: {} as any,
        },
      },
    } as unknown as Octokit;
  }

  beforeEach(() => {
    paginateCalls = 0;
    concurrentExecutions = 0;
    maxConcurrentSeen = 0;
    delete process.env.REPO_LIST_CACHE_TTL_SECONDS;
    delete process.env.GITHUB_MAX_CONCURRENCY;
  });

  it("second call within TTL makes 0 GitHub requests (100% reduction)", async () => {
    const octokit = makeMockOctokit(5);
    const service = new GithubRepositoryService({
      getAccessToken: async () => "token-1",
      getOctokit: () => octokit,
      getUserInstallations: async () => [
        { installationId: "101", accountLogin: "acme" },
        { installationId: "102", accountLogin: "acme-corp" },
      ],
      verifyUserInstallationAccess: async () => true,
      getExistingProjects: async () => [],
    });

    // First call: cold cache -> fetches 2 installations
    const first = await service.listRepositories("user-1");
    assert.strictEqual(paginateCalls, 2, "First call must fetch both installations");
    assert.strictEqual(first.repositories.length, 4);

    const callsBefore = paginateCalls;

    // Second call: warm cache -> 0 new GitHub calls
    const second = await service.listRepositories("user-1");
    const callsAfter = paginateCalls;

    assert.strictEqual(callsAfter - callsBefore, 0, "Second call must make 0 GitHub requests");
    assert.strictEqual(second.repositories.length, 4);
    assert.strictEqual(second.totalCount, 4);
  });

  it("two concurrent calls share a single in-flight fetch", async () => {
    const octokit = makeMockOctokit(30);
    const service = new GithubRepositoryService({
      getAccessToken: async () => "token-1",
      getOctokit: () => octokit,
      getUserInstallations: async () => [
        { installationId: "201", accountLogin: "team" },
      ],
      verifyUserInstallationAccess: async () => true,
      getExistingProjects: async () => [],
    });

    // Launch 2 calls concurrently
    const [res1, res2] = await Promise.all([
      service.listRepositories("user-concurrent"),
      service.listRepositories("user-concurrent"),
    ]);

    // Should only have paginated once despite 2 callers
    assert.strictEqual(paginateCalls, 1, "Concurrent calls must be deduplicated into 1 fetch");
    assert.strictEqual(res1.repositories.length, 2);
    assert.strictEqual(res2.repositories.length, 2);
  });

  it("cache is strictly per-user and prevents cross-user pollution", async () => {
    const octokit = makeMockOctokit(5);
    const service = new GithubRepositoryService({
      getAccessToken: async () => "token",
      getOctokit: () => octokit,
      getUserInstallations: async (userId: string) => [
        { installationId: userId === "user-A" ? "301" : "302", accountLogin: "acme" },
      ],
      verifyUserInstallationAccess: async () => true,
      getExistingProjects: async () => [],
    });

    await service.listRepositories("user-A");
    assert.strictEqual(paginateCalls, 1);

    // user-B must NOT use user-A's cached data
    await service.listRepositories("user-B");
    assert.strictEqual(paginateCalls, 2, "user-B must fetch their own installations");
  });

  it("invalidated cache triggers a fresh fetch", async () => {
    const octokit = makeMockOctokit(5);
    const service = new GithubRepositoryService({
      getAccessToken: async () => "token",
      getOctokit: () => octokit,
      getUserInstallations: async () => [
        { installationId: "401", accountLogin: "acme" },
      ],
      verifyUserInstallationAccess: async () => true,
      getExistingProjects: async () => [],
    });

    await service.listRepositories("user-inv");
    assert.strictEqual(paginateCalls, 1);

    // Invalidate user-inv's cache
    service.invalidateCache("user-inv");

    // Next call must re-fetch
    await service.listRepositories("user-inv");
    assert.strictEqual(paginateCalls, 2, "Must refetch after cache invalidation");
  });

  it("parallel fetches are bounded by GITHUB_MAX_CONCURRENCY", async () => {
    process.env.GITHUB_MAX_CONCURRENCY = "2";
    const octokit = makeMockOctokit(40);
    const service = new GithubRepositoryService({
      getAccessToken: async () => "token",
      getOctokit: () => octokit,
      getUserInstallations: async () => [
        { installationId: "501", accountLogin: "a" },
        { installationId: "502", accountLogin: "b" },
        { installationId: "503", accountLogin: "c" },
        { installationId: "504", accountLogin: "d" },
      ],
      verifyUserInstallationAccess: async () => true,
      getExistingProjects: async () => [],
    });

    await service.listRepositories("user-gate");
    assert.strictEqual(paginateCalls, 4, "All 4 installations must be fetched");
    assert.ok(
      maxConcurrentSeen <= 2,
      `Expected max concurrency <= 2, got ${maxConcurrentSeen}`
    );
  });

  it("filters (search, visibility, pagination) apply correctly on cached results", async () => {
    const octokit = makeMockOctokit(0);
    const service = new GithubRepositoryService({
      getAccessToken: async () => "token",
      getOctokit: () => octokit,
      getUserInstallations: async () => [
        { installationId: "601", accountLogin: "team" },
      ],
      verifyUserInstallationAccess: async () => true,
      getExistingProjects: async () => [],
    });

    // Prime cache (installation 601 has public-601 and private-601)
    await service.listRepositories("user-filter");
    assert.strictEqual(paginateCalls, 1);

    // Visibility = public
    const pub = await service.listRepositories("user-filter", { visibility: "public" });
    assert.strictEqual(paginateCalls, 1, "Cached query must not call GitHub");
    assert.strictEqual(pub.repositories.length, 1);
    assert.strictEqual(pub.repositories[0].name, "public-601");

    // Visibility = private
    const priv = await service.listRepositories("user-filter", { visibility: "private" });
    assert.strictEqual(paginateCalls, 1);
    assert.strictEqual(priv.repositories.length, 1);
    assert.strictEqual(priv.repositories[0].name, "private-601");

    // Search filter
    const search = await service.listRepositories("user-filter", { search: "public" });
    assert.strictEqual(paginateCalls, 1);
    assert.strictEqual(search.repositories.length, 1);
    assert.strictEqual(search.repositories[0].name, "public-601");

    // Pagination
    const page1 = await service.listRepositories("user-filter", { page: 1, perPage: 1 });
    assert.strictEqual(paginateCalls, 1);
    assert.strictEqual(page1.repositories.length, 1);
    assert.strictEqual(page1.hasMore, true);
  });
});
