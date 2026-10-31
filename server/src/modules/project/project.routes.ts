import { Router } from "express";
import { projectController } from "./project.controller";
import { requireAuth, optionalAuth } from "../../middleware/auth";
import { decisionController } from "../decisions/decision.controller";
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

// Decision intelligence (read: owner, or anyone for public repositories)
projectRouter.post("/:slug/extract", requireAuth, (req, res) =>
  decisionController.extract(req, res)
);
projectRouter.get("/:slug/overview", optionalAuth, (req, res) =>
  decisionController.overview(req, res)
);
projectRouter.get("/:slug/decisions", optionalAuth, (req, res) =>
  decisionController.decisions(req, res)
);
projectRouter.get("/:slug/pr-intelligence", optionalAuth, (req, res) =>
  decisionController.prIntelligence(req, res)
);
projectRouter.get("/:slug/source-feed", optionalAuth, (req, res) =>
  decisionController.sourceFeed(req, res)
);

projectRouter.delete("/:slug", requireAuth, (req, res) =>
  githubSyncController.remove(req, res)
);
