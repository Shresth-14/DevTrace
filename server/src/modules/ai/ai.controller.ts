import { Request, Response } from "express";
import { aiService } from "./ai.service";
import {
  ChatMessage,
  AiTimeoutError,
  AiUpstreamError,
  AiInvalidRequestError,
  OllamaUnavailableError,
  OllamaModelMissingError,
} from "./ai.types";

export class AiController {
  /**
   * Parses and validates chat request body.
   */
  private parseChatRequest(body: unknown): {
    messages: ChatMessage[];
    stream: boolean;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } {
    if (!body || typeof body !== "object") {
      throw new AiInvalidRequestError(
        "Request body must be a JSON object containing a 'message' string or 'messages' array."
      );
    }

    const payload = body as {
      message?: unknown;
      messages?: unknown;
      systemPrompt?: unknown;
      stream?: unknown;
      model?: unknown;
      temperature?: unknown;
      maxTokens?: unknown;
    };

    let messages: ChatMessage[] = [];

    if (
      typeof payload.message === "string" &&
      payload.message.trim().length > 0
    ) {
      const system =
        typeof payload.systemPrompt === "string" &&
        payload.systemPrompt.trim().length > 0
          ? payload.systemPrompt.trim()
          : undefined;

      messages = aiService.buildMessages(payload.message, system);
    } else if (Array.isArray(payload.messages) && payload.messages.length > 0) {
      for (const m of payload.messages) {
        if (!m || typeof m !== "object") {
          throw new AiInvalidRequestError(
            "Each item in 'messages' array must be an object with 'role' and 'content'."
          );
        }
        const role = (m as { role?: unknown }).role;
        const content = (m as { content?: unknown }).content;

        if (
          typeof role !== "string" ||
          !["system", "user", "assistant"].includes(role)
        ) {
          throw new AiInvalidRequestError(
            "Message 'role' must be one of: 'system', 'user', 'assistant'."
          );
        }
        if (typeof content !== "string") {
          throw new AiInvalidRequestError(
            "Message 'content' must be a valid string."
          );
        }

        messages.push({
          role: role as "system" | "user" | "assistant",
          content,
        });
      }
    } else {
      throw new AiInvalidRequestError(
        "Please provide either a 'message' string (e.g. {\"message\": \"How many r's are in strawberry?\"}) or a non-empty 'messages' array."
      );
    }

    return {
      messages,
      stream: Boolean(payload.stream),
      model: typeof payload.model === "string" ? payload.model : undefined,
      temperature:
        typeof payload.temperature === "number"
          ? payload.temperature
          : undefined,
      maxTokens:
        typeof payload.maxTokens === "number" ? payload.maxTokens : undefined,
    };
  }

  /**
   * Helper to format standardized JSON errors.
   */
  private handleError(res: Response, error: unknown): void {
    if (error instanceof OllamaUnavailableError) {
      res.status(error.statusCode).json({
        error: "Ollama Unavailable",
        code: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof OllamaModelMissingError) {
      res.status(error.statusCode).json({
        error: "Model Missing",
        code: error.code,
        message: error.message,
        model: error.model,
      });
      return;
    }

    if (error instanceof AiInvalidRequestError) {
      res.status(error.statusCode).json({
        error: "Bad Request",
        code: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof AiTimeoutError) {
      res.status(error.statusCode).json({
        error: "Gateway Timeout",
        code: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof AiUpstreamError) {
      res.status(error.statusCode).json({
        error: "AI Provider Error",
        code: error.code,
        message: error.message,
      });
      return;
    }

    const err = error as { message?: string };
    const safeMessage =
      err?.message || "An unexpected error occurred during AI processing.";

    res.status(500).json({
      error: "Internal Server Error",
      code: "AI_INTERNAL_ERROR",
      message: safeMessage,
    });
  }

  /**
   * Synchronous / streaming chat completion endpoint.
   * POST /api/v1/ai/chat
   */
  public chat = async (req: Request, res: Response): Promise<void> => {
    try {
      const wantsStream =
        req.body?.stream === true ||
        req.headers.accept?.includes("text/event-stream");

      if (wantsStream) {
        await this.streamChat(req, res);
        return;
      }

      const { messages, model, temperature, maxTokens } = this.parseChatRequest(
        req.body
      );

      const abortController = new AbortController();
      req.on("close", () => abortController.abort());

      const result = await aiService.chat(messages, {
        model,
        temperature,
        maxTokens,
        signal: abortController.signal,
      });

      res.status(200).json({
        success: true,
        model: result.model,
        id: result.id,
        message: {
          role: "assistant",
          content: result.content,
          reasoning: result.reasoning || undefined,
        },
        usage: result.usage,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * Server-Sent Events (SSE) streaming chat completion endpoint.
   * POST /api/v1/ai/chat/stream (or POST /api/v1/ai/chat with stream: true)
   */
  public streamChat = async (req: Request, res: Response): Promise<void> => {
    let headersSent = false;
    const abortController = new AbortController();

    req.on("close", () => {
      abortController.abort();
    });

    try {
      const { messages, model, temperature, maxTokens } = this.parseChatRequest(
        req.body
      );

      // Verify configured before writing SSE headers so we can return standard 503 JSON if not configured
      const status = aiService.getStatus();
      if (!status.configured) {
        throw new OllamaUnavailableError("Local AI runtime is not configured.");
      }

      // Initialize SSE response headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      headersSent = true;

      const stream = aiService.streamChat(messages, {
        model,
        temperature,
        maxTokens,
        signal: abortController.signal,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let lastUsage: any = undefined;

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          break;
        }

        if (chunk.usage) {
          lastUsage = chunk.usage;
        }

        const payload = JSON.stringify({
          type: "chunk",
          id: chunk.id,
          model: chunk.model,
          content: chunk.content,
          reasoning: chunk.reasoning || undefined,
          finishReason: chunk.finishReason || undefined,
        });

        res.write(`data: ${payload}\n\n`);
      }

      // Final completion signal
      const donePayload = JSON.stringify({
        type: "done",
        usage: lastUsage,
      });
      res.write(`data: ${donePayload}\n\n`);
      res.end();
    } catch (error) {
      if (headersSent) {
        const errMessage =
          error instanceof Error ? error.message : "Error streaming response";
        res.write(
          `data: ${JSON.stringify({ type: "error", message: errMessage })}\n\n`
        );
        res.end();
      } else {
        this.handleError(res, error);
      }
    }
  };

  /**
   * Health and configuration status of AI service.
   * GET /api/v1/ai/status
   */
  public getStatus = async (req: Request, res: Response): Promise<void> => {
    const wantsDiagnostics =
      req.query.diagnostics === "true" || req.query.check === "true";
    if (wantsDiagnostics) {
      const health = await aiService.checkHealth();
      res.json({
        provider: health.provider,
        configured: health.configured,
        model: health.model,
        availableProviders: ["ollama"],
        diagnostics: health.diagnostics,
      });
      return;
    }
    const status = aiService.getStatus();
    res.json({
      provider: status.provider,
      configured: status.configured,
      model: status.model,
      availableProviders: ["ollama"],
    });
  };
}

export const aiController = new AiController();
