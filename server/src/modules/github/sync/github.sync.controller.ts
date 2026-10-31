import { Request, Response } from "express";
import {
  HttpError,
  githubSyncService,
  isSourceResource,
} from "./github.sync.service";

const SLUG = /^[\w-]{1,200}$/;

function fail(res: Response, err: unknown): void {
  if (err instanceof HttpError) {
    res
      .status(err.status)
      .json({ error: httpName(err.status), message: err.message });
    return;
  }
  console.error("[GitHub Sync Controller] Unexpected error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: "Unexpected error while processing the request.",
  });
}

function httpName(status: number): string {
  return (
    { 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 409: "Conflict" }[
      status
    ] ?? "Error"
  );
}

function intParam(v: unknown, fallback: number, max: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1)
    throw new HttpError(400, "Invalid pagination parameter.");
  return Math.min(n, max);
}

export class GithubSyncController {
  /** POST /api/projects/:slug/sync */
  public async start(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) throw new HttpError(401, "Unauthorized");
      if (!SLUG.test(req.params.slug))
        throw new HttpError(400, "Invalid project slug.");
      const full = req.body?.full === true;
      const job = await githubSyncService.startSync(req.params.slug, user.id, {
        full,
        trigger: "manual",
      });
      res.status(202).json({ success: true, job });
    } catch (err) {
      fail(res, err);
    }
  }

  /** GET /api/projects/:slug/sync */
  public async status(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) throw new HttpError(401, "Unauthorized");
      if (!SLUG.test(req.params.slug))
        throw new HttpError(400, "Invalid project slug.");
      res.json(await githubSyncService.getStatus(req.params.slug, user.id));
    } catch (err) {
      fail(res, err);
    }
  }

  /** GET /api/projects/:slug/sources/:resource?page=&perPage= */
  public async sources(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) throw new HttpError(401, "Unauthorized");
      const { slug, resource } = req.params;
      if (!SLUG.test(slug)) throw new HttpError(400, "Invalid project slug.");
      if (!isSourceResource(resource))
        throw new HttpError(404, "Unknown source resource.");
      const page = intParam(req.query.page, 1, 100000);
      const perPage = intParam(req.query.perPage, 50, 100);
      res.json(
        await githubSyncService.listSource(
          slug,
          user.id,
          resource,
          page,
          perPage
        )
      );
    } catch (err) {
      fail(res, err);
    }
  }
}

export const githubSyncController = new GithubSyncController();
