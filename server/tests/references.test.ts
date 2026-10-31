import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractReferences } from "../src/modules/github/sync/github.references";

const repo = { owner: "acme", repo: "widgets" };
const refs = (text: string, self?: number) =>
  extractReferences(text, repo, self).sort((a, b) => a - b);

describe("extractReferences", () => {
  it("finds explicit #N, qualified and URL references to the same repository", () => {
    assert.deepEqual(refs("Follow-up to #12 and acme/widgets#7"), [7, 12]);
    assert.deepEqual(
      refs(
        "see https://github.com/acme/widgets/issues/30 and https://github.com/acme/widgets/pull/31#issuecomment-1"
      ),
      [30, 31]
    );
    assert.deepEqual(refs("Fixes #5, closes #6."), [5, 6]);
  });

  it("ignores other repositories, the thread itself and non-references", () => {
    assert.deepEqual(
      refs("other-org/other#9 https://github.com/other/repo/issues/10"),
      []
    );
    assert.deepEqual(refs("this is #3", 3), []);
    assert.deepEqual(
      refs("colour #123abc and heading ## 4 and issue#8 and &#39;"),
      []
    );
    assert.deepEqual(refs(""), []);
    assert.deepEqual(extractReferences(null, repo), []);
  });

  it("does not read references inside code", () => {
    assert.deepEqual(
      refs("run `git revert #44` now\n```\n#45 is in a block\n```\nreal: #46"),
      [46]
    );
  });

  it("is not fooled by lookalike URLs", () => {
    assert.deepEqual(
      refs("https://evil.example/github.com/acme/widgets/issues/99"),
      []
    );
  });
});
