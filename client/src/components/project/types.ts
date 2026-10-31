export type ProjectTab =
  | "overview"
  | "decisions"
  | "rejected"
  | "sources"
  | "code"
  | "pr-intelligence";

export type DecisionStatus = "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "UNRESOLVED";

export type SourceType = "discussion" | "issue" | "pr" | "comment" | "discord";

export interface DecisionSource {
  id: string;
  type: SourceType;
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
  status: DecisionStatus;
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

export interface SourceWithRefs extends DecisionSource {
  referencedDecisions: string[];
}

export interface CodeRelationship {
  path: string;
  lines: string;
  description: string;
  decisions: { id: string; title: string; status: DecisionStatus }[];
}

export interface RejectedApproach {
  decisionId: string;
  decisionTitle: string;
  status: DecisionStatus;
  date: string;
  alternative: RejectedAlternative;
}
