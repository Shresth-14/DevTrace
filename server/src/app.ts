import express, {
  Application,
  NextFunction,
  Request,
  Response,
} from "express";
import { STATUS_CODES } from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config/env";
import { healthRouter } from "./routes/health";
import { githubRouter } from "./modules/github/github.routes";
import { projectRouter } from "./modules/project/project.routes";
import { aiRouter } from "./modules/ai/ai.routes";
import { dashboardRouter } from "./modules/decisions/dashboard.routes";
import { investigationRouter } from "./modules/investigation/investigation.routes";
import { HttpError } from "./utils/http-error";

export const createApp = (): Application => {
  const app = express();

  // CORS configuration to allow local frontend communication with credentials
  const allowedOrigins = [
    config.clientOrigin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(
          new HttpError(403, `CORS origin '${origin}' not allowed.`)
        );
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // Body parsing and cookie parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Root endpoint
  app.get("/", (_req: Request, res: Response) => {
    res.json({
      name: "Dev Trace API",
      version: "1.0.0",
      status: "running",
    });
  });

  // Health check endpoints
  app.use("/health", healthRouter);
  app.use("/api/health", healthRouter);

  // GitHub integration & project endpoints
  app.use("/api/github", githubRouter);
  app.use("/api/projects/:slug/investigations", investigationRouter);
  app.use("/api/projects", projectRouter);
  app.use("/api/dashboard", dashboardRouter);

  // AI inference endpoints (local Ollama provider)
  app.use("/api/v1/ai", aiRouter);
  app.use("/api/ai", aiRouter);

  // Errors become JSON; 5xx details stay in the log, never in the response.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const e = err as { status?: number; statusCode?: number; message?: string };
    const status = e.status ?? e.statusCode ?? 500;
    if (status < 400 || status > 599) return next(err);
    if (status >= 500) console.error("Unhandled error:", err);
    res.status(status).json({
      error: STATUS_CODES[status] ?? "Error",
      message:
        status >= 500 ? "Something went wrong." : (e.message ?? "Request failed."),
    });
  });

  return app;
};
