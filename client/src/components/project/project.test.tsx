import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DecisionsSection } from "./DecisionsSection";
import { RejectedSection } from "./RejectedSection";
import { OverviewSection } from "./OverviewSection";
import { PrSection } from "./PrSection";
import type { DecisionRecord, OverviewData } from "./types";

afterEach(cleanup);

// Test fixtures only; the app never ships records like these.
const decision: DecisionRecord = {
  id: "DEC-001",
  seq: 1,
  title: "Use approach X",
  status: "ACCEPTED",
  date: "2024-01-05T00:00:00.000Z",
  author: "carol",
  participants: ["carol", "frank"],
  summary: "Reviewers settled on X.",
  reasoning: [
    { category: "maintainability", explanation: "Simpler to reason about." },
  ],
  openQuestions: null,
  confidence: 0.8,
  alternatives: [
    {
      name: "Approach Y",
      proposedBy: "frank",
      reason: "Explained away in review.",
      status: "REJECTED",
      chosenApproach: "Approach X",
      evidenceQuotes: [
        {
          author: "carol",
          source: "PR #10",
          quote: "Because X",
          url: "https://github.com/c/4002",
        },
      ],
      affectedFiles: ["src/a.ts"],
    },
  ],
  sources: [
    {
      id: "e1",
      type: "review",
      title: "PR #10",
      author: "carol",
      date: "2024-01-04T00:00:00.000Z",
      quote: "Because X",
      url: "https://github.com/c/4002",
      badge: "Inline review comment",
    },
  ],
  codeFiles: [
    {
      path: "src/a.ts",
      previousPath: null,
      lines: "L12",
      description: "",
      relationship: "direct",
      basis: "pr_file",
      commitSha: null,
    },
    {
      path: "src/b.ts",
      previousPath: null,
      lines: "",
      description: "",
      relationship: "inferred",
      basis: "model_inferred",
      commitSha: null,
    },
  ],
  relatedThreads: [
    {
      kind: "pull_request",
      number: 10,
      title: "Switch storage",
      url: "https://github.com/acme/widgets/pull/10",
    },
  ],
  model: "fake/open-model",
  version: "v1",
};

const overview = (
  over: Partial<OverviewData["status"]> = {},
  total = 0
): OverviewData => ({
  counts: {
    total,
    accepted: total,
    rejected: 0,
    proposed: 0,
    withdrawn: 0,
    unresolved: 0,
    rejectedAlternatives: 0,
  },
  sources: {
    issues: 3,
    issueComments: 2,
    pullRequests: 2,
    prComments: 1,
    reviews: 2,
    reviewComments: 2,
    discussions: 0,
    discussionComments: 0,
    commits: 4,
    files: 9,
    prFiles: 4,
  },
  codeLinks: 0,
  threads: {
    issues: {
      total: 4,
      open: 3,
      resolvedCurrent: 0,
      linkedHistory: 1,
      otherHistory: 0,
    },
    pullRequests: {
      total: 3,
      open: 2,
      resolvedCurrent: 0,
      linkedHistory: 1,
      otherHistory: 0,
    },
    references: 3,
  },
  status: {
    syncStatus: "completed",
    aiStatus: "pending",
    lastSyncedAt: null,
    lastExtractedAt: null,
    latestJob: null,
    latestRun: null,
    ...over,
  },
  activity: [],
});

describe("DecisionsSection", () => {
  const props = {
    decisions: [decision],
    filtered: [decision],
    active: decision,
    searchQuery: "",
    onSearchChange: vi.fn(),
    statusFilter: "ALL" as const,
    onStatusFilterChange: vi.fn(),
    onSelect: vi.fn(),
  };

  it("renders the real record with evidence links and labels inferred code", () => {
    render(<DecisionsSection {...props} />);
    expect(screen.getAllByText("Use approach X").length).toBeGreaterThan(0);
    expect(screen.getByText(/confidence 80%/)).toBeInTheDocument();
    expect(
      screen.getByText("Direct evidence", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText(/Inferred/)).toBeInTheDocument();
    const open = screen.getByLabelText("Open original: PR #10");
    expect(open).toHaveAttribute("href", "https://github.com/c/4002");
  });

  it("filters by status", () => {
    render(<DecisionsSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Rejected/ }));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("REJECTED");
  });

  it("shows an honest empty state, not placeholder decisions", () => {
    render(
      <DecisionsSection {...props} decisions={[]} filtered={[]} active={null} />
    );
    expect(screen.getByText("No decisions extracted yet")).toBeInTheDocument();
    expect(screen.queryByText(/DEC-/)).not.toBeInTheDocument();
  });
});

describe("RejectedSection", () => {
  it("lists only what it is given and links back to the decision", () => {
    const onOpen = vi.fn();
    render(
      <RejectedSection
        approaches={[
          {
            decisionId: "DEC-001",
            decisionTitle: "Use approach X",
            status: "ACCEPTED",
            date: decision.date,
            alternative: decision.alternatives[0],
          },
        ]}
        onOpenDecision={onOpen}
      />
    );
    expect(screen.getByText("Approach Y")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "DEC-001" }));
    expect(onOpen).toHaveBeenCalledWith("DEC-001");
    expect(screen.getByRole("link", { name: /open original/ })).toHaveAttribute(
      "href",
      "https://github.com/c/4002"
    );
  });

  it("shows an empty state when nothing was rejected", () => {
    render(<RejectedSection approaches={[]} onOpenDecision={vi.fn()} />);
    expect(
      screen.getByText("No rejected approaches recorded")
    ).toBeInTheDocument();
  });
});

describe("OverviewSection", () => {
  const base = {
    decisions: [],
    codeRelationships: [],
    onOpenDecision: vi.fn(),
    onNavigate: vi.fn(),
  };

  it("explains an empty project instead of showing a populated dashboard", () => {
    render(
      <OverviewSection {...base} overview={overview({ syncStatus: "never" })} />
    );
    expect(screen.getByText("No decisions extracted yet")).toBeInTheDocument();
    expect(screen.getByText(/has not been imported yet/)).toBeInTheDocument();
    expect(screen.queryByText("Decisions recorded")).not.toBeInTheDocument();
  });

  it("tells the user when AI analysis is not configured", () => {
    render(
      <OverviewSection
        {...base}
        overview={overview({ aiStatus: "not_configured" })}
      />
    );
    expect(
      screen.getByText(/AI analysis is not configured/)
    ).toBeInTheDocument();
  });

  it("separates open work from linked history using the API numbers", () => {
    render(<OverviewSection {...base} overview={overview()} />);
    expect(screen.getByText("Open issues").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("Older issues").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Explicit links").nextSibling).toHaveTextContent(
      "3"
    );
    expect(screen.getByText("Commits").nextSibling).toHaveTextContent("4");
  });

  it("shows how many open issues were imported of those GitHub lists", () => {
    const o = overview();
    o.status.latestJob = {
      id: "j",
      status: "completed",
      mode: "full",
      error: null,
      startedAt: "",
      finishedAt: "",
      resources: {
        issues: {
          status: "ok",
          count: 3,
          discovered: 140,
          note: "Showing the 3 most recently updated of 140 open on GitHub.",
        },
      },
    };
    render(<OverviewSection {...base} overview={o} />);
    expect(screen.getByText("Open issues").nextSibling).toHaveTextContent(
      "3 of 140"
    );
    expect(
      screen.getByText(/Showing the 3 most recently updated of 140 open/)
    ).toBeInTheDocument();
  });

  it("computes the headline numbers from the counts it is given", () => {
    render(
      <OverviewSection
        {...base}
        decisions={[decision]}
        overview={overview({ aiStatus: "completed" }, 1)}
      />
    );
    expect(screen.getByText("Decisions recorded")).toBeInTheDocument();
    expect(screen.getByText("Use approach X")).toBeInTheDocument();
  });
});

describe("PrSection", () => {
  it("says why nothing matched", () => {
    render(
      <PrSection
        prs={[]}
        scanned={12}
        decisions={[decision]}
        onOpenDecision={vi.fn()}
      />
    );
    expect(
      screen.getByText(/None of the 12 most recent pull requests/)
    ).toBeInTheDocument();
  });

  it("shows matched decisions with the reason and the files", () => {
    render(
      <PrSection
        scanned={5}
        decisions={[decision]}
        onOpenDecision={vi.fn()}
        prs={[
          {
            prNumber: 12,
            title: "Touch a.ts",
            author: "zed",
            date: "2024-02-01T00:00:00Z",
            status: "open",
            url: "https://github.com/acme/widgets/pull/12",
            changedFiles: ["src/a.ts"],
            matches: [
              {
                decisionId: "DEC-001",
                decisionTitle: "Use approach X",
                decisionStatus: "REJECTED",
                matchedFiles: ["src/a.ts"],
                relationship: "direct",
                reason: "This PR changes src/a.ts",
                sources: [],
              },
            ],
          },
        ]}
      />
    );
    expect(screen.getByText(/This PR changes src\/a.ts/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/Rejected/);
  });
});
