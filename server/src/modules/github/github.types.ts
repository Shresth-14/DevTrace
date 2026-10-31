export interface GithubUserProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  email: string | null;
  type: string;
}

export interface GithubTokenResponse {
  access_token: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

export interface GithubInstallationDto {
  id: string;
  installationId: string;
  accountLogin: string;
  accountId: string;
  accountType: "User" | "Organization";
  accountAvatarUrl?: string | null;
  targetType?: string | null;
  repositorySelection: "all" | "selected";
  status: string;
}

export interface GithubRepositoryDto {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  ownerId: string;
  ownerAvatarUrl?: string;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  primaryLanguage: string | null;
  isFork: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  installationId: string;
  connected?: boolean;
  projectSlug?: string;
}

export interface ConnectRepositoryInput {
  repositoryId: string | number;
  installationId?: string | number;
}
