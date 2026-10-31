import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { Octokit } from "octokit";
import {
  getRequestStats,
  logRequestSummary,
  requestTiming,
  resetRequestStats,
  timingEnabled,
} from "../src/modules/github/github.timing";

const TimedOctokit = Octokit.plugin(requestTiming);

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const client = (fetch: typeof globalThis.fetch) =>
  new TimedOctokit({
    auth: "ghp_secret_token_value",
    request: { fetch },
    throttle: { enabled: false },
    retry: { enabled: false },
  });

let logs: string[];
const original = process.env.ANALYSIS_TIMING;

beforeEach(() => {
  logs = [];
  mock.method(console, "log", (...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  resetRequestStats();
});

afterEach(() => {
  mock.restoreAll();
  if (original === undefined) delete process.env.ANALYSIS_TIMING;
  else process.env.ANALYSIS_TIMING = original;
});

describe("ANALYSIS_TIMING flag", () => {
  it("is off unless set to a truthy value", () => {
    for (const v of [undefined, "", "0", "false", "off"]) {
      if (v === undefined) delete process.env.ANALYSIS_TIMING;
      else process.env.ANALYSIS_TIMING = v;
      assert.equal(timingEnabled(), false, `value ${String(v)}`);
    }
    process.env.ANALYSIS_TIMING = "1";
    assert.equal(timingEnabled(), true);
  });
});

describe("request timing plugin", () => {
  it("records and logs nothing when the flag is off, and returns the response unchanged", async () => {
    delete process.env.ANALYSIS_TIMING;
    const gh = client(async () => json({ id: 7, full_name: "acme/widgets" }));
    const res = await gh.rest.repos.get({ owner: "acme", repo: "widgets" });
    assert.equal(res.status, 200);
    assert.equal(res.data.id, 7);
    assert.equal(getRequestStats().size, 0);
    assert.deepEqual(logs, []);
    logRequestSummary("off");
    assert.deepEqual(logs, []);
  });

  it("counts requests per endpoint and logs status and rate-limit headers", async () => {
    process.env.ANALYSIS_TIMING = "1";
    const gh = client(async () =>
      json([], 200, {
        "x-ratelimit-remaining": "4990",
        "x-ratelimit-reset": "1700000000",
      })
    );
    await gh.rest.issues.listForRepo({ owner: "acme", repo: "widgets" });
    await gh.rest.issues.listForRepo({ owner: "acme", repo: "widgets" });
    await gh.rest.pulls.list({ owner: "acme", repo: "widgets" });

    const stats = getRequestStats();
    assert.equal(stats.get("GET /repos/{owner}/{repo}/issues")?.count, 2);
    assert.equal(stats.get("GET /repos/{owner}/{repo}/pulls")?.count, 1);
    assert.match(logs[0], /GET \/repos\/\{owner\}\/\{repo\}\/issues 200 \d+ms remaining=4990 reset=1700000000/);
  });

  it("never logs credentials", async () => {
    process.env.ANALYSIS_TIMING = "1";
    const gh = client(async () => json({}));
    await gh.rest.repos.get({ owner: "acme", repo: "widgets" });
    assert.ok(logs.length > 0);
    assert.ok(
      logs.every((l) => !l.includes("ghp_secret_token_value")),
      logs.join("\n")
    );
  });

  it("counts a failed request, logs retry-after, and rethrows the original error", async () => {
    process.env.ANALYSIS_TIMING = "1";
    const gh = client(async () =>
      json({ message: "rate limited" }, 403, {
        "retry-after": "30",
        "x-ratelimit-remaining": "0",
      })
    );
    await assert.rejects(
      () => gh.rest.repos.get({ owner: "acme", repo: "widgets" }),
      (err: { status?: number }) => err.status === 403
    );
    const s = getRequestStats().get("GET /repos/{owner}/{repo}");
    assert.equal(s?.count, 1);
    assert.equal(s?.errors, 1);
    assert.match(logs[0], / 403 \d+ms remaining=0 retry-after=30/);
  });

  it("summarises totals per endpoint, then resets", async () => {
    process.env.ANALYSIS_TIMING = "1";
    const gh = client(async () => json([]));
    await gh.rest.issues.listForRepo({ owner: "acme", repo: "widgets" });
    await gh.rest.issues.listForRepo({ owner: "acme", repo: "widgets" });
    logs.length = 0;

    logRequestSummary("acme/widgets sync");
    assert.match(logs[0], /acme\/widgets sync: 2 request\(s\), 0 failed/);
    assert.match(logs[1], /\s2\s+GET \/repos\/\{owner\}\/\{repo\}\/issues/);
    assert.equal(getRequestStats().size, 0);
  });
});
