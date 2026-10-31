import { config } from "../../config/env";
import {
  encrypt,
  decrypt,
  generateOAuthState,
  verifyOAuthState,
} from "../../utils/crypto";
import { createUserOctokit } from "./github.client";
import { GithubUserProfile, GithubTokenResponse } from "./github.types";
import { prisma } from "../../database";
import { User } from "@prisma/client";

export class GithubAuthService {
  /**
   * Generates the GitHub OAuth authorization URL with CSRF state protection.
   */
  public getAuthorizationUrl(
    redirectPath?: string,
    redirectUri?: string
  ): {
    url: string;
    state: string;
  } {
    if (!config.githubClientId) {
      throw new Error("GITHUB_CLIENT_ID is not configured in environment.");
    }

    const chosenRedirectUri = redirectUri || config.githubCallbackUrl;
    const state = generateOAuthState({
      redirectPath: redirectPath || "/dashboard",
      redirectUri: chosenRedirectUri,
    });

    const params = new URLSearchParams({
      client_id: config.githubClientId,
      redirect_uri: chosenRedirectUri,
      state,
      scope: "read:user,user:email",
    });

    const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
    return { url, state };
  }

  /**
   * Returns direct URL to install Dev Trace on personal account or organization.
   */
  public getInstallationUrl(state?: string): string {
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return `https://github.com/apps/${config.githubAppSlug}/installations/new${qs}`;
  }

  /**
   * Validates incoming OAuth state string.
   */
  public validateState(stateString: string) {
    return verifyOAuthState(stateString);
  }

  /**
   * Exchanges authorization code for user access token and refresh token.
   */
  public async exchangeCodeForToken(
    code: string,
    redirectUri?: string
  ): Promise<GithubTokenResponse> {
    if (!config.githubClientId || !config.githubClientSecret) {
      throw new Error(
        "GitHub App OAuth credentials (client ID and client secret) are not configured."
      );
    }

    const chosenRedirectUri = redirectUri || config.githubCallbackUrl;

    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code,
          redirect_uri: chosenRedirectUri,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `GitHub token exchange failed with HTTP ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as GithubTokenResponse & {
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      throw new Error(
        `GitHub token exchange error: ${data.error_description || data.error}`
      );
    }

    if (!data.access_token) {
      throw new Error(
        "No access_token returned by GitHub OAuth token endpoint"
      );
    }

    return data;
  }

  /**
   * Refreshes an expired user access token using the refresh token.
   */
  public async refreshAccessToken(
    refreshToken: string
  ): Promise<GithubTokenResponse> {
    if (!config.githubClientId || !config.githubClientSecret) {
      throw new Error(
        "GitHub App OAuth credentials are not configured for token refresh."
      );
    }

    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Token refresh failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as GithubTokenResponse & {
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      throw new Error(
        `GitHub token refresh error: ${data.error_description || data.error}`
      );
    }

    return data;
  }

  /**
   * Fetches user profile and verified email from GitHub API.
   */
  public async fetchUserProfile(
    accessToken: string
  ): Promise<GithubUserProfile> {
    const octokit = createUserOctokit(accessToken);
    const { data: user } = await octokit.rest.users.getAuthenticated();

    let email = user.email;

    // If primary email is private or not present in public profile, fetch from emails endpoint
    if (!email) {
      try {
        const { data: emails } =
          await octokit.rest.users.listEmailsForAuthenticatedUser();
        const primaryVerified = emails.find(
          (e: { primary?: boolean; verified?: boolean; email?: string }) =>
            Boolean(e.primary && e.verified)
        );
        if (primaryVerified && primaryVerified.email) {
          email = primaryVerified.email;
        } else if (emails.length > 0 && emails[0].email) {
          email = emails[0].email;
        }
      } catch (err) {
        console.warn("[GitHub Auth] Could not fetch user emails:", err);
      }
    }

    return {
      id: user.id,
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
      email,
      type: user.type,
    };
  }

  /**
   * Persists or updates the User record and securely encrypts access tokens.
   */
  public async syncUserAndTokens(
    profile: GithubUserProfile,
    tokenData: GithubTokenResponse
  ): Promise<User> {
    const encryptedAccess = encrypt(tokenData.access_token);
    const encryptedRefresh = tokenData.refresh_token
      ? encrypt(tokenData.refresh_token)
      : null;

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    const refreshTokenExpiresAt = tokenData.refresh_token_expires_in
      ? new Date(Date.now() + tokenData.refresh_token_expires_in * 1000)
      : null;

    const githubId = BigInt(profile.id);

    // Upsert User
    const user = await prisma.user.upsert({
      where: { githubId },
      update: {
        githubUsername: profile.login,
        name: profile.name,
        email: profile.email || undefined,
        githubAvatarUrl: profile.avatar_url,
        githubProfileUrl: profile.html_url,
        githubUserType: profile.type,
      },
      create: {
        githubId,
        githubUsername: profile.login,
        name: profile.name,
        email: profile.email || undefined,
        githubAvatarUrl: profile.avatar_url,
        githubProfileUrl: profile.html_url,
        githubUserType: profile.type,
      },
    });

    // Upsert encrypted tokens
    await prisma.githubAccountToken.upsert({
      where: { userId: user.id },
      update: {
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: encryptedRefresh,
        expiresAt,
        refreshTokenExpiresAt,
        scope: tokenData.scope || null,
      },
      create: {
        userId: user.id,
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: encryptedRefresh,
        expiresAt,
        refreshTokenExpiresAt,
        scope: tokenData.scope || null,
      },
    });

    return user;
  }

  /**
   * Decrypts and retrieves a valid user access token, automatically refreshing if expired.
   */
  public async getValidAccessToken(userId: string): Promise<string> {
    const tokenRecord = await prisma.githubAccountToken.findUnique({
      where: { userId },
    });

    if (!tokenRecord) {
      throw new Error("No GitHub token record found for this user.");
    }

    // Check if token has expired (with 2-minute safety window)
    const isExpired =
      tokenRecord.expiresAt &&
      tokenRecord.expiresAt.getTime() - 2 * 60 * 1000 < Date.now();

    if (isExpired && tokenRecord.refreshTokenEncrypted) {
      try {
        const decryptedRefresh = decrypt(tokenRecord.refreshTokenEncrypted);
        const refreshed = await this.refreshAccessToken(decryptedRefresh);

        const encryptedAccess = encrypt(refreshed.access_token);
        const encryptedRefresh = refreshed.refresh_token
          ? encrypt(refreshed.refresh_token)
          : tokenRecord.refreshTokenEncrypted;

        const expiresAt = refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000)
          : null;

        await prisma.githubAccountToken.update({
          where: { userId },
          data: {
            accessTokenEncrypted: encryptedAccess,
            refreshTokenEncrypted: encryptedRefresh,
            expiresAt,
          },
        });

        return refreshed.access_token;
      } catch (err) {
        console.error(
          `[GitHub Auth] Token refresh failed for user ${userId}:`,
          err
        );
      }
    }

    return decrypt(tokenRecord.accessTokenEncrypted);
  }

  /**
   * Disconnects GitHub account by removing tokens and installation associations.
   */
  public async disconnect(userId: string): Promise<void> {
    await prisma.$transaction([
      prisma.githubAccountToken.deleteMany({ where: { userId } }),
      prisma.githubInstallation.deleteMany({ where: { userId } }),
    ]);
  }
}

export const githubAuthService = new GithubAuthService();
