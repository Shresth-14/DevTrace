import { Request, Response } from "express";
import { prisma } from "../../database";
import { HttpError } from "../../utils/http-error";
import { decisionExtractionService } from "./decision.service";
import {
  SOURCE_CATEGORIES,
  getOverview,
  getPrIntelligence,
  getSourceFeed,
  listDecisions,
  type SourceCategory,
} from "./decision.read";

const SLUG = /^[\w-]{1,200}$/;

function fail(res: Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error:
        {
          400: "Bad Request",
          401: "Unauthorized",
          403: "Forbidden",
          404: "Not Found",
          409: "Conflict",
          503: "Service Unavailable",
        }[err.status] ?? "Error",
      message: err.message,
    });
    return;
  }
  console.error("[Decision Controller] Unexpected error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: "Unexpected error while processing the request.",
  });
}

function intParam(v: unknown, fallback: number, max: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1)
    throw new HttpError(400, "Invalid pagination parameter.");
  return Math.min(n, max);
}

/** Owner always; everyone else only for public repositories. */
async function readableProject(req: Request) {
  const slug = req.params.slug;
  if (!SLUG.test(slug)) throw new HttpError(400, "Invalid project slug.");
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) throw new HttpError(404, "Project not found.");
  if (project.isPrivate && project.userId !== req.user?.id) {
    throw new HttpError(403, "You do not have access to this project.");
  }
  return project;
}

export const decisionController = {
  /** POST /api/projects/:slug/extract */
  async extract(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) throw new HttpError(401, "Unauthorized");
      if (!SLUG.test(req.params.slug))
        throw new HttpError(400, "Invalid project slug.");
      const run = await decisionExtractionService.start(
        req.params.slug,
        req.user.id,
        {
          force: req.body?.force === true,
        }
      );
      res.status(202).json({ success: true, run });
    } catch (err) {
      fail(res, err);
    }
  },

  /** GET /api/projects/:slug/overview */
  async overview(req: Request, res: Response): Promise<void> {
    try {
      const p = await readableProject(req);
      res.json(await getOverview(prisma, p.id));
    } catch (err) {
      fail(res, err);
    }
  },

  /** GET /api/projects/:slug/decisions */
  async decisions(req: Request, res: Response): Promise<void> {
    try {
      const p = await readableProject(req);
      res.json(
        await listDecisions(
          prisma,
          p.id,
          intParam(req.query.page, 1, 100000),
          intParam(req.query.perPage, 100, 200)
        )
      );
    } catch (err) {
      fail(res, err);
    }
  },

  /** GET /api/projects/:slug/pr-intelligence */
  async prIntelligence(req: Request, res: Response): Promise<void> {
    try {
      const p = await readableProject(req);
      res.json(
        await getPrIntelligence(
          prisma,
          p.id,
          intParam(req.query.page, 1, 100000),
          intParam(req.query.perPage, 25, 100)
        )
      );
    } catch (err) {
      fail(res, err);
    }
  },

  /** GET /api/projects/:slug/source-feed */
  async sourceFeed(req: Request, res: Response): Promise<void> {
    try {
      const p = await readableProject(req);
      const category = (req.query.category ?? "all") as string;
      if (!(SOURCE_CATEGORIES as readonly string[]).includes(category)) {
        throw new HttpError(400, "Unknown source category.");
      }
      const q =
        typeof req.query.q === "string"
          ? req.query.q.trim().slice(0, 100)
          : undefined;
      res.json(
        await getSourceFeed(prisma, p.id, {
          category: category as SourceCategory,
          q: q || undefined,
          page: intParam(req.query.page, 1, 100000),
          perPage: intParam(req.query.perPage, 25, 100),
        })
      );
    } catch (err) {
      fail(res, err);
    }
  },
};
