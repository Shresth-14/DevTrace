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
  format?: "json" | string;
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

export class OllamaUnavailableError extends Error {
  public readonly code = "OLLAMA_UNAVAILABLE";
  public readonly statusCode = 503;

  constructor(
    message = "Ollama is not running or unreachable at http://localhost:11434. Start Ollama with 'ollama serve' or open the Ollama app."
  ) {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}

export class OllamaModelMissingError extends Error {
  public readonly code = "OLLAMA_MODEL_MISSING";
  public readonly statusCode = 503;
  public readonly model: string;

  constructor(model: string, installedModels: string[] = []) {
    const hint =
      installedModels.length > 0
        ? `\n\nCurrently installed models: ${installedModels.join(", ")}\nOr download the configured model using:\n\n  ollama pull ${model}\n`
        : `\n\nDownload it using:\n\n  ollama pull ${model}\n`;
    super(`Ollama model '${model}' is not installed.${hint}`);
    this.name = "OllamaModelMissingError";
    this.model = model;
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
