import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/api/[...path]/route.ts", "utf8");

test("api proxy strips expect before forwarding requests through undici", () => {
  assert.match(
    source,
    /headers\.delete\(["']expect["']\)/,
    "forwarded request headers must remove Expect because undici rejects it",
  );
});
