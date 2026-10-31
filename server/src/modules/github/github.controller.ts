import { Request, Response } from "express";
import { config } from "../../config/env";
import { githubAuthService } from "./github.auth.service";
import { githubInstallationService } from "./github.installation.service";
import { githubRepositoryService } from "./github.repository.service";
import { signSessionToken, verifySessionToken } from "../../utils/jwt";

export class GithubController {
  /**
   * Initiates GitHub App authorization flow.
   * GET /api/github/auth
   */
  public async startAuth(req: Request, res: Response): Promise<void> {
    try {
      const redirectPath = (req.query.redirect as string) || "/dashboard";
      const redirectUri = req.query.redirect_uri as string | undefined;
      const { url } = githubAuthService.getAuthorizationUrl(
        redirectPath,
        redirectUri
      );

      // If client requests JSON response
      if (req.headers.accept?.includes("application/json")) {
        res.json({ url });
        return;
      }

      res.redirect(url);
    } catch (error) {
      console.error("[GitHub Auth] Failed to generate auth URL:", error);
      res.status(500).json({
        error: "Configuration Error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to initiate GitHub authorization.",
      });
    }
  }

  /**
   * Handles GitHub OAuth callback.
   * GET /api/github/callback
   */
  public async handleCallback(req: Request, res: Response): Promise<void> {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.warn(
        "[GitHub Callback] Access denied by user:",
        error_description
      );
      res.redirect(
        `${config.clientOrigin}/?auth_error=${encodeURIComponent(
          (error_description as string) || (error as string)
        )}`
      );
      return;
    }

    if (
      !code ||
      typeof code !== "string" ||
      !state ||
      typeof state !== "string"
    ) {
      res.status(400).json({
        error: "Bad Request",
        message: "Missing code or state in OAuth callback.",
      });
      return;
    }

    // Validate state
    const validation = githubAuthService.validateState(state);
    if (!validation.valid) {
      console.error(
        "[GitHub Callback] State validation failed:",
        validation.error
      );
      res.status(403).json({
        error: "Invalid State",
        message: "OAuth state verification failed. Potential CSRF detected.",
      });
      return;
    }

    try {
      // 1. Exchange code for access token using matching redirectUri
      const redirectUri =
        (validation.data?.redirectUri as string) || config.githubCallbackUrl;
      const tokenData = await githubAuthService.exchangeCodeForToken(
        code,
        redirectUri
      );

      // 2. Fetch authenticated GitHub user profile
      const profile = await githubAuthService.fetchUserProfile(
        tokenData.access_token
      );

      // 3. Persist User and encrypt token in Supabase
      const user = await githubAuthService.syncUserAndTokens(
        profile,
        tokenData
      );

      // 4. Issue session token and HTTP-only cookie
      const sessionToken = signSessionToken({
        userId: user.id,
        githubId: user.githubId.toString(),
        githubUsername: user.githubUsername,
        githubAvatarUrl: user.githubAvatarUrl,
      });

      const isProduction = config.nodeEnv === "production";
      res.cookie("devtrace_session", sessionToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/",
      });

      // 5. Sync user's installations in background
      try {
        await githubInstallationService.syncUserInstallations(user.id);
      } catch (syncErr) {
        console.warn("[GitHub Callback] Installation sync note:", syncErr);
      }

      // 6. Direct user to requested destination (defaults to dashboard "/dashboard")
      const redirectPath =
        (validation.data?.redirectPath as string) || "/dashboard";
      const separator = redirectPath.includes("?") ? "&" : "?";
      res.redirect(
        `${config.clientOrigin}${redirectPath}${separator}session=${encodeURIComponent(
          sessionToken
        )}`
      );
    } catch (err) {
      console.error("[GitHub Callback] Processing error:", err);
      res.redirect(
        `${config.clientOrigin}/?auth_error=${encodeURIComponent(
          err instanceof Error ? err.message : "GitHub authentication failed"
        )}`
      );
    }
  }

  /**
   * Post-installation redirect handler (Setup URL).
   * GET /api/github/setup
   */
  public async handleSetup(req: Request, res: Response): Promise<void> {
    const { installation_id, setup_action } = req.query;
    console.log(
      `[GitHub Setup] Installation ${installation_id} setup completed (action: ${setup_action})`
    );

    const cookieToken = req.cookies?.devtrace_session;

    if (cookieToken) {
      const payload = verifySessionToken(cookieToken);
      if (payload?.userId) {
        try {
          await githubInstallationService.syncUserInstallations(payload.userId);
        } catch (syncErr) {
          console.warn("[GitHub Setup] Installation sync warning:", syncErr);
        }
      }
    }

    const redirectParams = new URLSearchParams();
    if (installation_id) {
      redirectParams.set("installation_id", String(installation_id));
    }
    if (cookieToken) {
      redirectParams.set("session", cookieToken);
    }
    redirectParams.set("setup", "success");

    // Redirect to the import dashboard where repos will be listed
    res.redirect(`${config.clientOrigin}/import?${redirectParams.toString()}`);
  }

  /**
   * Returns current authenticated user and GitHub profile.
   * GET /api/github/user
   */
  public async getCurrentUser(req: Request, res: Response): Promise<void> {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        githubId: user.githubId.toString(),
        githubUsername: user.githubUsername,
        githubAvatarUrl: user.githubAvatarUrl,
        githubProfileUrl: user.githubProfileUrl,
        githubUserType: user.githubUserType,
        createdAt: user.createdAt,
      },
    });
  }

  /**
   * Lists GitHub App installations accessible to the authenticated user.
   * GET /api/github/installations
   */
  public async listInstallations(req: Request, res: Response): Promise<void> {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const installations =
        await githubInstallationService.getUserInstallations(user.id);
      res.json({ installations });
    } catch (error) {
      console.error("[GitHub Controller] Error listing installations:", error);
      res.status(500).json({
        error: "Failed to fetch installations",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Lists repositories accessible through the user's authorized installations.
   * GET /api/github/repositories
   */
  public async listRepositories(req: Request, res: Response): Promise<void> {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const installationId = req.query.installationId as string | undefined;
    const search = req.query.search as string | undefined;
    const visibility = req.query.visibility as
      "all" | "public" | "private" | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const perPage = req.query.perPage
      ? parseInt(req.query.perPage as string, 10)
      : 30;

    try {
      const result = await githubRepositoryService.listRepositories(user.id, {
        installationId,
        search,
        visibility,
        page,
        perPage,
      });

      res.json(result);
    } catch (error) {
      console.error("[GitHub Controller] Error listing repositories:", error);
      res.status(500).json({
        error: "Failed to fetch repositories",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Disconnects user GitHub account and clears session.
   * POST /api/github/disconnect
   */
  public async disconnect(req: Request, res: Response): Promise<void> {
    const user = req.user;
    if (user) {
      try {
        await githubAuthService.disconnect(user.id);
      } catch (err) {
        console.warn("[GitHub Disconnect] Error clearing tokens:", err);
      }
    }

    res.clearCookie("devtrace_session", { path: "/" });
    res.json({ success: true, message: "Disconnected successfully." });
  }
}

export const githubController = new GithubController();
