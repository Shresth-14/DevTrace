import { prisma } from "../../database";
import { githubRepositoryService } from "../github/github.repository.service";
import { Project } from "@prisma/client";
import type { Octokit } from "octokit";
import { HttpError } from "../../utils/http-error";
import { parseGithubRepoUrl } from "../../utils/github-url";
import { createThrottledUserOctokit } from "../github/github.octokit";
import { githubAuthService } from "../github/github.auth.service";
import { describeError, errorStatus } from "../github/sync/github.errors";
import { githubSyncService } from "../github/sync/github.sync.service";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class ProjectService {
  /**
   * Generates a unique URL slug for the project.
   */
  private async generateUniqueSlug(
    name: string,
    owner: string
  ): Promise<string> {
    const baseSlug = slugify(name);
    const existingBase = await prisma.project.findUnique({
      where: { slug: baseSlug },
    });

    if (!existingBase) {
      return baseSlug;
    }

    // Try owner-name
    const ownerSlug = slugify(`${owner}-${name}`);
    const existingOwner = await prisma.project.findUnique({
      where: { slug: ownerSlug },
    });

    if (!existingOwner) {
      return ownerSlug;
    }

    // Append counter
    let counter = 1;
    while (counter < 100) {
      const candidate = `${ownerSlug}-${counter}`;
      const existing = await prisma.project.findUnique({
        where: { slug: candidate },
      });
      if (!existing) {
        return candidate;
      }
      counter++;
    }

    return `${ownerSlug}-${Date.now().toString(36)}`;
  }

  /**
   * Connects a repository and creates or updates a Dev Trace Project.
   */
  public async connectRepository(
    userId: string,
    repositoryId: string | number
  ): Promise<Project> {
    // 1. Verify access & fetch metadata
    const { repository, installationRecordId } =
      await githubRepositoryService.getRepositoryDetails(userId, repositoryId);

    const repoBigInt = BigInt(repository.id);

    // 2. Check if this repository is already connected for this user
    const existing = await prisma.project.findUnique({
      where: {
        userId_githubRepoId: {
          userId,
          githubRepoId: repoBigInt,
        },
      },
    });

    if (existing) {
      // Update with latest repo metadata
      return prisma.project.update({
        where: { id: existing.id },
        data: {
          name: repository.name,
          description: repository.description,
          githubRepoFullName: repository.fullName,
          githubRepoName: repository.name,
          githubRepoOwner: repository.owner,
          githubRepoUrl: repository.htmlUrl,
          defaultBranch: repository.defaultBranch,
          isPrivate: repository.isPrivate,
          primaryLanguage: repository.primaryLanguage,
          installationId: installationRecordId || existing.installationId,
        },
      });
    }

    // 3. Generate unique slug
    const slug = await this.generateUniqueSlug(
      repository.name,
      repository.owner
    );

    // 4. Create Project (initial GitHub import starts in the background)
    const created = await prisma.project.create({
      data: {
        name: repository.name,
        slug,
        description: repository.description,
        userId,
        githubRepoId: repoBigInt,
        githubRepoFullName: repository.fullName,
        githubRepoName: repository.name,
        githubRepoOwner: repository.owner,
        githubRepoUrl: repository.htmlUrl,
        defaultBranch: repository.defaultBranch,
        isPrivate: repository.isPrivate,
        primaryLanguage: repository.primaryLanguage,
        installationId: installationRecordId,
      },
    });

    githubSyncService
      .startSync(created.slug, userId, { trigger: "initial" })
      .catch((err) =>
        console.warn(
          "[Project] Initial GitHub sync could not start:",
          err instanceof Error ? err.message : err
        )
      );

    return created;
  }

  /**
   * Adds a PUBLIC GitHub repository by URL. Needs no app installation: the owner's
   * own GitHub sign-in is enough to read public data. Starts the import right away.
   */
  public async connectPublicRepository(
    userId: string,
    repositoryUrl: string,
    getClient: (userId: string) => Promise<Octokit> = async (id) =>
      createThrottledUserOctokit(
        await githubAuthService.getValidAccessToken(id)
      )
  ): Promise<{ project: Project; alreadyConnected: boolean }> {
    const ref = parseGithubRepoUrl(repositoryUrl);
    if (!ref) {
      throw new HttpError(
        400,
        "Enter a public GitHub repository URL, for example https://github.com/owner/repo."
      );
    }

    const octokit = await getClient(userId);
    let repo;
    try {
      ({ data: repo } = await octokit.rest.repos.get(ref));
    } catch (err) {
      const status = errorStatus(err);
      if (status === 404) {
        throw new HttpError(
          404,
          `${ref.owner}/${ref.repo} was not found. Check the URL, and that the repository is public.`
        );
      }
      if (status === 403 || status === 429) {
        throw new HttpError(
          429,
          "GitHub is rate-limiting requests right now. Try again in a few minutes."
        );
      }
      throw new HttpError(
        502,
        `Could not read the repository from GitHub: ${describeError(err)}`
      );
    }
    if (repo.private) {
      throw new HttpError(
        400,
        "Only public repositories can be added by URL. This repository is private."
      );
    }

    const existing = await prisma.project.findUnique({
      where: { userId_githubRepoId: { userId, githubRepoId: BigInt(repo.id) } },
    });
    if (existing) return { project: existing, alreadyConnected: true };

    const slug = await this.generateUniqueSlug(repo.name, repo.owner.login);
    const project = await prisma.project.create({
      data: {
        name: repo.name,
        slug,
        description: repo.description,
        userId,
        githubRepoId: BigInt(repo.id),
        githubRepoFullName: repo.full_name,
        githubRepoName: repo.name,
        githubRepoOwner: repo.owner.login,
        githubRepoUrl: repo.html_url,
        defaultBranch: repo.default_branch,
        isPrivate: false,
        primaryLanguage: repo.language,
      },
    });

    githubSyncService
      .startSync(project.slug, userId, { trigger: "initial" })
      .catch((err) =>
        console.warn(
          "[Project] Initial GitHub sync could not start:",
          err instanceof Error ? err.message : err
        )
      );
    return { project, alreadyConnected: false };
  }

  /**
   * Lists all projects owned by the user.
   */
  public async listUserProjects(userId: string): Promise<Project[]> {
    return prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Retrieves a project by slug with privacy/authorization checks.
   */
  public async getProjectBySlug(
    slug: string,
    requestingUserId?: string
  ): Promise<{ project: Project; isOwner: boolean }> {
    const project = await prisma.project.findUnique({
      where: { slug },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            githubUsername: true,
            githubAvatarUrl: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error("Project not found.");
    }

    const isOwner = requestingUserId === project.userId;

    // Enforce private repository protection
    if (project.isPrivate && !isOwner) {
      throw new Error("Unauthorized: Private repository project.");
    }

    return { project, isOwner };
  }
}

export const projectService = new ProjectService();
