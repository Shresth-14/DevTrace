import express, { Application, Request, Response } from "express";

const app: Application = express();

const broken: number = "not a number"; // INTENTIONAL CI FAILURE - revert in next commit

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: "DevTrace API is running",
    timestamp: new Date().toISOString(),
  });
});

export default app;
export { app };

