import { createUserOctokit } from "./github.client";
import { githubAuthService } from "./github.auth.service";
import { GithubInstallationDto } from "./github.types";
import { prisma } from "../../database";

export class GithubInstallationService {
  /**
   * Fetches all GitHub App installations accessible to the authenticated user
   * and synchronizes them with the database.
   */
  public async syncUserInstallations(
    userId: string
  ): Promise<GithubInstallationDto[]> {
    const accessToken = await githubAuthService.getValidAccessToken(userId);
    const octokit = createUserOctokit(accessToken);

    // Throws on API failure so callers can tell "no installations" from "could not ask".
    const installationsFromApi = await octokit.paginate(
      octokit.rest.apps.listInstallationsForAuthenticatedUser,
      { per_page: 100 }
    );

    const syncedInstallations: GithubInstallationDto[] = [];

    for (const inst of installationsFromApi) {
      // `account` is a user/org, or an enterprise (which has a slug instead of a login)
      const raw = inst.account;
      const account =
        raw && "login" in raw
          ? {
              login: raw.login,
              id: raw.id,
              type: raw.type,
              avatar_url: raw.avatar_url,
            }
          : null;
      if (!account?.login || !account.id) continue;

      const installationId = BigInt(inst.id);
      const accountId = BigInt(account.id);
      const accountType =
        account.type === "Organization" ? "Organization" : "User";
      const repositorySelection =
        inst.repository_selection === "selected" ? "selected" : "all";
      const status = inst.suspended_at ? "suspended" : "active";

      const record = await prisma.githubInstallation.upsert({
        where: {
          userId_installationId: {
            userId,
            installationId,
          },
        },
        update: {
          accountLogin: account.login,
          accountId,
          accountType,
          accountAvatarUrl: account.avatar_url || null,
          targetType: inst.target_type || accountType,
          repositorySelection,
          status,
        },
        create: {
          installationId,
          accountLogin: account.login,
          accountId,
          accountType,
          accountAvatarUrl: account.avatar_url || null,
          targetType: inst.target_type || accountType,
          repositorySelection,
          status,
          userId,
        },
      });

      syncedInstallations.push({
        id: record.id,
        installationId: record.installationId.toString(),
        accountLogin: record.accountLogin,
        accountId: record.accountId.toString(),
        accountType: record.accountType as "User" | "Organization",
        accountAvatarUrl: record.accountAvatarUrl,
        targetType: record.targetType,
        repositorySelection: record.repositorySelection as "all" | "selected",
        status: record.status,
      });
    }

    // Installations the user can no longer see (app uninstalled / access removed).
    await prisma.githubInstallation.updateMany({
      where: {
        userId,
        status: { not: "deleted" },
        installationId: {
          notIn: installationsFromApi.map((i) => BigInt(i.id)),
        },
      },
      data: { status: "deleted" },
    });

    return syncedInstallations;
  }

  /**
   * Retrieves installations for a user from database or syncs from GitHub if empty.
   */
  public async getUserInstallations(
    userId: string
  ): Promise<GithubInstallationDto[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubUsername: true },
    });

    // Refresh from GitHub every time so a newly installed app (or newly added
    // organisation) shows up immediately. If GitHub cannot be reached we still
    // serve what we stored rather than showing nothing.
    try {
      await this.syncUserInstallations(userId);
    } catch (error) {
      console.warn(
        `[GitHub Installations] Refresh failed for user ${userId}; using stored installations.`,
        error instanceof Error ? error.message : error
      );
    }

    const existing = await prisma.githubInstallation.findMany({
      where: { userId, status: "active" },
    });

    const currentUsername = user?.githubUsername?.toLowerCase();

    // Sort: user's personal account first, then alphabetically
    existing.sort((a, b) => {
      const aIsPersonal = a.accountLogin.toLowerCase() === currentUsername;
      const bIsPersonal = b.accountLogin.toLowerCase() === currentUsername;
      if (aIsPersonal && !bIsPersonal) return -1;
      if (!aIsPersonal && bIsPersonal) return 1;
      return a.accountLogin.localeCompare(b.accountLogin);
    });

    return existing.map((record) => ({
      id: record.id,
      installationId: record.installationId.toString(),
      accountLogin: record.accountLogin,
      accountId: record.accountId.toString(),
      accountType: record.accountType as "User" | "Organization",
      accountAvatarUrl: record.accountAvatarUrl,
      targetType: record.targetType,
      repositorySelection: record.repositorySelection as "all" | "selected",
      status: record.status,
    }));
  }

  /**
   * Verifies if a user has access to a specific installation.
   */
  public async verifyUserInstallationAccess(
    userId: string,
    installationId: bigint | number | string
  ): Promise<boolean> {
    const instId = BigInt(installationId);
    const count = await prisma.githubInstallation.count({
      where: {
        userId,
        installationId: instId,
        status: "active",
      },
    });

    if (count > 0) return true;

    // If not found in DB, try a fresh sync
    const synced = await this.syncUserInstallations(userId);
    return synced.some((i) => i.installationId === instId.toString());
  }
}

export const githubInstallationService = new GithubInstallationService();
