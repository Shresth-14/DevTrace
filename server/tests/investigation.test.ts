import "../src/tests/setup-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseSourceInput } from "../src/modules/investigation/investigation.input";
import { Octokit } from "octokit";
import { classifyGithubError, rateLimitInfo } from "../src/modules/investigation/investigation.errors";
import {
  InvestigationService,
  type Investigation,
  type InvestigationDb,
  type ThreadDecision,
} from "../src/modules/investigation/investigation.service";
import type { ThreadItem, ThreadKind, ThreadUnit } from "../src/modules/decisions/decision.types";
import { isAutomated } from "../src/modules/decisions/decision.units";
import { validateSummary } from "../src/modules/investigation/investigation.summary";
import { HttpError } from "../src/utils/http-error";
import { AiUpstreamError } from "../src/modules/ai/ai.types";
import { runSync } from "../src/modules/github/sync/github.sync.runner";
import {
  QuestionService,
  buildClaims,
  questionTerms,
  rankCandidates,
  type QuestionDb,
  type StoredDecision,
  type StoredThread,
} from "../src/modules/investigation/investigation.question";
import { baseData, createFakeGitHub, type FakeOptions } from "./helpers/fake-github";
import { MemoryStore } from "./helpers/memory-store";

const repo = { owner: "acme", repo: "widgets" };
const project = { id: "p1", ...repo };

/** Builds analysable threads from what the importer stored in the memory store. */
function memoryDb(store: MemoryStore): InvestigationDb & {
  states: Map<string, { status: string; contentHash: string; version: string }>;
} {
  const states = new Map<string, { status: string; contentHash: string; version: string }>();
  const unit = (kind: ThreadKind, number: number): ThreadUnit | null => {
    const row = kind === "issue" ? store.issues.get(number) : store.pullRequests.get(number);
    if (!row) return null;
    const comments = [...(kind === "issue" ? store.issueComments : store.prComments).values()]
      .filter((c) => c.parentNumber === number)
      .sort((a, b) => (a.githubId < b.githubId ? -1 : 1));
    const items = [
      { key: String(number), text: row.body ?? "", at: row.createdAtGh },
      ...comments.map((c) => ({ key: String(c.githubId), text: c.body ?? "", at: c.createdAtGh })),
    ]
      .filter((i) => i.text.trim())
      .map((i, n) => ({
        ref: `S${n + 1}`,
        sourceType: (kind === "issue" ? "issue" : "pull_request") as "issue",
        sourceKey: i.key,
        author: "alice",
        text: i.text,
        url: row.url,
        at: i.at,
      }));
    return {
      kind,
      number,
      title: row.title,
      url: row.url,
      updatedAt: row.updatedAtGh,
      items,
      files: [],
      hash: createHash("sha1").update(JSON.stringify(items.map((i) => [i.sourceKey, i.text]))).digest("hex"),
      state: row.state,
      reason: "referenced",
      linkedFrom: [],
    };
  };
  return {
    states,
    loadUnit: async (_p, kind, number) => unit(kind, number),
    getUnitState: async (_p, kind, number) => states.get(`${kind}:${number}`) ?? null,
    saveUnitState: async (_p, kind, number, s) => {
      states.set(`${kind}:${number}`, { status: s.status, contentHash: s.contentHash, version: s.version });
    },
    repoPaths: async () => new Set<string>(),
    decisionsForThread: async () => [],
  };
}

/**
 * `calls` counts decision-extraction requests only, so the existing "how many model calls"
 * assertions keep their meaning; `summaryCalls` counts thread-summary requests.
 */
function fakeLlm(configured = true) {
  const calls: unknown[] = [];
  const summaryCalls: unknown[] = [];
  return {
    calls,
    summaryCalls,
    isConfigured: () => configured,
    getModel: () => "fake-open-model",
    chat: async (messages: { role: string; content: string }[]) => {
      if (messages[0].content.includes("summarise ONE GitHub thread")) {
        summaryCalls.push(messages);
        const first = /\[S1\][^\n]*\n([^\n]+)/.exec(messages[1].content)?.[1] ?? "";
        return {
          content: JSON.stringify({
            overview: "A thread about " + first.slice(0, 10),
            points: [{ kind: "problem", text: "The thread opens.", source_ids: ["S1"], quote: first.slice(0, 20) }],
          }),
          model: "fake-open-model",
        };
      }
      calls.push(messages);
      return { content: JSON.stringify({ decisions: [] }), model: "fake-open-model" };
    },
  };
}

function setup(opts: { maxLinked?: number; configured?: boolean } = {}) {
  const store = new MemoryStore();
  const db = memoryDb(store);
  const llm = fakeLlm(opts.configured ?? true);
  const service = new InvestigationService({
    db,
    store,
    llm,
    decisions: { save: async (_p, c) => c.length },
    maxLinked: opts.maxLinked,
  });
  return { store, db, llm, service };
}

/** Starts an investigation and waits for its background run to finish. */
async function investigate(
  service: InvestigationService,
  input: string,
  data = baseData(),
  fake: FakeOptions = {}
): Promise<{ inv: Investigation; calls: string[] }> {
  const gh = createFakeGitHub(data, { pageSize: 100, ...fake });
  const started = service.start({ project, input, octokit: async () => gh.octokit() });
  for (let i = 0; i < 200; i++) {
    const inv = service.get(started.id, project.id)!;
    if (!["queued", "fetching", "analysing"].includes(inv.status)) {
      return { inv, calls: gh.calls };
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("investigation did not finish");
}

describe("parseSourceInput", () => {
  it("accepts issue, PR and discussion URLs of this repository", () => {
    assert.deepEqual(parseSourceInput("https://github.com/acme/widgets/issues/12", repo), { number: 12, kind: "issue" });
    assert.deepEqual(parseSourceInput("https://github.com/Acme/Widgets/pull/7/files", repo), { number: 7, kind: "pull_request" });
    assert.deepEqual(parseSourceInput("https://github.com/acme/widgets/discussions/3", repo), { number: 3, kind: "discussion" });
  });

  it("accepts owner/repo#N, #N and a bare number", () => {
    assert.deepEqual(parseSourceInput("acme/widgets#42", repo), { number: 42 });
    assert.deepEqual(parseSourceInput("#42", repo), { number: 42 });
    assert.deepEqual(parseSourceInput(" 42 ", repo), { number: 42 });
  });

  it("rejects other repositories and anything that is not a reference", () => {
    for (const bad of [
      "https://github.com/other/widgets/issues/1",
      "other/repo#1",
      "https://gitlab.com/acme/widgets/issues/1",
      "#0",
      "issue twelve",
      "",
      "12abc",
    ]) {
      assert.equal(parseSourceInput(bad, repo), null, bad);
    }
  });
});

describe("rateLimitInfo", () => {
  it("recognises primary and secondary limits but not permission errors", () => {
    const err = (status: number, headers: Record<string, string> = {}, message = "") => ({
      status,
      message,
      response: { headers },
    });
    assert.deepEqual(rateLimitInfo(err(403, { "retry-after": "30" })), { retryAfterSeconds: 30 });
    assert.deepEqual(rateLimitInfo(err(429)), {});
    assert.deepEqual(
      rateLimitInfo(err(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1060" }), 1_000_000),
      { retryAfterSeconds: 60 }
    );
    assert.deepEqual(rateLimitInfo({ errors: [{ type: "RATE_LIMITED" }] }), {});
    assert.equal(rateLimitInfo(err(403, {}, "Resource not accessible by integration")), null);
    assert.equal(rateLimitInfo(err(404)), null);
  });
});

describe("InvestigationService", () => {
  it("rejects bad input before touching GitHub", () => {
    const { service } = setup();
    const octokit = async () => {
      throw new Error("must not be called");
    };
    assert.throws(() => service.start({ project, input: "not a ref", octokit }), (e) => e instanceof HttpError && e.status === 400);
    assert.throws(
      () => service.start({ project, input: "https://github.com/acme/widgets/discussions/1", octokit }),
      (e) => e instanceof HttpError && e.status === 422
    );
    const off = setup({ configured: false });
    assert.throws(() => off.service.start({ project, input: "#1", octokit }), (e) => e instanceof HttpError && e.status === 503);
  });

  it("fetches one issue and its explicit references, then analyses only that issue", async () => {
    const { service, store, llm } = setup();
    const { inv, calls } = await investigate(service, "#1");
    assert.equal(inv.status, "done", inv.error);
    assert.equal(inv.source.kind, "issue");
    assert.equal(inv.source.title, "Issue 1");
    assert.deepEqual(inv.linked.map((l) => l.number), [4]);
    assert.equal(llm.calls.length, 1, "one model call, for the requested issue only");
    assert.ok(store.issues.has(1) && store.issues.has(4));
    assert.ok(!store.issues.has(2), "unrelated issues are not fetched");
    assert.ok(calls.length <= 3, `few GitHub requests: ${calls.join(", ")}`);
  });

  it("fetches a PR with its reviews and files, and follows its explicit reference", async () => {
    const { service, store, llm } = setup();
    const { inv } = await investigate(service, "https://github.com/acme/widgets/pull/11");
    assert.equal(inv.status, "done", inv.error);
    assert.equal(inv.source.kind, "pull_request");
    assert.deepEqual(inv.linked.map((l) => [l.number, l.kind]), [[9, "pull_request"]]);
    assert.ok(store.pullRequests.has(11) && store.pullRequests.has(9));
    assert.ok([...store.prFiles.values()].some((f) => f.prNumber === 11), "changed files stored");
    assert.ok(!store.pullRequests.has(10), "unrelated PRs are not fetched");
    assert.equal(llm.calls.length, 1);
  });

  it("follows at most maxLinked explicit references, never the thread itself", async () => {
    const data = baseData();
    const issue1 = (data.issues as { number: number; body: string }[]).find((i) => i.number === 1)!;
    issue1.body = "Relates to #1, #2, #3, #4 and #5.";
    const { service } = setup({ maxLinked: 2 });
    const { inv } = await investigate(service, "#1", data);
    assert.equal(inv.status, "done", inv.error);
    assert.equal(inv.linked.length, 2);
    assert.equal(inv.linkedNotFollowed, 2);
    assert.ok(inv.linked.every((l) => l.number !== 1));
  });

  it("reuses the stored analysis when the content hash is unchanged, and re-analyses when it changes", async () => {
    const { service, llm } = setup();
    const first = await investigate(service, "#1");
    assert.equal(first.inv.cacheHit, false);
    assert.equal(llm.calls.length, 1);

    const second = await investigate(service, "#1");
    assert.equal(second.inv.status, "done");
    assert.equal(second.inv.cacheHit, true);
    assert.equal(llm.calls.length, 1, "no model call for an unchanged thread");

    const data = baseData();
    const issue1 = (data.issues as { number: number; body: string; updated_at: string }[]).find((i) => i.number === 1)!;
    issue1.body = "Body 1, edited: we chose approach Y.";
    issue1.updated_at = "2025-01-01T00:00:00Z";
    const third = await investigate(service, "#1", data);
    assert.equal(third.inv.cacheHit, false);
    assert.equal(llm.calls.length, 2, "an edited thread is analysed again");
  });

  it("reports a rate-limited GitHub response as rate_limited, not done", async () => {
    const { service, llm } = setup();
    const { inv } = await investigate(service, "#1", baseData(), {
      failures: [
        {
          match: /\/graphql$/,
          status: 403,
          headers: { "retry-after": "30", "x-ratelimit-remaining": "0" },
        },
      ],
    });
    assert.equal(inv.status, "rate_limited");
    assert.equal(inv.retryAfterSeconds, 30);
    assert.equal(llm.calls.length, 0);
  });

  it("reports a missing thread as not_found", async () => {
    const { service } = setup();
    const { inv } = await investigate(service, "#999");
    assert.equal(inv.status, "not_found");
    assert.match(inv.error ?? "", /not found/);
  });

  it("only returns an investigation to its own project", async () => {
    const { service } = setup();
    const { inv } = await investigate(service, "#1");
    assert.ok(service.get(inv.id, "p1"));
    assert.equal(service.get(inv.id, "someone-elses-project"), null);
  });
});

// ---------------------------------------------------------------------------
// Phase 2: rate-limit safety
// ---------------------------------------------------------------------------

/** Waits until every listed investigation has left the active states. */
async function settle(service: InvestigationService, ids: string[]) {
  for (let i = 0; i < 400; i++) {
    const all = ids.map((id) => service.get(id, project.id)!);
    if (all.every((inv) => !["queued", "fetching", "analysing"].includes(inv.status))) {
      return all;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("investigations did not finish");
}

describe("classifyGithubError", () => {
  it("maps failures to distinct statuses", () => {
    const err = (status: number, message = "", headers: Record<string, string> = {}) => ({
      status,
      message,
      response: { headers },
    });
    assert.equal(classifyGithubError(err(403, "", { "retry-after": "5" })).status, "rate_limited");
    assert.equal(classifyGithubError(err(401, "Bad credentials")).status, "forbidden");
    assert.equal(classifyGithubError(err(403, "Resource not accessible by integration")).status, "forbidden");
    assert.equal(classifyGithubError(err(404, "Not Found")).status, "not_found");
    assert.equal(classifyGithubError(err(500, "fetch failed")).status, "network");
    assert.equal(classifyGithubError(new TypeError("fetch failed")).status, "network");
    assert.equal(classifyGithubError(err(502, "Bad Gateway")).status, "failed");
  });
});

describe("InvestigationService rate-limit safety", () => {
  it("shares one run, and its GitHub calls, between concurrent requests for the same thread", async () => {
    const single = setup();
    const alone = await investigate(single.service, "#1");

    const { service, llm } = setup();
    const gh = createFakeGitHub(baseData(), { pageSize: 100, latencyMs: { rest: 10, graphql: 10 } });
    const octokit = async () => gh.octokit();
    const a = service.start({ project, input: "#1", octokit });
    const b = service.start({ project, input: "https://github.com/acme/widgets/issues/1", octokit });
    assert.equal(a.id, b.id, "the second request joins the first run");
    const [done] = await settle(service, [a.id]);
    assert.equal(done.status, "done");
    assert.equal(gh.calls.length, alone.calls.length, "no duplicate GitHub requests");
    assert.equal(llm.calls.length, 1);
  });

  it("caps concurrent investigations at GITHUB_MAX_CONCURRENCY", async () => {
    const before = process.env.GITHUB_MAX_CONCURRENCY;
    process.env.GITHUB_MAX_CONCURRENCY = "2";
    try {
      const { service } = setup();
      const gh = createFakeGitHub(baseData(), { pageSize: 100, latencyMs: { rest: 15, graphql: 15 } });
      const octokit = async () => gh.octokit();
      const ids = ["#1", "#2", "#3", "#4", "#5"].map((input) => service.start({ project, input, octokit }).id);
      const results = await settle(service, ids);
      assert.ok(results.every((r) => r.status === "done" || r.status === "partial"), JSON.stringify(results.map((r) => r.status)));
      assert.ok(gh.stats.maxInFlight <= 2, `saw ${gh.stats.maxInFlight} GitHub requests in flight`);
    } finally {
      if (before === undefined) delete process.env.GITHUB_MAX_CONCURRENCY;
      else process.env.GITHUB_MAX_CONCURRENCY = before;
    }
  });

  it("does not retry a rate-limited 403 with retry-after, and reports rate_limited", async () => {
    const { service } = setup();
    const { inv, calls } = await investigate(service, "#1", baseData(), {
      failures: [{ match: /\/graphql$/, status: 403, headers: { "retry-after": "30" } }],
    });
    assert.equal(inv.status, "rate_limited");
    assert.equal(inv.retryAfterSeconds, 30);
    assert.equal(calls.filter((c) => c.includes("/graphql")).length, 1, calls.join(", "));
  });

  it("reports forbidden and not_found from GitHub as their own statuses", async () => {
    const forbidden = await investigate(setup().service, "#1", baseData(), {
      failures: [{ match: /\/graphql$/, status: 401 }],
    });
    assert.equal(forbidden.inv.status, "forbidden");
    const missing = await investigate(setup().service, "#1", baseData(), {
      failures: [{ match: /\/graphql$/, status: 404 }],
    });
    assert.equal(missing.inv.status, "not_found");
  });

  it("reports a request that never reached GitHub as network", async () => {
    const { service } = setup();
    const offline = new Octokit({
      request: {
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      },
      throttle: { enabled: false },
      retry: { enabled: false },
    });
    const started = service.start({ project, input: "#1", octokit: async () => offline });
    const [inv] = await settle(service, [started.id]);
    assert.equal(inv.status, "network");
  });

  it("reports partial, not done, when linked threads cannot be fetched", async () => {
    const { service, llm } = setup();
    const gh = createFakeGitHub(baseData(), { pageSize: 100 });
    let graphqlCalls = 0;
    const octokit = async () => {
      const o = gh.octokit();
      o.hook.wrap("request", async (request, options) => {
        if (String(options.url).endsWith("/graphql") && ++graphqlCalls === 2) {
          throw Object.assign(new Error("Bad Gateway"), { status: 502 });
        }
        return request(options);
      });
      return o;
    };
    const started = service.start({ project, input: "#1", octokit });
    const [inv] = await settle(service, [started.id]);
    assert.equal(inv.status, "partial");
    assert.match(inv.error ?? "", /Linked threads could not be fetched/);
    assert.deepEqual(inv.linked, []);
    assert.equal(llm.calls.length, 1, "the requested thread is still analysed");
  });
});

// ---------------------------------------------------------------------------
// Phase 3: repository questions
// ---------------------------------------------------------------------------

function memoryQuestionDb(store: MemoryStore, decisions: StoredDecision[] = []): QuestionDb {
  const threads = (): StoredThread[] => [
    ...[...store.issues.values()].map((r) => ({
      kind: "issue" as const, number: r.number, title: r.title, body: r.body ?? null,
      labels: (r.labels as string[]) ?? [], url: r.url, updatedAt: r.updatedAtGh,
    })),
    ...[...store.pullRequests.values()].map((r) => ({
      kind: "pull_request" as const, number: r.number, title: r.title, body: r.body ?? null,
      labels: (r.labels as string[]) ?? [], url: r.url, updatedAt: r.updatedAtGh,
    })),
  ];
  return {
    discover: async (_p, terms) => ({
      threads: threads(),
      files: [...store.prFiles.values()]
        .filter((f) => terms.some((t) => f.filename.toLowerCase().includes(t)))
        .map((f) => ({ prNumber: f.prNumber, filename: f.filename })),
      decisionThreads: decisions
        .filter((d) => terms.some((t) => `${d.title} ${d.summary}`.toLowerCase().includes(t)))
        .flatMap((d) => d.evidence.map((e) => ({ kind: e.threadKind, number: e.threadNumber }))),
    }),
    decisionsForThreads: async (_p, ts) =>
      decisions.filter((d) =>
        d.evidence.some((e) => ts.some((t) => t.kind === e.threadKind && t.number === e.threadNumber))
      ),
  };
}

const thread = (over: Partial<StoredThread>): StoredThread => ({
  kind: "issue", number: 1, title: "", body: null, labels: [], url: "u", updatedAt: new Date(0), ...over,
});

describe("questionTerms", () => {
  it("keeps the meaningful words and drops filler", () => {
    const terms = questionTerms("Why was Redis rejected for the session cache?");
    assert.ok(terms.includes("redis") && terms.includes("session") && terms.includes("cache"));
    for (const w of ["why", "was", "for", "the"]) assert.ok(!terms.includes(w), w);
    assert.deepEqual(questionTerms("Why was it?"), []);
  });
});

describe("rankCandidates", () => {
  it("ranks title over label over description, adds file paths and decisions, and drops non-matches", () => {
    const rows = {
      threads: [
        thread({ number: 1, title: "Adopt Redis for sessions" }),
        thread({ number: 2, title: "Caching", labels: ["redis"] }),
        thread({ number: 3, title: "Misc", body: "maybe redis later" }),
        thread({ number: 4, title: "Docs typo" }),
        thread({ kind: "pull_request", number: 10, title: "Session store" }),
      ],
      files: [{ prNumber: 10, filename: "server/src/cache/redis.ts" }],
      decisionThreads: [{ kind: "issue", number: 3 }],
    };
    const ranked = rankCandidates(["redis"], rows);
    // #3: description (1) + cited by a matching decision (3) = 4; #1: title (3);
    // #2: label (2); #10: file path (1)
    assert.deepEqual(ranked.map((c) => c.number), [3, 1, 2, 10]);
    assert.deepEqual(ranked.map((c) => c.score), [4, 3, 2, 1]);
    assert.ok(ranked.every((c) => c.number !== 4), "no match, no candidate");
    assert.ok(ranked.find((c) => c.number === 10)!.reasons.includes("file: server/src/cache/redis.ts"));
    assert.equal(rankCandidates(["redis"], rows, 2).length, 2);
  });
});

describe("buildClaims", () => {
  it("marks a decision without stored evidence as unresolved, never as a decision", () => {
    const claims = buildClaims(
      [
        { id: "a", seq: 1, title: "Use Postgres", summary: "", status: "accepted",
          evidence: [{ threadKind: "issue", threadNumber: 1, sourceType: "issue", sourceKey: "1", url: "u", quote: "we use postgres" }] },
        { id: "b", seq: 2, title: "Redis is rejected", summary: "", status: "rejected", evidence: [] },
      ],
      ["redis"]
    );
    const redis = claims.find((c) => c.decisionId === "b")!;
    assert.equal(redis.status, "unresolved");
    assert.equal(redis.supported, false);
    assert.equal(claims[0].decisionId, "b", "ordered by relevance to the question");
    const pg = claims.find((c) => c.decisionId === "a")!;
    assert.equal(pg.status, "accepted");
    assert.equal(pg.ref, "DEC-001");
    assert.equal(pg.sources[0].url, "u");
  });
});

describe("QuestionService", () => {
  const seeded = async () => {
    const data = baseData();
    const issue2 = (data.issues as { number: number; title: string }[]).find((i) => i.number === 2)!;
    issue2.title = "Use Redis for the session cache";
    const store = new MemoryStore();
    const seed = createFakeGitHub(data, { pageSize: 100 });
    await runSync({
      octokit: seed.octokit(),
      store,
      project: { id: project.id, owner: "acme", repo: "widgets", defaultBranch: "main" },
      mode: "full",
      now: () => new Date("2024-06-01T00:00:00Z"),
    });
    return { data, store };
  };

  it("discovers candidates from stored data with zero GitHub calls", async () => {
    const { store } = await seeded();
    const gh = createFakeGitHub(baseData(), { pageSize: 100 });
    const { service: inv } = setup();
    const questions = new QuestionService(memoryQuestionDb(store), inv);
    const { candidates } = await questions.discover(project.id, "Why did we choose Redis for sessions?");
    assert.deepEqual(candidates.map((c) => c.number), [2]);
    assert.equal(gh.calls.length, 0, "discovery never calls GitHub");
  });

  it("answers from the top candidates only, citing stored evidence", async () => {
    const { data, store } = await seeded();
    const decisions: StoredDecision[] = [
      {
        id: "d1", seq: 7, title: "Redis chosen as session cache", summary: "Sessions move to Redis.", status: "accepted",
        evidence: [{ threadKind: "issue", threadNumber: 2, sourceType: "issue", sourceKey: "2",
          url: "https://github.com/acme/widgets/issues/2", quote: "Body 2" }],
      },
      {
        id: "d2", seq: 8, title: "Unrelated", summary: "", status: "accepted",
        evidence: [{ threadKind: "issue", threadNumber: 3, sourceType: "issue", sourceKey: "3", url: "u3", quote: "Body 3" }],
      },
    ];
    const llm = fakeLlm();
    const db = memoryDb(store);
    const inv = new InvestigationService({ db, store, llm, decisions: { save: async () => 0 } });
    const questions = new QuestionService(memoryQuestionDb(store, decisions), inv);
    const gh = createFakeGitHub(data, { pageSize: 100 });

    const asked = questions.ask({ project, question: "Why Redis for the session cache?", octokit: async () => gh.octokit() });
    let q = questions.get(asked.id, project.id)!;
    for (let i = 0; i < 400 && ["discovering", "investigating"].includes(q.status); i++) {
      await new Promise((r) => setTimeout(r, 5));
      q = questions.get(asked.id, project.id)!;
    }
    assert.equal(q.status, "done", q.note);
    assert.deepEqual(q.investigations.map((i) => i.number), [2], "only the matching thread is investigated");
    assert.deepEqual(q.claims.map((c) => c.ref), ["DEC-007"], "claims come from the investigated thread only");
    assert.equal(q.claims[0].sources[0].url, "https://github.com/acme/widgets/issues/2");
    assert.ok(gh.calls.length <= 3, `GitHub calls only for the one candidate: ${gh.calls.join(", ")}`);
  });

  it("says so plainly when nothing stored matches", async () => {
    const { store } = await seeded();
    const { service: inv } = setup();
    const questions = new QuestionService(memoryQuestionDb(store), inv);
    const asked = questions.ask({ project, question: "Why Kubernetes operators?", octokit: async () => { throw new Error("must not call GitHub"); } });
    let q = questions.get(asked.id, project.id)!;
    for (let i = 0; i < 100 && q.status === "discovering"; i++) {
      await new Promise((r) => setTimeout(r, 5));
      q = questions.get(asked.id, project.id)!;
    }
    assert.equal(q.status, "done");
    assert.deepEqual(q.claims, []);
    assert.match(q.note ?? "", /No stored issues or pull requests match/);
  });

  it("rejects an empty or filler-only question", () => {
    const { service: inv } = setup();
    const questions = new QuestionService(memoryQuestionDb(new MemoryStore()), inv);
    const octokit = async () => { throw new Error("unused"); };
    assert.throws(() => questions.ask({ project, question: "  ", octokit }), (e) => e instanceof HttpError && e.status === 400);
    assert.throws(() => questions.ask({ project, question: "Why was it?", octokit }), (e) => e instanceof HttpError && e.status === 400);
  });
});

// ---------------------------------------------------------------------------
// Result: conversation, evidence-cited summary, decisions
// ---------------------------------------------------------------------------

const item = (ref: string, text: string, over: Partial<ThreadItem> = {}): ThreadItem => ({
  ref, sourceType: "issue_comment", sourceKey: ref, author: "alice", text, url: `https://github.com/acme/widgets/issues/1#${ref}`,
  at: new Date("2024-01-02T00:00:00Z"), ...over,
});

describe("validateSummary", () => {
  const items = [item("S1", "We should cache sessions in Redis."), item("S2", "Redis adds ops cost; I prefer Postgres.", { author: "bob" })];

  it("keeps cited points with verified quotes and links every source", () => {
    const out = validateSummary(
      { overview: "Redis vs Postgres.", points: [{ kind: "objection", text: "Bob objects to Redis.", source_ids: ["S2"], quote: "Redis adds ops cost" }] },
      items
    );
    assert.equal(out.points.length, 1);
    assert.equal(out.points[0].quoteVerified, true);
    assert.equal(out.points[0].quote, "Redis adds ops cost");
    assert.deepEqual(out.points[0].sources.map((s) => [s.ref, s.author, s.url]), [["S2", "bob", "https://github.com/acme/widgets/issues/1#S2"]]);
  });

  it("replaces an invented quote with the real source text and flags it", () => {
    const out = validateSummary(
      { overview: "", points: [{ kind: "agreement", text: "Everyone agreed.", source_ids: ["S1"], quote: "We all unanimously agreed to ship it." }] },
      items
    );
    assert.equal(out.points[0].quoteVerified, false);
    assert.equal(out.points[0].quote, "We should cache sessions in Redis.");
  });

  it("drops points that cite nothing real, and unknown kinds become 'update'", () => {
    const out = validateSummary(
      {
        overview: "x",
        points: [
          { kind: "outcome", text: "Shipped.", source_ids: ["S99"], quote: "" },
          { kind: "outcome", text: "No sources.", source_ids: [], quote: "" },
          { kind: "weird", text: "Real.", source_ids: ["S1"], quote: "cache sessions" },
          "not an object",
        ],
      },
      items
    );
    assert.equal(out.points.length, 1);
    assert.equal(out.points[0].kind, "update");
    assert.equal(out.dropped, 3);
  });

  it("rejects a reply without a points array", () => {
    assert.throws(() => validateSummary({ overview: "x" }, items), /points/);
  });
});

describe("investigation result", () => {
  it("returns the full conversation, an evidence-cited summary and the decisions", async () => {
    const { service, db, llm } = setup();
    const decision: ThreadDecision = {
      id: "d1", code: "DEC-001", title: "Use Redis", summary: "Sessions move to Redis.", status: "accepted",
      reasoning: [{ category: "performance", explanation: "Faster." }], openQuestions: null, confidence: 0.8,
      alternatives: [{ title: "Postgres", proposedBy: "bob", reason: "Slower.", status: "rejected", chosenInstead: "Redis" }],
      evidence: [{ sourceType: "issue", author: "alice", quote: "Body 1", url: "https://github.com/acme/widgets/issues/1", at: null }],
    };
    db.decisionsForThread = async () => [decision];

    const { inv } = await investigate(service, "#1");
    assert.equal(inv.status, "done", inv.error);
    const r = inv.result!;
    assert.equal(r.thread.number, 1);
    assert.equal(r.thread.kind, "issue");
    assert.ok(r.thread.itemCount >= 2, "issue body plus its comments");
    assert.equal(r.thread.items[0].ref, "S1");
    assert.ok(r.thread.items.every((i) => i.url.startsWith("https://github.com/")));
    assert.ok(r.summary && r.summary.points.length === 1);
    assert.equal(r.summary!.points[0].quoteVerified, true);
    assert.deepEqual(r.decisions, [decision]);
    assert.equal(llm.summaryCalls.length, 1);
  });

  it("does not regenerate the summary for an unchanged thread, but does after an edit", async () => {
    const { service, llm } = setup();
    await investigate(service, "#1");
    await investigate(service, "#1");
    assert.equal(llm.summaryCalls.length, 1, "unchanged thread: summary reused");

    const data = baseData();
    const issue1 = (data.issues as { number: number; body: string; updated_at: string }[]).find((i) => i.number === 1)!;
    issue1.body = "Body 1, edited.";
    issue1.updated_at = "2025-01-01T00:00:00Z";
    await investigate(service, "#1", data);
    assert.equal(llm.summaryCalls.length, 2, "edited thread: new summary");
  });

  it("reports partial when the summary fails, yet still returns the conversation and decisions", async () => {
    const { service, llm } = setup();
    const chat = llm.chat;
    llm.chat = async (messages: { role: string; content: string }[]) => {
      if (messages[0].content.includes("summarise ONE GitHub thread")) throw new Error("summary model down");
      return chat(messages);
    };
    const { inv } = await investigate(service, "#1");
    assert.equal(inv.status, "partial");
    assert.match(inv.error ?? "", /Summary failed/);
    assert.equal(inv.result!.summary, null);
    assert.ok(inv.result!.summaryError);
    assert.ok(inv.result!.thread.items.length >= 2, "the real conversation is still shown");
  });

  it("reports partial when decision analysis fails, and still summarises", async () => {
    const { service, llm } = setup();
    const chat = llm.chat;
    llm.chat = async (messages: { role: string; content: string }[]) => {
      if (!messages[0].content.includes("summarise ONE GitHub thread")) throw new Error("extractor down");
      return chat(messages);
    };
    const { inv } = await investigate(service, "#1");
    assert.equal(inv.status, "partial");
    assert.match(inv.error ?? "", /Decision analysis failed/);
    assert.ok(inv.result!.summary);
  });
});

describe("daily model limit", () => {
  it("is not retried, skips the summary call, and is explained to the user", async () => {
    const { service, llm } = setup();
    let attempts = 0;
    llm.chat = async () => {
      attempts += 1;
      throw new AiUpstreamError("Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day", 429);
    };
    const { inv } = await investigate(service, "#1");
    assert.equal(attempts, 1, "one attempt: no retries, and no second call for the summary");
    assert.equal(inv.status, "partial");
    assert.match(inv.error ?? "", /Model daily limit reached/);
    assert.match(inv.result!.summaryError ?? "", /daily limit/);
    assert.ok(inv.result!.thread.items.length >= 2, "the real conversation is still shown");
  });
});

describe("isAutomated", () => {
  it("recognises app accounts GitHub reports without a [bot] suffix, and keeps real people", () => {
    for (const bot of ["vercel", "github-actions", "dependabot", "renovate", "netlify", "codecov-commenter", "dependabot[bot]", "release-bot", "VERCEL"]) {
      assert.equal(isAutomated(bot), true, bot);
    }
    for (const person of ["alice", "KatalKavya96", "Nakul-Jaglan", "vercel-fan", "my-github-actions-guru", null]) {
      assert.equal(isAutomated(person), false, String(person));
    }
  });
});
