"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ProjectDto } from "@/lib/api";
import {
  INITIAL_MOCK_PROJECTS,
  MOCK_AVAILABLE_REPOSITORIES,
} from "@/data/mock-projects";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  GitBranch,
  GitPullRequest,
  Globe,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  MoreHorizontal,
  RotateCw,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type {
  CodeRelationship,
  DecisionRecord,
  ProjectTab,
  RejectedApproach,
  SourceWithRefs,
} from "@/components/project/types";
import {
  SAMPLE_ACTIVITY,
  SAMPLE_DECISIONS,
  SAMPLE_PRS,
} from "@/components/project/sample-data";
import { FOCUS } from "@/components/project/ui";
import { OverviewSection } from "@/components/project/OverviewSection";
import {
  DecisionsSection,
  type StatusFilter,
} from "@/components/project/DecisionsSection";
import { RejectedSection } from "@/components/project/RejectedSection";
import {
  SourcesSection,
  type SourceFilter,
} from "@/components/project/SourcesSection";
import { CodeSection } from "@/components/project/CodeSection";
import { PrSection } from "@/components/project/PrSection";

const TABS: { id: ProjectTab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: Layers },
  { id: "decisions", label: "Decisions", icon: FileText },
  { id: "rejected", label: "Rejected approaches", icon: XCircle },
  { id: "sources", label: "Sources", icon: MessageSquare },
  { id: "code", label: "Code relationships", icon: FileCode2 },
  { id: "pr-intelligence", label: "PR intelligence", icon: GitPullRequest },
];

const secondaryButton = `inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dt-line-strong bg-dt-surface px-3 py-1.5 text-xs font-medium text-dt-ink-strong transition-colors hover:bg-dt-bg2/60 ${FOCUS}`;

// ==========================================
// Inner Project Workspace Component
// ==========================================

function ProjectWorkspace() {
  const params = useParams();
  const slug = (params?.slug as string) || "dev-trace";

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  // Active navigation tab
  const [currentTab, setCurrentTab] = useState<ProjectTab>("overview");
  const tabRefs = useRef<Partial<Record<ProjectTab, HTMLButtonElement | null>>>(
    {}
  );

  // Decision explorer filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selectedDecisionId, setSelectedDecisionId] = useState<string>(
    SAMPLE_DECISIONS[0]?.id ?? ""
  );

  // Source explorer search state
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceFilter>("ALL");

  // Code relationship search state
  const [codeSearch, setCodeSearch] = useState("");

  useEffect(() => {
    if (!slug) return;

    const fetchProject = async () => {
      setLoading(true);
      setError(null);
      try {
        const { project: p, isOwner: owner } = await api.getProjectBySlug(slug);
        setProject(p);
        setIsOwner(owner);
      } catch (err) {
        // Fall back to matching mock repository
        const mockMatch =
          INITIAL_MOCK_PROJECTS.find(
            (p) => p.slug === slug || p.name === slug
          ) ||
          MOCK_AVAILABLE_REPOSITORIES.find(
            (r) =>
              r.name === slug ||
              r.name.toLowerCase().replace(/[^a-z0-9-]/g, "-") === slug
          );

        if (mockMatch) {
          const mockDto: ProjectDto = {
            id: mockMatch.id,
            name: mockMatch.name,
            slug: slug,
            description: mockMatch.description,
            githubRepoFullName: mockMatch.fullName,
            githubRepoUrl:
              "githubUrl" in mockMatch
                ? mockMatch.githubUrl
                : `https://github.com/${mockMatch.fullName}`,
            defaultBranch: mockMatch.defaultBranch,
            isPrivate: mockMatch.isPrivate,
            primaryLanguage: mockMatch.primaryLanguage,
            url:
              typeof window !== "undefined"
                ? window.location.href
                : `/p/${slug}`,
            createdAt: new Date().toISOString(),
          };
          setProject(mockDto);
          setIsOwner(true);
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load project details."
          );
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [slug]);

  const copyUrl = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleSyncNow = () => {
    setSyncing(true);
    setActionsOpen(false);
    setTimeout(() => {
      setSyncing(false);
      setSyncToast("Sync isn't connected to the backend yet, so nothing was changed.");
      setTimeout(() => setSyncToast(null), 3500);
    }, 700);
  };

  // Sample content: the client API has no endpoint for these records yet.
  const decisions: DecisionRecord[] = SAMPLE_DECISIONS;

  const filteredDecisions = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return decisions.filter((d) => {
      const matchesSearch =
        d.id.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.codeFiles.some((f) => f.path.toLowerCase().includes(q));
      const matchesStatus = statusFilter === "ALL" || d.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [decisions, searchQuery, statusFilter]);

  const activeDecision =
    filteredDecisions.find((d) => d.id === selectedDecisionId) ??
    filteredDecisions[0] ??
    null;

  // Alternatives that a decision explicitly records as rejected
  const rejectedApproaches = useMemo<RejectedApproach[]>(
    () =>
      decisions.flatMap((d) =>
        d.rejectedAlternative
          ? [
              {
                decisionId: d.id,
                decisionTitle: d.title,
                status: d.status,
                date: d.date,
                alternative: d.rejectedAlternative,
              },
            ]
          : []
      ),
    [decisions]
  );

  // Unique sources across decisions, with the decisions that cite them
  const allSources = useMemo<SourceWithRefs[]>(() => {
    const list: SourceWithRefs[] = [];
    decisions.forEach((d) => {
      d.sources.forEach((s) => {
        const existing = list.find((item) => item.id === s.id);
        if (existing) {
          if (!existing.referencedDecisions.includes(d.id)) {
            existing.referencedDecisions.push(d.id);
          }
        } else {
          list.push({ ...s, referencedDecisions: [d.id] });
        }
      });
    });
    return list;
  }, [decisions]);

  const filteredSources = useMemo(() => {
    const q = sourceSearch.toLowerCase();
    return allSources.filter((s) => {
      const matchesSearch =
        s.title.toLowerCase().includes(q) ||
        s.author.toLowerCase().includes(q) ||
        s.quote.toLowerCase().includes(q);
      const matchesType =
        sourceTypeFilter === "ALL" || s.type === sourceTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [allSources, sourceSearch, sourceTypeFilter]);

  // Unique code files across decisions
  const allCodeRelationships = useMemo<CodeRelationship[]>(() => {
    const fileMap = new Map<string, CodeRelationship>();
    decisions.forEach((d) => {
      d.codeFiles.forEach((f) => {
        const entry = { id: d.id, title: d.title, status: d.status };
        const existing = fileMap.get(f.path);
        if (!existing) {
          fileMap.set(f.path, {
            path: f.path,
            lines: f.lines,
            description: f.description,
            decisions: [entry],
          });
        } else if (!existing.decisions.some((dec) => dec.id === d.id)) {
          existing.decisions.push(entry);
        }
      });
    });
    return Array.from(fileMap.values());
  }, [decisions]);

  const filteredCodeFiles = useMemo(
    () =>
      allCodeRelationships.filter((f) =>
        f.path.toLowerCase().includes(codeSearch.toLowerCase())
      ),
    [allCodeRelationships, codeSearch]
  );

  const tabCount: Partial<Record<ProjectTab, number>> = {
    decisions: decisions.length,
    rejected: rejectedApproaches.length,
    sources: allSources.length,
    code: allCodeRelationships.length,
    "pr-intelligence": SAMPLE_PRS.length,
  };

  // Jump to a decision from any section, clearing filters that could hide it
  const openDecision = useCallback((id: string) => {
    setSelectedDecisionId(id);
    setSearchQuery("");
    setStatusFilter("ALL");
    setCurrentTab("decisions");
    window.scrollTo({ top: 0 });
  }, []);

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === currentTab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    setCurrentTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dt-bg">
        <div role="status" className="flex flex-col items-center gap-3">
          <Loader2
            className="h-6 w-6 animate-spin text-dt-forest"
            aria-hidden="true"
          />
          <p className="text-sm text-dt-muted-text">Loading project…</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dt-bg p-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-dt-line-strong bg-dt-surface p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-dt-reject-bg text-dt-reject">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-base font-semibold text-dt-ink-strong">
            Repository inaccessible
          </h1>
          <p className="text-sm leading-relaxed text-dt-muted-text">
            {error ||
              "This project could not be found or your account does not have authorization to view this repository."}
          </p>
          <Link
            href="/dashboard/projects"
            className={`inline-flex items-center gap-1.5 rounded-lg bg-dt-forest px-4 py-2 text-sm font-medium text-dt-bg transition-colors hover:bg-dt-forest-dark ${FOCUS}`}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const fullName = project.githubRepoFullName || project.name;
  const slash = fullName.indexOf("/");
  const ownerName = slash > 0 ? fullName.slice(0, slash) : "";
  const repoName = slash > 0 ? fullName.slice(slash + 1) : fullName;

  return (
    <div className="flex min-h-screen flex-col bg-dt-bg font-sans text-dt-ink selection:bg-dt-sage-pale">
      {/* Toast feedback */}
      {syncToast && (
        <div
          role="status"
          className="fixed bottom-6 right-4 z-50 flex max-w-sm items-center gap-2.5 rounded-xl bg-dt-ink-strong p-4 text-sm font-medium text-dt-bg shadow-xl sm:right-6"
        >
          <CheckCircle2
            className="h-4 w-4 shrink-0 text-dt-pistachio"
            aria-hidden="true"
          />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-40 h-12 border-b border-dt-line bg-dt-bg/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/"
              className={`flex shrink-0 items-center gap-2 rounded ${FOCUS}`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-dt-ink-strong text-[10px] font-bold text-dt-bg">
                DT
              </span>
              <span className="hidden text-sm font-semibold tracking-tight text-dt-ink-strong sm:inline">
                Dev Trace
              </span>
            </Link>
            <span className="text-dt-line-strong" aria-hidden="true">
              /
            </span>
            <Link
              href="/dashboard/projects"
              className={`rounded text-sm text-dt-muted-text transition-colors hover:text-dt-ink-strong ${FOCUS}`}
            >
              Projects
            </Link>
            <span className="text-dt-line-strong" aria-hidden="true">
              /
            </span>
            <span
              aria-current="page"
              className="truncate font-mono text-xs font-semibold text-dt-ink-strong"
            >
              {project.slug}
            </span>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={copyUrl}
              className={secondaryButton}
              title="Copy shareable project link"
            >
              {copiedUrl ? (
                <>
                  <Check className="h-3.5 w-3.5 text-dt-accept" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-dt-muted-text" aria-hidden="true" />
                  <span className="hidden sm:inline">Share link</span>
                  <span className="sr-only sm:hidden">Share link</span>
                </>
              )}
            </button>

            <a
              href={project.githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-lg bg-dt-forest px-3 py-1.5 text-xs font-medium text-dt-bg transition-colors hover:bg-dt-forest-dark ${FOCUS}`}
            >
              <span>GitHub</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      {/* Project header */}
      <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-8 sm:px-6 sm:pt-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-3">
            <h1 className="break-words text-2xl font-semibold tracking-tight text-dt-ink-strong sm:text-3xl">
              {ownerName ? (
                <span className="font-normal text-dt-muted-text">
                  {ownerName} /{" "}
                </span>
              ) : null}
              {repoName}
            </h1>

            <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-dt-muted-text">
              <li className="inline-flex items-center gap-1.5">
                {project.isPrivate ? (
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {project.isPrivate ? "Private" : "Public"}
              </li>
              {project.primaryLanguage ? (
                <li className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full bg-dt-accept"
                    aria-hidden="true"
                  />
                  {project.primaryLanguage}
                </li>
              ) : null}
              <li className="inline-flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono text-xs">{project.defaultBranch}</span>
              </li>
              {isOwner ? (
                <li className="inline-flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Owner
                </li>
              ) : null}
            </ul>

            <p className="max-w-2xl text-sm leading-relaxed text-dt-ink">
              {project.description ||
                "Technical decision memory and architectural invariant workspace."}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className={`${secondaryButton} disabled:cursor-wait disabled:opacity-70`}
              title="Trigger webhook synchronization check"
            >
              <RotateCw
                className={`h-3.5 w-3.5 text-dt-muted-text ${
                  syncing ? "animate-spin motion-reduce:animate-none" : ""
                }`}
                aria-hidden="true"
              />
              <span>{syncing ? "Syncing…" : "Sync context"}</span>
            </button>

            <div
              className="relative"
              onKeyDown={(e) => {
                if (e.key === "Escape") setActionsOpen(false);
              }}
            >
              <button
                type="button"
                onClick={() => setActionsOpen(!actionsOpen)}
                aria-haspopup="menu"
                aria-expanded={actionsOpen}
                aria-label="More actions"
                className={`cursor-pointer rounded-lg border border-dt-line-strong bg-dt-surface p-2 text-dt-muted-text transition-colors hover:bg-dt-bg2/60 hover:text-dt-ink-strong ${FOCUS}`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>

              {actionsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setActionsOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-30 mt-2 w-52 space-y-0.5 rounded-xl border border-dt-line-strong bg-dt-surface p-1 text-sm shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={copyUrl}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-dt-ink-strong hover:bg-dt-bg ${FOCUS}`}
                    >
                      <span>Copy project URL</span>
                      <Copy className="h-3.5 w-3.5 text-dt-muted-text" aria-hidden="true" />
                    </button>
                    <a
                      href={project.githubRepoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-dt-ink-strong hover:bg-dt-bg ${FOCUS}`}
                    >
                      <span>GitHub repository</span>
                      <ExternalLink className="h-3.5 w-3.5 text-dt-muted-text" aria-hidden="true" />
                    </a>
                    <div className="my-1 border-t border-dt-line" />
                    <Link
                      href="/dashboard/settings"
                      role="menuitem"
                      className={`flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-dt-muted-text hover:bg-dt-bg hover:text-dt-ink-strong ${FOCUS}`}
                    >
                      Workspace settings
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section navigation */}
      <div className="sticky top-12 z-30 border-b border-dt-line bg-dt-bg/95 backdrop-blur-md">
        <div
          role="tablist"
          aria-label="Project sections"
          className="dt-scroll-none mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6"
        >
          {TABS.map((tab) => {
            const selected = currentTab === tab.id;
            const Icon = tab.icon;
            const count = tabCount[tab.id];
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setCurrentTab(tab.id)}
                onKeyDown={handleTabKeyDown}
                className={`relative inline-flex cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-3 text-sm transition-colors ${FOCUS} focus-visible:-outline-offset-2 ${
                  selected
                    ? "font-semibold text-dt-ink-strong"
                    : "font-medium text-dt-muted-text hover:text-dt-ink-strong"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${selected ? "text-dt-forest" : ""}`}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
                {count !== undefined ? (
                  <span className="font-mono text-xs text-dt-muted-text">
                    {count}
                  </span>
                ) : null}
                <span
                  className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full ${
                    selected ? "bg-dt-forest" : "bg-transparent"
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Workspace body */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <p
          role="note"
          className="mb-8 max-w-2xl border-l-2 border-dt-pistachio pl-3 text-xs leading-relaxed text-dt-muted-text"
        >
          Decisions, sources, code links and pull-request matches shown here are
          sample data bundled with the app. They are not loaded from this
          repository yet.
        </p>

        <div
          key={currentTab}
          role="tabpanel"
          id={`panel-${currentTab}`}
          aria-labelledby={`tab-${currentTab}`}
          tabIndex={0}
          className={`dt-fade rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dt-forest`}
        >
          {currentTab === "overview" && (
            <OverviewSection
              decisions={decisions}
              rejectedApproaches={rejectedApproaches}
              sources={allSources}
              codeRelationships={allCodeRelationships}
              prs={SAMPLE_PRS}
              activity={SAMPLE_ACTIVITY}
              onOpenDecision={openDecision}
              onNavigate={setCurrentTab}
            />
          )}

          {currentTab === "decisions" && (
            <DecisionsSection
              decisions={decisions}
              filtered={filteredDecisions}
              active={activeDecision}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onSelect={setSelectedDecisionId}
            />
          )}

          {currentTab === "rejected" && (
            <RejectedSection
              approaches={rejectedApproaches}
              onOpenDecision={openDecision}
            />
          )}

          {currentTab === "sources" && (
            <SourcesSection
              sources={allSources}
              filtered={filteredSources}
              search={sourceSearch}
              onSearchChange={setSourceSearch}
              typeFilter={sourceTypeFilter}
              onTypeFilterChange={setSourceTypeFilter}
              onOpenDecision={openDecision}
            />
          )}

          {currentTab === "code" && (
            <CodeSection
              files={allCodeRelationships}
              filtered={filteredCodeFiles}
              search={codeSearch}
              onSearchChange={setCodeSearch}
              onOpenDecision={openDecision}
            />
          )}

          {currentTab === "pr-intelligence" && (
            <PrSection
              prs={SAMPLE_PRS}
              decisions={decisions}
              onOpenDecision={openDecision}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// Root Page Component with Suspense
// ==========================================

export default function ProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-dt-bg">
          <div role="status" className="flex flex-col items-center gap-3">
            <Loader2
              className="h-6 w-6 animate-spin text-dt-forest"
              aria-hidden="true"
            />
            <p className="text-sm text-dt-muted-text">Loading project…</p>
          </div>
        </div>
      }
    >
      <ProjectWorkspace />
    </Suspense>
  );
}
