import {
  ChatMessage,
  AiChatOptions,
  AiChatResponse,
  AiStreamChunk,
} from "./ai.types";
import { ollamaService, OllamaHealthResult } from "./ollama.service";

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
  checkHealth?(): Promise<OllamaHealthResult | Record<string, unknown>>;
}

export class AiService {
  private activeProvider: IAiProvider;

  constructor(initialProvider?: IAiProvider) {
    this.activeProvider = initialProvider ?? (ollamaService as unknown as IAiProvider);
  }

  /**
   * Sets or swaps the active AI provider.
   */
  public setProvider(provider: IAiProvider): void {
    this.activeProvider = provider;
  }

  /**
   * Switches provider by name: "ollama".
   */
  public setProviderByName(name: "ollama"): void {
    if (name === "ollama") {
      this.activeProvider = ollamaService as unknown as IAiProvider;
    }
  }

  public getActiveProvider(): IAiProvider {
    return this.activeProvider;
  }

  public getActiveProviderName(): string {
    return this.activeProvider.name || "ollama";
  }

  public isConfigured(): boolean {
    return this.activeProvider.isConfigured();
  }

  public getModel(): string {
    return this.activeProvider.getModel();
  }

  /**
   * Returns current provider info and configuration status.
   */
  public getStatus(): {
    provider: string;
    configured: boolean;
    model: string;
    availableProviders: string[];
  } {
    return {
      provider: this.activeProvider.name || "ollama",
      configured: this.activeProvider.isConfigured(),
      model: this.activeProvider.getModel(),
      availableProviders: ["ollama"],
    };
  }

  /**
   * Health check and diagnostics for the active provider.
   */
  public async checkHealth(): Promise<{
    provider: string;
    configured: boolean;
    model: string;
    diagnostics?: Record<string, unknown>;
  }> {
    const status = this.getStatus();
    let diagnostics: Record<string, unknown> | undefined;

    if (typeof this.activeProvider.checkHealth === "function") {
      diagnostics = (await this.activeProvider.checkHealth()) as Record<
        string,
        unknown
      >;
    }

    return {
      provider: status.provider,
      configured: status.configured,
      model: status.model,
      diagnostics,
    };
  }

  /**
   * Returns true if current active AI provider is configured.
   */
  public isConfigured(): boolean {
    return this.activeProvider.isConfigured();
  }

  /**
   * Returns configured model of active provider.
   */
  public getModel(): string {
    return this.activeProvider.getModel();
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

export const aiService = new AiService();
