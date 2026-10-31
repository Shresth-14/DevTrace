import "../src/tests/setup-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// GITHUB_APP_ID / GITHUB_PRIVATE_KEY deliberately unset in this process.
process.env.GITHUB_APP_ID = ""; // dotenv never overrides, so a local .env cannot leak in
process.env.GITHUB_PRIVATE_KEY = "";

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
