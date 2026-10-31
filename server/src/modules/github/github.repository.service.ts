import { createUserOctokit } from "./github.client";
import { githubAuthService } from "./github.auth.service";
import { githubInstallationService } from "./github.installation.service";
import { GithubRepositoryDto } from "./github.types";
import { prisma } from "../../database";
import { describeError } from "./sync/github.errors";

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

export class GithubRepositoryService {
  /**
   * Fetches repositories accessible to the user through their authorized GitHub App installations.
   */
  public async listRepositories(
    userId: string,
    options: ListRepositoriesOptions = {}
  ): Promise<ListRepositoriesResult> {
    const accessToken = await githubAuthService.getValidAccessToken(userId);
    const octokit = createUserOctokit(accessToken);

    const {
      installationId,
      search = "",
      visibility = "all",
      page = 1,
      perPage = 30,
    } = options;

    let targetInstallations: Array<{
      installationId: string;
      accountLogin: string;
    }> = [];
    const warnings: ListRepositoriesResult["warnings"] = [];

    if (installationId) {
      const hasAccess =
        await githubInstallationService.verifyUserInstallationAccess(
          userId,
          installationId
        );
      if (!hasAccess) {
        throw new Error("Unauthorized access to this GitHub installation.");
      }
      const own = (
        await githubInstallationService.getUserInstallations(userId)
      ).find((i) => i.installationId === String(installationId));
      targetInstallations = [
        { installationId, accountLogin: own?.accountLogin ?? "" },
      ];
    } else {
      const userInstallations =
        await githubInstallationService.getUserInstallations(userId);
      targetInstallations = userInstallations.map((i) => ({
        installationId: i.installationId,
        accountLogin: i.accountLogin,
      }));
    }

    const allRepos: GithubRepositoryDto[] = [];
    const existingProjects = await prisma.project.findMany({
      where: { userId },
      select: { githubRepoId: true, slug: true },
    });
    const connectedMap = new Map<string, string>();
    for (const p of existingProjects) {
      connectedMap.set(p.githubRepoId.toString(), p.slug);
    }

    for (const inst of targetInstallations) {
      try {
        const instIdNum = parseInt(inst.installationId, 10);
        const repos = await octokit.paginate(
          octokit.rest.apps.listInstallationReposForAuthenticatedUser,
          { installation_id: instIdNum, per_page: 100 }
        );

        for (const repo of repos) {
          const repoIdStr = repo.id.toString();
          const isPrivate = repo.private;

          // Filter by visibility if requested
          if (visibility === "public" && isPrivate) continue;
          if (visibility === "private" && !isPrivate) continue;

          // Filter by search query if requested
          if (
            search &&
            !repo.name.toLowerCase().includes(search.toLowerCase()) &&
            !repo.full_name.toLowerCase().includes(search.toLowerCase())
          ) {
            continue;
          }

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
    }

    // Sort by updated date descending
    allRepos.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    const totalCount = allRepos.length;
    const startIndex = (page - 1) * perPage;
    const paginated = allRepos.slice(startIndex, startIndex + perPage);

    return {
      repositories: paginated,
      totalCount,
      page,
      perPage,
      hasMore: startIndex + perPage < totalCount,
      warnings,
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
    const accessToken = await githubAuthService.getValidAccessToken(userId);
    const octokit = createUserOctokit(accessToken);

    const userInstallations =
      await githubInstallationService.getUserInstallations(userId);

    const targetRepoId = repositoryId.toString();

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
