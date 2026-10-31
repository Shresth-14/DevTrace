import express, { Application, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config/env";
import { healthRouter } from "./routes/health";
import { githubRouter } from "./modules/github/github.routes";
import { projectRouter } from "./modules/project/project.routes";
import { aiRouter } from "./modules/ai/ai.routes";
import { dashboardRouter } from "./modules/decisions/dashboard.routes";
import { investigationRouter } from "./modules/investigation/investigation.routes";

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
        return callback(new Error(`CORS origin '${origin}' not allowed.`));
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

  // AI inference endpoints (OpenRouter & modular providers)
  app.use("/api/v1/ai", aiRouter);
  app.use("/api/ai", aiRouter);

  return app;
};
