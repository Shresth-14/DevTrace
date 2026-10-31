import "../src/tests/setup-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// GITHUB_APP_ID / GITHUB_PRIVATE_KEY deliberately unset in this process.
process.env.GITHUB_APP_ID = ""; // dotenv never overrides, so a local .env cannot leak in
process.env.GITHUB_PRIVATE_KEY = "";
process.env.GITHUB_PRIVATE_KEY_PATH = ""; // a local .env must not supply a key either

describe("GitHub App configuration", () => {
  it("names exactly which variables are missing, without revealing any values", async () => {
    const { getGitHubApp } =
      await import("../src/modules/github/github.octokit");
    assert.throws(
      () => getGitHubApp(),
      (e: unknown) =>
        e instanceof Error &&
        e.message.includes("GITHUB_APP_ID") &&
        e.message.includes("GITHUB_PRIVATE_KEY")
    );
  });
});

describe("GitHub private key file", () => {
  it("loads the key from GITHUB_PRIVATE_KEY_PATH, even with spaces in the path", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { generateKeyPairSync } = await import("node:crypto");
    const { loadGithubPrivateKey } = await import("../src/config/env");

    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const file = join(
      mkdtempSync(join(tmpdir(), "dt key ")),
      "private key.pem"
    );
    writeFileSync(file, privateKey);

    process.env.GITHUB_PRIVATE_KEY = "";
    process.env.GITHUB_PRIVATE_KEY_PATH = file;
    assert.equal(loadGithubPrivateKey(), privateKey.trim());

    // an inline key still wins over the file
    process.env.GITHUB_PRIVATE_KEY = "inline-key";
    assert.equal(loadGithubPrivateKey(), "inline-key");

    // an unreadable path yields no key instead of crashing
    process.env.GITHUB_PRIVATE_KEY = "";
    process.env.GITHUB_PRIVATE_KEY_PATH = join(tmpdir(), "does-not-exist.pem");
    assert.equal(loadGithubPrivateKey(), undefined);
    process.env.GITHUB_PRIVATE_KEY_PATH = "";
  });
});
