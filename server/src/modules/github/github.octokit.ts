import { App, Octokit } from "octokit";
import { config } from "../../config/env";

/**
 * Octokit with throttling + retry (both bundled in the official `octokit` package).
 * - Retry: the retry plugin already skips 400/401/403/404/422/451, so permanent
 *   auth/validation errors are never retried.
 * - Throttle: honor GitHub's rate-limit and secondary-rate-limit signals a bounded
 *   number of times, then surface the error instead of waiting forever.
 */
interface ThrottledRequest {
  method: string;
  url: string;
}

export const DevTraceOctokit = Octokit.defaults({
  userAgent: "dev-trace",
  throttle: {
    onRateLimit: (
      retryAfter: number,
      options: ThrottledRequest,
      _octokit: unknown,
      retryCount: number
    ) => {
      console.warn(
        `[GitHub] Rate limit hit for ${options.method} ${options.url}; retry in ${retryAfter}s`
      );
      return retryCount < 2 && retryAfter <= 120;
    },
    onSecondaryRateLimit: (
      retryAfter: number,
      options: ThrottledRequest,
      _octokit: unknown,
      retryCount: number
    ) => {
      console.warn(
        `[GitHub] Secondary rate limit for ${options.method} ${options.url}; retry in ${retryAfter}s`
      );
      return retryCount < 1 && retryAfter <= 120;
    },
  },
});

let cachedApp: App | null = null;
let cachedKey = "";

/**
 * Returns the (cached) GitHub App, or throws naming exactly which variable is missing.
 */
export function getGitHubApp(): App {
  const missing: string[] = [];
  if (!config.githubAppId) missing.push("GITHUB_APP_ID");
  if (!config.githubPrivateKey) missing.push("GITHUB_PRIVATE_KEY");
  if (missing.length > 0 || !config.githubAppId || !config.githubPrivateKey) {
    throw new Error(
      `GitHub App is not configured. Missing environment variable(s): ${missing.join(", ")}.`
    );
  }

  const key = `${config.githubAppId}:${config.githubPrivateKey.length}`;
  if (!cachedApp || cachedKey !== key) {
    cachedApp = new App({
      appId: config.githubAppId,
      privateKey: config.githubPrivateKey,
      Octokit: DevTraceOctokit,
    });
    cachedKey = key;
  }
  return cachedApp;
}

/**
 * Octokit authenticated as a GitHub App installation. Installation tokens are
 * created and refreshed automatically by @octokit/auth-app and never leave the server.
 */
export async function getInstallationOctokit(
  installationId: number | bigint | string
): Promise<Octokit> {
  const id = Number(installationId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Invalid GitHub installation id.");
  }
  return getGitHubApp().getInstallationOctokit(id);
}

/**
 * Octokit authenticated with a user-to-server token (used only for discovering the
 * user's installations/repositories, not for ingestion).
 */
export function createThrottledUserOctokit(accessToken: string): Octokit {
  return new DevTraceOctokit({ auth: accessToken });
}
