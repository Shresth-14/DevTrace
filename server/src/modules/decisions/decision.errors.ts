import {
  AiTimeoutError,
  AiUpstreamError,
  OpenRouterNotConfiguredError,
} from "../ai/ai.types";

/** A 429 that will not clear by waiting a few seconds (e.g. OpenRouter's `free-models-per-day`). */
export function isDailyModelLimit(err: unknown): boolean {
  return (
    err instanceof AiUpstreamError &&
    err.statusCode === 429 &&
    /per-?day|daily/i.test(err.message)
  );
}

/** Message safe to store and show to users (no keys, no stack). */
export function describeLlmError(err: unknown): string {
  if (err instanceof OpenRouterNotConfiguredError) return err.message;
  if (err instanceof AiTimeoutError) return "The AI model timed out.";
  if (err instanceof AiUpstreamError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return "OpenRouter rejected the API key or the model is not permitted for it.";
    }
    if (isDailyModelLimit(err)) {
      return "OpenRouter's daily limit for free models is used up. Add credits at openrouter.ai, set OPENROUTER_MODEL to a paid model, or try again tomorrow.";
    }
    if (err.statusCode === 429)
      return "OpenRouter rate limit reached. Try again later.";
    return `The AI provider returned an error (${err.statusCode}).`;
  }
  const msg = err instanceof Error ? err.message : "Unknown error";
  return msg.slice(0, 300);
}
