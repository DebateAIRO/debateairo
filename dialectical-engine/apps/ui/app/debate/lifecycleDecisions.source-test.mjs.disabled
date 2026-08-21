import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// NOTE: deliberately placed outside app/debate/[id]/ (see
// headerToolbarResilience.source-test.mjs for the same established pattern)
// -- the bracketed directory name is not reliably picked up by `node --test`
// when it is itself the argument path, so DebatePageClient.tsx source tests
// live one level up and read the file via a relative path instead.
const root = process.cwd();
const debatePageSource = readFileSync(join(root, "app", "debate", "[id]", "DebatePageClient.tsx"), "utf8");
const typesSource = readFileSync(join(root, "lib", "types.ts"), "utf8");

test("types.ts declares the additive W5a decision-provenance shapes", () => {
  assert.match(typesSource, /export type LifecycleDecision = \{/);
  assert.match(typesSource, /export type DebateDerivation = \{/);
  assert.match(typesSource, /export type DebateCompletion = \{/);
  const debateDetail = typesSource.match(/export type DebateDetail = \{([\s\S]*?)\n\};/)?.[1];
  assert.ok(debateDetail, "types.ts should declare DebateDetail");
  assert.match(debateDetail, /\blifecycleDecisions\?: LifecycleDecision\[\];/);
  assert.match(debateDetail, /\bderivation\?: DebateDerivation;/);
  assert.match(debateDetail, /\bcompletion\?: DebateCompletion;/);
});

test("DebatePageClient indexes lifecycleDecisions by nodeId and passes the node's decision into the drawer", () => {
  assert.match(
    debatePageSource,
    /const lifecycleDecisionByNodeId = useMemo\(\(\) => \{[\s\S]*new Map<string, LifecycleDecision>\(\)[\s\S]*debate\?\.lifecycleDecisions[\s\S]*map\.set\(decision\.nodeId, decision\)[\s\S]*\}, \[debate\?\.lifecycleDecisions\]\);/,
    "DebatePageClient should build a nodeId -> decision lookup from the served (possibly absent) lifecycleDecisions array"
  );
  assert.match(
    debatePageSource,
    /lifecycleDecision=\{lifecycleDecisionByNodeId\.get\(detailNode\.id\)\}/,
    "The open node's decision (if any) must be passed into NodeDetailDrawer"
  );
});

test("DebatePageClient renders the debate-level completion.humanReason honestly when present", () => {
  assert.match(
    debatePageSource,
    /\{debate\.completion\?\.humanReason \? \([\s\S]{0,120}debate\.completion\.humanReason[\s\S]{0,40}\) : null\}/,
    "A non-empty completion.humanReason should render near the debate status; absence renders nothing"
  );
});
