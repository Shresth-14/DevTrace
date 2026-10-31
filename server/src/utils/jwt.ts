import jwt from "jsonwebtoken";
import { config } from "../config/env";

export interface SessionPayload {
  userId: string;
  githubId: string;
  githubUsername: string;
  githubAvatarUrl?: string | null;
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, config.sessionSecret, {
    expiresIn: "7d",
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, config.sessionSecret) as SessionPayload;
    return decoded;
  } catch {
    return null;
  }
}
