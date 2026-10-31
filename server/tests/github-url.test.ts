import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseGithubRepoUrl } from "../src/utils/github-url";

describe("parseGithubRepoUrl", () => {
  it("accepts the ways people paste a repository", () => {
    const expected = { owner: "python", repo: "peps" };
    for (const input of [
      "https://github.com/python/peps",
      "https://github.com/python/peps/",
      "https://github.com/python/peps.git",
      "http://www.github.com/python/peps",
      "github.com/python/peps",
      "https://github.com/python/peps/tree/main/peps",
      "https://github.com/python/peps/pull/123?diff=split#files",
      "  python/peps  ",
    ]) {
      assert.deepEqual(parseGithubRepoUrl(input), expected, input);
    }
    assert.deepEqual(parseGithubRepoUrl("https://github.com/vercel/next.js"), {
      owner: "vercel",
      repo: "next.js",
    });
  });

  it("rejects anything that is not a GitHub repository reference", () => {
    for (const input of [
      "",
      "https://github.com/python",
      "https://gitlab.com/python/peps",
      "https://evil.example/github.com/python/peps",
      "git@github.com:python/peps.git",
      "ftp://github.com/python/peps",
      "https://github.com/-bad/repo",
      "https://github.com/ok/..",
      "python",
      "x".repeat(400),
    ]) {
      assert.equal(parseGithubRepoUrl(input), null, input);
    }
  });
});
