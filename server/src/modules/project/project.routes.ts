import { Router } from "express";
import { projectController } from "./project.controller";
import { requireAuth, optionalAuth } from "../../middleware/auth";
import { githubSyncController } from "../github/sync/github.sync.controller";

export const projectRouter = Router();

// Connect repository -> create project
projectRouter.post("/", requireAuth, (req, res) =>
  projectController.connectRepository(req, res)
);

// List user projects
projectRouter.get("/", requireAuth, (req, res) =>
  projectController.listProjects(req, res)
);

// Get project by unique slug (public for public repos, private check for private repos)
projectRouter.get("/:slug", optionalAuth, (req, res) =>
  projectController.getProjectBySlug(req, res)
);

// GitHub synchronization (owner only)
projectRouter.post("/:slug/sync", requireAuth, (req, res) =>
  githubSyncController.start(req, res)
);
projectRouter.get("/:slug/sync", requireAuth, (req, res) =>
  githubSyncController.status(req, res)
);
projectRouter.get("/:slug/sources/:resource", requireAuth, (req, res) =>
  githubSyncController.sources(req, res)
);
