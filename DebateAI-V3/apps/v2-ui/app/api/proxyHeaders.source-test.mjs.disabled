import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/api/[...path]/route.ts", "utf8");

test("api proxy strips transport-owned headers before forwarding through undici", () => {
  assert.match(source, /headers\.delete\(["']host["']\)/);
  assert.match(source, /headers\.delete\(["']expect["']\)/);
});

test("api proxy exposes every ordinary route-handler method", () => {
  for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.match(source, new RegExp(`export function ${method}\\(`));
  }
});
