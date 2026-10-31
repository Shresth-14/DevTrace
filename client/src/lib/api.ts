export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

export const GITHUB_APP_SLUG =
  process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "dev-trace2607";

export interface UserDto {
  id: string;
  name: string | null;
  email: string | null;
  githubId: string;
  githubUsername: string;
  githubAvatarUrl: string | null;
  githubProfileUrl: string | null;
  githubUserType: string;
}

export interface InstallationDto {
  id: string;
  installationId: string;
  accountLogin: string;
  accountId: string;
  accountType: "User" | "Organization";
  accountAvatarUrl: string | null;
  targetType: string | null;
  repositorySelection: "all" | "selected";
  status: string;
}

export interface RepositoryDto {
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

export interface ProjectDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  githubRepoFullName: string;
  githubRepoUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  primaryLanguage: string | null;
  url: string;
  createdAt: string;
  updatedAt?: string;
}

// Token storage in browser
export function getStoredSession(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("devtrace_session");
}

export function setStoredSession(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("devtrace_session", token);
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("devtrace_session");
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredSession();
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include", // send cookies
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message ||
        errorData.error ||
        `Request failed with HTTP ${response.status}`
    );
  }

  return response.json();
}

export const api = {
  // Auth
  getAuthUrl: (redirect = "/dashboard"): string => {
    return `${API_BASE_URL}/api/github/auth?redirect=${encodeURIComponent(
      redirect
    )}`;
  },

  getCurrentUser: async (): Promise<{ user: UserDto }> => {
    return request<{ user: UserDto }>("/api/github/user");
  },

  getInstallations: async (): Promise<{
    installations: InstallationDto[];
  }> => {
    return request<{ installations: InstallationDto[] }>(
      "/api/github/installations"
    );
  },

  getRepositories: async (params: {
    installationId?: string;
    search?: string;
    visibility?: "all" | "public" | "private";
    page?: number;
    perPage?: number;
  }): Promise<{
    repositories: RepositoryDto[];
    totalCount: number;
    page: number;
    hasMore: boolean;
  }> => {
    const searchParams = new URLSearchParams();
    if (params.installationId) {
      searchParams.set("installationId", params.installationId);
    }
    if (params.search) {
      searchParams.set("search", params.search);
    }
    if (params.visibility && params.visibility !== "all") {
      searchParams.set("visibility", params.visibility);
    }
    if (params.page) {
      searchParams.set("page", params.page.toString());
    }
    if (params.perPage) {
      searchParams.set("perPage", params.perPage.toString());
    }

    const qs = searchParams.toString();
    return request(`/api/github/repositories${qs ? `?${qs}` : ""}`);
  },

  connectRepository: async (
    repositoryId: string | number
  ): Promise<{ success: boolean; project: ProjectDto }> => {
    return request<{ success: boolean; project: ProjectDto }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ repositoryId }),
    });
  },

  getProjects: async (): Promise<{ projects: ProjectDto[] }> => {
    return request<{ projects: ProjectDto[] }>("/api/projects");
  },

  getProjectBySlug: async (
    slug: string
  ): Promise<{ project: ProjectDto; isOwner: boolean }> => {
    return request<{ project: ProjectDto; isOwner: boolean }>(
      `/api/projects/${slug}`
    );
  },

  disconnect: async (): Promise<{ success: boolean }> => {
    clearStoredSession();
    return request<{ success: boolean }>("/api/github/disconnect", {
      method: "POST",
    });
  },
};
