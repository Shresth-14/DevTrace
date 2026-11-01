import { describe, it, afterEach, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import "../src/tests/setup-env";
import { createApp } from "../src/app";
import { prisma } from "../src/database";
import { signSessionToken } from "../src/utils/jwt";
import { OllamaService } from "../src/modules/ai/ollama.service";
import { aiService } from "../src/modules/ai/ai.service";
import {
  OllamaUnavailableError,
  OllamaModelMissingError,
  AiTimeoutError,
  AiStreamChunk,
} from "../src/modules/ai/ai.types";

const app = createApp();

describe("OllamaService Unit Tests", () => {
  it("initializes with default options and handles configure()", () => {
    const service = new OllamaService({
      baseUrl: "http://localhost:11434",
      model: "qwen3:8b",
      contextLength: 4096,
      timeoutMs: 60000,
    });

    assert.equal(service.name, "ollama");
    assert.equal(service.getBaseUrl(), "http://localhost:11434");
    assert.equal(service.getModel(), "qwen3:8b");
    assert.equal(service.isConfigured(), true);

    service.configure({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen2.5-coder:7b",
      contextLength: 8192,
      timeoutMs: 30000,
    });

    assert.equal(service.getBaseUrl(), "http://127.0.0.1:11434");
    assert.equal(service.getModel(), "qwen2.5-coder:7b");
  });

  it("reports isConfigured false when baseUrl is empty", () => {
    const service = new OllamaService({ baseUrl: "" });
    // If baseUrl is empty string or undefined, service defaults or falls back
    service.configure({ baseUrl: "" });
    assert.equal(service.isConfigured(), false);
  });

  describe("checkHealth", () => {
    it("returns reachable: true and modelInstalled: true when model exists in tags", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = String(input);
        if (url.endsWith("/api/tags")) {
          return new Response(
            JSON.stringify({
              models: [
                { name: "qwen3:8b", model: "qwen3:8b" },
                { name: "llama3.2:3b", model: "llama3.2:3b" },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      const service = new OllamaService({
        baseUrl: "http://localhost:11434",
        model: "qwen3:8b",
        fetchFn: mockFetch,
      });

      const health = await service.checkHealth();
      assert.equal(health.reachable, true);
      assert.equal(health.modelInstalled, true);
      assert.deepEqual(health.installedModels, ["qwen3:8b", "llama3.2:3b"]);
      assert.equal(health.message, undefined);
    });

    it("returns reachable: true and modelInstalled: false with pull suggestion when model is missing", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = String(input);
        if (url.endsWith("/api/tags")) {
          return new Response(
            JSON.stringify({
              models: [{ name: "llama3.2:3b", model: "llama3.2:3b" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      const service = new OllamaService({
        baseUrl: "http://localhost:11434",
        model: "qwen3:8b",
        fetchFn: mockFetch,
      });

      const health = await service.checkHealth();
      assert.equal(health.reachable, true);
      assert.equal(health.modelInstalled, false);
      assert.ok(health.message?.includes("ollama pull qwen3:8b"));
    });

    it("returns reachable: false when Ollama endpoint connection fails", async () => {
      const mockFetch: typeof fetch = async () => {
        const err = new Error("connect ECONNREFUSED 127.0.0.1:11434");
        (err as { code?: string }).code = "ECONNREFUSED";
        throw err;
      };

      const service = new OllamaService({
        baseUrl: "http://localhost:11434",
        model: "qwen3:8b",
        fetchFn: mockFetch,
      });

      const health = await service.checkHealth();
      assert.equal(health.reachable, false);
      assert.equal(health.modelInstalled, false);
      assert.ok(health.message?.includes("Ollama is not reachable"));
    });
  });

  describe("chat", () => {
    it("successfully sends chat request and formats response", async () => {
      let receivedUrl = "";
      type ReqBody = {
        model?: string;
        stream?: boolean;
        options?: { temperature?: number; num_ctx?: number; num_predict?: number };
      };
      let receivedBody: ReqBody | null = null;

      const mockFetch: typeof fetch = async (input, init) => {
        receivedUrl = String(input);
        receivedBody = JSON.parse(String(init?.body || "{}"));

        return new Response(
          JSON.stringify({
            model: "qwen3:8b",
            created_at: "2026-11-01T00:00:00Z",
            message: {
              role: "assistant",
              content: "Hello from local Ollama!",
            },
            done: true,
            done_reason: "stop",
            prompt_eval_count: 15,
            eval_count: 8,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const service = new OllamaService({
        baseUrl: "http://localhost:11434",
        model: "qwen3:8b",
        fetchFn: mockFetch,
        contextLength: 4096,
      });

      const response = await service.chat(
        [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hi" },
        ],
        { temperature: 0.2, maxTokens: 100 }
      );

      assert.equal(receivedUrl, "http://localhost:11434/api/chat");
      const body = receivedBody as unknown as ReqBody;
      assert.equal(body?.model, "qwen3:8b");
      assert.equal(body?.stream, false);
      assert.equal(body?.options?.temperature, 0.2);
      assert.equal(body?.options?.num_ctx, 4096);
      assert.equal(body?.options?.num_predict, 100);

      assert.equal(response.content, "Hello from local Ollama!");
      assert.equal(response.model, "qwen3:8b");
      assert.equal(response.finishReason, "stop");
      assert.equal(response.usage?.cost, 0); // Local inference is free
      assert.equal(response.usage?.promptTokens, 15);
      assert.equal(response.usage?.completionTokens, 8);
      assert.equal(response.usage?.totalTokens, 23);
    });

    it("falls back gracefully when format: 'json' causes structured output error", async () => {
      let callCount = 0;
      let lastBody: { format?: string } | null = null;

      const mockFetch: typeof fetch = async (_input, init) => {
        callCount++;
        lastBody = JSON.parse(String(init?.body || "{}"));

        if (callCount === 1) {
          // Simulate MLX or runner refusing format: "json"
          return new Response("structured output is unavailable for this model", {
            status: 400,
          });
        }

        return new Response(
          JSON.stringify({
            model: "qwen3.5:4b",
            message: { role: "assistant", content: '{"status":"ok"}' },
            done: true,
            prompt_eval_count: 10,
            eval_count: 5,
          }),
          { status: 200 }
        );
      };

      const service = new OllamaService({
        baseUrl: "http://localhost:11434",
        model: "qwen3.5:4b",
        fetchFn: mockFetch,
      });

      const response = await service.chat([{ role: "user", content: "Output JSON" }], {
        format: "json",
      });

      assert.equal(callCount, 2);
      const fallbackBody = lastBody as unknown as { format?: string };
      assert.equal(fallbackBody?.format, undefined); // Second call removed format: "json"
      assert.equal(response.content, '{"status":"ok"}');
    });

    it("throws OllamaModelMissingError when Ollama returns 404 model not found", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response("model 'missing-model' not found, try pulling it first", {
          status: 404,
        });
      };

      const service = new OllamaService({
        baseUrl: "http://localhost:11434",
        model: "missing-model",
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => {
          await service.chat([{ role: "user", content: "Hi" }]);
        },
        (err) => {
          assert.ok(err instanceof OllamaModelMissingError);
          assert.equal(err.model, "missing-model");
          assert.ok(err.message.includes("ollama pull missing-model"));
          return true;
        }
      );
    });

    it("throws OllamaUnavailableError when connection is refused", async () => {
      const mockFetch: typeof fetch = async () => {
        const err = new Error("fetch failed");
        (err as { code?: string }).code = "ECONNREFUSED";
        throw err;
      };

      const service = new OllamaService({
        baseUrl: "http://localhost:11434",
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => {
          await service.chat([{ role: "user", content: "Hi" }]);
        },
        (err) => {
          assert.ok(err instanceof OllamaUnavailableError);
          assert.equal(err.statusCode, 503);
          return true;
        }
      );
    });

    it("throws AiTimeoutError when inference times out", async () => {
      const mockFetch: typeof fetch = async () => {
        const err = new Error("The operation was aborted due to timeout");
        err.name = "TimeoutError";
        throw err;
      };

      const service = new OllamaService({
        baseUrl: "http://localhost:11434",
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => {
          await service.chat([{ role: "user", content: "Hi" }]);
        },
        (err) => {
          assert.ok(err instanceof AiTimeoutError);
          assert.equal(err.statusCode, 504);
          return true;
        }
      );
    });
  });

  describe("streamChat", () => {
    it("streams response chunks and returns token usage on completion", async () => {
      const lines = [
        JSON.stringify({
          model: "qwen3:8b",
          message: { role: "assistant", content: "Hello" },
          done: false,
        }),
        JSON.stringify({
          model: "qwen3:8b",
          message: { role: "assistant", content: " world!" },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 5,
          eval_count: 4,
        }),
      ];

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          for (const line of lines) {
            controller.enqueue(encoder.encode(line + "\n"));
          }
          controller.close();
        },
      });

      const mockFetch: typeof fetch = async () => {
        return new Response(stream, { status: 200 });
      };

      const service = new OllamaService({
        baseUrl: "http://localhost:11434",
        model: "qwen3:8b",
        fetchFn: mockFetch,
      });

      const chunks: AiStreamChunk[] = [];
      for await (const chunk of service.streamChat([{ role: "user", content: "Hi" }])) {
        chunks.push(chunk);
      }

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].content, "Hello");
      assert.equal(chunks[0].finishReason, null);
      assert.equal(chunks[1].content, " world!");
      assert.equal(chunks[1].finishReason, "stop");
      assert.equal(chunks[1].usage?.totalTokens, 9);
      assert.equal(chunks[1].usage?.cost, 0);
    });
  });
});

describe("AiService Provider Configuration", () => {
  it("defaults to ollama provider", () => {
    aiService.setProviderByName("ollama");
    assert.equal(aiService.getActiveProviderName(), "ollama");

    const status = aiService.getStatus();
    assert.equal(status.provider, "ollama");
    assert.deepEqual(status.availableProviders, ["ollama"]);
  });
});

describe("AI API Routes with Ollama", () => {
  // The AI routes need a signed-in user; give requireAuth one without touching the database.
  const originalFindUnique = prisma.user.findUnique;
  const token = `Bearer ${signSessionToken({
    userId: "test-user",
    githubId: "1",
    githubUsername: "tester",
  })}`;
  const authed = () => ({
    get: (path: string) => request(app).get(path).set("Authorization", token),
    post: (path: string) => request(app).post(path).set("Authorization", token),
  });

  before(() => {
    Object.assign(prisma.user, {
      findUnique: async () => ({ id: "test-user", githubUsername: "tester", token: null }),
    });
  });
  after(() => {
    Object.assign(prisma.user, { findUnique: originalFindUnique });
  });


  const originalProvider = aiService.getActiveProvider();

  afterEach(() => {
    aiService.setProvider(originalProvider);
  });

  it("GET /api/v1/ai/status returns current provider info", async () => {
    aiService.setProviderByName("ollama");
    const res = await authed().get("/api/v1/ai/status");

    assert.equal(res.status, 200);
    assert.equal(res.body.provider, "ollama");
    assert.equal(typeof res.body.configured, "boolean");
    assert.ok(Array.isArray(res.body.availableProviders));
  });

  it("GET /api/v1/ai/status?diagnostics=true returns diagnostics details", async () => {
    const mockOllama = new OllamaService({
      baseUrl: "http://localhost:11434",
      model: "qwen3:8b",
      fetchFn: async () =>
        new Response(
          JSON.stringify({ models: [{ name: "qwen3:8b", model: "qwen3:8b" }] }),
          { status: 200 }
        ),
    });

    aiService.setProvider(mockOllama);
    const res = await authed().get("/api/v1/ai/status?diagnostics=true");

    assert.equal(res.status, 200);
    assert.equal(res.body.provider, "ollama");
    assert.equal(res.body.diagnostics?.reachable, true);
    assert.equal(res.body.diagnostics?.modelInstalled, true);
  });

  it("POST /api/v1/ai/chat returns 400 for bad request payloads", async () => {
    const res = await authed()
      .post("/api/v1/ai/chat")
      .send({ invalid: "payload" });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Bad Request");
  });

  it("POST /api/v1/ai/chat maps OllamaUnavailableError to 503", async () => {
    const mockOllama = new OllamaService({
      baseUrl: "http://localhost:11434",
      fetchFn: async () => {
        const err = new Error("ECONNREFUSED");
        (err as { code?: string }).code = "ECONNREFUSED";
        throw err;
      },
    });

    aiService.setProvider(mockOllama);

    const res = await authed()
      .post("/api/v1/ai/chat")
      .send({ message: "Hello" });

    assert.equal(res.status, 503);
    assert.equal(res.body.error, "Ollama Unavailable");
    assert.equal(res.body.code, "OLLAMA_UNAVAILABLE");
  });

  it("POST /api/v1/ai/chat maps OllamaModelMissingError to 503 with pull command", async () => {
    const mockOllama = new OllamaService({
      baseUrl: "http://localhost:11434",
      model: "test-missing-model",
      fetchFn: async () => new Response("model not found", { status: 404 }),
    });

    aiService.setProvider(mockOllama);

    const res = await authed()
      .post("/api/v1/ai/chat")
      .send({ message: "Hello" });

    assert.equal(res.status, 503);
    assert.equal(res.body.error, "Model Missing");
    assert.equal(res.body.code, "OLLAMA_MODEL_MISSING");
    assert.ok(res.body.message.includes("ollama pull test-missing-model"));
  });

  it("POST /api/v1/ai/chat returns 200 when local Ollama responds successfully", async () => {
    const mockOllama = new OllamaService({
      baseUrl: "http://localhost:11434",
      model: "qwen2.5-coder:7b",
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            model: "qwen2.5-coder:7b",
            message: { role: "assistant", content: "Local response" },
            done: true,
            prompt_eval_count: 5,
            eval_count: 3,
          }),
          { status: 200 }
        ),
    });

    aiService.setProvider(mockOllama);

    const res = await authed()
      .post("/api/v1/ai/chat")
      .send({ message: "Hello" });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message.content, "Local response");
    assert.equal(res.body.usage.cost, 0);
  });
});
