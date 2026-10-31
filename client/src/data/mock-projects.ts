export interface DashboardProject {
  id: string;
  name: string;
  slug: string;
  owner: string;
  fullName: string;
  description: string;
  isPrivate: boolean;
  primaryLanguage: string;
  languageColor: string;
  decisionsCount: number;
  lastSyncedAt: string;
  syncStatus: "synced" | "syncing" | "pending";
  githubUrl: string;
  defaultBranch: string;
  stars?: number;
}

export interface AvailableRepository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatarUrl: string;
  description: string;
  isPrivate: boolean;
  primaryLanguage: string;
  languageColor: string;
  defaultBranch: string;
  stars: number;
  updatedAt: string;
}

export interface IntegrationState {
  id: string;
  name: "GitHub" | "Discord";
  connected: boolean;
  accountName?: string;
  accountAvatar?: string;
  lastSync?: string;
  description: string;
}

export interface DashboardUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string;
  role: string;
}

export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178C6",
  JavaScript: "#F7DF1E",
  Go: "#00ADD8",
  Python: "#3776AB",
  Rust: "#DEA584",
  PostgreSQL: "#336791",
  Solidity: "#AA6746",
};

export const INITIAL_MOCK_USER: DashboardUser = {
  id: "usr_mock_maintainer",
  name: "Arpit Tripathi",
  username: "arpittripathi755",
  email: "maintainer@devtrace.internal",
  avatarUrl: "https://avatars.githubusercontent.com/u/100000000?v=4",
  role: "Lead Maintainer",
};

export const INITIAL_MOCK_PROJECTS: DashboardProject[] = [
  {
    id: "proj_01",
    name: "dev-trace-core",
    slug: "dev-trace-core",
    owner: "dev-trace",
    fullName: "dev-trace/dev-trace-core",
    description:
      "Core decision-extraction pipeline, semantic decision indexer and source graph synthesis engine.",
    isPrivate: false,
    primaryLanguage: "TypeScript",
    languageColor: "#3178C6",
    decisionsCount: 54,
    lastSyncedAt: "12m ago",
    syncStatus: "synced",
    githubUrl: "https://github.com/dev-trace/dev-trace-core",
    defaultBranch: "main",
    stars: 342,
  },
  {
    id: "proj_02",
    name: "storage-engine",
    slug: "storage-engine",
    owner: "supabase",
    fullName: "supabase/storage-engine",
    description:
      "High-throughput object storage layer with S3-compatible endpoints and WAL replication.",
    isPrivate: true,
    primaryLanguage: "Go",
    languageColor: "#00ADD8",
    decisionsCount: 38,
    lastSyncedAt: "1h ago",
    syncStatus: "synced",
    githubUrl: "https://github.com/supabase/storage-engine",
    defaultBranch: "master",
    stars: 1280,
  },
  {
    id: "proj_03",
    name: "scheduling-core",
    slug: "scheduling-core",
    owner: "calcom",
    fullName: "calcom/scheduling-core",
    description:
      "Timezone-aware slot calculation engine and distributed calendar availability solver.",
    isPrivate: false,
    primaryLanguage: "TypeScript",
    languageColor: "#3178C6",
    decisionsCount: 72,
    lastSyncedAt: "4h ago",
    syncStatus: "synced",
    githubUrl: "https://github.com/calcom/scheduling-core",
    defaultBranch: "main",
    stars: 890,
  },
];

export const MOCK_AVAILABLE_REPOSITORIES: AvailableRepository[] = [
  {
    id: "repo_101",
    name: "turbopack-cache",
    fullName: "vercel/turbopack-cache",
    owner: "vercel",
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020?v=4",
    description:
      "Incremental computation graph and distributed filesystem artifact caching.",
    isPrivate: false,
    primaryLanguage: "Rust",
    languageColor: "#DEA584",
    defaultBranch: "main",
    stars: 4210,
    updatedAt: "2h ago",
  },
  {
    id: "repo_102",
    name: "discrawl-collector",
    fullName: "openclaw/discrawl-collector",
    owner: "openclaw",
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/9919?v=4",
    description:
      "High-performance Go daemon indexing technical Discord discussions with rate-limit backoff.",
    isPrivate: true,
    primaryLanguage: "Go",
    languageColor: "#00ADD8",
    defaultBranch: "main",
    stars: 184,
    updatedAt: "1d ago",
  },
  {
    id: "repo_103",
    name: "query-compiler",
    fullName: "prisma/query-compiler",
    owner: "prisma",
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/17219288?v=4",
    description:
      "AST transformations and SQL generation pipeline optimized for PostgreSQL schemas.",
    isPrivate: false,
    primaryLanguage: "Rust",
    languageColor: "#DEA584",
    defaultBranch: "main",
    stars: 2130,
    updatedAt: "3d ago",
  },
  {
    id: "repo_104",
    name: "realtime-presence",
    fullName: "liveblocks/realtime-presence",
    owner: "liveblocks",
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/82821217?v=4",
    description:
      "Low-latency state synchronization with conflict-free replicated data types.",
    isPrivate: true,
    primaryLanguage: "TypeScript",
    languageColor: "#3178C6",
    defaultBranch: "main",
    stars: 560,
    updatedAt: "4d ago",
  },
  {
    id: "repo_105",
    name: "typed-router",
    fullName: "trpc/typed-router",
    owner: "trpc",
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/781177?v=4",
    description:
      "End-to-end type safety for contract definitions between Next.js and backend workers.",
    isPrivate: false,
    primaryLanguage: "TypeScript",
    languageColor: "#3178C6",
    defaultBranch: "main",
    stars: 3890,
    updatedAt: "5d ago",
  },
  {
    id: "repo_106",
    name: "email-render-worker",
    fullName: "resend/email-render-worker",
    owner: "resend",
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/108507817?v=4",
    description:
      "Distributed queue processor rendering responsive email templates with Chromium headless.",
    isPrivate: true,
    primaryLanguage: "TypeScript",
    languageColor: "#3178C6",
    defaultBranch: "main",
    stars: 940,
    updatedAt: "1w ago",
  },
];

export const INITIAL_INTEGRATIONS: IntegrationState[] = [
  {
    id: "int_github",
    name: "GitHub",
    connected: true,
    accountName: "arpittripathi755",
    accountAvatar: "https://avatars.githubusercontent.com/u/100000000?v=4",
    lastSync: "3 minutes ago",
    description:
      "Captures issues, pull request discussions, line-level code reviews, and commit messages.",
  },
  {
    id: "int_discord",
    name: "Discord",
    connected: false,
    accountName: undefined,
    accountAvatar: undefined,
    lastSync: undefined,
    description:
      "Monitors engineering channels, architectural debates, and decision threads in your Discord server.",
  },
];

