import { Router } from "express";
import { githubController } from "./github.controller";
import { requireAuth } from "../../middleware/auth";

export const githubRouter = Router();

// Public OAuth and installation callbacks
githubRouter.get("/auth", (req, res) => githubController.startAuth(req, res));
githubRouter.get("/callback", (req, res) =>
  githubController.handleCallback(req, res)
);
githubRouter.get("/setup", (req, res) =>
  githubController.handleSetup(req, res)
);

// Protected GitHub resources
githubRouter.get("/user", requireAuth, (req, res) =>
  githubController.getCurrentUser(req, res)
);
githubRouter.get("/installations", requireAuth, (req, res) =>
  githubController.listInstallations(req, res)
);
githubRouter.get("/repositories", requireAuth, (req, res) =>
  githubController.listRepositories(req, res)
);
githubRouter.post("/disconnect", requireAuth, (req, res) =>
  githubController.disconnect(req, res)
);
