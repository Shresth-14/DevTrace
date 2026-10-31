import type { PrismaClient } from "@prisma/client";

const MESSAGE =
  "Interrupted by a server restart. Press Sync now or Run analysis to continue; finished work is kept.";

/**
 * Imports and analyses run in the background of this process. If the server stops
 * mid-run nothing would ever finish them, and the UI would show "running" forever.
 * Call once on startup, before serving requests.
 */
export async function recoverInterruptedWork(db: PrismaClient): Promise<{
  syncJobs: number;
  extractionRuns: number;
}> {
  const finishedAt = new Date();
  const [syncJobs, extractionRuns] = await Promise.all([
    db.syncJob.updateMany({
      where: { status: "running" },
      data: { status: "failed", error: MESSAGE, finishedAt },
    }),
    db.extractionRun.updateMany({
      where: { status: "running" },
      data: { status: "failed", error: MESSAGE, finishedAt },
    }),
  ]);
  await Promise.all([
    db.project.updateMany({
      where: { syncStatus: "running" },
      data: { syncStatus: "failed" },
    }),
    db.project.updateMany({
      where: { aiStatus: "running" },
      data: { aiStatus: "failed" },
    }),
  ]);
  return { syncJobs: syncJobs.count, extractionRuns: extractionRuns.count };
}
