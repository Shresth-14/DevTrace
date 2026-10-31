import { Request, Response } from "express";
import { Project } from "@prisma/client";
import { prisma } from "../../database";
import { projectService } from "./project.service";
import { HttpError } from "../../utils/http-error";

/** Fields every project payload shares, so list and detail stay consistent. */
function projectDto(p: Project, decisionsCount: number) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    githubRepoFullName: p.githubRepoFullName,
    githubRepoUrl: p.githubRepoUrl,
    defaultBranch: p.defaultBranch,
    isPrivate: p.isPrivate,
    primaryLanguage: p.primaryLanguage,
    url: `/p/${p.slug}`,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    decisionsCount,
    syncStatus: p.syncStatus,
    aiStatus: p.aiStatus,
    lastSyncedAt: p.lastSyncedAt,
    lastExtractedAt: p.lastExtractedAt,
  };
}

export class ProjectController {
  /**
   * Connects a repository and creates a Dev Trace Project.
   * POST /api/projects
   */
  public async connectRepository(req: Request, res: Response): Promise<void> {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { repositoryId, repositoryUrl } = req.body ?? {};

    // Public repository by URL (the only flow the UI uses).
    if (typeof repositoryUrl === "string") {
      try {
        const { project, alreadyConnected } =
          await projectService.connectPublicRepository(user.id, repositoryUrl);
        const decisionsCount = await prisma.decision.count({
          where: { projectId: project.id },
        });
        res.status(alreadyConnected ? 200 : 201).json({
          success: true,
          alreadyConnected,
          project: projectDto(project, decisionsCount),
        });
      } catch (error) {
        if (error instanceof HttpError) {
          res.status(error.status).json({
            error: "Connection Failed",
            message: error.message,
          });
          return;
        }
        console.error(
          "[Project Controller] Error adding repository by URL:",
          error
        );
        res.status(500).json({
          error: "Connection Failed",
          message: "Could not add this repository. Please try again.",
        });
      }
      return;
    }

    if (!repositoryId) {
      res.status(400).json({
        error: "Bad Request",
        message: "repositoryUrl is required to add a project.",
      });
      return;
    }

    try {
      const project = await projectService.connectRepository(
        user.id,
        repositoryId
      );

      res.status(201).json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          description: project.description,
          githubRepoFullName: project.githubRepoFullName,
          githubRepoUrl: project.githubRepoUrl,
          defaultBranch: project.defaultBranch,
          isPrivate: project.isPrivate,
          primaryLanguage: project.primaryLanguage,
          url: `/p/${project.slug}`,
          createdAt: project.createdAt,
        },
      });
    } catch (error) {
      console.error("[Project Controller] Error connecting project:", error);
      res.status(400).json({
        error: "Connection Failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to connect repository.",
      });
    }
  }

  /**
   * Lists all projects for the authenticated user.
   * GET /api/projects
   */
  public async listProjects(req: Request, res: Response): Promise<void> {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const projects = await projectService.listUserProjects(user.id);
      const counts = await prisma.decision.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projects.map((p) => p.id) } },
        _count: { _all: true },
      });
      const byProject = new Map(
        counts.map((c) => [c.projectId, c._count._all])
      );
      res.json({
        projects: projects.map((p) => projectDto(p, byProject.get(p.id) ?? 0)),
      });
    } catch (error) {
      console.error("[Project Controller] Error listing projects:", error);
      res.status(500).json({
        error: "Failed to fetch projects",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Retrieves a project by unique slug.
   * GET /api/projects/:slug
   */
  public async getProjectBySlug(req: Request, res: Response): Promise<void> {
    const { slug } = req.params;
    const requestingUserId = req.user?.id;

    try {
      const { project, isOwner } = await projectService.getProjectBySlug(
        slug,
        requestingUserId
      );

      const decisionsCount = await prisma.decision.count({
        where: { projectId: project.id },
      });
      res.json({
        project: projectDto(project, decisionsCount),
        isOwner,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Project not found.";
      if (msg.includes("Unauthorized")) {
        res.status(403).json({ error: "Forbidden", message: msg });
      } else {
        res.status(404).json({ error: "Not Found", message: msg });
      }
    }
  }
}

export const projectController = new ProjectController();
