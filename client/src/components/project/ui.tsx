import type { ReactNode } from "react";
import {
  GitPullRequest,
  MessageSquare,
  CircleDot,
  MessagesSquare,
  FileCode2,
  type LucideIcon,
} from "lucide-react";
import type { DecisionStatus, SourceType } from "./types";

/** Visible keyboard focus for every interactive control. */
export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dt-forest";

export const STATUS_META: Record<
  DecisionStatus,
  { label: string; dot: string; text: string; badge: string }
> = {
  ACCEPTED: {
    label: "Accepted",
    dot: "bg-dt-accept",
    text: "text-dt-accept",
    badge: "bg-dt-sage-pale text-dt-forest",
  },
  REJECTED: {
    label: "Rejected",
    dot: "bg-dt-reject",
    text: "text-dt-reject",
    badge: "bg-dt-reject-bg text-dt-reject",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    dot: "bg-dt-muted",
    text: "text-dt-muted-text",
    badge: "bg-dt-bg2 text-dt-ink",
  },
  UNRESOLVED: {
    label: "Unresolved",
    dot: "bg-dt-unresolved",
    text: "text-dt-unresolved",
    badge: "bg-dt-unresolved-bg text-dt-unresolved",
  },
};

export const SOURCE_META: Record<
  SourceType,
  { label: string; icon: LucideIcon }
> = {
  discussion: { label: "GitHub Discussion", icon: MessagesSquare },
  issue: { label: "GitHub Issue", icon: CircleDot },
  pr: { label: "Pull Request", icon: GitPullRequest },
  comment: { label: "Comment", icon: MessageSquare },
  discord: { label: "Discord thread", icon: MessageSquare },
};

export function StatusBadge({ status }: { status: DecisionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** Small status marker without a pill, for dense lists. */
export function StatusDot({ status }: { status: DecisionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${meta.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-dt-ink-strong">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dt-muted-text">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-dt-muted-text">
      {children}
    </h3>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-dt-line-strong px-6 py-12 text-center">
      <Icon className="h-5 w-5 text-dt-muted" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-dt-ink-strong">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-dt-muted-text">
        {children}
      </p>
    </div>
  );
}

/** Directory in muted text, file name emphasised; wraps instead of overflowing. */
export function FilePath({
  path,
  lines,
  className = "",
}: {
  path: string;
  lines?: string;
  className?: string;
}) {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  return (
    <span
      className={`inline-flex min-w-0 items-baseline gap-2 font-mono text-[13px] ${className}`}
    >
      <FileCode2
        className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-dt-accept"
        aria-hidden="true"
      />
      <span className="min-w-0 break-all">
        <span className="text-dt-muted-text">{dir}</span>
        <span className="font-semibold text-dt-ink-strong">{file}</span>
      </span>
      {lines ? (
        <span className="shrink-0 text-xs text-dt-muted-text">
          {lines.replace(/^:/, "")}
        </span>
      ) : null}
    </span>
  );
}

export function Quote({
  children,
  attribution,
}: {
  children: ReactNode;
  attribution?: ReactNode;
}) {
  return (
    <figure className="border-l-2 border-dt-pistachio pl-4">
      <blockquote className="text-sm leading-relaxed text-dt-ink">
        {children}
      </blockquote>
      {attribution ? (
        <figcaption className="mt-1.5 text-xs text-dt-muted-text">
          {attribution}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Parses the sample data's display dates ("Oct 25, 2026") for sorting. */
export function dateValue(label: string): number {
  const t = Date.parse(label);
  return Number.isNaN(t) ? 0 : t;
}
