import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import "../src/tests/setup-env";
import { createApp } from "../src/app";

const app = createApp();

describe("GET /health", () => {
  it("should return HTTP 200 with status ok and DevTrace running message", async () => {
    const response = await request(app).get("/health");

    assert.equal(response.status, 200);
    assert.match(
      response.headers["content-type"] || "",
      /application\/json/
    );
    assert.equal(response.body.status, "ok");
    assert.equal(response.body.message, "DevTrace API is running");
    assert.ok(response.body.timestamp);
    assert.doesNotThrow(() => new Date(response.body.timestamp).toISOString());
  });
});

