"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ProjectDto } from "@/lib/api";
import {
  INITIAL_MOCK_PROJECTS,
  MOCK_AVAILABLE_REPOSITORIES,
} from "@/data/mock-projects";
import {
  GitBranch,
  Globe,
  Lock,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  FileCode2,
  MessageSquare,
  GitPullRequest,
  Search,
  Loader2,
  Calendar,
  UserCheck,
  AlertTriangle,
  XCircle,
  RotateCw,
  MoreHorizontal,
  Layers,
  FileText,
  ArrowRight,
} from "lucide-react";

// ==========================================
// Types
// ==========================================

export type ProjectTab =
  | "overview"
  | "decisions"
  | "rejected"
  | "sources"
  | "code"
  | "pr-intelligence";

export interface DecisionSource {
  id: string;
  type: "discussion" | "issue" | "pr" | "comment" | "discord";
  title: string;
  author: string;
  date: string;
  quote: string;
  url: string;
  badge: string;
}

export interface CodeReference {
  path: string;
  lines: string;
  description: string;
}

export interface RejectedAlternative {
  name: string;
  proposedBy: string;
  reason: string;
  chosenApproach: string;
  evidenceQuotes: { author: string; source: string; quote: string }[];
  affectedFiles: string[];
}

export interface DecisionRecord {
  id: string;
  title: string;
  status: "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "UNRESOLVED";
  date: string;
  author: string;
  summary: string;
  rationale: string;
  rejectedAlternative?: RejectedAlternative;
  sources: DecisionSource[];
  codeFiles: CodeReference[];
}

export interface PrIntelligenceItem {
  prNumber: number;
  title: string;
  author: string;
  date: string;
  status: "open" | "merged" | "closed";
  changedFiles: string[];
  matchedDecisionId: string;
  matchedDecisionTitle: string;
  decisionStatus: "ACCEPTED" | "REJECTED";
  importanceNote: string;
  rejectionWarning?: string;
  checkStatus: "PASSING" | "NEEDS_REVIEW";
}

export interface ActivityEvent {
  id: string;
  type: "decision_updated" | "discussion_processed" | "sync_completed";
  title: string;
  description: string;
  timestamp: string;
  source: string;
}

// ==========================================
// Rich Architectural Knowledge Data
// ==========================================

const PROJECT_DECISIONS: DecisionRecord[] = [
  {
    id: "DEC-084",
    title: "PostgreSQL on Supabase as primary datastore",
    status: "ACCEPTED",
    date: "Oct 14, 2026",
    author: "@alex-tech",
    summary:
      "Selected PostgreSQL hosted on Supabase as the single authoritative relational datastore with Prisma ORM.",
    rationale:
      "Strict relational consistency, foreign key integrity, and relational querying were non-negotiable for building the decision evidence graph. Supabase provides managed PostgreSQL with built-in connection pooling and auth integration.",
    rejectedAlternative: {
      name: "MongoDB / Document DB",
      proposedBy: "@dan-infra",
      reason:
        "Rejected because decision evidence links (PRs -> Commits -> Discussions) require strict relational integrity. Emulating foreign keys and multi-entity graph traversals in a document store causes severe consistency risks.",
      chosenApproach: "PostgreSQL with Prisma ORM on Supabase",
      evidenceQuotes: [
        {
          author: "Hannes Rudolph",
          source: "Discord #architecture",
          quote:
            "Mongo seemed easier at first, but with decision graphs and relational evidence, we’ll end up writing manual joins and losing ACID guarantees. Postgres + Prisma is the clear winner.",
        },
        {
          author: "@sarah-tech",
          source: "Discussion #142",
          quote:
            "Agreed on PostgreSQL. Schema migrations via Prisma give us type safety and reproducible staging environments across all contributors.",
        },
      ],
      affectedFiles: [
        "server/prisma/schema.prisma",
        "server/src/database/index.ts",
      ],
    },
    sources: [
      {
        id: "SRC-142",
        type: "discussion",
        title: "Discussion #142 (Storage Engine Evaluation)",
        author: "@sarah-tech",
        date: "Oct 14, 2026, 17:10",
        quote:
          "Agreed on PostgreSQL. Schema migrations via Prisma give us type safety and reproducible staging environments across all contributors.",
        url: "https://github.com",
        badge: "GitHub Discussion",
      },
      {
        id: "SRC-089",
        type: "pr",
        title: "Pull Request #89 (Initial Schema Setup)",
        author: "@alex-tech",
        date: "Oct 15, 2026, 11:20",
        quote:
          "Prisma schema committed with User, Project, Decision, and Evidence models with foreign keys.",
        url: "https://github.com",
        badge: "Pull Request",
      },
      {
        id: "SRC-DISC-01",
        type: "discord",
        title: "Discord #architecture (Data Modeling Consensus)",
        author: "Hannes Rudolph",
        date: "Oct 14, 2026, 15:42",
        quote:
          "Mongo seemed easier at first, but with decision graphs and relational evidence, we’ll end up writing manual joins and losing ACID guarantees. Postgres + Prisma is the clear winner.",
        url: "https://discord.com",
        badge: "Discord Thread",
      },
    ],
    codeFiles: [
      {
        path: "server/prisma/schema.prisma",
        lines: ":L1-L188",
        description:
          "Declarative Prisma models for Project, Decision, DecisionEvidence, and User.",
      },
      {
        path: "server/src/database/index.ts",
        lines: ":L12-L64",
        description:
          "PrismaClient singleton instantiation with connection retries.",
      },
    ],
  },
  {
    id: "DEC-042",
    title: "Supabase Session Pooler over Direct Connection",
    status: "ACCEPTED",
    date: "Oct 18, 2026",
    author: "@sarah-tech",
    summary:
      "Standardized on Supabase Session Pooler (port 5432) for all backend API instances.",
    rationale:
      "Prevents database connection pool exhaustion while preserving support for Prisma prepared statements. Transaction pooling mode (port 6543) breaks Prisma migration rollbacks.",
    rejectedAlternative: {
      name: "Transaction Pooling (Port 6543)",
      proposedBy: "@infra-bot",
      reason:
        "Supabase transaction pooling terminates sessions on statement completion, causing Prisma prepared statement and migration lock exceptions during schema deployments.",
      chosenApproach: "Session Pooler on Port 5432",
      evidenceQuotes: [
        {
          author: "@sarah-tech",
          source: "Discord #infra",
          quote:
            "Switching server connection to session pooler port 5432 resolved the migration rollback locks immediately.",
        },
      ],
      affectedFiles: ["server/.env.example", "server/src/config/env.ts"],
    },
    sources: [
      {
        id: "SRC-DISC-02",
        type: "discord",
        title: "Discord #infra (Incident Debrief)",
        author: "@sarah-tech",
        date: "Oct 18, 2026, 09:30",
        quote:
          "Switching server connection to session pooler port 5432 resolved the migration rollback locks immediately.",
        url: "https://discord.com",
        badge: "Discord Thread",
      },
      {
        id: "SRC-042",
        type: "pr",
        title: "PR #42 (Database Pooler Configuration)",
        author: "@sarah-tech",
        date: "Oct 18, 2026, 12:15",
        quote:
          "Explicit DATABASE_URL configured with port 5432 session pooler.",
        url: "https://github.com",
        badge: "Pull Request",
      },
    ],
    codeFiles: [
      {
        path: "server/.env.example",
        lines: ":L8-L12",
        description: "Documents DATABASE_URL using port 5432.",
      },
      {
        path: "server/src/config/env.ts",
        lines: ":L20-L35",
        description:
          "Zod environment validation for database connection strings.",
      },
    ],
  },
  {
    id: "DEC-061",
    title: "Isolated Collectors without Monorepo Tooling",
    status: "ACCEPTED",
    date: "Oct 22, 2026",
    author: "@dev-lead",
    summary:
      "Maintained the Go Discord collector as an independent package rather than adopting Turborepo.",
    rationale:
      "Go has its own build and module system (go.mod, Makefile). Wrapping it into a JS-centric monorepo tool like Turborepo added build friction without runtime benefits.",
    rejectedAlternative: {
      name: "Turborepo / Nx Monorepo",
      proposedBy: "@monorepo-advocate",
      reason:
        "Added extra node_modules overhead and CI complexity for a multi-language repository (Next.js, Express, Go) with zero execution speed gains.",
      chosenApproach: "Root Makefile with standalone Go modules",
      evidenceQuotes: [
        {
          author: "@dev-lead",
          source: "Issue #73",
          quote:
            "A clean Makefile at the repo root and independent sub-directories gives everyone fast local development without tool lock-in.",
        },
      ],
      affectedFiles: ["discord-collector/go.mod", "Makefile"],
    },
    sources: [
      {
        id: "SRC-073",
        type: "issue",
        title: "Issue #73 (Architecture Review: Build Orchestration)",
        author: "@dev-lead",
        date: "Oct 22, 2026, 14:00",
        quote:
          "A clean Makefile at the repo root and independent sub-directories gives everyone fast local development without tool lock-in.",
        url: "https://github.com",
        badge: "GitHub Issue",
      },
    ],
    codeFiles: [
      {
        path: "discord-collector/go.mod",
        lines: ":L1-L24",
        description: "Standard Go module definition for discord-collector.",
      },
      {
        path: "Makefile",
        lines: ":L1-L45",
        description: "Unified dev, build, and test targets for all services.",
      },
    ],
  },
  {
    id: "DEC-070",
    title: "GraphQL Gateway for Frontend Dashboard",
    status: "REJECTED",
    date: "Oct 25, 2026",
    author: "@frontend-eng",
    summary:
      "Evaluated introducing Apollo GraphQL between Next.js App Router and the Express backend.",
    rationale:
      "Rejected because Next.js App Router already provides clean server-component data fetching and React cache. A GraphQL intermediary created redundant schema declarations and added 18ms latency overhead.",
    rejectedAlternative: {
      name: "Apollo GraphQL Gateway",
      proposedBy: "@graphql-team",
      reason:
        "Excess schema maintenance and cognitive overhead for a team already productive with TypeScript DTOs and REST endpoints.",
      chosenApproach: "Direct REST API with shared TypeScript DTOs",
      evidenceQuotes: [
        {
          author: "@frontend-eng",
          source: "Discussion #198",
          quote:
            "REST with shared TypeScript types gives us faster development velocity and simpler caching than maintaining a GraphQL schema layer.",
        },
      ],
      affectedFiles: ["client/src/lib/api.ts", "server/src/app.ts"],
    },
    sources: [
      {
        id: "SRC-198",
        type: "discussion",
        title: "Discussion #198 (API Gateway & Query Layer)",
        author: "@frontend-eng",
        date: "Oct 25, 2026, 16:40",
        quote:
          "REST with shared TypeScript types gives us faster development velocity and simpler caching than maintaining a GraphQL schema layer.",
        url: "https://github.com",
        badge: "GitHub Discussion",
      },
    ],
    codeFiles: [
      {
        path: "client/src/lib/api.ts",
        lines: ":L1-L120",
        description:
          "Lightweight typed API client with fetch and standard DTOs.",
      },
    ],
  },
];

const PR_INTELLIGENCE_DATA: PrIntelligenceItem[] = [
  {
    prNumber: 147,
    title: "Switch database connection pooler to port 6543",
    author: "@contributor-k",
    date: "Yesterday",
    status: "open",
    changedFiles: ["server/src/config/env.ts", "server/.env.example"],
    matchedDecisionId: "DEC-042",
    matchedDecisionTitle: "Supabase Session Pooler over Direct Connection",
    decisionStatus: "ACCEPTED",
    importanceNote:
      "This PR touches database connection parameters governed by DEC-042.",
    rejectionWarning:
      "WARNING: Port 6543 (transaction mode) was explicitly tested and rejected in DEC-042 because it causes Prisma prepared statement rollbacks and migration lockups.",
    checkStatus: "NEEDS_REVIEW",
  },
  {
    prNumber: 112,
    title: "JWT short-lived token revocation via Redis blocklist",
    author: "@sarah-tech",
    date: "Oct 20, 2026",
    status: "merged",
    changedFiles: ["server/src/modules/auth/jwt.ts"],
    matchedDecisionId: "DEC-031",
    matchedDecisionTitle: "JWT with Redis Blocklist for session invalidation",
    decisionStatus: "ACCEPTED",
    importanceNote:
      "Implements agreed-upon authentication invalidation pattern.",
    checkStatus: "PASSING",
  },
  {
    prNumber: 89,
    title: "Initial PostgreSQL schema and Prisma models",
    author: "@alex-tech",
    date: "Oct 15, 2026",
    status: "merged",
    changedFiles: [
      "server/prisma/schema.prisma",
      "server/src/database/index.ts",
    ],
    matchedDecisionId: "DEC-084",
    matchedDecisionTitle: "PostgreSQL on Supabase as primary datastore",
    decisionStatus: "ACCEPTED",
    importanceNote:
      "Established relational schema models for Project, Decision, and Evidence graphs.",
    checkStatus: "PASSING",
  },
];

const RECENT_ACTIVITY: ActivityEvent[] = [
  {
    id: "ACT-01",
    type: "discussion_processed",
    title: "Processed Discussion #198",
    description: "Extracted consensus against GraphQL gateway layer (DEC-070).",
    timestamp: "Oct 25, 17:00",
    source: "GitHub Discussions",
  },
  {
    id: "ACT-02",
    type: "decision_updated",
    title: "Decision Verified: DEC-061",
    description: "Anchored to discord-collector/go.mod and Makefile:L1-45.",
    timestamp: "Oct 22, 14:30",
    source: "Repository Graph",
  },
  {
    id: "ACT-03",
    type: "sync_completed",
    title: "GitHub Webhook Event Synchronized",
    description: "Ingested PR #147 and attached DEC-042 historical invariant check.",
    timestamp: "Yesterday, 18:12",
    source: "GitHub App",
  },
];

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

  // Decision explorer filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "UNRESOLVED"
  >("ALL");
  const [selectedDecisionId, setSelectedDecisionId] = useState<string>("DEC-084");

  // Source explorer search state
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("ALL");

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
      setSyncToast("Repository webhooks verified. Context graph is up to date.");
      setTimeout(() => setSyncToast(null), 3500);
    }, 700);
  };

  // Derived lists
  const decisions = PROJECT_DECISIONS;

  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        d.id.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.codeFiles.some((f) => f.path.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === "ALL" ? true : d.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [decisions, searchQuery, statusFilter]);

  const activeDecision =
    decisions.find((d) => d.id === selectedDecisionId) ||
    filteredDecisions[0] ||
    decisions[0];

  // All extracted rejected approaches
  const rejectedApproaches = useMemo(() => {
    return decisions
      .filter((d) => d.rejectedAlternative !== undefined)
      .map((d) => ({
        decisionId: d.id,
        decisionTitle: d.title,
        status: d.status,
        date: d.date,
        alternative: d.rejectedAlternative!,
      }));
  }, [decisions]);

  // All unique sources across decisions
  const allSources = useMemo(() => {
    const list: (DecisionSource & { referencedDecisions: string[] })[] = [];
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
    return allSources.filter((s) => {
      const q = sourceSearch.toLowerCase();
      const matchesSearch =
        s.title.toLowerCase().includes(q) ||
        s.author.toLowerCase().includes(q) ||
        s.quote.toLowerCase().includes(q);

      const matchesType =
        sourceTypeFilter === "ALL" ? true : s.type === sourceTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [allSources, sourceSearch, sourceTypeFilter]);

  // All unique code files across decisions
  const allCodeRelationships = useMemo(() => {
    const fileMap = new Map<
      string,
      {
        path: string;
        lines: string;
        description: string;
        decisions: { id: string; title: string; status: string }[];
      }
    >();

    decisions.forEach((d) => {
      d.codeFiles.forEach((f) => {
        if (!fileMap.has(f.path)) {
          fileMap.set(f.path, {
            path: f.path,
            lines: f.lines,
            description: f.description,
            decisions: [{ id: d.id, title: d.title, status: d.status }],
          });
        } else {
          const item = fileMap.get(f.path)!;
          if (!item.decisions.some((dec) => dec.id === d.id)) {
            item.decisions.push({ id: d.id, title: d.title, status: d.status });
          }
        }
      });
    });

    return Array.from(fileMap.values());
  }, [decisions]);

  const filteredCodeFiles = useMemo(() => {
    return allCodeRelationships.filter((f) =>
      f.path.toLowerCase().includes(codeSearch.toLowerCase())
    );
  }, [allCodeRelationships, codeSearch]);

  // Overview calculations
  const totalDecisionsCount = decisions.length;
  const acceptedDecisionsCount = decisions.filter(
    (d) => d.status === "ACCEPTED"
  ).length;
  const rejectedDecisionsCount = decisions.filter(
    (d) => d.status === "REJECTED" || d.rejectedAlternative !== undefined
  ).length;
  const unresolvedDecisionsCount = decisions.filter(
    (d) => d.status === "UNRESOLVED"
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5ED] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-[#35432C] animate-spin" />
          <p className="text-xs font-mono text-[#77796F]">
            Loading project workspace...
          </p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-[#F7F5ED] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#DDD8CC] p-8 text-center space-y-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-[#2D3327]">Repository Inaccessible</h2>
          <p className="text-xs text-[#77796F]">
            {error ||
              "This project could not be found or your account does not have authorization to view this repository."}
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard/projects"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#35432C] hover:bg-[#283421] text-[#FAF8F3] text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Projects</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5ED] text-[#2D3327] flex flex-col font-sans selection:bg-[#DCE6D3] selection:text-[#2E332A]">
      {/* Toast Feedback Notification */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-[#2D3327] text-[#FAF8F3] text-xs font-medium shadow-xl flex items-center gap-2.5 animate-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-[#C5D6B4]" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Persistent Global Top Navigation Header */}
      <header className="border-b border-[#EAE4D5] bg-[#F7F5ED]/95 sticky top-0 z-40 backdrop-blur-md px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#2D3627] text-[#FAF8F3] flex items-center justify-center font-bold text-xs">
                DT
              </div>
              <span className="font-bold text-sm tracking-tight text-[#2D3327]">
                Dev Trace
              </span>
            </Link>
            <span className="text-[#DDD8CC]">/</span>
            <Link
              href="/dashboard/projects"
              className="text-xs text-[#77796F] hover:text-[#2D3327] transition-colors"
            >
              Projects
            </Link>
            <span className="text-[#DDD8CC]">/</span>
            <span className="text-xs font-mono font-semibold text-[#2D3327]">
              {project.slug}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-[#FAF8F3] text-xs font-mono text-[#2D3327] border border-[#DDD8CC] transition-colors"
              title="Copy shareable project link"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#4E673D]" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#77796F]" />
                  <span>Share link</span>
                </>
              )}
            </button>

            <a
              href={project.githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#35432C] hover:bg-[#283421] text-[#FAF8F3] text-xs font-semibold transition-colors"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Persistent Project Workspace Header */}
      <section className="bg-white border-b border-[#EAE4D5] px-6 py-6 md:py-7">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Repository Identity */}
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <svg
                  className="w-5 h-5 text-[#2D3327] shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>

                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2D3327]">
                  {project.githubRepoFullName || `${project.name}`}
                </h1>

                {/* Visibility Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-mono font-medium ${
                    project.isPrivate
                      ? "bg-[#EAE6D8] text-[#5A6052]"
                      : "bg-[#DCE6D3] text-[#2D3728]"
                  }`}
                >
                  {project.isPrivate ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    <Globe className="w-3 h-3" />
                  )}
                  <span>{project.isPrivate ? "Private" : "Public"}</span>
                </span>

                {/* Sync status */}
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#5A684E] bg-[#FAF8F3] px-2.5 py-0.5 rounded border border-[#EAE4D5]">
                  <span className="w-2 h-2 rounded-full bg-[#4E673D] animate-pulse" />
                  <span>Synced 2h ago</span>
                </span>
              </div>

              <p className="text-xs text-[#6F7365] max-w-3xl leading-relaxed">
                {project.description ||
                  "Technical decision memory and architectural invariant workspace."}
              </p>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2 self-start md:self-center shrink-0">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DDD8CC] bg-white hover:bg-[#FAF8F3] text-xs font-semibold text-[#2D3327] transition-colors"
                title="Trigger webhook synchronization check"
              >
                <RotateCw
                  className={`w-3.5 h-3.5 text-[#77796F] ${
                    syncing ? "animate-spin text-[#35432C]" : ""
                  }`}
                />
                <span>{syncing ? "Syncing..." : "Sync context"}</span>
              </button>

              {/* Compact Actions Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActionsOpen(!actionsOpen)}
                  className="p-2 rounded-xl border border-[#DDD8CC] bg-white hover:bg-[#FAF8F3] text-[#77796F] hover:text-[#2D3327] transition-colors"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {actionsOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setActionsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-[#DDD8CC] shadow-xl p-1 z-30 text-xs font-medium space-y-0.5">
                      <button
                        type="button"
                        onClick={copyUrl}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#FAF8F3] text-[#2D3327] flex items-center justify-between"
                      >
                        <span>Copy Project URL</span>
                        <Copy className="w-3.5 h-3.5 text-[#77796F]" />
                      </button>
                      <a
                        href={project.githubRepoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#FAF8F3] text-[#2D3327] flex items-center justify-between"
                      >
                        <span>GitHub Repository</span>
                        <ExternalLink className="w-3.5 h-3.5 text-[#77796F]" />
                      </a>
                      <div className="border-t border-[#F2ECE0] my-1" />
                      <Link
                        href="/dashboard/settings"
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#FAF8F3] text-[#77796F] flex items-center justify-between"
                      >
                        <span>Workspace Settings</span>
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Metadata Strip */}
          <div className="flex items-center gap-5 text-xs font-mono text-[#77796F] pt-2 border-t border-[#F2ECE0] flex-wrap">
            <span className="flex items-center gap-1.5 text-[#2D3327] font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#4E673D]" />
              {project.primaryLanguage || "TypeScript"}
            </span>
            <span className="text-[#DDD8CC]">·</span>
            <span className="flex items-center gap-1">
              <GitBranch className="w-3.5 h-3.5 text-[#5A6052]" />
              Default branch: <strong className="text-[#2D3327]">{project.defaultBranch}</strong>
            </span>
            <span className="text-[#DDD8CC]">·</span>
            <span>Role: {isOwner ? "Project Owner" : "Maintainer"}</span>
            <span className="text-[#DDD8CC]">·</span>
            <span className="text-[#5A684E] font-semibold">
              Dev Trace Bot Check: Active
            </span>
          </div>
        </div>
      </section>

      {/* Six Section Navigation System */}
      <nav className="bg-[#FAF8F3] border-b border-[#EAE4D5] px-6 sticky top-12 z-30">
        <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto scrollbar-none py-1.5">
          {(
            [
              { id: "overview", label: "Overview", icon: Layers },
              {
                id: "decisions",
                label: "Decisions",
                icon: FileText,
                badge: `${decisions.length}`,
              },
              {
                id: "rejected",
                label: "Rejected Approaches",
                icon: XCircle,
                badge: `${rejectedApproaches.length}`,
              },
              {
                id: "sources",
                label: "Sources",
                icon: MessageSquare,
                badge: `${allSources.length}`,
              },
              {
                id: "code",
                label: "Code Relationships",
                icon: FileCode2,
                badge: `${allCodeRelationships.length}`,
              },
              {
                id: "pr-intelligence",
                label: "PR Intelligence",
                icon: GitPullRequest,
                badge: `${PR_INTELLIGENCE_DATA.length}`,
              },
            ] as const
          ).map((tab) => {
            const isActive = currentTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCurrentTab(tab.id as ProjectTab)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? "bg-white text-[#2D3327] font-bold shadow-2xs border border-[#DDD8CC]"
                    : "text-[#77796F] hover:text-[#2D3327] hover:bg-white/60"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#35432C]" : "text-[#77796F]"}`} />
                <span>{tab.label}</span>
                {"badge" in tab && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isActive
                        ? "bg-[#DCE6D3] text-[#2D3728] font-bold"
                        : "bg-[#EAE4D5] text-[#5A6052]"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        {/* ========================================================
            1. OVERVIEW SECTION (Default landing section)
            ======================================================== */}
        {currentTab === "overview" && (
          <div className="space-y-10 animate-in fade-in duration-150">
            {/* Project Intelligence Statistics (Creative, typography-led, non-boxy) */}
            <div className="space-y-4">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#5A684E] font-bold">
                Project Telemetry
              </span>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-end pt-2 pb-6 border-b border-[#EAE4D5]">
                {/* Hero Metric: Recovered Decisions */}
                <div className="md:col-span-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#DCE6D3] text-[#2D3728] text-[11px] font-mono font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4E673D]" />
                      Verified Decisions
                    </span>
                  </div>

                  <div className="flex items-baseline gap-4">
                    <div className="text-6xl sm:text-7xl font-extralight tracking-tight text-[#2D3327] font-mono">
                      {totalDecisionsCount}
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-[#2D3327]">
                        Recovered Architectural Decisions
                      </div>
                      <p className="text-xs text-[#77796F]">
                        Derived from PR discussions, issues, and design RFCs.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sub Metrics: Accepted, Rejected, Unresolved, Sources */}
                <div className="md:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 md:pt-0 md:pl-8 md:border-l border-[#EAE4D5]">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-[#77796F]">
                      Accepted
                    </span>
                    <div className="text-2xl font-light text-[#2D3327] font-mono">
                      {acceptedDecisionsCount}
                    </div>
                    <span className="text-[10px] font-mono text-[#4E673D]">Active invariants</span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-[#77796F]">
                      Rejected
                    </span>
                    <div className="text-2xl font-light text-[#2D3327] font-mono">
                      {rejectedDecisionsCount}
                    </div>
                    <span className="text-[10px] font-mono text-[#9E3426]">Avoided paths</span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-[#77796F]">
                      Unresolved
                    </span>
                    <div className="text-2xl font-light text-[#2D3327] font-mono">
                      {unresolvedDecisionsCount}
                    </div>
                    <span className="text-[10px] font-mono text-[#77796F]">Open proposals</span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-[#77796F]">
                      Sources
                    </span>
                    <div className="text-2xl font-light text-[#2D3327] font-mono">
                      {allSources.length}
                    </div>
                    <span className="text-[10px] font-mono text-[#5A684E]">Ingested threads</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Split: Recent Decisions & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left: Recent Decisions (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#2D3327]">
                    Recently Recovered Technical Decisions
                  </h3>
                  <button
                    type="button"
                    onClick={() => setCurrentTab("decisions")}
                    className="text-xs font-semibold text-[#35432C] hover:underline inline-flex items-center gap-1"
                  >
                    <span>View all ({decisions.length})</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="rounded-2xl bg-white border border-[#DDD8CC] divide-y divide-[#EAE4D5] overflow-hidden shadow-2xs">
                  {decisions.slice(0, 3).map((dec) => (
                    <div
                      key={dec.id}
                      onClick={() => {
                        setSelectedDecisionId(dec.id);
                        setCurrentTab("decisions");
                      }}
                      className="p-4 hover:bg-[#FAF8F3] transition-colors cursor-pointer space-y-2 group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#5A684E]">
                            {dec.id}
                          </span>
                          <span className="font-bold text-[#2D3327] group-hover:underline">
                            {dec.title}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                            dec.status === "ACCEPTED"
                              ? "bg-[#DCE6D3] text-[#2D3728]"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {dec.status}
                        </span>
                      </div>

                      <p className="text-xs text-[#6F7365] line-clamp-2 leading-relaxed">
                        {dec.summary}
                      </p>

                      <div className="flex items-center justify-between text-[11px] font-mono text-[#77796F] pt-1">
                        <span>{dec.sources.length} sources · {dec.codeFiles.length} files</span>
                        <span>{dec.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Recent Ingestion & Sync Activity (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <h3 className="text-sm font-bold text-[#2D3327]">
                  Recent Activity & Sync
                </h3>

                <div className="rounded-2xl bg-white border border-[#DDD8CC] p-4 divide-y divide-[#EAE4D5] shadow-2xs space-y-3">
                  {RECENT_ACTIVITY.map((act) => (
                    <div key={act.id} className="pt-3 first:pt-0 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#2D3327]">{act.title}</span>
                        <span className="text-[10px] font-mono text-[#77796F]">
                          {act.timestamp}
                        </span>
                      </div>
                      <p className="text-[#6F7365] text-xs leading-relaxed">
                        {act.description}
                      </p>
                      <div className="text-[10px] font-mono text-[#5A684E]">
                        Via {act.source}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Codebase Intelligence (Files with most associated decisions) */}
            <div className="space-y-4 pt-4 border-t border-[#EAE4D5]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#2D3327]">
                    Codebase Intelligence & Decision Hotspots
                  </h3>
                  <p className="text-xs text-[#77796F]">
                    Files with the highest density of architectural decisions and trade-offs.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentTab("code")}
                  className="text-xs font-semibold text-[#35432C] hover:underline inline-flex items-center gap-1"
                >
                  <span>Explore graph</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allCodeRelationships.slice(0, 3).map((file, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-white border border-[#DDD8CC] space-y-2 hover:border-[#9BAF8B] transition-colors"
                  >
                    <div className="flex items-center justify-between font-mono text-xs">
                      <div className="flex items-center gap-1.5 text-[#2D3327] font-semibold truncate">
                        <FileCode2 className="w-3.5 h-3.5 text-[#5A684E] shrink-0" />
                        <span className="truncate">{file.path}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#77796F] shrink-0">
                        {file.lines}
                      </span>
                    </div>

                    <p className="text-xs text-[#6F7365] line-clamp-2 leading-relaxed">
                      {file.description}
                    </p>

                    <div className="pt-2 border-t border-[#F2ECE0] flex items-center justify-between text-[11px] font-mono text-[#77796F]">
                      <span className="text-[#35432C] font-semibold">
                        {file.decisions.length} decision{file.decisions.length === 1 ? "" : "s"} linked
                      </span>
                      <span>{file.decisions.map((d) => d.id).join(", ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            2. DECISIONS SECTION (Searchable and filterable explorer)
            ======================================================== */}
        {currentTab === "decisions" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-[#77796F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search decisions by title, summary, or file path..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white border border-[#DDD8CC] focus:border-[#9BAF8B] text-xs text-[#2D3327] placeholder-[#77796F] focus:outline-none transition-all shadow-2xs"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center rounded-xl bg-white p-0.5 text-xs font-medium border border-[#DDD8CC] shadow-2xs">
                {(
                  ["ALL", "ACCEPTED", "REJECTED", "WITHDRAWN", "UNRESOLVED"] as const
                ).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-mono transition-colors ${
                      statusFilter === status
                        ? "bg-[#DCE6D3] text-[#2D3728] font-bold"
                        : "text-[#77796F] hover:text-[#2D3327]"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Master-Detail Split Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Decision List (4 cols) */}
              <div className="lg:col-span-4 rounded-2xl bg-white border border-[#DDD8CC] divide-y divide-[#EAE4D5] overflow-hidden shadow-2xs">
                <div className="p-3.5 bg-[#FAF8F3] border-b border-[#EAE4D5] text-[11px] font-mono uppercase text-[#77796F] font-bold flex items-center justify-between">
                  <span>Recovered Decisions</span>
                  <span>{filteredDecisions.length} Records</span>
                </div>

                {filteredDecisions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#77796F]">
                    No decisions found matching filter criteria.
                  </div>
                ) : (
                  filteredDecisions.map((dec) => {
                    const isSelected = dec.id === activeDecision?.id;
                    return (
                      <button
                        key={dec.id}
                        type="button"
                        onClick={() => setSelectedDecisionId(dec.id)}
                        className={`w-full text-left p-4 transition-colors space-y-1.5 cursor-pointer ${
                          isSelected
                            ? "bg-[#FAF8F3] border-l-3 border-[#35432C]"
                            : "hover:bg-[#FAF8F3]"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-xs font-bold text-[#5A684E]">
                            {dec.id}
                          </span>
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              dec.status === "ACCEPTED"
                                ? "bg-[#DCE6D3] text-[#2D3728]"
                                : dec.status === "REJECTED"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {dec.status}
                          </span>
                        </div>

                        <div className="text-xs font-bold text-[#2D3327] line-clamp-1">
                          {dec.title}
                        </div>

                        <p className="text-[11px] text-[#77796F] line-clamp-2 leading-relaxed">
                          {dec.summary}
                        </p>

                        <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-[#77796F]">
                          <span>{dec.date}</span>
                          <span>{dec.codeFiles.length} file refs</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Right ADR Detailed Record (8 cols) */}
              <div className="lg:col-span-8 rounded-2xl bg-white border border-[#DDD8CC] p-6 sm:p-8 space-y-8 shadow-2xs">
                {activeDecision ? (
                  <>
                    <div className="space-y-3 pb-6 border-b border-[#EAE4D5]">
                      <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#5A684E]">
                            ADR / {activeDecision.id}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              activeDecision.status === "ACCEPTED"
                                ? "bg-[#DCE6D3] text-[#2D3728]"
                                : activeDecision.status === "REJECTED"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {activeDecision.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[#77796F] text-[11px]">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {activeDecision.date}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            Author: {activeDecision.author}
                          </span>
                        </div>
                      </div>

                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2D3327]">
                        {activeDecision.title}
                      </h2>

                      <p className="text-xs sm:text-sm text-[#555A4D] leading-relaxed font-medium">
                        {activeDecision.summary}
                      </p>
                    </div>

                    {/* Consensus Rationale */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#77796F] font-bold">
                        Consensus Context & Rationale
                      </span>
                      <p className="text-xs sm:text-sm text-[#41463B] leading-relaxed bg-[#FAF8F3] p-4 rounded-xl border border-[#EAE4D5]">
                        {activeDecision.rationale}
                      </p>
                    </div>

                    {/* Rejected Alternative if present */}
                    {activeDecision.rejectedAlternative && (
                      <div className="space-y-2">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[#9E3426] font-bold">
                          Explicitly Rejected Alternative
                        </span>
                        <div className="p-4 rounded-xl bg-red-50/50 border border-red-100 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#8A2417]">
                              {activeDecision.rejectedAlternative.name}
                            </span>
                            <span className="text-[10px] font-mono text-[#9E3426]">
                              Proposed by {activeDecision.rejectedAlternative.proposedBy}
                            </span>
                          </div>
                          <p className="text-[#6E2B20] text-xs leading-relaxed">
                            {activeDecision.rejectedAlternative.reason}
                          </p>
                          <div className="text-[11px] font-mono text-[#4E673D] pt-1">
                            Adopted instead: {activeDecision.rejectedAlternative.chosenApproach}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Verified Discussion Evidence */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-[11px] uppercase tracking-wider text-[#77796F] font-bold">
                          Verbatim Discussion Citations
                        </span>
                        <span className="text-[#5A684E] flex items-center gap-1 text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Cryptographically Linked
                        </span>
                      </div>

                      <div className="space-y-3">
                        {activeDecision.sources.map((src, idx) => (
                          <div
                            key={idx}
                            className="p-4 rounded-xl bg-[#FAF8F3] border border-[#EAE4D5] text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between text-[11px] font-mono text-[#77796F]">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-[#2D3327]">
                                  {src.title}
                                </span>
                                <span>by {src.author}</span>
                              </div>
                              <span>{src.date}</span>
                            </div>

                            <p className="text-xs italic text-[#41463B] leading-relaxed pl-3 border-l-2 border-[#C5D6B4]">
                              &quot;{src.quote}&quot;
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Impacted Code Files */}
                    <div className="space-y-3">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#77796F] font-bold">
                        Connected Code Files
                      </span>
                      <div className="divide-y divide-[#EAE4D5] rounded-xl border border-[#EAE4D5] overflow-hidden">
                        {activeDecision.codeFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 bg-[#FAF8F3] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                          >
                            <div className="flex items-center gap-2">
                              <FileCode2 className="w-3.5 h-3.5 text-[#5A684E]" />
                              <span className="font-bold text-[#2D3327]">
                                {file.path}
                              </span>
                              <span className="text-[#77796F] text-[10px]">
                                {file.lines}
                              </span>
                            </div>
                            <span className="text-[11px] font-sans text-[#77796F]">
                              {file.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-xs text-[#77796F]">
                    Select a decision record to view its full architectural details.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            3. REJECTED APPROACHES SECTION (Problem 06 First-Class Feature)
            ======================================================== */}
        {currentTab === "rejected" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#9E3426] font-bold">
                Problem 06 · Recovered Alternatives
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#2D3327] mt-1">
                Rejected Approaches & Discarded Alternatives
              </h2>
              <p className="text-xs sm:text-sm text-[#77796F] mt-1 max-w-3xl leading-relaxed">
                Recovering why alternative implementations were proposed and rejected prevents repeated debates and accidental regressions during future refactorings.
              </p>
            </div>

            <div className="space-y-6">
              {rejectedApproaches.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl bg-white border border-[#DDD8CC] p-6 sm:p-7 space-y-5 shadow-2xs"
                >
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#F2ECE0]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#5A684E]">
                          {item.decisionId}
                        </span>
                        <span className="text-[#DDD8CC]">·</span>
                        <span className="text-xs font-bold text-[#2D3327]">
                          Related: {item.decisionTitle}
                        </span>
                      </div>
                      <div className="text-lg font-bold text-[#8A2417] flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-[#9E3426]" />
                        <span>Proposed Alternative: {item.alternative.name}</span>
                      </div>
                    </div>

                    <div className="text-xs font-mono text-[#77796F]">
                      Proposed by: <strong className="text-[#2D3327]">{item.alternative.proposedBy}</strong>
                    </div>
                  </div>

                  {/* Two column: Rejection Reason & Adopted Solution */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#9E3426] font-bold">
                        Why Was It Rejected?
                      </span>
                      <p className="text-xs leading-relaxed text-[#6E2B20] bg-red-50/50 p-4 rounded-xl border border-red-100">
                        {item.alternative.reason}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#4E673D] font-bold">
                        What Was Adopted Instead?
                      </span>
                      <p className="text-xs leading-relaxed text-[#2D3728] bg-[#DCE6D3]/40 p-4 rounded-xl border border-[#C5D6B4]">
                        {item.alternative.chosenApproach}
                      </p>
                    </div>
                  </div>

                  {/* Supporting Verbatim Discussion Quotes */}
                  <div className="space-y-2 pt-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#77796F] font-bold">
                      Supporting Discussion Citations
                    </span>
                    <div className="space-y-2">
                      {item.alternative.evidenceQuotes.map((q, qIdx) => (
                        <div
                          key={qIdx}
                          className="p-3.5 rounded-xl bg-[#FAF8F3] border border-[#EAE4D5] text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono text-[#77796F]">
                            <span className="font-semibold text-[#2D3327]">
                              {q.author} via {q.source}
                            </span>
                          </div>
                          <p className="italic text-[#41463B] pl-2.5 border-l-2 border-[#C5D6B4]">
                            &quot;{q.quote}&quot;
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Affected Files */}
                  <div className="pt-2 flex items-center justify-between text-xs font-mono text-[#77796F]">
                    <span className="flex items-center gap-1.5">
                      <FileCode2 className="w-3.5 h-3.5 text-[#5A684E]" />
                      <span>Affected files: {item.alternative.affectedFiles.join(", ")}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================
            4. SOURCES SECTION (Searchable original discussions)
            ======================================================== */}
        {currentTab === "sources" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#5A684E] font-bold">
                Source Discussion Explorer
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#2D3327] mt-1">
                Original Discussion Messages & Evidence
              </h2>
              <p className="text-xs sm:text-sm text-[#77796F] mt-1 max-w-3xl leading-relaxed">
                Original titles, authors, timestamps, and quotes from GitHub Discussions, Pull Requests, Issues, and Discord threads.
              </p>
            </div>

            {/* Filter and Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-[#77796F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={sourceSearch}
                  onChange={(e) => setSourceSearch(e.target.value)}
                  placeholder="Search sources by title, author, or message content..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white border border-[#DDD8CC] focus:border-[#9BAF8B] text-xs text-[#2D3327] placeholder-[#77796F] focus:outline-none transition-all shadow-2xs"
                />
              </div>

              {/* Source Type Filter */}
              <div className="flex items-center rounded-xl bg-white p-0.5 text-xs font-medium border border-[#DDD8CC] shadow-2xs">
                {(["ALL", "discussion", "pr", "issue", "discord"] as const).map(
                  (type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSourceTypeFilter(type)}
                      className={`px-3 py-1 rounded-lg text-[11px] font-mono capitalize transition-colors ${
                        sourceTypeFilter === type
                          ? "bg-[#DCE6D3] text-[#2D3728] font-bold"
                          : "text-[#77796F] hover:text-[#2D3327]"
                      }`}
                    >
                      {type}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Source Cards */}
            <div className="space-y-4">
              {filteredSources.length === 0 ? (
                <div className="p-12 text-center text-xs text-[#77796F] bg-white rounded-2xl border border-[#DDD8CC]">
                  No original discussion sources matched your filter criteria.
                </div>
              ) : (
                filteredSources.map((src) => (
                  <div
                    key={src.id}
                    className="p-5 rounded-2xl bg-white border border-[#DDD8CC] space-y-3 shadow-2xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#5A684E]">
                          {src.badge}
                        </span>
                        <span className="text-[#DDD8CC]">·</span>
                        <h4 className="text-sm font-bold text-[#2D3327]">
                          {src.title}
                        </h4>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono text-[#77796F]">
                        <span>By {src.author}</span>
                        <span>·</span>
                        <span>{src.date}</span>
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#35432C] hover:underline inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* Original Message Verbatim */}
                    <div className="p-3.5 rounded-xl bg-[#FAF8F3] border border-[#EAE4D5] text-xs">
                      <span className="text-[10px] font-mono uppercase text-[#77796F] font-bold block mb-1">
                        Original Discussion Message
                      </span>
                      <p className="italic text-[#41463B] leading-relaxed">
                        &quot;{src.quote}&quot;
                      </p>
                    </div>

                    {/* Extracted Decisions Referencing This */}
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#77796F] pt-1">
                      <span>
                        Referenced by:{" "}
                        <strong className="text-[#2D3327]">
                          {src.referencedDecisions.join(", ")}
                        </strong>
                      </span>
                      <span className="text-[#4E673D] flex items-center gap-1 font-semibold">
                        <ShieldCheck className="w-3 h-3" />
                        Verified Source
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            5. CODE RELATIONSHIPS SECTION (Matrix of files & decisions)
            ======================================================== */}
        {currentTab === "code" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#5A684E] font-bold">
                Repository Impact Graph
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#2D3327] mt-1">
                Relationships between Technical Decisions and Files
              </h2>
              <p className="text-xs sm:text-sm text-[#77796F] mt-1 max-w-3xl leading-relaxed">
                Trace from any repository file directly to the architectural decisions, constraints, and supporting discussions that shaped it.
              </p>
            </div>

            {/* File Search */}
            <div className="relative max-w-md">
              <Search className="w-3.5 h-3.5 text-[#77796F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={codeSearch}
                onChange={(e) => setCodeSearch(e.target.value)}
                placeholder="Search repository files..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white border border-[#DDD8CC] focus:border-[#9BAF8B] text-xs text-[#2D3327] placeholder-[#77796F] focus:outline-none transition-all shadow-2xs"
              />
            </div>

            {/* Code Matrix List */}
            <div className="rounded-2xl bg-white border border-[#DDD8CC] divide-y divide-[#EAE4D5] overflow-hidden shadow-2xs">
              {filteredCodeFiles.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#77796F]">
                  No matching files found.
                </div>
              ) : (
                filteredCodeFiles.map((item, idx) => (
                  <div key={idx} className="p-5 hover:bg-[#FAF8F3] transition-colors space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <FileCode2 className="w-4 h-4 text-[#5A684E] shrink-0" />
                        <span className="font-bold text-[#2D3327] text-sm">
                          {item.path}
                        </span>
                        <span className="text-[#77796F] text-[11px]">
                          {item.lines}
                        </span>
                      </div>

                      <span className="text-[#5A684E] text-[11px] font-semibold">
                        {item.decisions.length} Associated Decision{item.decisions.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <p className="text-xs text-[#6F7365] leading-relaxed">
                      {item.description}
                    </p>

                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-mono uppercase text-[#77796F] font-bold">
                        Anchored Technical Decisions:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {item.decisions.map((dec) => (
                          <button
                            key={dec.id}
                            type="button"
                            onClick={() => {
                              setSelectedDecisionId(dec.id);
                              setCurrentTab("decisions");
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FAF8F3] hover:bg-[#EAE4D5] border border-[#DDD8CC] text-xs font-mono text-[#2D3327] transition-colors"
                          >
                            <span className="font-bold text-[#5A684E]">{dec.id}</span>
                            <span className="truncate max-w-xs">{dec.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            6. PR INTELLIGENCE SECTION (Context for Pull Requests)
            ======================================================== */}
        {currentTab === "pr-intelligence" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#5A684E] font-bold">
                PR Invariant Shield
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#2D3327] mt-1">
                Historical Context for Pull Requests
              </h2>
              <p className="text-xs sm:text-sm text-[#77796F] mt-1 max-w-3xl leading-relaxed">
                When pull requests modify code governed by previously agreed-upon decisions, Dev Trace surfaces relevant historical context before merging.
              </p>
            </div>

            <div className="space-y-5">
              {PR_INTELLIGENCE_DATA.map((pr) => (
                <div
                  key={pr.prNumber}
                  className="rounded-2xl bg-white border border-[#DDD8CC] p-6 space-y-4 shadow-2xs"
                >
                  {/* PR Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#F2ECE0]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <GitPullRequest className="w-4 h-4 text-[#5A684E]" />
                        <span className="font-mono text-xs font-bold text-[#2D3327]">
                          Pull Request #{pr.prNumber}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded capitalize ${
                            pr.status === "open"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-[#DCE6D3] text-[#2D3728]"
                          }`}
                        >
                          {pr.status}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-[#2D3327]">
                        {pr.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-[#77796F]">By {pr.author}</span>
                      <span className="text-[#DDD8CC]">·</span>
                      <span className="text-[#77796F]">{pr.date}</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          pr.checkStatus === "PASSING"
                            ? "bg-[#DCE6D3] text-[#2D3728]"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {pr.checkStatus}
                      </span>
                    </div>
                  </div>

                  {/* Impacted files */}
                  <div className="text-xs font-mono text-[#77796F] flex items-center gap-2">
                    <span className="font-bold text-[#2D3327]">Changed Files:</span>
                    <span>{pr.changedFiles.join(", ")}</span>
                  </div>

                  {/* Warning Callout if rejection rule violated */}
                  {pr.rejectionWarning && (
                    <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs space-y-1.5 text-amber-900">
                      <div className="flex items-center gap-2 font-bold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>Architectural Invariant Alert</span>
                      </div>
                      <p className="leading-relaxed">{pr.rejectionWarning}</p>
                    </div>
                  )}

                  {/* Matched Historical Decision */}
                  <div className="pt-2 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2 text-[#77796F]">
                      <span>Matched Decision:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDecisionId(pr.matchedDecisionId);
                          setCurrentTab("decisions");
                        }}
                        className="font-bold text-[#35432C] hover:underline"
                      >
                        {pr.matchedDecisionId}: {pr.matchedDecisionTitle}
                      </button>
                    </div>

                    <span className="text-[#5A684E] font-semibold">
                      Automated GitHub App Check
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
        <div className="min-h-screen bg-[#F7F5ED] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-7 h-7 text-[#35432C] animate-spin" />
            <p className="text-xs font-mono text-[#77796F]">
              Loading project context...
            </p>
          </div>
        </div>
      }
    >
      <ProjectWorkspace />
    </Suspense>
  );
}
