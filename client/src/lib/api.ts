export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

import type {
  DecisionRecord,
  OverviewData,
  PrIntelligenceItem,
  ProjectStatus,
  SourceCategory,
  SourceFeedItem,
  DecisionStatus,
} from "@/components/project/types";

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
  manageUrl?: string;
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
  stars?: number;
  forks?: number;
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
  decisionsCount: number;
  syncStatus: string;
  aiStatus: string;
  lastSyncedAt: string | null;
  lastExtractedAt: string | null;
}

export interface RepositoryPage {
  repositories: RepositoryDto[];
  totalCount: number;
  page: number;
  hasMore: boolean;
  warnings: { installationId: string; accountLogin: string; message: string }[];
  installUrl?: string;
}

export interface DashboardSummary {
  projects: number;
  decisions: number;
  recentDecisions: {
    id: string;
    title: string;
    status: DecisionStatus;
    date: string | null;
    summary: string;
    projectName: string;
    slug: string;
  }[];
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

const REQUEST_TIMEOUT_MS = 45_000;

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

  // Every request has a deadline so a stuck server can never leave a loader spinning.
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: "include", // send cookies
      signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(
        "The Dev Trace server took too long to respond. Please try again."
      );
    }
    throw new Error(
      "Could not reach the Dev Trace server. Check that it is running and try again."
    );
  }

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
    installUrl?: string;
  }> => {
    return request<{ installations: InstallationDto[]; installUrl?: string }>(
      "/api/github/installations"
    );
  },

  getRepositories: async (params: {
    installationId?: string;
    search?: string;
    visibility?: "all" | "public" | "private";
    page?: number;
    perPage?: number;
  }): Promise<RepositoryPage> => {
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

  /**
   * Every repository the user can access, across all pages. The server pages its
   * results, so a single call would silently hide everything past the first page.
   */
  getAllRepositories: async (
    params: {
      installationId?: string;
      search?: string;
      visibility?: "all" | "public" | "private";
    } = {}
  ): Promise<RepositoryPage> => {
    const perPage = 100;
    const all: RepositoryDto[] = [];
    let first: RepositoryPage | null = null;
    for (let page = 1; page <= 100; page++) {
      const res = await api.getRepositories({ ...params, page, perPage });
      first ??= res;
      all.push(...res.repositories);
      if (!res.hasMore) break;
    }
    return {
      ...(first as RepositoryPage),
      repositories: all,
      totalCount: all.length,
      hasMore: false,
    };
  },

  connectRepository: async (
    repositoryId: string | number
  ): Promise<{ success: boolean; project: ProjectDto }> => {
    return request<{ success: boolean; project: ProjectDto }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ repositoryId }),
    });
  },

  /** Adds a public repository by URL; the import and analysis start automatically. */
  addProjectFromUrl: (repositoryUrl: string) =>
    request<{ success: boolean; alreadyConnected: boolean; project: ProjectDto }>(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ repositoryUrl }) }
    ),

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

  deleteProject: (slug: string) =>
    request<{ success: boolean }>(`/api/projects/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    }),

  getSyncStatus: (slug: string) =>
    request<ProjectStatus>(`/api/projects/${encodeURIComponent(slug)}/sync`),

  startSync: (slug: string, full = false) =>
    request<{ success: boolean }>(
      `/api/projects/${encodeURIComponent(slug)}/sync`,
      { method: "POST", body: JSON.stringify({ full }) }
    ),

  startExtraction: (slug: string, force = false) =>
    request<{ success: boolean }>(
      `/api/projects/${encodeURIComponent(slug)}/extract`,
      { method: "POST", body: JSON.stringify({ force }) }
    ),

  getOverview: (slug: string) =>
    request<OverviewData>(`/api/projects/${encodeURIComponent(slug)}/overview`),

  /** All decisions of a project (pages are followed until exhausted). */
  getDecisions: async (slug: string): Promise<DecisionRecord[]> => {
    const out: DecisionRecord[] = [];
    for (let page = 1; page <= 100; page++) {
      const res = await request<{ decisions: DecisionRecord[]; hasMore: boolean }>(
        `/api/projects/${encodeURIComponent(slug)}/decisions?page=${page}&perPage=200`
      );
      out.push(...res.decisions);
      if (!res.hasMore) break;
    }
    return out;
  },

  getPrIntelligence: (slug: string) =>
    request<{ items: PrIntelligenceItem[]; total: number; scanned: number }>(
      `/api/projects/${encodeURIComponent(slug)}/pr-intelligence?perPage=100`
    ),

  getSourceFeed: (
    slug: string,
    params: { category: SourceCategory; q?: string; page?: number }
  ) => {
    const qs = new URLSearchParams({
      category: params.category,
      page: String(params.page ?? 1),
      perPage: "25",
    });
    if (params.q) qs.set("q", params.q);
    return request<{
      items: SourceFeedItem[];
      counts: Record<SourceCategory, number>;
      hasMore: boolean;
    }>(`/api/projects/${encodeURIComponent(slug)}/source-feed?${qs}`);
  },

  getDashboardSummary: () =>
    request<DashboardSummary>("/api/dashboard/summary"),

  disconnect: async (): Promise<{ success: boolean }> => {
    clearStoredSession();
    return request<{ success: boolean }>("/api/github/disconnect", {
      method: "POST",
    });
  },
};
