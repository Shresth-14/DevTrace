import type { ChatMessage, AiChatOptions } from "../ai/ai.types";
import { AiTimeoutError, AiUpstreamError } from "../ai/ai.types";
import { isDailyModelLimit } from "./decision.errors";
import { REPAIR_PROMPT, SYSTEM_PROMPT, renderThread } from "./decision.prompt";
import {
  mergeCandidates,
  parseReply,
  validateCandidates,
} from "./decision.validate";
import type { Candidate, ThreadItem, ThreadUnit } from "./decision.types";

export interface LlmClient {
  chat(
    messages: ChatMessage[],
    options?: AiChatOptions
  ): Promise<{ content: string; model: string }>;
}

export const CHUNK_CHAR_BUDGET = 14000;

/**
 * Splits a long thread into windows that fit the budget. Every window repeats the
 * opening post so the model keeps the context of what is being discussed.
 */
export function chunkItems(
  items: ThreadItem[],
  budget = CHUNK_CHAR_BUDGET
): ThreadItem[][] {
  if (items.length === 0) return [];
  const head = items[0];
  const chunks: ThreadItem[][] = [];
  let cur: ThreadItem[] = [];
  let size = 0;
  for (const it of items) {
    const len = it.text.length + 120;
    if (cur.length > 0 && size + len > budget) {
      chunks.push(cur);
      cur = head && it !== head ? [head] : [];
      size = head ? head.text.length + 120 : 0;
    }
    cur.push(it);
    size += len;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

export interface ExtractorOptions {
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

function retryable(err: unknown): boolean {
  if (err instanceof AiTimeoutError) return true;
  // a daily quota will not clear in a few seconds; retrying only wastes time
  if (isDailyModelLimit(err)) return false;
  return (
    err instanceof AiUpstreamError &&
    (err.statusCode === 429 || err.statusCode >= 500)
  );
}

export async function callModel(
  llm: LlmClient,
  messages: ChatMessage[],
  opts: ExtractorOptions
): Promise<{ content: string; model: string }> {
  const attempts = opts.maxAttempts ?? 3;
  const sleep = opts.sleep ?? defaultSleep;
  for (let n = 1; ; n++) {
    try {
      return await llm.chat(messages, {
        temperature: 0.1,
        maxTokens: 4000,
        timeoutMs: 60_000,
      });
    } catch (err) {
      if (n >= attempts || !retryable(err)) throw err;
      await sleep(1000 * 2 ** (n - 1));
    }
  }
}

export interface UnitExtraction {
  candidates: Candidate[];
  model: string;
  chunks: number;
}

export async function extractUnit(
  llm: LlmClient,
  unit: ThreadUnit,
  repoPaths: ReadonlySet<string>,
  opts: ExtractorOptions = {}
): Promise<UnitExtraction> {
  const chunks = chunkItems(unit.items);
  const all: Candidate[] = [];
  let model = "";

  for (let i = 0; i < chunks.length; i++) {
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: renderThread({
          kind: unit.kind,
          number: unit.number,
          title: unit.title,
          state: unit.state,
          linkedFrom: unit.linkedFrom,
          items: chunks[i],
          files: unit.files.map((f) => f.path),
          part: { index: i + 1, total: chunks.length },
        }),
      },
    ];

    let reply = await callModel(llm, messages, opts);
    model = reply.model || model;
    let raw: unknown[];
    try {
      raw = parseReply(reply.content);
    } catch {
      // One repair attempt, then give up on this thread (reported as failed).
      reply = await callModel(
        llm,
        [
          ...messages,
          { role: "assistant", content: reply.content.slice(0, 4000) },
          { role: "user", content: REPAIR_PROMPT },
        ],
        opts
      );
      model = reply.model || model;
      raw = parseReply(reply.content);
    }

    // Validate against the items shown in THIS chunk only (the model saw nothing else).
    const scoped: ThreadUnit = { ...unit, items: chunks[i] };
    all.push(...validateCandidates(raw, scoped, repoPaths));
  }

  return { candidates: mergeCandidates(all), model, chunks: chunks.length };
}
