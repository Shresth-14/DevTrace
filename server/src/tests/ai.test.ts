import assert from "assert";
import { openRouterService } from "../modules/ai/openrouter.service";
import { aiService, IAiProvider } from "../modules/ai/ai.service";
import {
  OpenRouterNotConfiguredError,
  AiChatResponse,
  AiStreamChunk,
  ChatMessage,
} from "../modules/ai/ai.types";
import { createApp } from "../app";
import { Server } from "http";

async function runAiTests() {
  console.log("=========================================");
  console.log("Dev Trace - OpenRouter AI Integration Tests");
  console.log("=========================================");

  // 1. Unconfigured OpenRouter Service Behavior
  console.log("\n[Test 1] OpenRouter Unconfigured State & Safety");
  assert.strictEqual(
    openRouterService.isConfigured(),
    false,
    "OpenRouter must report not configured when OPENROUTER_API_KEY is empty"
  );
  assert.strictEqual(
    openRouterService.getModel(),
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "OpenRouter must default to nemotron free model"
  );

  let unconfiguredCaught = false;
  try {
    await openRouterService.chat([{ role: "user", content: "Test prompt" }]);
  } catch (err) {
    if (err instanceof OpenRouterNotConfiguredError) {
      unconfiguredCaught = true;
      assert.strictEqual(err.statusCode, 503);
    }
  }
  assert.strictEqual(
    unconfiguredCaught,
    true,
    "Calling chat without API key must throw OpenRouterNotConfiguredError"
  );
  console.log("✓ OpenRouter unconfigured guard correctly throws 503 error.");

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

  // 3. Provider Pluggability (swapping to mock provider like Ollama)
  console.log(
    "\n[Test 3] Provider Swapping (Ollama / Local Server Simulation)"
  );
  class MockLocalProvider implements IAiProvider {
    public readonly name = "ollama";
    public isConfigured(): boolean {
      return true;
    }
    public getModel(): string {
      return "llama3.2:latest";
    }
    public async chat(msgs: ChatMessage[]): Promise<AiChatResponse> {
      return {
        id: "mock_01",
        model: "llama3.2:latest",
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
        model: "llama3.2:latest",
        content: "Echo: ",
      };
      yield {
        id: "mock_01",
        model: "llama3.2:latest",
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
    "✓ Pluggable provider executed successfully with reasoning tokens."
  );

  // Restore OpenRouter provider
  aiService.setProvider(openRouterService as unknown as IAiProvider);
  assert.strictEqual(aiService.getStatus().provider, "openrouter");
  console.log("✓ OpenRouter provider restored.");

  // 4. HTTP API Endpoints Verification
  console.log(
    "\n[Test 4] Express API Routes (/api/v1/ai/status & /api/v1/ai/chat)"
  );
  const app = createApp();
  const testPort = 5098;
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(testPort, () => resolve(s));
  });

  try {
    // 4a. GET /api/v1/ai/status
    const statusRes = await fetch(
      `http://localhost:${testPort}/api/v1/ai/status`
    );
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.provider, "openrouter");
    assert.strictEqual(statusData.configured, false);
    assert.strictEqual(
      statusData.model,
      "nvidia/nemotron-3-ultra-550b-a55b:free"
    );
    console.log(
      "✓ GET /api/v1/ai/status returns 200 with configuration status."
    );

    // 4b. POST /api/v1/ai/chat with empty payload -> 400
    const badReqRes = await fetch(
      `http://localhost:${testPort}/api/v1/ai/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    assert.strictEqual(badReqRes.status, 400);
    const badReqData = await badReqRes.json();
    assert.strictEqual(badReqData.error, "Bad Request");
    console.log(
      "✓ POST /api/v1/ai/chat invalid payload returns 400 Bad Request."
    );

    // 4c. POST /api/v1/ai/chat with message (unconfigured) -> 503
    const unconfRes = await fetch(
      `http://localhost:${testPort}/api/v1/ai/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "How many r's are in strawberry?" }),
      }
    );
    assert.strictEqual(unconfRes.status, 503);
    const unconfData = await unconfRes.json();
    assert.strictEqual(unconfData.error, "Configuration Error");
    assert.strictEqual(unconfData.code, "OPENROUTER_NOT_CONFIGURED");
    assert.strictEqual(unconfData.message.includes("OPENROUTER_API_KEY"), true);
    console.log(
      "✓ POST /api/v1/ai/chat without key returns 503 Configuration Error."
    );
  } finally {
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
