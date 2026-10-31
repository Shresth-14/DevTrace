export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number | null;
  cost?: number | null;
}

export interface AiChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AiChatResponse {
  id: string;
  model: string;
  content: string;
  reasoning?: string | null;
  finishReason?: string | null;
  usage?: AiUsage;
}

export interface AiStreamChunk {
  id: string;
  model: string;
  content: string;
  reasoning?: string | null;
  finishReason?: string | null;
  usage?: AiUsage;
}

export class OpenRouterNotConfiguredError extends Error {
  public readonly code = "OPENROUTER_NOT_CONFIGURED";
  public readonly statusCode = 503;

  constructor(
    message = "OpenRouter API key is not configured. Set OPENROUTER_API_KEY in server/.env to enable AI decision reconstruction."
  ) {
    super(message);
    this.name = "OpenRouterNotConfiguredError";
  }
}

export class AiTimeoutError extends Error {
  public readonly code = "AI_TIMEOUT";
  public readonly statusCode = 504;

  constructor(
    message = "AI request timed out. Upstream provider took too long to respond."
  ) {
    super(message);
    this.name = "AiTimeoutError";
  }
}

export class AiUpstreamError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, statusCode = 502, code = "AI_UPSTREAM_ERROR") {
    super(message);
    this.name = "AiUpstreamError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class AiInvalidRequestError extends Error {
  public readonly code = "AI_INVALID_REQUEST";
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "AiInvalidRequestError";
  }
}
