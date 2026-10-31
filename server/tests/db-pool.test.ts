import "../src/tests/setup-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DB_POOL_SIZE, withPoolLimit } from "../src/config/env";

describe("database pool limit", () => {
  it("caps the pool below Supabase's 15-client session limit by default", () => {
    const out = new URL(
      withPoolLimit(
        "postgresql://u:p%40ss@host.example:5432/postgres"
      ) as string
    );
    assert.equal(
      out.searchParams.get("connection_limit"),
      String(DEFAULT_DB_POOL_SIZE)
    );
    assert.ok(DEFAULT_DB_POOL_SIZE < 15);
    assert.equal(out.password, "p%40ss", "credentials survive unchanged");
  });

  it("respects an explicit connection_limit and keeps other parameters", () => {
    const out = new URL(
      withPoolLimit(
        "postgresql://u:p@h:5432/db?sslmode=require&connection_limit=3"
      ) as string
    );
    assert.equal(out.searchParams.get("connection_limit"), "3");
    assert.equal(out.searchParams.get("sslmode"), "require");
  });

  it("leaves a missing or unparseable URL alone", () => {
    assert.equal(withPoolLimit(undefined), undefined);
    assert.equal(withPoolLimit("not a url"), "not a url");
  });
});
