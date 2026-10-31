"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { api, setStoredSession, type ProjectDto } from "@/lib/api";
import { Loader2 } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "info" | "error";
  message: string;
}

export interface DashboardUser {
  id: string;
  name: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  profileUrl: string;
}

interface DashboardContextType {
  user: DashboardUser;
  projects: ProjectDto[];
  projectsLoading: boolean;
  projectsError: string | null;
  refreshProjects: () => void;
  isAddProjectOpen: boolean;
  openAddProject: () => void;
  closeAddProject: () => void;
  /** Adds a public repository by URL. Rejects with a user-readable message. */
  addProjectFromUrl: (
    url: string
  ) => Promise<{ project: ProjectDto; alreadyConnected: boolean }>;
  removeProject: (project: ProjectDto) => Promise<void>;
  toasts: ToastMessage[];
  addToast: (message: string, type?: "success" | "info" | "error") => void;
  removeToast: (id: string) => void;
  handleLogout: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(
  undefined
);

type Auth =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "error"; message: string }
  | { status: "ready"; user: DashboardUser };

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback;

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dt-bg p-6">
      <div className="w-full max-w-sm space-y-4 text-center">{children}</div>
    </div>
  );
}

// Module-level cache to reuse already loaded projects across mounts
let cachedProjects: ProjectDto[] | null = null;

export function DashboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [auth, setAuth] = useState<Auth>({ status: "loading" });
  const [authAttempt, setAuthAttempt] = useState(0);

  const [projects, setProjects] = useState<ProjectDto[]>(() => cachedProjects ?? []);
  const [projectsLoading, setProjectsLoading] = useState(() => cachedProjects === null);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: "success" | "info" | "error" = "success") => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => removeToast(id), 4000);
    },
    [removeToast]
  );

  // --- authentication --------------------------------------------------------
  useEffect(() => {
    let live = true;
    // Capture the session token when redirected straight from the GitHub callback.
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get("session");
    if (sessionParam) {
      setStoredSession(sessionParam);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    api
      .getCurrentUser()
      .then(({ user }) => {
        if (!live) return;
        setAuth({
          status: "ready",
          user: {
            id: user.id,
            name: user.name || user.githubUsername,
            username: user.githubUsername,
            email: user.email,
            avatarUrl: user.githubAvatarUrl,
            profileUrl:
              user.githubProfileUrl ?? `https://github.com/${user.githubUsername}`,
          },
        });
      })
      .catch((err: unknown) => {
        if (!live) return;
        const msg = errorMessage(err, "Could not reach the Dev Trace API.");
        // The API answers 401 with "Authentication required"/"Session expired".
        const signedOut = /authentication required|session expired|unauthorized|sign in/i.test(
          msg
        );
        setAuth(signedOut ? { status: "signed_out" } : { status: "error", message: msg });
      });
    return () => {
      live = false;
    };
  }, [authAttempt]);

  // --- projects --------------------------------------------------------------
  // `projectsTick` re-runs the fetch effect; bump it through refreshProjects().
  const [projectsTick, setProjectsTick] = useState(0);
  const refreshProjects = useCallback(() => setProjectsTick((n) => n + 1), []);

  const ready = auth.status === "ready";
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let live = true;
    api
      .getProjects({ signal: controller.signal })
      .then((res) => {
        if (!live) return;
        cachedProjects = res.projects;
        setProjects(res.projects);
        setProjectsError(null);
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setProjectsError(errorMessage(err, "Could not load your projects."));
      })
      .finally(() => {
        if (live) setProjectsLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [ready, projectsTick]);

  // While anything is syncing or being analysed, keep the numbers fresh.
  const busy = projects.some(
    (p) => p.syncStatus === "running" || p.aiStatus === "running"
  );
  useEffect(() => {
    if (!busy) return;

    let timer: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (timer === null && typeof document !== "undefined" && document.visibilityState !== "hidden") {
        timer = setInterval(() => setProjectsTick((n) => n + 1), 5000);
      }
    };

    const stopPolling = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        stopPolling();
      } else {
        setProjectsTick((n) => n + 1);
        startPolling();
      }
    };

    if (typeof document !== "undefined" && document.visibilityState !== "hidden") {
      startPolling();
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      stopPolling();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [busy]);

  // --- adding a repository ------------------------------------------------------
  const openAddProject = useCallback(() => setIsAddProjectOpen(true), []);
  const closeAddProject = useCallback(() => setIsAddProjectOpen(false), []);

  const addProjectFromUrl = useCallback(
    async (url: string) => {
      const res = await api.addProjectFromUrl(url);
      refreshProjects();
      addToast(
        res.alreadyConnected
          ? `${res.project.githubRepoFullName} is already connected.`
          : `Added ${res.project.githubRepoFullName}. Importing its history now.`,
        res.alreadyConnected ? "info" : "success"
      );
      return { project: res.project, alreadyConnected: res.alreadyConnected };
    },
    [addToast, refreshProjects]
  );

  const removeProject = useCallback(
    async (project: ProjectDto) => {
      try {
        await api.deleteProject(project.slug);
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
        addToast(`Disconnected ${project.githubRepoFullName}.`, "info");
      } catch (err) {
        addToast(errorMessage(err, "Could not disconnect this project."), "error");
      }
    },
    [addToast]
  );

  const handleLogout = useCallback(async () => {
    try {
      await api.disconnect();
    } catch {
      // The local session is cleared either way.
    } finally {
      router.push("/");
    }
  }, [router]);

  if (auth.status === "loading") {
    return (
      <Gate>
        <div role="status" className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-dt-forest" aria-hidden="true" />
          <p className="text-sm text-dt-muted-text">Loading your workspace…</p>
        </div>
      </Gate>
    );
  }

  if (auth.status === "signed_out") {
    return (
      <Gate>
        <h1 className="text-lg font-semibold text-dt-ink-strong">Sign in to Dev Trace</h1>
        <p className="text-sm leading-relaxed text-dt-muted-text">
          Connect your GitHub account to see your repositories and the decisions recovered from them.
        </p>
        <a
          href={api.getAuthUrl("/dashboard")}
          className="inline-flex rounded-lg bg-dt-forest px-4 py-2 text-sm font-medium text-dt-bg hover:bg-dt-forest-dark"
        >
          Continue with GitHub
        </a>
      </Gate>
    );
  }

  if (auth.status === "error") {
    return (
      <Gate>
        <h1 className="text-lg font-semibold text-dt-ink-strong">Could not load your workspace</h1>
        <p role="alert" className="text-sm leading-relaxed text-dt-muted-text">
          {auth.message}
        </p>
        <button
          type="button"
          onClick={() => {
            setAuth({ status: "loading" });
            setAuthAttempt((n) => n + 1);
          }}
          className="inline-flex cursor-pointer rounded-lg bg-dt-forest px-4 py-2 text-sm font-medium text-dt-bg hover:bg-dt-forest-dark"
        >
          Try again
        </button>
      </Gate>
    );
  }

  return (
    <DashboardContext.Provider
      value={{
        user: auth.user,
        projects,
        projectsLoading,
        projectsError,
        refreshProjects,
        isAddProjectOpen,
        openAddProject,
        closeAddProject,
        addProjectFromUrl,
        removeProject,
        toasts,
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
