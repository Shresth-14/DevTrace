import { RequestError } from "octokit";

export class SyncAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncAccessError";
  }
}

export function errorStatus(err: unknown): number | undefined {
  return err instanceof RequestError ? err.status : undefined;
}

/**
 * Produces a message safe to store and return to clients: no stack, no tokens,
 * no request headers. Octokit's RequestError message never contains credentials,
 * but we still bound its length.
 */
export function describeError(err: unknown): string {
  const status = errorStatus(err);
  if (status === 401) {
    return "GitHub rejected the credentials (401). Reconnect GitHub or reinstall the app.";
  }
  if (status === 403) {
    return "GitHub denied access or the rate limit was exhausted (403). The app may lack the required permission.";
  }
  if (status === 404) {
    return "GitHub resource not found or not accessible to the app (404).";
  }
  if (status === 422) {
    return "GitHub rejected the request as invalid (422).";
  }
  if (status === 429) {
    return "GitHub rate limit exceeded (429). Try again later.";
  }
  const raw = err instanceof Error ? err.message : "Unknown error";
  return raw.slice(0, 300);
}
