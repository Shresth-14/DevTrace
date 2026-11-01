import { createApp } from "./app";
import { config } from "./config/env";
import { prisma } from "./database";
import { recoverInterruptedWork } from "./modules/project/recovery";
import { aiService } from "./modules/ai/ai.service";

const app = createApp();

recoverInterruptedWork(prisma)
  .then(({ syncJobs, extractionRuns }) => {
    if (syncJobs + extractionRuns > 0) {
      console.log(
        `[Dev Trace Server] Marked ${syncJobs} import(s) and ${extractionRuns} analysis run(s) interrupted by the last shutdown as failed.`
      );
    }
  })
  .catch((err) =>
    console.warn(
      "[Dev Trace Server] Could not check for interrupted work:",
      err instanceof Error ? err.message : err
    )
  );

const server = app.listen(config.port, () => {
  console.log(`[Dev Trace Server] Running on http://localhost:${config.port}`);
  console.log(`[Dev Trace Server] Environment: ${config.nodeEnv}`);
  console.log(
    `[Dev Trace Server] Allowed client origin: ${config.clientOrigin}`
  );

  aiService
    .checkHealth()
    .then((health) => {
      const diag = health.diagnostics as
        | { reachable?: boolean; modelInstalled?: boolean }
        | undefined;
      if (diag?.reachable && diag?.modelInstalled) {
        console.log(
          `[Dev Trace Server] AI: Ollama running with model '${health.model}' (${config.ollamaBaseUrl})`
        );
      } else if (diag?.reachable && !diag?.modelInstalled) {
        console.warn(
          `[Dev Trace Server] AI: Ollama is running at ${config.ollamaBaseUrl}, but model '${health.model}' is not installed. Run: ollama pull ${health.model}`
        );
      } else {
        console.warn(
          `[Dev Trace Server] AI: Ollama is not reachable at ${config.ollamaBaseUrl}. Ensure 'brew services start ollama' or 'ollama serve' is running.`
        );
      }
    })
    .catch(() => {});
});

const gracefulShutdown = (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
