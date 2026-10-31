import "../src/tests/setup-env";
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

// config/env.ts reads these at import time, so set them before the dynamic import.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
process.env.GITHUB_APP_ID = "12345";
process.env.GITHUB_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n");

const realFetch = globalThis.fetch;
const requests: { url: string; auth: string | null }[] = [];
let tokenCounter = 0;

globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit
) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  );
  const headers = new Headers(init?.headers);
  requests.push({ url: url.pathname, auth: headers.get("authorization") });
  const json = (status: number, body: unknown) => {
    const res = new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
    Object.defineProperty(res, "url", { value: url.toString() });
    return res;
  };
  if (url.pathname === "/app/installations/777/access_tokens") {
    tokenCounter += 1;
    return json(201, {
      token: `ghs_installation_token_${tokenCounter}`,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      permissions: {},
      repository_selection: "all",
    });
  }
  if (url.pathname === "/repos/acme/widgets") return json(200, { id: 1 });
  return json(404, { message: "Not Found" });
}) as typeof fetch;

after(() => {
  globalThis.fetch = realFetch;
});

describe("GitHub App authentication", () => {
  it("exchanges the app JWT for an installation token and reuses it", async () => {
    const { getInstallationOctokit } =
      await import("../src/modules/github/github.octokit");
    const octokit = await getInstallationOctokit(777n);

    await octokit.rest.repos.get({ owner: "acme", repo: "widgets" });
    await octokit.rest.repos.get({ owner: "acme", repo: "widgets" });

    const tokenCalls = requests.filter(
      (r) => r.url === "/app/installations/777/access_tokens"
    );
    assert.equal(
      tokenCalls.length,
      1,
      "installation token is cached, not re-minted per request"
    );
    assert.match(
      tokenCalls[0].auth ?? "",
      /^bearer /i,
      "token request is signed with the app JWT"
    );

    const repoCalls = requests.filter((r) => r.url === "/repos/acme/widgets");
    assert.equal(repoCalls.length, 2);
    for (const call of repoCalls) {
      assert.match(call.auth ?? "", /ghs_installation_token_1/);
    }
  });

  it("rejects invalid installation ids without calling GitHub", async () => {
    const { getInstallationOctokit } =
      await import("../src/modules/github/github.octokit");
    const before = requests.length;
    await assert.rejects(
      getInstallationOctokit("abc"),
      /Invalid GitHub installation id/
    );
    await assert.rejects(
      getInstallationOctokit(0),
      /Invalid GitHub installation id/
    );
    assert.equal(requests.length, before);
  });
});
