"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import {
  DashboardProject,
  AvailableRepository,
  IntegrationState,
  DashboardUser,
  INITIAL_MOCK_USER,
  INITIAL_MOCK_PROJECTS,
  MOCK_AVAILABLE_REPOSITORIES,
  INITIAL_INTEGRATIONS,
  LANGUAGE_COLORS,
} from "@/data/mock-projects";
import { api, setStoredSession } from "@/lib/api";

export interface ToastMessage {
  id: string;
  type: "success" | "info" | "error";
  message: string;
}

interface DashboardContextType {
  projects: DashboardProject[];
  availableRepositories: AvailableRepository[];
  integrations: IntegrationState[];
  user: DashboardUser;
  isAddProjectOpen: boolean;
  toasts: ToastMessage[];
  openAddProject: () => void;
  closeAddProject: () => void;
  addProjectFromRepo: (repo: AvailableRepository) => boolean;
  removeProject: (projectId: string) => void;
  toggleDiscordIntegration: () => void;
  addToast: (message: string, type?: "success" | "info" | "error") => void;
  removeToast: (id: string) => void;
  handleLogout: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(
  undefined
);

export function DashboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [projects, setProjects] = useState<DashboardProject[]>(
    INITIAL_MOCK_PROJECTS
  );
  const [availableRepositories, setAvailableRepositories] = useState<
    AvailableRepository[]
  >(MOCK_AVAILABLE_REPOSITORIES);
  const [integrations, setIntegrations] =
    useState<IntegrationState[]>(INITIAL_INTEGRATIONS);
  const [user, setUser] = useState<DashboardUser>(INITIAL_MOCK_USER);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Toast helpers
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: "success" | "info" | "error" = "success") => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  // Sync real authenticated user and repositories if available
  useEffect(() => {
    let isMounted = true;

    // 1. Capture session token if redirected directly from GitHub OAuth callback
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionParam = urlParams.get("session");
      if (sessionParam) {
        setStoredSession(sessionParam);
        // Clean the URL query params without reloading
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }

    // 2. Fetch authenticated user
    api
      .getCurrentUser()
      .then(async (res) => {
        if (!isMounted || !res.user) return;
        setUser({
          id: res.user.id,
          name: res.user.name || res.user.githubUsername,
          username: res.user.githubUsername,
          email:
            res.user.email ||
            `${res.user.githubUsername}@users.noreply.github.com`,
          avatarUrl:
            res.user.githubAvatarUrl ||
            `https://avatars.githubusercontent.com/${res.user.githubUsername}`,
          role: "Owner / Maintainer",
        });

        // Update GitHub integration account name & status
        setIntegrations((prev) =>
          prev.map((i) =>
            i.name === "GitHub"
              ? {
                  ...i,
                  connected: true,
                  accountName: res.user?.githubUsername || i.accountName,
                  accountAvatar: res.user?.githubAvatarUrl || i.accountAvatar,
                  lastSync: "Just now",
                }
              : i
          )
        );

        // 3. Fetch user's real GitHub repositories
        try {
          const repoRes = await api.getRepositories({ perPage: 100 });
          if (
            isMounted &&
            repoRes.repositories &&
            repoRes.repositories.length > 0
          ) {
            const realRepos: AvailableRepository[] = repoRes.repositories.map(
              (r) => ({
                id: r.id,
                name: r.name,
                fullName: r.fullName,
                owner: r.owner,
                ownerAvatarUrl:
                  r.ownerAvatarUrl || res.user.githubAvatarUrl || "",
                description: r.description || "No description provided.",
                isPrivate: r.isPrivate,
                primaryLanguage: r.primaryLanguage || "TypeScript",
                languageColor:
                  LANGUAGE_COLORS[r.primaryLanguage || ""] || "#5A6052",
                defaultBranch: r.defaultBranch || "main",
                stars: 0,
                updatedAt: new Date(r.updatedAt).toLocaleDateString(),
              })
            );
            setAvailableRepositories(realRepos);
          }
        } catch (repoErr) {
          console.warn("Could not load GitHub repositories:", repoErr);
        }

        // 4. Fetch user's connected projects if any
        try {
          const projRes = await api.getProjects();
          if (
            isMounted &&
            projRes.projects &&
            projRes.projects.length > 0
          ) {
            const realProjects: DashboardProject[] = projRes.projects.map(
              (p) => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                owner: p.githubRepoFullName.split("/")[0] || "user",
                fullName: p.githubRepoFullName,
                description: p.description || "",
                isPrivate: p.isPrivate,
                primaryLanguage: p.primaryLanguage || "TypeScript",
                languageColor:
                  LANGUAGE_COLORS[p.primaryLanguage || ""] || "#5A6052",
                decisionsCount: Math.floor(Math.random() * 20) + 10,
                lastSyncedAt: "Just now",
                syncStatus: "synced",
                githubUrl: p.githubRepoUrl,
                defaultBranch: p.defaultBranch,
              })
            );
            setProjects(realProjects);
          }
        } catch (projErr) {
          console.warn("Could not load backend projects:", projErr);
        }
      })
      .catch(() => {
        // Fall back gracefully to mock user
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const openAddProject = useCallback(() => setIsAddProjectOpen(true), []);
  const closeAddProject = useCallback(() => setIsAddProjectOpen(false), []);

  const addProjectFromRepo = useCallback(
    (repo: AvailableRepository): boolean => {
      // Check duplicate
      const exists = projects.some(
        (p) => p.fullName.toLowerCase() === repo.fullName.toLowerCase()
      );
      if (exists) {
        addToast(`Repository "${repo.fullName}" is already connected.`, "info");
        return false;
      }

      const newProject: DashboardProject = {
        id: `proj_${Date.now()}`,
        name: repo.name,
        slug: repo.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        owner: repo.owner,
        fullName: repo.fullName,
        description: repo.description,
        isPrivate: repo.isPrivate,
        primaryLanguage: repo.primaryLanguage,
        languageColor: repo.languageColor,
        decisionsCount: Math.floor(Math.random() * 24) + 12,
        lastSyncedAt: "Just now",
        syncStatus: "synced",
        githubUrl: `https://github.com/${repo.fullName}`,
        defaultBranch: repo.defaultBranch,
        stars: repo.stars,
      };

      setProjects((prev) => [newProject, ...prev]);
      setAvailableRepositories((prev) => prev.filter((r) => r.id !== repo.id));

      // Persist to backend database if real repository id
      if (!repo.id.startsWith("repo_")) {
        api.connectRepository(repo.id).catch((err) => {
          console.warn("Backend repo connect:", err);
        });
      }

      addToast(
        `Connected "${repo.fullName}" — initial decision index generated.`,
        "success"
      );
      closeAddProject();
      return true;
    },
    [projects, addToast, closeAddProject]
  );

  const removeProject = useCallback(
    (projectId: string) => {
      const target = projects.find((p) => p.id === projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (target) {
        addToast(`Disconnected project "${target.fullName}".`, "info");
      }
    },
    [projects, addToast]
  );

  const toggleDiscordIntegration = useCallback(() => {
    setIntegrations((prev) =>
      prev.map((item) => {
        if (item.name === "Discord") {
          const nextConnected = !item.connected;
          if (nextConnected) {
            addToast("Connected to Discord server: #dev-trace-community", "success");
            return {
              ...item,
              connected: true,
              accountName: "Dev Trace Community (#tech-decisions)",
              accountAvatar:
                "https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png",
              lastSync: "Just now",
            };
          } else {
            addToast("Disconnected Discord integration.", "info");
            return {
              ...item,
              connected: false,
              accountName: undefined,
              accountAvatar: undefined,
              lastSync: undefined,
            };
          }
        }
        return item;
      })
    );
  }, [addToast]);

  const router = useRouter();

  const handleLogout = useCallback(async () => {
    try {
      await api.disconnect();
    } catch {
      // ignore
    } finally {
      router.push("/");
    }
  }, [router]);

  return (
    <DashboardContext.Provider
      value={{
        projects,
        availableRepositories,
        integrations,
        user,
        isAddProjectOpen,
        toasts,
        openAddProject,
        closeAddProject,
        addProjectFromRepo,
        removeProject,
        toggleDiscordIntegration,
        addToast,
        removeToast,
        handleLogout,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}

