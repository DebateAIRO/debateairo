import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const debatePagePath = join(root, "app", "debate", "[id]", "DebatePageClient.tsx");

function eventHandler(source, eventName) {
  const marker = `events.addEventListener("${eventName}",`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${eventName} SSE handler`);
  const end = source.indexOf("\n      });", start);
  assert.notEqual(end, -1, `Expected ${eventName} SSE handler terminator`);
  return source.slice(start, end + "\n      });".length);
}

test("SSE failure handlers render stable public copy without worker payload text", () => {
  const debatePageSource = readFileSync(debatePagePath, "utf8");
  const nodeFailureHandler = eventHandler(debatePageSource, "node_failed");
  const genericFailureHandler = eventHandler(debatePageSource, "debate_failed");
  const syntheticSecret = "SYNTHETIC_SECRET_SENTINEL_FRONTEND_17d4";

  assert.match(nodeFailureHandler, /setError\("Claim generation failed"\)/);
  assert.doesNotMatch(nodeFailureHandler, /payloadString\([^)]*,\s*"reason"\)|\.reason\b/);
  assert.match(genericFailureHandler, /setError\("Debate generation failed"\)/);
  assert.match(
    genericFailureHandler,
    /events\.addEventListener\("debate_failed", \(event\) => \{\s*const payload = parseEventData\(event\);\s*if \(payload\) setError\("Debate generation failed"\);\s*\}\);/,
    "Only server-sent error payloads should display generation-failure copy"
  );
  assert.doesNotMatch(
    debatePageSource,
    /events\.addEventListener\("error",/,
    "Application failures must not use EventSource's reserved transport error event"
  );
  assert.match(
    debatePageSource,
    /useEffect\(\(\) => \{\s*if \(debateTerminal\) return;\s*let events: EventSource/,
    "Terminal debates must not retain or reopen an SSE connection"
  );
  assert.doesNotMatch(genericFailureHandler, /payloadString\([^)]*,\s*"message"\)|\.message\b/);
  assert.doesNotMatch(nodeFailureHandler + genericFailureHandler, new RegExp(syntheticSecret));
  assert.match(
    debatePageSource,
    /events\.onerror = \(\) => \{\s*events\?\.close\(\);\s*refresh\(\);\s*scheduleReconnect\(\);\s*\};/,
    "Transport errors must still refresh and schedule reconnection"
  );
  assert.match(
    debatePageSource,
    /\{error \? \([\s\S]*?<div className="error">\{error\}<\/div>/,
    "Safe failure copy must remain visible in the debate error panel"
  );
});
