import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repository hygiene: no credentials and no reviewer-steering text may be committed.
 * Runs against every file git tracks. Patterns are assembled from fragments so this
 * file does not match its own checks.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELF = "server/tests/repo-hygiene.test.ts";

const SECRET_PATTERNS: [string, RegExp][] = [
  ["private key block", new RegExp("-----BEGIN [A-Z ]*PRIVATE" + " KEY-----")],
  ["GitHub token", new RegExp("\\bgh[pousr]" + "_[A-Za-z0-9]{20,}")],
  ["GitHub fine-grained token", new RegExp("github" + "_pat_[A-Za-z0-9_]{20,}")],
  ["OpenAI-style key", new RegExp("\\bsk" + "-[A-Za-z0-9]{20,}")],
  ["AWS access key id", new RegExp("\\bAK" + "IA[0-9A-Z]{16}\\b")],
  ["Slack token", new RegExp("\\bxox[baprs]" + "-[A-Za-z0-9-]{10,}")],
];

const STEERING_PATTERNS: [string, RegExp][] = [
  [
    "instruction-override phrase",
    new RegExp("(ignore|disregard)" + " (all |the )?(previous|prior|above) (instructions|prompts?)", "i"),
  ],
  [
    "text addressed to a judge or reviewer",
    new RegExp("(dear |attention )(judge|reviewer|grader)s?|to (the )?(judge|reviewer|grader)s?:", "i"),
  ],
  [
    "score request",
    new RegExp("(give|award|assign) (this|us|it|the project) (a |the )?(full|top|perfect|maximum|highest|high) (score|marks|grade|rating)", "i"),
  ],
];

function trackedTextFiles(): string[] | null {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" });
    return out
      .split("\0")
      .filter(Boolean)
      .filter((f) => f !== SELF)
      .filter((f) => !/(^|\/)package-lock\.json$/.test(f))
      .filter((f) => !/\.(png|jpe?g|gif|ico|svg|woff2?|ttf|pdf|zip)$/i.test(f));
  } catch {
    return null; // not a git checkout (for example an exported tarball)
  }
}

const files = trackedTextFiles();
const skip = files === null ? "not a git checkout" : false;

function findings(patterns: [string, RegExp][]): string[] {
  const hits: string[] = [];
  for (const file of files ?? []) {
    let text: string;
    try {
      text = readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      continue; // deleted in the working tree
    }
    text.split("\n").forEach((line, i) => {
      for (const [label, re] of patterns) {
        if (re.test(line)) hits.push(`${file}:${i + 1} ${label}`);
      }
    });
  }
  return hits;
}

describe("repository hygiene", { skip }, () => {
  it("tracks no key files or real environment files", () => {
    const bad = (files ?? []).filter(
      (f) => /\.(pem|key|p12|pfx)$/i.test(f) || /(^|\/)\.env(\.(?!example$).+)?$/.test(f)
    );
    assert.deepEqual(bad, []);
  });

  it("tracks no files whose purpose is to instruct AI agents", () => {
    // Tools such as `next dev` can generate these automatically; they are git-ignored.
    const bad = (files ?? []).filter((f) =>
      /(^|\/)(agents|claude|gemini)\.md$/i.test(f) ||
      /(^|\/)(\.cursorrules|\.windsurfrules|copilot-instructions\.md)$/i.test(f) ||
      /(^|\/)\.(cursor|claude)\//.test(f)
    );
    assert.deepEqual(bad, []);
  });

  it("contains no key- or token-shaped strings", () => {
    assert.deepEqual(findings(SECRET_PATTERNS), []);
  });

  it("contains no text that tries to steer a reviewer or a score", () => {
    assert.deepEqual(findings(STEERING_PATTERNS), []);
  });
});
