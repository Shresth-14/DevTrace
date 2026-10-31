// Response shapes of the Dev Trace API. They mirror server/src/modules/decisions/decision.read.ts.

export type ProjectTab =
  | "overview"
  | "decisions"
  | "rejected"
  | "sources"
  | "code"
  | "pr-intelligence";

export type DecisionStatus =
  | "ACCEPTED"
  | "REJECTED"
  | "PROPOSED"
  | "WITHDRAWN"
  | "UNRESOLVED";

export type SourceType =
  | "discussion"
  | "issue"
  | "pr"
  | "comment"
  | "review"
  | "commit";

export interface DecisionSource {
  id: string;
  type: SourceType;
  title: string;
  author: string;
  date: string | null;
  quote: string;
  url: string;
  badge: string;
}

export interface CodeReference {
  path: string;
  previousPath: string | null;
  lines: string;
  description: string;
  relationship: "direct" | "inferred";
  basis: string;
  commitSha: string | null;
}

export interface RejectedAlternative {
  name: string;
  proposedBy: string | null;
  reason: string | null;
  status: DecisionStatus;
  chosenApproach: string | null;
  evidenceQuotes: { author: string; source: string; quote: string; url: string }[];
  affectedFiles: string[];
}

export interface DecisionRecord {
  id: string;
  seq: number;
  title: string;
  status: DecisionStatus;
  date: string | null;
  author: string | null;
  participants: string[];
  summary: string;
  reasoning: { category: string; explanation: string }[];
  openQuestions: string | null;
  confidence: number | null;
  alternatives: RejectedAlternative[];
  sources: DecisionSource[];
  codeFiles: CodeReference[];
  relatedThreads: { kind: string; number: number; title: string; url: string }[];
  model: string;
  version: string;
}

export interface PrMatch {
  decisionId: string;
  decisionTitle: string;
  decisionStatus: DecisionStatus;
  matchedFiles: string[];
  relationship: "direct" | "inferred";
  reason: string;
  sources: { title: string; url: string }[];
}

export interface PrIntelligenceItem {
  prNumber: number;
  title: string;
  author: string | null;
  date: string;
  status: "open" | "merged" | "closed";
  url: string;
  changedFiles: string[];
  matches: PrMatch[];
}

export interface ActivityEvent {
  id: string;
  type: "decision_updated" | "sync_completed" | "extraction_completed";
  title: string;
  description: string;
  timestamp: string;
  source: string;
}

export interface SourceFeedItem extends DecisionSource {
  referencedDecisions: string[];
}

export type SourceCategory =
  | "all"
  | "issues"
  | "pull_requests"
  | "discussions"
  | "comments"
  | "reviews"
  | "commits";

export interface RejectedApproach {
  decisionId: string;
  decisionTitle: string;
  status: DecisionStatus;
  date: string | null;
  alternative: RejectedAlternative;
}

export interface CodeRelationship {
  path: string;
  previousPath: string | null;
  lines: string;
  description: string;
  relationship: "direct" | "inferred";
  decisions: { id: string; title: string; status: DecisionStatus }[];
}

/** What the importer reports per resource; "count" is what was fetched. */
export interface ResourceStat {
  status: string;
  count: number;
  /** GitHub's own number for this selection (e.g. all open issues), when known. */
  discovered?: number;
  selected?: number;
  stored?: number;
  unchanged?: number;
  skipped?: number;
  failed?: number;
  error?: string;
  note?: string;
}

export interface ThreadBreakdown {
  total: number;
  open: number;
  resolvedCurrent: number;
  linkedHistory: number;
  otherHistory: number;
}

export interface SyncJobInfo {
  id: string;
  status: string;
  mode: string;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  resources: Record<string, ResourceStat> | null;
}

export interface ExtractionRunInfo {
  id: string;
  status: string;
  model: string;
  unitsTotal: number;
  unitsDone: number;
  unitsFailed: number;
  decisionsSaved: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ProjectStatus {
  syncStatus: string;
  aiStatus: string;
  lastSyncedAt: string | null;
  lastExtractedAt: string | null;
  latestJob: SyncJobInfo | null;
  latestRun: ExtractionRunInfo | null;
}

export interface OverviewData {
  counts: {
    total: number;
    accepted: number;
    rejected: number;
    proposed: number;
    withdrawn: number;
    unresolved: number;
    rejectedAlternatives: number;
  };
  sources: {
    issues: number;
    issueComments: number;
    pullRequests: number;
    prComments: number;
    reviews: number;
    reviewComments: number;
    discussions: number;
    discussionComments: number;
    commits: number;
    files: number;
    prFiles: number;
  };
  codeLinks: number;
  threads: {
    issues: ThreadBreakdown;
    pullRequests: ThreadBreakdown;
    references: number;
  };
  status: ProjectStatus;
  activity: ActivityEvent[];
}
