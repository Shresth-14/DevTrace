import { Request, Response, NextFunction } from "express";
import { verifySessionToken, SessionPayload } from "../utils/jwt";
import { prisma } from "../database";
import { User, GithubAccountToken } from "@prisma/client";

export interface AuthenticatedUser extends User {
  token?: GithubAccountToken | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionPayload?: SessionPayload;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const cookieToken = req.cookies?.devtrace_session;
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;

  const token = cookieToken || headerToken;

  if (!token) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Authentication required. Please sign in with GitHub.",
    });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Session expired or invalid. Please sign in again.",
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { token: true },
    });

    if (!user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User account not found.",
      });
      return;
    }

    req.user = user;
    req.sessionPayload = payload;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to authenticate session.",
    });
  }
}

/**
 * Optional auth: populates req.user if a valid token is present, but doesn't block request if missing.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const cookieToken = req.cookies?.devtrace_session;
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;

  const token = cookieToken || headerToken;
  if (!token) {
    return next();
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return next();
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { token: true },
    });
    if (user) {
      req.user = user;
      req.sessionPayload = payload;
    }
  } catch {
    // Ignore error for optional auth
  }

  next();
}
