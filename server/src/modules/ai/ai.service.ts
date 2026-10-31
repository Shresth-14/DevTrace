import {
  ChatMessage,
  AiChatOptions,
  AiChatResponse,
  AiStreamChunk,
} from "./ai.types";
import { openRouterService } from "./openrouter.service";

export interface IAiProvider {
  name: string;
  isConfigured(): boolean;
  getModel(): string;
  chat(
    messages: ChatMessage[],
    options?: AiChatOptions
  ): Promise<AiChatResponse>;
  streamChat(
    messages: ChatMessage[],
    options?: AiChatOptions
  ): AsyncGenerator<AiStreamChunk, void, unknown>;
}

export class AiService {
  private activeProvider: IAiProvider;

  constructor(
    provider: IAiProvider = openRouterService as unknown as IAiProvider
  ) {
    this.activeProvider = provider;
  }

  /**
   * Sets or swaps the active AI provider (e.g. OpenRouter, Ollama, local model server).
   */
  public setProvider(provider: IAiProvider): void {
    this.activeProvider = provider;
  }

  /**
   * Returns current provider info and configuration status.
   */
  public getStatus(): {
    provider: string;
    configured: boolean;
    model: string;
  } {
    return {
      provider: this.activeProvider.name || "openrouter",
      configured: this.activeProvider.isConfigured(),
      model: this.activeProvider.getModel(),
    };
  }

  /**
   * Helper to normalize a single text prompt and optional system instruction into ChatMessage array.
   */
  public buildMessages(prompt: string, systemPrompt?: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({
        role: "system",
        content: systemPrompt.trim(),
      });
    }
    messages.push({
      role: "user",
      content: prompt.trim(),
    });
    return messages;
  }

  /**
   * Generates a non-streaming completion for conversational messages.
   */
  public async chat(
    messages: ChatMessage[],
    options?: AiChatOptions
  ): Promise<AiChatResponse> {
    return this.activeProvider.chat(messages, options);
  }

  /**
   * Generates a non-streaming completion for a single prompt.
   */
  public async generateText(
    prompt: string,
    systemPrompt?: string,
    options?: AiChatOptions
  ): Promise<AiChatResponse> {
    const messages = this.buildMessages(prompt, systemPrompt);
    return this.activeProvider.chat(messages, options);
  }

  /**
   * Streams completion chunks for conversational messages.
   */
  public async *streamChat(
    messages: ChatMessage[],
    options?: AiChatOptions
  ): AsyncGenerator<AiStreamChunk, void, unknown> {
    yield* this.activeProvider.streamChat(messages, options);
  }

  /**
   * Streams completion chunks for a single prompt.
   */
  public async *streamText(
    prompt: string,
    systemPrompt?: string,
    options?: AiChatOptions
  ): AsyncGenerator<AiStreamChunk, void, unknown> {
    const messages = this.buildMessages(prompt, systemPrompt);
    yield* this.activeProvider.streamChat(messages, options);
  }
}

// Add name property to OpenRouterService so it satisfies IAiProvider
(openRouterService as unknown as { name: string }).name = "openrouter";

export const aiService = new AiService(
  openRouterService as unknown as IAiProvider
);
