import "./setup-env";
import assert from "assert";
import { ollamaService } from "../modules/ai/ollama.service";
import { aiService, IAiProvider } from "../modules/ai/ai.service";
import {
  AiChatResponse,
  AiStreamChunk,
  ChatMessage,
} from "../modules/ai/ai.types";
import { createApp } from "../app";
import { prisma } from "../database";
import { signSessionToken } from "../utils/jwt";
import { Server } from "http";

async function runAiTests() {
  console.log("=========================================");
  console.log("Dev Trace - Local Ollama AI Integration Tests");
  console.log("=========================================");

  // 1. Ollama Service Configuration & Defaults
  console.log("\n[Test 1] Ollama Service Configuration");
  assert.strictEqual(
    ollamaService.name,
    "ollama",
    "Ollama service must have name 'ollama'"
  );
  assert.strictEqual(
    ollamaService.getModel(),
    "qwen2.5-coder:7b",
    "Ollama must default to qwen2.5-coder:7b"
  );
  assert.strictEqual(
    ollamaService.getBaseUrl(),
    "http://localhost:11434",
    "Ollama must default to http://localhost:11434"
  );
  console.log("✓ Ollama service configuration verified.");

  // 2. AI Service message builder and provider abstraction
  console.log("\n[Test 2] AI Service Abstraction & Message Builder");
  const messages = aiService.buildMessages(
    "How many r's are in strawberry?",
    "You are a helpful AI assistant."
  );
  assert.strictEqual(messages.length, 2);
  assert.strictEqual(messages[0].role, "system");
  assert.strictEqual(messages[0].content, "You are a helpful AI assistant.");
  assert.strictEqual(messages[1].role, "user");
  assert.strictEqual(messages[1].content, "How many r's are in strawberry?");
  console.log("✓ System and user prompts correctly structured.");

  // 3. Provider Pluggability (mock local provider simulation)
  console.log(
    "\n[Test 3] Provider Mock Execution & Pluggability"
  );
  class MockLocalProvider implements IAiProvider {
    public readonly name = "ollama";
    public isConfigured(): boolean {
      return true;
    }
    public getModel(): string {
      return "qwen2.5-coder:7b";
    }
    public async chat(msgs: ChatMessage[]): Promise<AiChatResponse> {
      return {
        id: "mock_01",
        model: "qwen2.5-coder:7b",
        content: `Echo: ${msgs[msgs.length - 1].content}`,
        reasoning: "Step 1: count occurrences",
        finishReason: "stop",
        usage: {
          promptTokens: 10,
          completionTokens: 15,
          totalTokens: 25,
          reasoningTokens: 5,
        },
      };
    }
    public async *streamChat(
      msgs: ChatMessage[]
    ): AsyncGenerator<AiStreamChunk, void, unknown> {
      yield {
        id: "mock_01",
        model: "qwen2.5-coder:7b",
        content: "Echo: ",
      };
      yield {
        id: "mock_01",
        model: "qwen2.5-coder:7b",
        content: msgs[msgs.length - 1].content,
        usage: {
          promptTokens: 10,
          completionTokens: 15,
          totalTokens: 25,
          reasoningTokens: 5,
        },
      };
    }
  }

  aiService.setProvider(new MockLocalProvider());
  const statusAfterSwap = aiService.getStatus();
  assert.strictEqual(statusAfterSwap.provider, "ollama");
  assert.strictEqual(statusAfterSwap.configured, true);

  const mockResponse = await aiService.generateText(
    "How many r's are in strawberry?"
  );
  assert.strictEqual(
    mockResponse.content,
    "Echo: How many r's are in strawberry?"
  );
  assert.strictEqual(mockResponse.usage?.reasoningTokens, 5);
  console.log(
    "✓ Local provider executed successfully with reasoning tokens."
  );

  // Restore default Ollama provider
  aiService.setProvider(ollamaService as unknown as IAiProvider);
  assert.strictEqual(aiService.getStatus().provider, "ollama");
  console.log("✓ Default Ollama provider restored.");

  // 4. HTTP API Endpoints Verification
  console.log(
    "\n[Test 4] Express API Routes (/api/v1/ai/status & /api/v1/ai/chat)"
  );
  const app = createApp();
  const testPort = 5098;
  // The AI routes need a signed-in user; give requireAuth a user without touching the database.
  const originalFindUnique = prisma.user.findUnique;
  Object.assign(prisma.user, {
    findUnique: async () => ({ id: "test-user", githubUsername: "tester", token: null }),
  });
  const auth = {
    Authorization: `Bearer ${signSessionToken({
      userId: "test-user",
      githubId: "1",
      githubUsername: "tester",
    })}`,
  };
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(testPort, () => resolve(s));
  });

  try {
    // 4a. GET /api/v1/ai/status
    const anonRes = await fetch(`http://localhost:${testPort}/api/v1/ai/status`);
    assert.strictEqual(anonRes.status, 401, "AI status requires sign-in");
    const statusRes = await fetch(
      `http://localhost:${testPort}/api/v1/ai/status`,
      { headers: auth }
    );
    assert.strictEqual(statusRes.status, 200);
    const statusData = (await statusRes.json()) as {
      provider: string;
      configured: boolean;
      model: string;
      availableProviders: string[];
    };
    assert.strictEqual(statusData.provider, "ollama");
    assert.strictEqual(statusData.configured, true);
    assert.strictEqual(statusData.model, "qwen2.5-coder:7b");
    assert.deepStrictEqual(statusData.availableProviders, ["ollama"]);
    console.log(
      "✓ GET /api/v1/ai/status returns 200 with configuration status."
    );

    // 4b. POST /api/v1/ai/chat with empty payload -> 400
    const badReqRes = await fetch(
      `http://localhost:${testPort}/api/v1/ai/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({}),
      }
    );
    assert.strictEqual(badReqRes.status, 400);
    const badReqData = (await badReqRes.json()) as { error: string };
    assert.strictEqual(badReqData.error, "Bad Request");
    console.log(
      "✓ POST /api/v1/ai/chat invalid payload returns 400 Bad Request."
    );
  } finally {
    Object.assign(prisma.user, { findUnique: originalFindUnique });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log("\n=========================================");
  console.log("All AI integration tests PASSED successfully!");
  console.log("=========================================\n");
}

runAiTests().catch((err) => {
  console.error("AI tests failed:", err);
  process.exit(1);
});
