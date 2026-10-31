import { createUserOctokit } from "./github.client";
import { githubAuthService } from "./github.auth.service";
import { githubInstallationService } from "./github.installation.service";
import { GithubRepositoryDto } from "./github.types";
import { prisma } from "../../database";
import { describeError } from "./sync/github.errors";
import type { Octokit } from "octokit";

export interface ListRepositoriesOptions {
  installationId?: string;
  search?: string;
  visibility?: "all" | "public" | "private";
  page?: number;
  perPage?: number;
}

export interface ListRepositoriesResult {
  repositories: GithubRepositoryDto[];
  totalCount: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  /** Installations GitHub could not list right now (their repositories are missing from the result). */
  warnings: { installationId: string; accountLogin: string; message: string }[];
}

export interface GithubRepositoryDeps {
  getAccessToken?: (userId: string) => Promise<string>;
  getOctokit?: (accessToken: string) => Octokit;
  getUserInstallations?: (
    userId: string
  ) => Promise<
    Array<{ installationId: string; accountLogin: string; id?: string }>
  >;
  verifyUserInstallationAccess?: (
    userId: string,
    installationId: string
  ) => Promise<boolean>;
  getExistingProjects?: (
    userId: string
  ) => Promise<Array<{ githubRepoId: bigint; slug: string }>>;
}

function concurrencyFromEnv(): number {
  const n = Number(process.env.GITHUB_MAX_CONCURRENCY);
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : 4;
}

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

function cacheTtlMs(): number {
  const n = Number(process.env.REPO_LIST_CACHE_TTL_SECONDS);
  return (Number.isInteger(n) && n >= 0 ? n : 60) * 1000;
}

interface CacheEntry {
  expiresAt: number;
  repos: GithubRepositoryDto[];
  warnings: ListRepositoriesResult["warnings"];
}

export class GithubRepositoryService {
  private readonly deps: Required<GithubRepositoryDeps>;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<
    string,
    Promise<{
      repos: GithubRepositoryDto[];
      warnings: ListRepositoriesResult["warnings"];
    }>
  >();

  constructor(deps?: GithubRepositoryDeps) {
    this.deps = {
      getAccessToken:
        deps?.getAccessToken ??
        ((id) => githubAuthService.getValidAccessToken(id)),
      getOctokit:
        deps?.getOctokit ?? ((token) => createUserOctokit(token) as Octokit),
      getUserInstallations:
        deps?.getUserInstallations ??
        ((id) => githubInstallationService.getUserInstallations(id)),
      verifyUserInstallationAccess:
        deps?.verifyUserInstallationAccess ??
        ((userId, instId) =>
          githubInstallationService.verifyUserInstallationAccess(
            userId,
            instId
          )),
      getExistingProjects:
        deps?.getExistingProjects ??
        ((userId) =>
          prisma.project.findMany({
            where: { userId },
            select: { githubRepoId: true, slug: true },
          })),
    };
  }

  /**
   * Invalidates cached repositories for a specific user, or for all users.
   */
  public invalidateCache(userId?: string): void {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Returns current count of cached user entries (useful for diagnostics & tests).
   */
  public getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Fetches all repositories across installations in parallel with in-flight deduplication and caching.
   */
  private async fetchAllUserRepos(
    userId: string,
    userInstallations: Array<{ installationId: string; accountLogin: string }>,
    octokit: Octokit
  ): Promise<{
    repos: GithubRepositoryDto[];
    warnings: ListRepositoriesResult["warnings"];
  }> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      return { repos: cached.repos, warnings: cached.warnings };
    }

    const pending = this.inFlight.get(userId);
    if (pending) {
      return pending;
    }

    const fetchPromise = (async () => {
      const existingProjects = await this.deps.getExistingProjects(userId);
      const connectedMap = new Map<string, string>();
      for (const p of existingProjects) {
        connectedMap.set(p.githubRepoId.toString(), p.slug);
      }

      const allRepos: GithubRepositoryDto[] = [];
      const warnings: ListRepositoriesResult["warnings"] = [];
      const gate = createGate(concurrencyFromEnv());

      const tasks = userInstallations.map((inst) =>
        gate(async () => {
          try {
            const instIdNum = parseInt(inst.installationId, 10);
            const repos = await octokit.paginate(
              octokit.rest.apps.listInstallationReposForAuthenticatedUser,
              { installation_id: instIdNum, per_page: 100 }
            );

            for (const repo of repos) {
              const repoIdStr = repo.id.toString();
              const isPrivate = repo.private;

              allRepos.push({
                id: repoIdStr,
                name: repo.name,
                fullName: repo.full_name,
                owner: repo.owner.login,
                ownerId: repo.owner.id.toString(),
                ownerAvatarUrl: repo.owner.avatar_url,
                description: repo.description,
                htmlUrl: repo.html_url,
                defaultBranch: repo.default_branch,
                isPrivate,
                primaryLanguage: repo.language || null,
                isFork: repo.fork,
                isArchived: repo.archived,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                createdAt: repo.created_at || new Date().toISOString(),
                updatedAt: repo.updated_at || new Date().toISOString(),
                installationId: inst.installationId,
                connected: connectedMap.has(repoIdStr),
                projectSlug: connectedMap.get(repoIdStr),
              });
            }
          } catch (err) {
            console.warn(
              `[GitHub Repos] Error fetching repos for installation ${inst.installationId}:`,
              err instanceof Error ? err.message : err
            );
            warnings.push({
              installationId: inst.installationId,
              accountLogin: inst.accountLogin,
              message: describeError(err),
            });
          }
        })
      );

      await Promise.all(tasks);

      const ttl = cacheTtlMs();
      if (ttl > 0) {
        this.cache.set(userId, {
          expiresAt: Date.now() + ttl,
          repos: allRepos,
          warnings,
        });
      }

      return { repos: allRepos, warnings };
    })();

    this.inFlight.set(userId, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      this.inFlight.delete(userId);
    }
  }

  /**
   * Fetches repositories accessible to the user through their authorized GitHub App installations.
   */
  public async listRepositories(
    userId: string,
    options: ListRepositoriesOptions = {}
  ): Promise<ListRepositoriesResult> {
    const accessToken = await this.deps.getAccessToken(userId);
    const octokit = this.deps.getOctokit(accessToken);

    const {
      installationId,
      search = "",
      visibility = "all",
      page = 1,
      perPage = 30,
    } = options;

    if (installationId) {
      const hasAccess = await this.deps.verifyUserInstallationAccess(
        userId,
        installationId
      );
      if (!hasAccess) {
        throw new Error("Unauthorized access to this GitHub installation.");
      }
    }

    const userInstallations = await this.deps.getUserInstallations(userId);
    const targetInstallations = userInstallations.map((i) => ({
      installationId: i.installationId,
      accountLogin: i.accountLogin,
    }));

    const { repos, warnings } = await this.fetchAllUserRepos(
      userId,
      targetInstallations,
      octokit
    );

    let filtered = repos;
    if (installationId) {
      filtered = filtered.filter(
        (r) => r.installationId === String(installationId)
      );
    }
    if (visibility === "public") {
      filtered = filtered.filter((r) => !r.isPrivate);
    } else if (visibility === "private") {
      filtered = filtered.filter((r) => r.isPrivate);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.fullName.toLowerCase().includes(q)
      );
    }

    // Sort by updated date descending
    filtered = [...filtered].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    const totalCount = filtered.length;
    const startIndex = (page - 1) * perPage;
    const paginated = filtered.slice(startIndex, startIndex + perPage);

    return {
      repositories: paginated,
      totalCount,
      page,
      perPage,
      hasMore: startIndex + perPage < totalCount,
      warnings: installationId
        ? warnings.filter((w) => w.installationId === String(installationId))
        : warnings,
    };
  }

  /**
   * Fetches metadata for a single repository and validates user access through authorized installations.
   */
  public async getRepositoryDetails(
    userId: string,
    repositoryId: number | string
  ): Promise<{
    repository: GithubRepositoryDto;
    installationRecordId?: string;
  }> {
    const targetRepoId = repositoryId.toString();

    // Check user repo cache first
    const cached = this.cache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      const match = cached.repos.find((r) => r.id === targetRepoId);
      if (match) {
        const userInstallations = await this.deps.getUserInstallations(userId);
        const inst = userInstallations.find(
          (i) => i.installationId === match.installationId
        );
        return {
          repository: match,
          installationRecordId: inst?.id,
        };
      }
    }

    const accessToken = await this.deps.getAccessToken(userId);
    const octokit = this.deps.getOctokit(accessToken);

    const userInstallations = await this.deps.getUserInstallations(userId);

    for (const inst of userInstallations) {
      try {
        const instIdNum = parseInt(inst.installationId, 10);
        const repos = await octokit.paginate(
          octokit.rest.apps.listInstallationReposForAuthenticatedUser,
          { installation_id: instIdNum, per_page: 100 }
        );

        const match = repos.find(
          (r: { id: number | string }) => r.id.toString() === targetRepoId
        );
        if (match) {
          return {
            repository: {
              id: match.id.toString(),
              name: match.name,
              fullName: match.full_name,
              owner: match.owner.login,
              ownerId: match.owner.id.toString(),
              ownerAvatarUrl: match.owner.avatar_url,
              description: match.description,
              htmlUrl: match.html_url,
              defaultBranch: match.default_branch,
              isPrivate: match.private,
              primaryLanguage: match.language || null,
              isFork: match.fork,
              isArchived: match.archived,
              stars: match.stargazers_count,
              forks: match.forks_count,
              createdAt: match.created_at || new Date().toISOString(),
              updatedAt: match.updated_at || new Date().toISOString(),
              installationId: inst.installationId,
            },
            installationRecordId: inst.id,
          };
        }
      } catch (err) {
        console.warn(
          `[GitHub Repos] Error checking installation ${inst.installationId}:`,
          err
        );
      }
    }

    throw new Error(
      "Repository not found or access denied under current GitHub App installations."
    );
  }
}

export const githubRepositoryService = new GithubRepositoryService();
