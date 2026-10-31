import { Request, Response } from "express";
import { projectService } from "./project.service";

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

    const { repositoryId } = req.body;
    if (!repositoryId) {
      res.status(400).json({
        error: "Bad Request",
        message: "repositoryId is required to connect a project.",
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
      res.json({
        projects: projects.map((p) => ({
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
        })),
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

      res.json({
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
          updatedAt: project.updatedAt,
        },
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
