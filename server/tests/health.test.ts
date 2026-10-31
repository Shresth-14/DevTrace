import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";

describe("GET /health", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
  });

  it("should return HTTP 200 with status ok and DevTrace running message", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as Record<string, string>;

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(body.status, "ok");
    assert.equal(body.message, "DevTrace API is running");
    assert.ok(body.timestamp);
    assert.doesNotThrow(() => new Date(body.timestamp).toISOString());
  });
});
