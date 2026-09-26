import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { assertLocalizedCatalog, assertTranslationSample } from "./catalogContractAssertions.mjs";

const root = process.cwd();
const ownedFiles = [
  "lib/scrutiny.ts",
  "lib/scrutinyDepth.ts",
  "lib/models.ts",
  "lib/recommendation.ts",
  "lib/v3/adapter.ts"
];
const source = (path) => readFileSync(join(root, path), "utf8");
const sources = new Map(ownedFiles.map((path) => [path, source(path)]));
const englishPath = join(root, "messages/en/compose.json");
const english = JSON.parse(readFileSync(englishPath, "utf8"));

function composeKeysInSource(path, fileSource) {
  const keys = new Set();
  const parsed = ts.createSourceFile(path, fileSource, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const inspect = (node) => {
    if (ts.isStringLiteral(node) && node.text.startsWith("compose.")) {
      if (Object.hasOwn(english, node.text)) {
        keys.add(node.text);
      } else if (Object.hasOwn(english, `${node.text}.one`) && Object.hasOwn(english, `${node.text}.other`)) {
        keys.add(`${node.text}.one`);
        keys.add(`${node.text}.other`);
      } else {
        assert.fail(`${path} uses unknown compose key ${node.text}`);
      }
    }
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return keys;
}

test("every compose key used by the owned helpers exists in English", () => {
  const used = new Set();
  for (const [path, fileSource] of sources) {
    for (const key of composeKeysInSource(path, fileSource)) used.add(key);
  }
  assert.ok(used.size >= 40, "expected the compose helpers to migrate their user-visible copy");
  assert.deepEqual([...used].sort(), Object.keys(english).sort(), "compose catalog has no missing or unused keys");
});

test("all 35 locales carry the exact compose contract and translated sample", () => {
  const messagesRoot = join(root, "messages");
  const locales = readdirSync(messagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(locales.length, 35);
  const catalogs = new Map();
  for (const locale of locales) {
    const localized = JSON.parse(source(`messages/${locale}/compose.json`));
    catalogs.set(locale, localized);
    assertLocalizedCatalog({ english, localized, locale, namespace: "compose" });
  }
  assertTranslationSample({ catalogs, english, namespace: "compose" });
});

const formerUserVisibleCopy = [
  "Investigating",
  "Contested",
  "Strengthened",
  "Refuted",
  "Counter it",
  "Spawn a focused opposing argument",
  "Fact-check",
  "Ask for sources, then verify",
  "Mark as weak",
  "Flag as unsupported",
  "Reinterpret",
  "The claim was misread",
  "Site default expansion budget",
  "More follow-up rounds on weak points",
  "Agents keep digging until the tree goes quiet",
  "Manual investigation unavailable",
  "Start manual investigation",
  "Served downgraded",
  "Components-only serve: prose withheld",
  "Blocked at terminal",
  "Shared crux",
  "Recorded replay available",
  "No disagreement record",
  "Disagreement recorded",
  "Rotation exhausted and marked",
  "Obligation remains open",
  "NO SCORE",
  "NO SCORE YET",
  "Scored on the graph — no V2 scoring endpoint"
];

function sourceStringLiterals(path, fileSource) {
  const values = [];
  const parsed = ts.createSourceFile(path, fileSource, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const inspect = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) values.push(node.text);
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return values;
}

test("compose helpers contain no hard-coded user-visible English", () => {
  const failures = [];
  for (const [path, fileSource] of sources) {
    const literals = new Set(sourceStringLiterals(path, fileSource));
    for (const copy of formerUserVisibleCopy) {
      if (literals.has(copy)) failures.push(`${path}: ${copy}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("model names, enum tokens, and adapter status identifiers stay in source", () => {
  const models = sources.get("lib/models.ts");
  for (const name of ["Claude", "GPT", "Gemini", "Grok", "Qwen"]) {
    assert.match(models, new RegExp(`\\b${name}\\b`));
    assert.equal(Object.values(english).includes(name), false, `${name} must not be translated`);
  }

  const recommendation = sources.get("lib/recommendation.ts");
  assert.match(recommendation, /action === "ask_user"/);
  assert.match(recommendation, /status: "unavailable"/);
  assert.match(recommendation, /status: "queued"/);

  const adapter = sources.get("lib/v3/adapter.ts");
  for (const identifier of [
    "SERVED",
    "DOWNGRADED",
    "COMPONENTS_ONLY",
    "BLOCKED",
    "QUESTION_CARD_IS_NOT_A_NODE",
    "NO_SERVED_ANSWER",
    "NODE_ABSENT_FROM_SERVED_ANSWER",
    "FINAL_STRENGTH_WITHHELD",
    "HIDDEN_NODE_SCORE_THRESHOLD_UNRESOLVED",
    "NO_TYPED_FLEET_SOURCE"
  ]) {
    assert.ok(adapter.includes(identifier), `adapter keeps ${identifier}`);
  }
});

test("compose migration preserves budget and recommendation behavior guards", () => {
  const depth = sources.get("lib/scrutinyDepth.ts");
  assert.match(depth, /if \(depth === "standard"\) \{\s*return null;/);
  assert.match(depth, /max_rounds: 4, max_per_node: 3, max_per_debate: 14/);
  // The ruled ceiling has a single source (apps/ui/lib/scrutinyDepth.ts, guarded by
  // tests/unit/s1-1-depth-contract.test.ts); restating its numerals here would be a
  // second definition, so this guard pins the default branch's shape, not its values.
  assert.match(depth, /return \{ max_rounds: \d+, max_per_node: \d+, max_per_debate: \d+ \};\s*\}/);

  const recommendation = sources.get("lib/recommendation.ts");
  assert.match(recommendation, /left\.priority - right\.priority/);
  assert.match(recommendation, /compareCodeUnits\(left\.action, right\.action\)/);
  assert.match(recommendation, /compareCodeUnits\(left\.reason, right\.reason\)/);
  assert.match(recommendation, /target_node_id\?\.trim\(\) \|\| null/);

  const adapter = sources.get("lib/v3/adapter.ts");
  assert.match(adapter, /exact\s*\?\s*\{\s*text: `\$\{decimal\}%`/);
  assert.match(adapter, /text: `≈\$\{decimal\}%`/);
  assert.match(adapter, /export function scoringAbsenceReason\(catalog: MessageCatalog\)/);
  assert.match(adapter, /row_key === "hiddenNodeScoreThreshold"/);
});

test("the English allowlist no longer exempts compose-owned files", () => {
  const allowlist = source("lib/i18n/english-allowlist.txt");
  for (const path of ownedFiles) {
    assert.doesNotMatch(
      allowlist,
      new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m")
    );
  }
});
