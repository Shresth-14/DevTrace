import { Router } from "express";
import { aiController } from "./ai.controller";
import { requireAuth } from "../../middleware/auth";

export const aiRouter = Router();

// These run the local model, so only signed-in users may call them.
aiRouter.use(requireAuth);

// Test & inference endpoints
aiRouter.post("/chat", aiController.chat);
aiRouter.post("/chat/stream", aiController.streamChat);
aiRouter.get("/status", aiController.getStatus);
