import type {
  ActivityEvent,
  DecisionRecord,
  PrIntelligenceItem,
} from "./types";

// Sample content bundled with the app. The client API (src/lib/api.ts) has no
// endpoint for decisions, sources, code links or PR matches yet, so the project
// workspace renders these and labels them as sample data.

export const SAMPLE_DECISIONS: DecisionRecord[] = [
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

export const SAMPLE_PRS: PrIntelligenceItem[] = [
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

export const SAMPLE_ACTIVITY: ActivityEvent[] = [
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
