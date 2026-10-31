import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { InvestigatePanel, type InvestigationDto } from "./InvestigatePanel";

// Node's built-in localStorage global shadows jsdom's and is undefined without a backing file.
vi.stubGlobal("localStorage", {
  getItem: () => "session-token",
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

const base = (over: Partial<InvestigationDto>): InvestigationDto => ({
  id: "inv-1",
  status: "queued",
  source: { number: 12 },
  linked: [],
  linkedNotFollowed: 0,
  cacheHit: null,
  decisionsSaved: 0,
  ...over,
});

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
});

const submit = (value: string) => {
  fireEvent.change(screen.getByLabelText("Issue or pull request URL or number"), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: "Investigate" }));
};

describe("InvestigatePanel", () => {
  it("starts an investigation, polls real status, and shows the result with links", async () => {
    const onSaved = vi.fn();
    fetchMock
      .mockResolvedValueOnce(reply({ investigation: base({ status: "queued" }) }, 202))
      .mockResolvedValueOnce(
        reply({
          investigation: base({
            status: "done",
            source: { number: 12, kind: "issue", title: "Pick a cache", url: "https://github.com/acme/widgets/issues/12" },
            linked: [{ number: 4, kind: "issue", url: "https://github.com/acme/widgets/issues/4" }],
            linkedNotFollowed: 2,
            cacheHit: false,
            decisionsSaved: 3,
          }),
        })
      );

    render(<InvestigatePanel slug="widgets" repoFullName="acme/widgets" onDecisionsSaved={onSaved} pollMs={5} />);
    submit("#12");

    expect(await screen.findByText("Done")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/projects\/widgets\/investigations$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ input: "#12" });
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer session-token");
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/investigations\/inv-1$/);

    expect(screen.getByRole("link", { name: /#12 Pick a cache/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/issues/12"
    );
    expect(screen.getByRole("link", { name: "Issue #4" })).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/issues/4"
    );
    expect(screen.getByText(/3 decisions saved/)).toBeInTheDocument();
    expect(screen.getByText(/2 more linked threads were not/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("shows the finished result: summary, decisions and the conversation", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        {
          investigation: base({
            status: "partial",
            error: "Decision analysis failed: OpenRouter's daily limit for free models is used up.",
            result: {
              thread: {
                kind: "issue", number: 12, title: "Pick a cache", url: "https://github.com/acme/widgets/issues/12", state: "open", itemCount: 1,
                items: [{ ref: "S1", sourceType: "issue", author: "alice", text: "Use Redis?", url: "https://github.com/acme/widgets/issues/12", at: null }],
              },
              summary: { overview: "Alice asks about Redis.", dropped: 0, points: [] },
              decisions: [],
            },
          }),
        },
        202
      )
    );
    render(<InvestigatePanel slug="widgets" repoFullName="acme/widgets" pollMs={5} />);
    submit("#12");
    expect(await screen.findByText("Partly done")).toBeInTheDocument();
    expect(screen.getByText(/daily limit for free models is used up/)).toBeInTheDocument();
    expect(screen.getByText(/Alice asks about Redis\./)).toBeInTheDocument();
    expect(screen.getByText(/Full conversation from GitHub \(1 message\)/)).toBeInTheDocument();
  });

  it("says when the stored analysis was reused", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ investigation: base({ status: "done", cacheHit: true, source: { number: 12 } }) }, 202)
    );
    render(<InvestigatePanel slug="widgets" repoFullName="acme/widgets" pollMs={5} />);
    submit("#12");
    expect(await screen.findByText(/stored analysis was reused/)).toBeInTheDocument();
  });

  it("shows a rate-limit pause with GitHub's wait time, and stops polling", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ investigation: base({ status: "rate_limited", retryAfterSeconds: 30, error: "GitHub rate limit reached." }) }, 202)
    );
    render(<InvestigatePanel slug="widgets" repoFullName="acme/widgets" pollMs={5} />);
    submit("#12");
    expect(await screen.findByText("Paused by GitHub's rate limit")).toBeInTheDocument();
    expect(screen.getByText(/wait about 30 seconds/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the server's message when the input is rejected", async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: "Enter an issue or pull request of acme/widgets." }, 400));
    render(<InvestigatePanel slug="widgets" repoFullName="acme/widgets" pollMs={5} />);
    submit("not a ref");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter an issue or pull request of acme/widgets.");
  });
});
