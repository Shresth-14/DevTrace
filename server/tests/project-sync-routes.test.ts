import "../src/tests/setup-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

describe("sync routes require authentication", () => {
  for (const [method, path] of [
    ["post", "/api/projects/widgets/sync"],
    ["get", "/api/projects/widgets/sync"],
    ["get", "/api/projects/widgets/sources/issues"],
  ] as const) {
    it(`${method.toUpperCase()} ${path} -> 401 without a session`, async () => {
      const res = await request(app)[method](path);
      assert.equal(res.status, 401);
    });
  }
});
