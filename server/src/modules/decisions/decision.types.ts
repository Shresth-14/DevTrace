export const EXTRACTION_VERSION = "2026-10-v1";

export const DECISION_STATUSES = [
  "accepted",
  "rejected",
  "proposed",
  "withdrawn",
  "unresolved",
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** Statuses that assert a final outcome and therefore need verified evidence. */
export const DEFINITIVE: ReadonlySet<DecisionStatus> = new Set([
  "accepted",
  "rejected",
  "withdrawn",
]);

export const REASONING_CATEGORIES = [
  "performance",
  "scalability",
  "security",
  "compatibility",
  "maintainability",
  "developer_experience",
  "complexity",
  "resource_consumption",
  "architecture",
  "backward_compatibility",
  "other",
] as const;
export type ReasoningCategory = (typeof REASONING_CATEGORIES)[number];

export type ThreadKind = "issue" | "pull_request" | "discussion";

export type EvidenceSourceType =
  | "issue"
  | "issue_comment"
  | "pull_request"
  | "pr_comment"
  | "review"
  | "review_comment"
  | "commit"
  | "discussion"
  | "discussion_comment";

/** One imported record inside a thread, addressed to the model by a local ref (S1, S2...). */
export interface ThreadItem {
  ref: string;
  sourceType: EvidenceSourceType;
  /** Natural key of the imported record (number, GitHub id or node id as string). */
  sourceKey: string;
  author: string | null;
  text: string;
  url: string;
  at: Date | null;
  /** Inline review comments only */
  path?: string;
  line?: number | null;
  commitSha?: string | null;
}

export interface ChangedFile {
  path: string;
  previousPath: string | null;
  status: string;
}

export interface ThreadUnit {
  kind: ThreadKind;
  number: number;
  title: string;
  url: string;
  updatedAt: Date;
  items: ThreadItem[];
  /** Files changed by the PR (empty for issues/discussions). */
  files: ChangedFile[];
  hash: string;
  /** open | closed | merged. Closed threads are history unless current work links to them. */
  state: string;
  /** open = current work; referenced = older thread linked from current work. */
  reason: string;
  linkedFrom: { kind: string; number: number }[];
}

// ---- validated candidate (output of the extractor, input of the store) ----

export interface CandidateEvidence {
  item: ThreadItem;
  quote: string;
  quoteVerified: boolean;
}

export interface CandidateAlternative {
  title: string;
  proposedBy: string | null;
  reason: string | null;
  status: DecisionStatus;
  chosenInstead: string | null;
  evidence: CandidateEvidence[];
}

export interface CandidateCodeLink {
  path: string;
  previousPath: string | null;
  relationship: "direct" | "inferred";
  basis: "pr_file" | "review_comment" | "model_inferred";
  description: string | null;
  commitSha: string | null;
  line: number | null;
  prNumber: number | null;
}

export interface Candidate {
  title: string;
  summary: string;
  status: DecisionStatus;
  reasoning: { category: ReasoningCategory; explanation: string }[];
  openQuestions: string | null;
  confidence: number | null;
  evidence: CandidateEvidence[];
  alternatives: CandidateAlternative[];
  codeLinks: CandidateCodeLink[];
  thread: { kind: ThreadKind; number: number };
  decidedAt: Date | null;
}
