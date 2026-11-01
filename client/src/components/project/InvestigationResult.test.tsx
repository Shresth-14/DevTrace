import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { InvestigationResult, type InvestigationResultDto } from "./InvestigationResult";

afterEach(cleanup);

// Test fixtures only; the app never ships records like these.
const url = (n: number) => `https://github.com/acme/widgets/issues/1#issuecomment-${n}`;

const base = (): InvestigationResultDto => ({
  thread: {
    kind: "issue",
    number: 1,
    title: "Pick a session cache",
    url: "https://github.com/acme/widgets/issues/1",
    state: "closed",
    itemCount: 2,
    items: [
      { ref: "S1", sourceType: "issue", author: "alice", text: "We should cache sessions in Redis.", url: url(0), at: "2024-01-02T00:00:00Z" },
      { ref: "S2", sourceType: "issue_comment", author: "bob", text: "Redis adds ops cost.\nI prefer Postgres.", url: url(2), at: "2024-01-03T00:00:00Z" },
    ],
  },
  summary: {
    overview: "Alice proposed Redis; Bob objected on cost.",
    dropped: 0,
    points: [
      {
        kind: "objection",
        text: "Bob objects to Redis.",
        quote: "Redis adds ops cost",
        quoteVerified: true,
        sources: [{ ref: "S2", sourceType: "issue_comment", author: "bob", url: url(2), at: "2024-01-03T00:00:00Z" }],
      },
    ],
  },
  decisions: [
    {
      id: "d1",
      code: "DEC-001",
      title: "Use Redis for sessions",
      summary: "Sessions move to Redis.",
      status: "accepted",
      reasoning: [{ category: "performance", explanation: "Faster reads." }],
      openQuestions: "Who runs it in production?",
      confidence: 0.8,
      alternatives: [{ title: "Postgres", proposedBy: "bob", reason: "Slower.", status: "rejected", chosenInstead: "Redis" }],
      evidence: [{ sourceType: "issue_comment", author: "alice", quote: "We should cache sessions in Redis.", url: url(0), at: "2024-01-02T00:00:00Z" }],
    },
  ],
});

describe("InvestigationResult", () => {
  it("shows what happened, with each point's quote and a link to the GitHub message", () => {
    render(<InvestigationResult result={base()} />);
    expect(screen.getByText(/Alice proposed Redis; Bob objected on cost\./)).toBeInTheDocument();
    expect(screen.getByText(/AI summary of the points below, not evidence itself/)).toBeInTheDocument();
    expect(screen.getByText("Objection")).toBeInTheDocument();
    expect(screen.getByText("Redis adds ops cost")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /@bob · Jan 3, 2024 · Comment/ });
    expect(link).toHaveAttribute("href", url(2));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("flags a quote the model did not reproduce exactly", () => {
    const r = base();
    r.summary!.points[0].quoteVerified = false;
    render(<InvestigationResult result={r} />);
    expect(screen.getByText(/the model's wording did not match it exactly/)).toBeInTheDocument();
  });

  it("shows decisions with status, reasoning, alternatives, open questions and linked evidence", () => {
    render(<InvestigationResult result={base()} />);
    expect(screen.getByRole("heading", { name: "Use Redis for sessions" })).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("DEC-001")).toBeInTheDocument();
    expect(screen.getByText(/model confidence 80%/)).toBeInTheDocument();
    expect(screen.getByText("Faster reads.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Postgres")).toBeInTheDocument();
    expect(screen.getByText(/Chosen instead: Redis/)).toBeInTheDocument();
    expect(screen.getByText("Who runs it in production?")).toBeInTheDocument();
    const decisions = screen.getByRole("region", { name: /Decisions found/ });
    expect(within(decisions).getByRole("link", { name: /@alice · Jan 2, 2024/ })).toHaveAttribute("href", url(0));
  });

  it("says plainly when there is no decision, instead of inventing one", () => {
    const r = base();
    r.decisions = [];
    render(<InvestigationResult result={r} />);
    expect(screen.getByText("Decisions found (0)")).toBeInTheDocument();
    expect(screen.getByText(/No technical decision was recorded for this thread/)).toBeInTheDocument();
  });

  it("shows the reason when no summary could be produced, and still lists the conversation", () => {
    const r = base();
    r.summary = null;
    r.summaryError = "Model daily limit reached.";
    render(<InvestigationResult result={r} />);
    expect(screen.getByText(/Model daily limit reached\./)).toBeInTheDocument();
    expect(screen.getByText(/The full conversation is below/)).toBeInTheDocument();
    expect(screen.getByText(/Full conversation from GitHub \(2 messages\)/)).toBeInTheDocument();
  });

  it("lists every message with its author, date and link, preserving line breaks", () => {
    const { container } = render(<InvestigationResult result={base()} />);
    const items = container.querySelectorAll("details li");
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent("@bob");
    expect(items[1].querySelector("p.whitespace-pre-wrap")?.textContent).toBe("Redis adds ops cost.\nI prefer Postgres.");
    expect(within(items[1] as HTMLElement).getByRole("link", { name: /Open on GitHub/ })).toHaveAttribute("href", url(2));
  });

  it("reports left-out unsupported points and a point list with no usable points", () => {
    const r = base();
    r.summary = { overview: "", points: [], dropped: 2 };
    render(<InvestigationResult result={r} />);
    expect(screen.getByText(/did not report any point that could be tied to a message/)).toBeInTheDocument();
    expect(screen.getByText(/2 points the model wrote without a real source were left out/)).toBeInTheDocument();
  });
});
