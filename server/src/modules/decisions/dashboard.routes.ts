import { Router } from "express";
import { prisma } from "../../database";
import { requireAuth } from "../../middleware/auth";
import { getDashboardSummary } from "./decision.read";

export const dashboardRouter = Router();

// GET /api/dashboard/summary — totals and recent decisions across the user's projects
dashboardRouter.get("/summary", requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json(await getDashboardSummary(prisma, req.user.id));
  } catch (error) {
    console.error("[Dashboard] Failed to build summary:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Could not load the dashboard summary.",
    });
  }
});
