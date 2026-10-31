import { OpenRouter } from "@openrouter/sdk";
import { config } from "../../config/env";
import {
  ChatMessage,
  AiChatOptions,
  AiChatResponse,
  AiStreamChunk,
  AiUsage,
  OpenRouterNotConfiguredError,
  AiTimeoutError,
  AiUpstreamError,
} from "./ai.types";

export class OpenRouterService {
  private client: OpenRouter | null = null;
  private readonly defaultModel: string;

  constructor() {
    this.defaultModel =
      config.openrouterModel || "nvidia/nemotron-3-ultra-550b-a55b:free";
    this.initClient();
  }

  /**
   * Initializes or refreshes the OpenRouter SDK client using current environment settings.
   */
  public initClient(): void {
    const apiKey = config.openrouterApiKey?.trim();
    if (apiKey) {
      this.client = new OpenRouter({
        apiKey,
        httpReferer: "https://devtrace.io",
        appTitle: "Dev Trace",
      });
    } else {
      this.client = null;
    }
  }

  /**
   * Returns true if OpenRouter API key is configured.
   */
  public isConfigured(): boolean {
    return this.client !== null && !!config.openrouterApiKey?.trim();
  }

  /**
   * Returns configured default model.
   */
  public getModel(): string {
    return this.defaultModel;
  }

  /**
   * Formats messages into OpenRouter ChatMessages structure.
   */
  private formatMessages(messages: ChatMessage[]) {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Helper to safely extract string content from possible string or multimodal content parts.
   */
  private extractTextContent(rawContent: unknown): string {
    if (typeof rawContent === "string") {
      return rawContent;
    }
    if (Array.isArray(rawContent)) {
      return rawContent
        .map((part) => {
          if (typeof part === "string") return part;
          if (
            part &&
            typeof part === "object" &&
            "text" in part &&
            typeof (part as { text?: unknown }).text === "string"
          ) {
            return (part as { text: string }).text;
          }
          return "";
        })
        .join("");
    }
    return "";
  }

  /**
   * Maps SDK ChatUsage to our standardized AiUsage structure.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapUsage(rawUsage?: any): AiUsage | undefined {
    if (!rawUsage) return undefined;
    return {
      promptTokens: rawUsage.promptTokens ?? rawUsage.prompt_tokens ?? 0,
      completionTokens:
        rawUsage.completionTokens ?? rawUsage.completion_tokens ?? 0,
      totalTokens: rawUsage.totalTokens ?? rawUsage.total_tokens ?? 0,
      reasoningTokens:
        rawUsage.completionTokensDetails?.reasoningTokens ??
        rawUsage.completion_tokens_details?.reasoning_tokens ??
        null,
      cost: rawUsage.cost ?? null,
    };
  }

  /**
   * Sanitizes upstream error messages to never leak tokens, headers, or internal traces.
   */
  private sanitizeError(error: unknown): Error {
    if (
      error instanceof OpenRouterNotConfiguredError ||
      error instanceof AiTimeoutError ||
      error instanceof AiUpstreamError
    ) {
      return error;
    }

    const err = error as {
      name?: string;
      message?: string;
      status?: number;
      statusCode?: number;
      code?: string;
    };

    const message = err?.message || "Unknown upstream AI provider error";
    const status = err?.status || err?.statusCode || 502;

    if (
      err?.name === "RequestTimeoutError" ||
      err?.name === "TimeoutError" ||
      message.toLowerCase().includes("timeout") ||
      status === 504
    ) {
      return new AiTimeoutError();
    }

    if (
      err?.name === "RequestAbortedError" ||
      err?.name === "AbortError" ||
      message.toLowerCase().includes("aborted")
    ) {
      return new Error("Request was aborted by client");
    }

    // Strip sensitive substrings like Bearer tokens or keys if present
    const cleanMessage = message.replace(
      /(bearer\s+|key=)[a-zA-Z0-9_\-.]+/gi,
      "$1***"
    );

    return new AiUpstreamError(
      cleanMessage,
      status,
      err?.code || "UPSTREAM_ERROR"
    );
  }

  /**
   * Sends a synchronous (non-streaming) completion request to OpenRouter.
   */
  public async chat(
    messages: ChatMessage[],
    options?: AiChatOptions
  ): Promise<AiChatResponse> {
    if (!this.isConfigured() || !this.client) {
      throw new OpenRouterNotConfiguredError();
    }

    const model = options?.model?.trim() || this.defaultModel;
    const timeoutMs = options?.timeoutMs ?? 60000;

    try {
      const response = await this.client.chat.send(
        {
          chatRequest: {
            model,
            messages: this.formatMessages(messages),
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
            stream: false,
          },
        },
        {
          timeoutMs,
          signal: options?.signal,
        }
      );

      const choice = response.choices?.[0];
      const content = this.extractTextContent(choice?.message?.content);
      // Type assertion for optional reasoning field on OpenRouter message
      const reasoning =
        (choice?.message as { reasoning?: string | null })?.reasoning ?? null;

      return {
        id: response.id || `chat_${Date.now()}`,
        model: response.model || model,
        content,
        reasoning,
        finishReason: choice?.finishReason ?? null,
        usage: this.mapUsage(response.usage),
      };
    } catch (error) {
      throw this.sanitizeError(error);
    }
  }

  /**
   * Sends a streaming completion request to OpenRouter, yielding chunks as they arrive.
   */
  public async *streamChat(
    messages: ChatMessage[],
    options?: AiChatOptions
  ): AsyncGenerator<AiStreamChunk, void, unknown> {
    if (!this.isConfigured() || !this.client) {
      throw new OpenRouterNotConfiguredError();
    }

    const model = options?.model?.trim() || this.defaultModel;
    const timeoutMs = options?.timeoutMs ?? 60000;

    let stream;
    try {
      stream = await this.client.chat.send(
        {
          chatRequest: {
            model,
            messages: this.formatMessages(messages),
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
            stream: true,
          },
        },
        {
          timeoutMs,
          signal: options?.signal,
        }
      );
    } catch (error) {
      throw this.sanitizeError(error);
    }

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        const content = this.extractTextContent(delta?.content);
        const reasoning = delta?.reasoning ?? null;
        const finishReason = choice?.finishReason ?? null;
        const usage = this.mapUsage(chunk.usage);

        yield {
          id: chunk.id || "",
          model: chunk.model || model,
          content,
          reasoning,
          finishReason,
          usage,
        };
      }
    } catch (error) {
      throw this.sanitizeError(error);
    }
  }
}

export const openRouterService = new OpenRouterService();
