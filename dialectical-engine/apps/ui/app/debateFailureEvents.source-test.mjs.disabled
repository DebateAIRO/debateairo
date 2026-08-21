import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// Failure-event honesty: the debate page must only raise the failure banner
// on a TERMINAL debate_failed event, must listen for node_retrying (scoped
// retry chatter), and must clear the banner when generation makes progress.
const source = readFileSync(join(process.cwd(), "app", "debate", "[id]", "DebatePageClient.tsx"), "utf8");

test("debate_failed banner requires the terminal flag", () => {
  const handler = source.split('addEventListener("debate_failed"')[1]?.slice(0, 400) ?? "";
  assert.match(handler, /terminal/, "banner must check payload.terminal");
});

test("node_retrying is handled and clears the stale banner", () => {
  assert.match(source, /addEventListener\("node_retrying"/, "must listen for node_retrying");
  const handler = source.split('addEventListener("node_retrying"')[1]?.slice(0, 400) ?? "";
  assert.match(handler, /setError\(null\)/, "retry progress must clear the failure banner");
});
