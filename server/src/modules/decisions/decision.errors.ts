import {
  AiTimeoutError,
  AiUpstreamError,
  OllamaUnavailableError,
  OllamaModelMissingError,
} from "../ai/ai.types";

/** A 429 that will not clear by waiting a few seconds (e.g. daily quota reached). */
export function isDailyModelLimit(err: unknown): boolean {
  return (
    err instanceof AiUpstreamError &&
    err.statusCode === 429 &&
    /per-?day|daily/i.test(err.message)
  );
}

/** Message safe to store and show to users (no keys, no stack). */
export function describeLlmError(err: unknown): string {
  if (err instanceof OllamaUnavailableError) return err.message;
  if (err instanceof OllamaModelMissingError) return err.message;
  if (err instanceof AiTimeoutError) return err.message || "The AI model timed out.";
  if (err instanceof AiUpstreamError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return "AI runtime rejected the request or permission is denied.";
    }
    if (isDailyModelLimit(err)) {
      return "Model daily limit reached. Try again later.";
    }
    if (err.statusCode === 429)
      return "AI runtime rate limit or capacity reached. Try again later.";
    return `The AI provider returned an error (${err.statusCode}).`;
  }
  const msg = err instanceof Error ? err.message : "Unknown error";
  return msg.slice(0, 300);
}
