import { config } from "../../config/env";
import {
  ChatMessage,
  AiChatOptions,
  AiChatResponse,
  AiStreamChunk,
  AiTimeoutError,
  AiUpstreamError,
  OllamaUnavailableError,
  OllamaModelMissingError,
} from "./ai.types";
import { IAiProvider } from "./ai.service";

export interface OllamaHealthResult {
  reachable: boolean;
  modelInstalled: boolean;
  installedModels: string[];
  baseUrl: string;
  model: string;
  message?: string;
}

export interface OllamaServiceOptions {
  baseUrl?: string;
  model?: string;
  contextLength?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** Gate to bound concurrent local inference requests and prevent memory thrashing on 16GB Macs. */
function createGate(maxConcurrent: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

export class OllamaService implements IAiProvider {
  public readonly name = "ollama";
  private baseUrl: string;
  private model: string;
  private contextLength: number;
  private defaultTimeoutMs: number;
  private fetchFn: typeof fetch;
  private gate = createGate(2); // Max 2 concurrent local requests to prevent GPU memory pressure

  constructor(options?: OllamaServiceOptions) {
    this.baseUrl =
      options?.baseUrl?.trim() ||
      config.ollamaBaseUrl ||
      "http://localhost:11434";
    this.model = options?.model?.trim() || config.ollamaModel || "qwen3:8b";
    this.contextLength =
      options?.contextLength ?? config.ollamaContextLength ?? 4096;
    this.defaultTimeoutMs =
      options?.timeoutMs ?? config.ollamaTimeoutMs ?? 120_000;
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
  }

  /**
   * Reinitializes or reconfigures the service using fresh options or environment settings.
   */
  public configure(options: OllamaServiceOptions): void {
    if (options.baseUrl !== undefined) this.baseUrl = options.baseUrl.trim();
    if (options.model !== undefined) this.model = options.model.trim();
    if (options.contextLength !== undefined)
      this.contextLength = options.contextLength;
    if (options.timeoutMs !== undefined)
      this.defaultTimeoutMs = options.timeoutMs;
    if (options.fetchFn !== undefined) this.fetchFn = options.fetchFn;
  }

  public isConfigured(): boolean {
    return Boolean(this.baseUrl && this.baseUrl.length > 0);
  }

  public getModel(): string {
    return this.model;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Health check and diagnostics: tests if Ollama is reachable and whether the model is installed.
   */
  public async checkHealth(): Promise<OllamaHealthResult> {
    const timeoutSignal = AbortSignal.timeout(3000);
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: timeoutSignal,
      });

      if (!res.ok) {
        return {
          reachable: false,
          modelInstalled: false,
          installedModels: [],
          baseUrl: this.baseUrl,
          model: this.model,
          message: `Ollama returned HTTP ${res.status} when checking /api/tags.`,
        };
      }

      const data = (await res.json()) as {
        models?: Array<{ name?: string; model?: string }>;
      };
      const installedModels = (data.models || [])
        .map((m) => m.name || m.model || "")
        .filter(Boolean);

      const target = this.model.toLowerCase();
      const modelInstalled = installedModels.some((m) => {
        const lower = m.toLowerCase();
        return (
          lower === target ||
          lower.startsWith(`${target}:`) ||
          lower.startsWith(target) ||
          target.startsWith(lower)
        );
      });

      return {
        reachable: true,
        modelInstalled,
        installedModels,
        baseUrl: this.baseUrl,
        model: this.model,
        message: modelInstalled
          ? undefined
          : `Ollama model '${this.model}' is not installed. Download it using:\n\n  ollama pull ${this.model}\n`,
      };
    } catch (err) {
      return {
        reachable: false,
        modelInstalled: false,
        installedModels: [],
        baseUrl: this.baseUrl,
        model: this.model,
        message: `Ollama is not reachable at ${this.baseUrl}. Start Ollama with 'ollama serve' or open the Ollama app. (${err instanceof Error ? err.message : String(err)})`,
      };
    }
  }

  /**
   * Sanitizes native fetch/HTTP errors into standardized DevTrace AI errors.
   */
  private sanitizeError(error: unknown, model: string): Error {
    if (
      error instanceof OllamaUnavailableError ||
      error instanceof OllamaModelMissingError ||
      error instanceof AiTimeoutError ||
      error instanceof AiUpstreamError
    ) {
      return error;
    }

    const err = error as {
      name?: string;
      message?: string;
      code?: string;
      status?: number;
      statusCode?: number;
    };

    const msg = (err?.message || "").toLowerCase();

    if (
      err?.name === "TimeoutError" ||
      err?.name === "RequestTimeoutError" ||
      msg.includes("timeout")
    ) {
      return new AiTimeoutError(
        `Local model inference with ${model} timed out after ${this.defaultTimeoutMs / 1000}s. Try reducing context length or prompt size.`
      );
    }

    if (err?.name === "AbortError" || msg.includes("abort")) {
      return new Error("Request was aborted by caller.");
    }

    if (
      err?.code === "ECONNREFUSED" ||
      err?.code === "ENOTFOUND" ||
      msg.includes("fetch failed") ||
      msg.includes("econnrefused")
    ) {
      return new OllamaUnavailableError(
        `Ollama is not running or unreachable at ${this.baseUrl}. Start Ollama with 'ollama serve' or open the Ollama app.`
      );
    }

    return new AiUpstreamError(
      err?.message || "Unknown error communicating with local Ollama runtime.",
      err?.status || err?.statusCode || 502,
      err?.code || "OLLAMA_UPSTREAM_ERROR"
    );
  }

  /**
   * Formats messages into Ollama's expected structure.
   */
  private formatMessages(messages: ChatMessage[]) {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Sends a synchronous completion request to local Ollama.
   */
  public async chat(
    messages: ChatMessage[],
    options?: AiChatOptions
  ): Promise<AiChatResponse> {
    const model = options?.model?.trim() || this.model;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    return this.gate(async () => {
      const abortController = new AbortController();
      let timer: NodeJS.Timeout | undefined;

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          abortController.abort(new Error("TimeoutError"));
        }, timeoutMs);
      }

      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          abortController.abort();
        });
      }

      const buildBody = (withFormatJson: boolean) => ({
        model,
        messages: this.formatMessages(messages),
        stream: false,
        ...(withFormatJson ? { format: "json" } : {}),
        options: {
          temperature: options?.temperature ?? 0.1,
          num_ctx: this.contextLength,
          ...(options?.maxTokens ? { num_predict: options.maxTokens } : {}),
        },
      });

      try {
        let res = await this.fetchFn(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody(options?.format === "json")),
          signal: abortController.signal,
        });

        // If the model does not support grammar-based structured output (e.g. MLX runner),
        // fallback gracefully without format: "json" and rely on prompt-based JSON.
        if (!res.ok && options?.format === "json") {
          const errText = await res.text().catch(() => "");
          if (errText.includes("structured output is unavailable")) {
            res = await this.fetchFn(`${this.baseUrl}/api/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildBody(false)),
              signal: abortController.signal,
            });
          } else {
            if (res.status === 404 || errText.includes("not found")) {
              throw new OllamaModelMissingError(model);
            }
            throw new AiUpstreamError(errText || "Ollama error", res.status);
          }
        }

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          if (res.status === 404 || errBody.includes("not found")) {
            throw new OllamaModelMissingError(model);
          }
          throw new AiUpstreamError(
            errBody || `Ollama returned HTTP ${res.status}`,
            res.status
          );
        }

        const data = (await res.json()) as {
          model?: string;
          created_at?: string;
          message?: { role?: string; content?: string };
          done?: boolean;
          done_reason?: string;
          prompt_eval_count?: number;
          eval_count?: number;
        };

        const promptTokens = data.prompt_eval_count ?? 0;
        const completionTokens = data.eval_count ?? 0;

        return {
          id: `ollama_${Date.now()}`,
          model: data.model || model,
          content: data.message?.content || "",
          finishReason: data.done_reason || (data.done ? "stop" : null),
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            cost: 0, // Local inference has 0 API cost!
          },
        };
      } catch (err) {
        throw this.sanitizeError(err, model);
      } finally {
        if (timer) clearTimeout(timer);
      }
    });
  }

  /**
   * Sends a streaming completion request to local Ollama, yielding chunks as they arrive.
   */
  public async *streamChat(
    messages: ChatMessage[],
    options?: AiChatOptions
  ): AsyncGenerator<AiStreamChunk, void, unknown> {
    const model = options?.model?.trim() || this.model;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    const abortController = new AbortController();
    let timer: NodeJS.Timeout | undefined;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        abortController.abort(new Error("TimeoutError"));
      }, timeoutMs);
    }

    if (options?.signal) {
      options.signal.addEventListener("abort", () => {
        abortController.abort();
      });
    }

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: this.formatMessages(messages),
          stream: true,
          ...(options?.format === "json" ? { format: "json" } : {}),
          options: {
            temperature: options?.temperature ?? 0.1,
            num_ctx: this.contextLength,
            ...(options?.maxTokens ? { num_predict: options.maxTokens } : {}),
          },
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        if (response.status === 404 || errText.includes("not found")) {
          throw new OllamaModelMissingError(model);
        }
        throw new AiUpstreamError(
          errText || `Ollama returned HTTP ${response.status}`,
          response.status
        );
      }

      if (!response.body) {
        throw new AiUpstreamError("Empty response body from Ollama stream.");
      }
    } catch (err) {
      if (timer) clearTimeout(timer);
      throw this.sanitizeError(err, model);
    }

    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const chunk = JSON.parse(trimmed) as {
              model?: string;
              message?: { role?: string; content?: string };
              done?: boolean;
              done_reason?: string;
              prompt_eval_count?: number;
              eval_count?: number;
            };

            const promptTokens = chunk.prompt_eval_count ?? 0;
            const completionTokens = chunk.eval_count ?? 0;

            yield {
              id: `ollama_stream_${Date.now()}`,
              model: chunk.model || model,
              content: chunk.message?.content || "",
              finishReason: chunk.done
                ? chunk.done_reason || "stop"
                : null,
              usage: chunk.done
                ? {
                    promptTokens,
                    completionTokens,
                    totalTokens: promptTokens + completionTokens,
                    cost: 0,
                  }
                : undefined,
            };
          } catch {
            // Skip unparseable partial chunk
          }
        }
      }
    } catch (err) {
      throw this.sanitizeError(err, model);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export const ollamaService = new OllamaService();

