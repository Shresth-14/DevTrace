import { createApp } from "./app";
import { config } from "./config/env";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[Dev Trace Server] Running on http://localhost:${config.port}`);
  console.log(`[Dev Trace Server] Environment: ${config.nodeEnv}`);
  console.log(
    `[Dev Trace Server] Allowed client origin: ${config.clientOrigin}`
  );
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
