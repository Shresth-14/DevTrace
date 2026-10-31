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

    let installationsFromApi: Array<{
      id: number;
      account: {
        login?: string;
        id?: number;
        type?: string;
        avatar_url?: string;
      } | null;
      target_type?: string;
      repository_selection?: string;
      suspended_at?: string | null;
    }> = [];

    try {
      const response =
        await octokit.rest.apps.listInstallationsForAuthenticatedUser({
          per_page: 100,
        });
      installationsFromApi = response.data.installations;
    } catch (error) {
      console.warn(
        `[GitHub Installations] Error querying installations for user ${userId}:`,
        error
      );
    }

    const syncedInstallations: GithubInstallationDto[] = [];

    for (const inst of installationsFromApi) {
      if (!inst.account?.login || !inst.account?.id) continue;

      const installationId = BigInt(inst.id);
      const accountId = BigInt(inst.account.id);
      const accountType =
        inst.account.type === "Organization" ? "Organization" : "User";
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
          accountLogin: inst.account.login,
          accountId,
          accountType,
          accountAvatarUrl: inst.account.avatar_url || null,
          targetType: inst.target_type || accountType,
          repositorySelection,
          status,
        },
        create: {
          installationId,
          accountLogin: inst.account.login,
          accountId,
          accountType,
          accountAvatarUrl: inst.account.avatar_url || null,
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

    let existing = await prisma.githubInstallation.findMany({
      where: { userId, status: "active" },
    });

    if (existing.length === 0) {
      try {
        existing = await prisma.githubInstallation.findMany({
          where: { userId, status: "active" },
        });
        if (existing.length === 0) {
          const synced = await this.syncUserInstallations(userId);
          existing = await prisma.githubInstallation.findMany({
            where: { userId, status: "active" },
          });
          if (existing.length === 0 && synced.length > 0) {
            return synced;
          }
        }
      } catch {
        return [];
      }
    }

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
