import { Octokit, App } from "octokit";
import { config } from "../../config/env";

/**
 * Creates an Octokit client authenticated with a GitHub User Access Token
 */
export function createUserOctokit(accessToken: string): Octokit {
  return new Octokit({
    auth: accessToken,
  });
}

/**
 * Creates an App-level Octokit client if App ID and Private Key are configured.
 * Returns null if GitHub App credentials or private key are not configured.
 */
export function createGitHubApp(): App | null {
  if (!config.githubAppId || !config.githubPrivateKey) {
    return null;
  }

  try {
    return new App({
      appId: config.githubAppId,
      privateKey: config.githubPrivateKey,
      oauth: {
        clientId: config.githubClientId || "",
        clientSecret: config.githubClientSecret || "",
      },
    });
  } catch (error) {
    console.warn("[GitHub App] Could not initialize App instance:", error);
    return null;
  }
}
