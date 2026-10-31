"use client";

import { LogoMark } from "@/components/LogoMark";
import { useEffect, useState, useTransition, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  setStoredSession,
  UserDto,
  InstallationDto,
  RepositoryDto,
  ProjectDto,
  GITHUB_APP_SLUG,
} from "@/lib/api";
import {
  Search,
  Lock,
  Globe,
  GitBranch,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  LogOut,
  ShieldCheck,
  Loader2,
} from "lucide-react";

function ImportContent() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserDto | null>(null);
  const [installations, setInstallations] = useState<InstallationDto[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState<
    string | undefined
  >(undefined);

  const [repositories, setRepositories] = useState<RepositoryDto[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "public" | "private"
  >("all");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import / Connection State
  const [connectingRepoId, setConnectingRepoId] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<ProjectDto | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  // 1. Initial Load & Session Handling
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Extract session from URL if redirected from OAuth callback
        const urlParams = new URLSearchParams(window.location.search);
        const sessionToken = urlParams.get("session");
        const authError = urlParams.get("auth_error");
        const urlInstallationId = urlParams.get("installation_id");

        if (authError) {
          setError(decodeURIComponent(authError));
        }

        if (sessionToken) {
          setStoredSession(sessionToken);
        }

        // Clean query params from URL
        if (sessionToken || authError || urlParams.get("setup")) {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }

        // Fetch authenticated user
        const { user: currentUser } = await api.getCurrentUser();
        setUser(currentUser);

        // Fetch user installations
        const { installations: userInsts } = await api.getInstallations();
        setInstallations(userInsts);

        // Auto-select priority:
        // 1. urlInstallationId from setup redirect
        // 2. Personal account installation matching currentUser.githubUsername
        // 3. First installation in list
        const personalInst = userInsts.find(
          (i) =>
            i.accountLogin.toLowerCase() ===
            currentUser.githubUsername.toLowerCase()
        );
        const matchingUrlInst = urlInstallationId
          ? userInsts.find((i) => i.installationId === urlInstallationId)
          : undefined;

        const defaultInst = matchingUrlInst || personalInst || userInsts[0];
        if (defaultInst) {
          setSelectedInstallationId(defaultInst.installationId);
        }
      } catch {
        // Not authenticated
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // 2. Fetch Repositories when selected installation changes
  useEffect(() => {
    if (!user) return;

    const fetchRepos = async () => {
      setLoadingRepos(true);
      setError(null);
      try {
        const { repositories: repos } = await api.getRepositories({
          installationId: selectedInstallationId,
          visibility: visibilityFilter,
          search: searchQuery,
        });
        setRepositories(repos);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load repositories."
        );
      } finally {
        setLoadingRepos(false);
      }
    };

    const timer = setTimeout(fetchRepos, 250);
    return () => clearTimeout(timer);
  }, [user, selectedInstallationId, visibilityFilter, searchQuery]);

  // Handle repository connection
  const handleConnect = async (repo: RepositoryDto) => {
    setConnectingRepoId(repo.id);
    setError(null);

    try {
      const { project } = await api.connectRepository(repo.id);
      setCreatedProject(project);

      // Update repo in list
      setRepositories((prev) =>
        prev.map((r) =>
          r.id === repo.id
            ? { ...r, connected: true, projectSlug: project.slug }
            : r
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect repository."
      );
    } finally {
      setConnectingRepoId(null);
    }
  };

  // Handle Disconnect
  const handleDisconnect = async () => {
    try {
      await api.disconnect();
      setUser(null);
      setInstallations([]);
      setRepositories([]);
      startTransition(() => {
        router.push("/");
      });
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  };

  const copyProjectUrl = (slug: string) => {
    const fullUrl = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // ==========================================
  // Loading State
  // ==========================================
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5ED] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#35432C] animate-spin" />
          <p className="text-xs font-mono text-[#5A6052]">
            Loading Dev Trace...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // SCREEN A: GitHub Connection (Unauthenticated)
  // ==========================================
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F7F5ED] text-[#2F362A] flex flex-col font-sans">
        {/* Simple Navbar */}
        <header className="border-b border-[#DDD8CC] bg-[#F7F5ED]/80 backdrop-blur-md px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#283222] text-[#FAF8F3] flex items-center justify-center font-bold text-xs">
                <LogoMark />
              </div>
              <span className="font-semibold text-base text-[#1F271B] tracking-tight">
                Dev Trace
              </span>
            </Link>
            <Link
              href="/"
              className="text-xs text-[#5A6052] hover:text-[#1F271B] transition-colors"
            >
              Back to Overview
            </Link>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-[#DDD8CC] p-8 shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-[#E6DFCF] border border-[#CFC5B2] flex items-center justify-center mx-auto text-[#283222]">
                <svg
                  className="w-6 h-6 fill-current"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
              </div>

              <h1 className="text-xl font-bold tracking-tight text-[#1F271B]">
                Connect with GitHub
              </h1>
              <p className="text-xs text-[#5A6052] leading-relaxed">
                Authorize the Dev Trace GitHub App to discover and connect your
                repositories in one seamless step.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <a
                href={api.getAuthUrl("/import")}
                className="w-full py-3.5 px-4 rounded-xl bg-[#35432C] hover:bg-[#283421] active:bg-[#1E2718] text-[#FAF8F3] font-semibold text-xs transition-colors flex items-center justify-center gap-2.5 shadow-sm"
              >
                <svg
                  className="w-4 h-4 fill-current"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>Continue with GitHub</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </a>
            </div>

            <div className="pt-4 border-t border-[#DDD8CC] space-y-2 text-[11px] text-[#5A6052]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#4E673D] shrink-0" />
                <span>Encrypted token storage with AES-256-GCM</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#4E673D] shrink-0" />
                <span>
                  Read-only permissions for PRs, issues and discussions
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Find currently selected installation object
  const currentInstallation = installations.find(
    (i) => i.installationId === selectedInstallationId
  );

  return (
    <div className="min-h-screen bg-[#F7F5ED] text-[#2F362A] flex flex-col font-sans">
      {/* Navbar with connected account */}
      <header className="border-b border-[#DDD8CC] bg-[#F7F5ED]/90 sticky top-0 z-40 backdrop-blur-md px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#283222] text-[#FAF8F3] flex items-center justify-center font-bold text-xs">
                <LogoMark />
              </div>
              <span className="font-semibold text-base text-[#1F271B] tracking-tight">
                Dev Trace
              </span>
            </Link>
            <span className="text-[#DDD8CC]">/</span>
            <span className="text-xs font-mono font-medium text-[#5A6052]">
              Import Repository
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 pl-3 py-1 pr-2 rounded-full bg-[#E6DFCF] border border-[#CFC5B2] text-xs">
              {user.githubAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.githubAvatarUrl}
                  alt={user.githubUsername}
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#35432C] text-white text-[10px] flex items-center justify-center font-bold">
                  {user.githubUsername[0].toUpperCase()}
                </div>
              )}
              <span className="font-medium text-[#1F271B]">
                {user.githubUsername}
              </span>
              <button
                type="button"
                onClick={handleDisconnect}
                title="Disconnect GitHub"
                className="ml-1 p-1 rounded-full hover:bg-[#D8CEBA] text-[#5A6052] hover:text-[#1F271B] transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 space-y-8">
        {/* Creation Success Modal / Banner */}
        {createdProject && (
          <div className="p-6 rounded-2xl bg-white border border-[#A6C590] shadow-md space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#CADDBB] text-[#1E2D17] flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1F271B]">
                    Project successfully created!
                  </h3>
                  <p className="text-xs text-[#5A6052]">
                    Repository{" "}
                    <strong className="text-[#1F271B]">
                      {createdProject.githubRepoFullName}
                    </strong>{" "}
                    is now connected to Dev Trace.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCreatedProject(null)}
                className="text-xs text-[#5A6052] hover:text-[#1F271B]"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-[#DDD8CC]">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F7F5ED] border border-[#DDD8CC] text-xs font-mono text-[#1F271B]">
                <span>{`/p/${createdProject.slug}`}</span>
                <button
                  type="button"
                  onClick={() => copyProjectUrl(createdProject.slug)}
                  className="p-1 rounded hover:bg-[#E6DFCF] text-[#5A6052] transition-colors"
                  title="Copy URL"
                >
                  {copiedUrl ? (
                    <Check className="w-3.5 h-3.5 text-[#4E673D]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <Link
                href={`/p/${createdProject.slug}`}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#35432C] hover:bg-[#283421] text-[#FAF8F3] font-semibold text-xs transition-colors shadow-sm"
              >
                <span>Open Project Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1F271B]">
            Import Git Repository
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6052]">
            Select an authorized GitHub repository to establish its technical
            decision memory layer.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Prompt to install app on personal account if not yet installed */}
        {!installations.some(
          (i) =>
            i.accountLogin.toLowerCase() === user.githubUsername.toLowerCase()
        ) && (
          <div className="p-4 rounded-2xl bg-[#E6DFCF] border border-[#CFC5B2] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#1F271B]">
            <div>
              <span className="font-bold">
                Dev Trace is not yet installed on your personal account (@
                {user.githubUsername})
              </span>
              <p className="text-[#5A6052] text-[11px] mt-0.5">
                Install the GitHub App on your personal account to access all
                your personal repositories.
              </p>
            </div>
            <a
              href={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#35432C] hover:bg-[#283421] text-[#FAF8F3] font-semibold text-xs shrink-0 transition-colors shadow-xs"
            >
              <span>Install on @{user.githubUsername}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Controls: Account Switcher, Search, Visibility Filter */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Account / Installation Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
              className="w-full md:w-auto inline-flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white border border-[#DDD8CC] hover:border-[#CFC5B2] text-xs text-[#1F271B] font-medium shadow-sm transition-colors"
            >
              <div className="flex items-center gap-2">
                {currentInstallation?.accountAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentInstallation.accountAvatarUrl}
                    alt=""
                    className="w-4 h-4 rounded-full"
                  />
                ) : (
                  <Globe className="w-4 h-4 text-[#5A6052]" />
                )}
                <span>
                  {currentInstallation
                    ? currentInstallation.accountLogin.toLowerCase() ===
                      user.githubUsername.toLowerCase()
                      ? `${user.githubUsername} (Personal)`
                      : currentInstallation.accountLogin
                    : "All Authorized Accounts"}
                </span>
                <span className="text-[10px] font-mono text-[#5A6052] uppercase px-1.5 py-0.5 rounded bg-[#F7F5ED] border border-[#DDD8CC]">
                  {currentInstallation
                    ? currentInstallation.accountLogin.toLowerCase() ===
                      user.githubUsername.toLowerCase()
                      ? "Personal"
                      : currentInstallation.accountType
                    : "All"}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#5A6052]" />
            </button>

            {accountDropdownOpen && (
              <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl border border-[#DDD8CC] shadow-xl py-2 z-30 animate-in fade-in duration-100">
                <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#77796F]">
                  GitHub App Installations
                </div>

                {/* Option for All Accounts */}
                {installations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInstallationId(undefined);
                      setAccountDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-[#F7F5ED] text-left transition-colors ${
                      selectedInstallationId === undefined
                        ? "bg-[#E6DFCF] font-semibold text-[#1F271B]"
                        : "text-[#2F362A]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#5A6052]" />
                      <span>All Accounts</span>
                    </div>
                    <span className="text-[10px] text-[#5A6052] font-mono">
                      {installations.length} accounts
                    </span>
                  </button>
                )}

                {installations.map((inst) => {
                  const isPersonal =
                    inst.accountLogin.toLowerCase() ===
                    user.githubUsername.toLowerCase();
                  return (
                    <button
                      key={inst.installationId}
                      type="button"
                      onClick={() => {
                        setSelectedInstallationId(inst.installationId);
                        setAccountDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-[#F7F5ED] text-left transition-colors ${
                        selectedInstallationId === inst.installationId
                          ? "bg-[#E6DFCF] font-semibold text-[#1F271B]"
                          : "text-[#2F362A]"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {inst.accountAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={inst.accountAvatarUrl}
                            alt=""
                            className="w-4 h-4 rounded-full"
                          />
                        ) : (
                          <Globe className="w-4 h-4 text-[#5A6052]" />
                        )}
                        <span className="truncate">{inst.accountLogin}</span>
                      </div>
                      <span className="text-[10px] text-[#5A6052] font-mono">
                        {isPersonal ? "Personal" : inst.accountType}
                      </span>
                    </button>
                  );
                })}

                <div className="pt-2 mt-2 border-t border-[#DDD8CC] px-2">
                  <a
                    href={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
                    className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-[#35432C] hover:bg-[#E6DFCF] rounded-lg transition-colors font-semibold"
                  >
                    <span>Install on another account / organization</span>
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Search Bar & Visibility Filter */}
          <div className="flex flex-1 items-center gap-3 md:justify-end">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5A6052]" />
              <input
                type="text"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white border border-[#DDD8CC] focus:outline-none focus:border-[#35432C] text-xs text-[#1F271B] shadow-sm transition-colors"
              />
            </div>

            {/* Visibility Pills */}
            <div className="flex items-center bg-[#E6DFCF] p-1 rounded-xl border border-[#CFC5B2] text-xs">
              {(["all", "public", "private"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibilityFilter(v)}
                  className={`px-3 py-1.5 rounded-lg font-medium capitalize text-xs transition-colors ${
                    visibilityFilter === v
                      ? "bg-white text-[#1F271B] shadow-xs"
                      : "text-[#5A6052] hover:text-[#1F271B]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Repositories List */}
        <div className="space-y-3">
          {loadingRepos ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border border-[#DDD8CC]">
              <Loader2 className="w-6 h-6 text-[#35432C] animate-spin" />
              <p className="text-xs text-[#5A6052]">
                Fetching accessible repositories...
              </p>
            </div>
          ) : repositories.length === 0 ? (
            <div className="py-16 px-6 text-center bg-white rounded-2xl border border-[#DDD8CC] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#E6DFCF] text-[#283222] flex items-center justify-center mx-auto">
                <Search className="w-5 h-5 text-[#5A6052]" />
              </div>
              <h3 className="text-sm font-semibold text-[#1F271B]">
                No repositories found
              </h3>
              <p className="text-xs text-[#5A6052] max-w-md mx-auto">
                No repositories match your current search or installation
                filter. Make sure Dev Trace is granted access to the
                repositories in GitHub App settings.
              </p>
              <div className="pt-2">
                <a
                  href={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E6DFCF] hover:bg-[#DDD5C3] text-[#1F271B] text-xs font-semibold border border-[#CFC5B2] transition-colors"
                >
                  <span>Configure repository access on GitHub</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {repositories.map((repo) => {
                const isConnecting = connectingRepoId === repo.id;

                return (
                  <div
                    key={repo.id}
                    className="p-5 rounded-2xl bg-white border border-[#DDD8CC] hover:border-[#CFC5B2] shadow-xs hover:shadow-sm transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[#1F271B] truncate">
                          {repo.fullName}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                            repo.isPrivate
                              ? "bg-[#F7F5ED] text-[#5A6052] border-[#DDD8CC]"
                              : "bg-[#CADDBB]/50 text-[#1E2D17] border-[#CADDBB]"
                          }`}
                        >
                          {repo.isPrivate ? (
                            <>
                              <Lock className="w-2.5 h-2.5" />
                              Private
                            </>
                          ) : (
                            <>
                              <Globe className="w-2.5 h-2.5" />
                              Public
                            </>
                          )}
                        </span>

                        {repo.isFork && (
                          <span className="text-[10px] font-mono text-[#5A6052] px-2 py-0.5 rounded-full bg-[#E6DFCF]">
                            Fork
                          </span>
                        )}
                      </div>

                      {repo.description && (
                        <p className="text-xs text-[#5A6052] line-clamp-1">
                          {repo.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#5A6052] font-mono pt-1">
                        {repo.primaryLanguage && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#35432C]" />
                            {repo.primaryLanguage}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3 h-3 text-[#5A6052]" />
                          {repo.defaultBranch}
                        </span>
                        <span>
                          Updated{" "}
                          {new Date(repo.updatedAt).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center sm:self-center gap-2 shrink-0">
                      {repo.connected && repo.projectSlug ? (
                        <Link
                          href={`/p/${repo.projectSlug}`}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#CADDBB] hover:bg-[#b8cca8] text-[#1E2D17] font-semibold text-xs border border-[#A6C590] transition-colors"
                        >
                          <span>Connected</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConnect(repo)}
                          disabled={isConnecting}
                          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#35432C] hover:bg-[#283421] active:bg-[#1E2718] disabled:opacity-60 text-[#FAF8F3] font-semibold text-xs transition-colors shadow-sm"
                        >
                          {isConnecting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Importing...</span>
                            </>
                          ) : (
                            <>
                              <span>Connect</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ImportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F7F5ED] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-[#35432C] animate-spin" />
            <p className="text-xs font-mono text-[#5A6052]">
              Loading Dev Trace...
            </p>
          </div>
        </div>
      }
    >
      <ImportContent />
    </Suspense>
  );
}
