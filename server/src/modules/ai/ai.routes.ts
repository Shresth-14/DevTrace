import { Router } from "express";
import { aiController } from "./ai.controller";

export const aiRouter = Router();

// Test & inference endpoints
aiRouter.post("/chat", aiController.chat);
aiRouter.post("/chat/stream", aiController.streamChat);
aiRouter.get("/status", aiController.getStatus);

