import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { Octokit } from "octokit";
import { prisma } from "../../database";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../utils/http-error";
import { aiService } from "../ai/ai.service";
import { DecisionStore } from "../decisions/decision.store";
import { PrismaSyncStore } from "../github/sync/github.sync.store";
import { githubSyncService } from "../github/sync/github.sync.service";
import {
  createThrottledUserOctokit,
  getInstallationOctokit,
} from "../github/github.octokit";
import { githubAuthService } from "../github/github.auth.service";
import {
  InvestigationService,
  prismaInvestigationDb,
} from "./investigation.service";
import { QuestionService, prismaQuestionDb } from "./investigation.question";

export const investigationService = new InvestigationService({
  db: prismaInvestigationDb(prisma),
  store: new PrismaSyncStore(prisma),
  decisions: new DecisionStore(prisma),
  llm: aiService,
});

export const questionService = new QuestionService(
  prismaQuestionDb(prisma),
  investigationService
);

/**
 * One Octokit per installation (or per user token) shared by every investigation, so
 * throttling state and cached installation tokens are shared instead of rebuilt per request.
 */
const clients = new Map<string, Promise<Octokit>>();
const MAX_CLIENTS = 100;

function sharedClient(key: string, make: () => Promise<Octokit>): Promise<Octokit> {
  const existing = clients.get(key);
  if (existing) return existing;
  const created = make().catch((err) => {
    clients.delete(key); // do not cache a failure
    throw err;
  });
  clients.set(key, created);
  while (clients.size > MAX_CLIENTS) {
    const oldest = clients.keys().next().value;
    if (oldest === undefined) break;
    clients.delete(oldest);
  }
  return created;
}

const tokenKey = (token: string) =>
  createHash("sha256").update(token).digest("hex").slice(0, 16);

// Mounted at /api/projects/:slug/investigations
export const investigationRouter = Router({ mergeParams: true });

const fail = (res: Response, err: unknown) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("[Investigation] Request failed:", err);
  res.status(500).json({ error: "Investigation request failed." });
};

const ownedProject = async (req: Request) => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  const slug = String(req.params.slug);
  const project = await githubSyncService.requireOwnedProject(slug, req.user.id);
  const [owner, repo] = project.githubRepoFullName.split("/");
  const installationId = project.installation?.installationId ?? null;
  return {
    ref: { id: project.id, owner, repo },
    octokit: async () => {
      if (installationId) {
        return sharedClient(`installation:${installationId}`, () =>
          getInstallationOctokit(installationId)
        );
      }
      // a refreshed user token gets its own client; the old one ages out
      const token = await githubAuthService.getValidAccessToken(project.userId);
      return sharedClient(`user:${project.userId}:${tokenKey(token)}`, async () =>
        createThrottledUserOctokit(token)
      );
    },
  };
};

// POST /api/projects/:slug/investigations  { input: "https://github.com/o/r/issues/12" | "#12" }
investigationRouter.post("/", requireAuth, async (req, res) => {
  try {
    const { ref, octokit } = await ownedProject(req);
    const input = typeof req.body?.input === "string" ? req.body.input : "";
    const investigation = investigationService.start({ project: ref, input, octokit });
    res.status(202).json({ investigation });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/projects/:slug/investigations/questions  { question: "Why was Redis rejected?" }
investigationRouter.post("/questions", requireAuth, async (req, res) => {
  try {
    const { ref, octokit } = await ownedProject(req);
    const text = typeof req.body?.question === "string" ? req.body.question : "";
    const question = questionService.ask({ project: ref, question: text, octokit });
    res.status(202).json({ question });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/projects/:slug/investigations/questions/:id
investigationRouter.get("/questions/:id", requireAuth, async (req, res) => {
  try {
    const { ref } = await ownedProject(req);
    const question = questionService.get(String(req.params.id), ref.id);
    if (!question) throw new HttpError(404, "Question not found.");
    res.json({ question });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/projects/:slug/investigations/:id
investigationRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const { ref } = await ownedProject(req);
    const investigation = investigationService.get(String(req.params.id), ref.id);
    if (!investigation) throw new HttpError(404, "Investigation not found.");
    res.json({ investigation });
  } catch (err) {
    fail(res, err);
  }
});
