import { PrismaClient } from "@prisma/client";
import { config, maskConnectionUrl, withPoolLimit } from "../config/env";

// Ensure BigInt serialization to string for JSON responses
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: config.resolvedDatabaseUrl
      ? {
          db: {
            url: withPoolLimit(config.resolvedDatabaseUrl),
          },
        }
      : undefined,
    log:
      config.nodeEnv === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (config.nodeEnv !== "production") {
  globalForPrisma.prisma = prisma;
}

export interface DatabaseConnectionResult {
  success: boolean;
  message: string;
  maskedUrl: string;
  error?: string;
}

/**
 * Attempts a real database connection test using Prisma $queryRaw
 * Strictly avoids logging or exposing credentials
 */
export async function testDatabaseConnection(): Promise<DatabaseConnectionResult> {
  const maskedUrl = maskConnectionUrl(config.resolvedDatabaseUrl);

  if (!config.resolvedDatabaseUrl) {
    return {
      success: false,
      message: "DATABASE_URL is not configured in environment.",
      maskedUrl,
    };
  }

  try {
    await prisma.$queryRaw`SELECT 1 as connected`;
    return {
      success: true,
      message: "Database connection successfully verified via Prisma Client.",
      maskedUrl,
    };
  } catch (err) {
    let errorMessage =
      err instanceof Error ? err.message : "Unknown database connection error";

    // Strip out any potential raw credentials from error message
    if (config.dbPassword && config.dbPassword.length > 0) {
      errorMessage = errorMessage.replaceAll(config.dbPassword, "******");
    }

    return {
      success: false,
      message: "Database connection test failed.",
      maskedUrl,
      error: errorMessage,
    };
  }
}

/**
 * Gracefully disconnects Prisma client
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
