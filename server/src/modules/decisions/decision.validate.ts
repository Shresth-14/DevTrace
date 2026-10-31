import { createHash } from "node:crypto";
import {
  DECISION_STATUSES,
  DEFINITIVE,
  REASONING_CATEGORIES,
  type Candidate,
  type CandidateAlternative,
  type CandidateCodeLink,
  type CandidateEvidence,
  type DecisionStatus,
  type ReasoningCategory,
  type ThreadItem,
  type ThreadUnit,
} from "./decision.types";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 2000): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const norm = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, " ").trim();

/** Pulls the first balanced JSON object out of a model reply (fences/prose tolerated). */
export function extractJson(reply: string): unknown {
  const text = reply.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  if (start < 0) throw new Error("No JSON object in model reply.");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("Unterminated JSON object in model reply.");
}

const status = (v: unknown): DecisionStatus | null =>
  typeof v === "string" &&
  (DECISION_STATUSES as readonly string[]).includes(v.toLowerCase())
    ? (v.toLowerCase() as DecisionStatus)
    : null;

const category = (v: unknown): ReasoningCategory =>
  typeof v === "string" &&
  (REASONING_CATEGORIES as readonly string[]).includes(v.toLowerCase())
    ? (v.toLowerCase() as ReasoningCategory)
    : "other";

/** Throws when the reply does not have the required top-level shape. */
export function parseReply(reply: string): unknown[] {
  const json = extractJson(reply);
  if (!isObj(json) || !Array.isArray(json.decisions)) {
    throw new Error('Model reply is missing a "decisions" array.');
  }
  return json.decisions;
}

function resolveEvidence(
  raw: unknown,
  byRef: Map<string, ThreadItem>
): CandidateEvidence | null {
  if (!isObj(raw)) return null;
  const ref = str(raw.source_id, 20);
  const item = ref ? byRef.get(ref) : undefined;
  if (!item) return null; // the model cannot invent sources
  const quote = str(raw.quote, 300);
  const verified = quote != null && norm(item.text).includes(norm(quote));
  return {
    item,
    quote: verified && quote ? quote : item.text.trim().slice(0, 300),
    quoteVerified: verified,
  };
}

function dedupeEvidence(list: CandidateEvidence[]): CandidateEvidence[] {
  const out = new Map<string, CandidateEvidence>();
  for (const e of list) {
    const key = `${e.item.sourceType}:${e.item.sourceKey}`;
    const prev = out.get(key);
    if (!prev || (e.quoteVerified && !prev.quoteVerified)) out.set(key, e);
  }
  return [...out.values()];
}

/**
 * Turns raw model output for one thread into candidates whose every reference points
 * at a real imported record. Anything the model made up is dropped or downgraded.
 */
export function validateCandidates(
  rawDecisions: unknown[],
  unit: ThreadUnit,
  repoPaths: ReadonlySet<string>
): Candidate[] {
  const byRef = new Map(unit.items.map((i) => [i.ref, i]));
  const authors = new Set(
    unit.items.map((i) => i.author?.toLowerCase()).filter(Boolean) as string[]
  );
  const directPaths = new Map<string, { previous: string | null }>();
  for (const f of unit.files) {
    directPaths.set(f.path, { previous: f.previousPath });
    if (f.previousPath) directPaths.set(f.previousPath, { previous: null });
  }
  const out: Candidate[] = [];

  for (const raw of rawDecisions) {
    if (!isObj(raw)) continue;
    const title = str(raw.title, 160);
    const summary = str(raw.summary, 1500);
    let st = status(raw.status);
    if (!title || !summary || !st) continue;

    const evidence = dedupeEvidence(
      arr(raw.evidence)
        .map((e) => resolveEvidence(e, byRef))
        .filter((e): e is CandidateEvidence => e !== null)
    );
    if (evidence.length === 0) continue; // no real evidence -> no decision

    // A final outcome needs at least one quote that genuinely appears in the source.
    if (DEFINITIVE.has(st) && !evidence.some((e) => e.quoteVerified)) {
      st = "proposed";
    }

    const alternatives: CandidateAlternative[] = [];
    for (const a of arr(raw.rejected_alternatives)) {
      if (!isObj(a)) continue;
      const aTitle = str(a.title, 160);
      if (!aTitle) continue;
      const aEvidence = dedupeEvidence(
        arr(a.evidence_ids)
          .map((id) =>
            typeof id === "string"
              ? resolveEvidence({ source_id: id, quote: null }, byRef)
              : null
          )
          .filter((e): e is CandidateEvidence => e !== null)
      );
      let aStatus = status(a.status) ?? "proposed";
      // "rejected"/"withdrawn" must be backed by a real source from this thread.
      if (DEFINITIVE.has(aStatus) && aEvidence.length === 0)
        aStatus = "proposed";
      const by = str(a.proposed_by, 80);
      alternatives.push({
        title: aTitle,
        proposedBy:
          by && authors.has(by.toLowerCase().replace(/^@/, ""))
            ? by.replace(/^@/, "")
            : null,
        reason: aEvidence.length ? str(a.reason, 1200) : null,
        status: aStatus,
        chosenInstead: str(a.chosen_instead, 300),
        evidence: aEvidence,
      });
    }

    const codeLinks: CandidateCodeLink[] = [];
    const seenPaths = new Set<string>();
    for (const f of arr(raw.related_files)) {
      if (!isObj(f)) continue;
      const path = str(f.path, 500);
      if (!path || seenPaths.has(path)) continue;
      const direct = directPaths.get(path);
      const description = str(f.relationship, 400);
      if (direct) {
        const file = unit.files.find(
          (x) => x.path === path || x.previousPath === path
        );
        seenPaths.add(path);
        if (file) {
          seenPaths.add(file.path);
          if (file.previousPath) seenPaths.add(file.previousPath);
        }
        codeLinks.push({
          path: file?.path ?? path,
          previousPath: file?.previousPath ?? null,
          relationship: "direct",
          basis: "pr_file",
          description,
          commitSha: null,
          line: null,
          prNumber: unit.kind === "pull_request" ? unit.number : null,
        });
      } else if (repoPaths.has(path)) {
        seenPaths.add(path);
        codeLinks.push({
          path,
          previousPath: null,
          relationship: "inferred",
          basis: "model_inferred",
          description,
          commitSha: null,
          line: null,
          prNumber: null,
        });
      } // else: path not present anywhere we imported -> dropped
    }

    // Inline review comments that were cited are direct file evidence, with line + commit.
    for (const e of [...evidence, ...alternatives.flatMap((a) => a.evidence)]) {
      const it = e.item;
      if (it.sourceType !== "review_comment" || !it.path) continue;
      const key = `${it.path}`;
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);
      codeLinks.push({
        path: it.path,
        previousPath: null,
        relationship: "direct",
        basis: "review_comment",
        description: "Discussed in an inline review comment.",
        commitSha: it.commitSha ?? null,
        line: it.line ?? null,
        prNumber: unit.kind === "pull_request" ? unit.number : null,
      });
    }

    const confidenceRaw =
      typeof raw.confidence === "number" ? raw.confidence : null;
    const times = evidence
      .map((e) => e.item.at?.getTime())
      .filter((t): t is number => typeof t === "number");

    out.push({
      title,
      summary,
      status: st,
      reasoning: arr(raw.reasoning)
        .filter(isObj)
        .map((r) => ({
          category: category(r.category),
          explanation: str(r.explanation, 1200) ?? "",
        }))
        .filter((r) => r.explanation)
        .slice(0, 8),
      openQuestions: str(raw.open_questions, 1200),
      confidence:
        confidenceRaw == null || Number.isNaN(confidenceRaw)
          ? null
          : Math.min(1, Math.max(0, confidenceRaw)),
      evidence,
      alternatives,
      codeLinks,
      thread: { kind: unit.kind, number: unit.number },
      decidedAt: times.length ? new Date(Math.max(...times)) : unit.updatedAt,
    });
  }
  return out;
}

// ---- merging --------------------------------------------------------------

const STOP = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "for",
  "and",
  "in",
  "on",
  "use",
  "using",
  "with",
  "as",
  "by",
]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    norm(title)
      .replace(/[^a-z0-9 ]/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !STOP.has(t))
  );
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function fingerprint(title: string): string {
  return createHash("sha1")
    .update([...titleTokens(title)].sort().join(" "))
    .digest("hex");
}

/**
 * Final status when the same decision is seen twice. A definitive outcome beats a
 * non-definitive one; between two definitive outcomes the one backed by later evidence wins.
 */
export function mergeStatus(
  a: { status: DecisionStatus; at: Date | null },
  b: { status: DecisionStatus; at: Date | null }
): DecisionStatus {
  const aDef = DEFINITIVE.has(a.status);
  const bDef = DEFINITIVE.has(b.status);
  if (aDef && !bDef) return a.status;
  if (bDef && !aDef) return b.status;
  if (!aDef && !bDef) {
    return a.status === "unresolved" || b.status === "unresolved"
      ? a.status === b.status
        ? a.status
        : "unresolved"
      : "proposed";
  }
  return (b.at?.getTime() ?? 0) >= (a.at?.getTime() ?? 0) ? b.status : a.status;
}

export const SIMILARITY_THRESHOLD = 0.75;

/** Merges candidates describing the same decision (e.g. from different chunks). */
export function mergeCandidates(list: Candidate[]): Candidate[] {
  const merged: { c: Candidate; tokens: Set<string> }[] = [];
  for (const c of list) {
    const tokens = titleTokens(c.title);
    const hit = merged.find(
      (m) => similarity(m.tokens, tokens) >= SIMILARITY_THRESHOLD
    );
    if (!hit) {
      merged.push({ c: { ...c }, tokens });
      continue;
    }
    const m = hit.c;
    m.status = mergeStatus(
      { status: m.status, at: m.decidedAt },
      { status: c.status, at: c.decidedAt }
    );
    m.evidence = dedupeEvidence([...m.evidence, ...c.evidence]);
    const alts = new Map(m.alternatives.map((a) => [norm(a.title), a]));
    for (const a of c.alternatives) {
      const prev = alts.get(norm(a.title));
      if (!prev) alts.set(norm(a.title), a);
      else {
        prev.evidence = dedupeEvidence([...prev.evidence, ...a.evidence]);
        prev.status = mergeStatus(
          { status: prev.status, at: null },
          { status: a.status, at: null }
        );
        prev.reason ??= a.reason;
        prev.chosenInstead ??= a.chosenInstead;
        prev.proposedBy ??= a.proposedBy;
      }
    }
    m.alternatives = [...alts.values()];
    const links = new Map(m.codeLinks.map((l) => [`${l.path}:${l.basis}`, l]));
    for (const l of c.codeLinks)
      links.set(`${l.path}:${l.basis}`, links.get(`${l.path}:${l.basis}`) ?? l);
    m.codeLinks = [...links.values()];
    m.reasoning = [...m.reasoning, ...c.reasoning].slice(0, 8);
    m.openQuestions = c.openQuestions ?? m.openQuestions;
    m.confidence =
      m.confidence == null || c.confidence == null
        ? (m.confidence ?? c.confidence)
        : Math.min(m.confidence, c.confidence);
    m.decidedAt =
      (c.decidedAt?.getTime() ?? 0) > (m.decidedAt?.getTime() ?? 0)
        ? c.decidedAt
        : m.decidedAt;
  }
  return merged.map((m) => m.c);
}
