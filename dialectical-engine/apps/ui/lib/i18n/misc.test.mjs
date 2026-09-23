import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { t, tPlural } from "./translate.ts";

const root = process.cwd();
const namespace = "misc";
const ownedFiles = [
  "components/AnswerHonestyDrawer.tsx",
  "components/ModelPresentation.tsx",
  "components/ScoringErrorBoundary.tsx",
  "components/Toast.tsx"
];
const source = (path) => readFileSync(join(root, path), "utf8");
const sourceEntries = ownedFiles.map((path) => [path, source(path)]);
const english = JSON.parse(source(`messages/en/${namespace}.json`));

function catalogKeysInSource(fileSource) {
  const keys = new Set();
  const pluralRoots = new Set(
    [...fileSource.matchAll(/\btPlural\(\s*catalog,\s*"(misc\.[^"]+)"/g)].map((match) => match[1])
  );
  for (const match of fileSource.matchAll(/"(misc\.[^"]+)"/g)) {
    const key = match[1];
    if (pluralRoots.has(key)) {
      keys.add(`${key}.one`);
      keys.add(`${key}.other`);
    } else {
      keys.add(key);
    }
  }
  return keys;
}

const brandOrToken = new Set(["AI"]);
const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);

function visibleEnglish(path, fileSource) {
  const failures = [];
  const parsed = ts.createSourceFile(path, fileSource, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const add = (node, value) => {
    const text = value.replace(/\s+/g, " ").trim();
    if (/[A-Za-z]{3,}/.test(text) && !brandOrToken.has(text)) {
      const line = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
      failures.push(`${path}:${line}: ${text}`);
    }
  };
  const inspect = (node) => {
    if (ts.isJsxText(node)) add(node, node.getText(parsed));
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(parsed))) {
      const initializer = node.initializer;
      if (initializer && ts.isStringLiteral(initializer)) add(node, initializer.text);
      if (
        initializer && ts.isJsxExpression(initializer) && initializer.expression &&
        (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression))
      ) add(node, initializer.expression.text);
    }
    if (
      ts.isJsxExpression(node) && node.expression &&
      (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
    ) add(node, node.expression.text);
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return failures;
}

test("every misc key used by the owned components exists in English", () => {
  const used = new Set(sourceEntries.flatMap(([, fileSource]) => [...catalogKeysInSource(fileSource)]));
  assert.ok(used.size >= 75, "expected the misc surfaces to migrate all user-visible copy");
  assert.deepEqual([...used].sort(), Object.keys(english).sort(), "misc catalog has no missing or unused keys");
  assert.equal(t(english, "misc.model.houseUnavailable"), "House unavailable");
  assert.equal(t(english, "misc.answerHonesty.handle", { handle: "inspection-1" }), "Handle: inspection-1");
  assert.equal(
    tPlural(english, "misc.answerHonesty.executedLedgerEntries", 2, "en"),
    "2 executed ledger entries."
  );
});

test("all 35 locales carry the final English misc catalog", () => {
  const locales = readdirSync(join(root, "messages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(locales.length, 35);
  for (const locale of locales) {
    assert.deepEqual(JSON.parse(source(`messages/${locale}/misc.json`)), english, `${locale}/misc catalog`);
  }
});

test("misc components contain no hard-coded user-visible English", () => {
  assert.deepEqual(sourceEntries.flatMap(([path, fileSource]) => visibleEnglish(path, fileSource)), []);
});

test("safe English fallbacks and existing component behavior remain intact", () => {
  for (const path of ownedFiles.slice(0, 3)) {
    assert.match(source(path), /import miscEnglish from "@\/messages\/en\/misc\.json"/);
  }

  const honesty = source("components/AnswerHonestyDrawer.tsx");
  for (const contractField of [
    "condition_mark_records",
    "cost_envelope",
    "memory_disclosure",
    "inspection_handle",
    "ledger_digest_handle",
    "shadow_suppressions"
  ]) {
    assert.ok(honesty.includes(contractField), `honesty drawer keeps ${contractField}`);
  }
  assert.match(honesty, /unrepresentedEdges\(answer\)/);
  assert.match(honesty, /data-ai-generated="true"/);

  const model = source("components/ModelPresentation.tsx");
  for (const maker of ["anthropic", "openai", "google", "xai", "alibaba"]) {
    assert.match(model, new RegExp(`case "${maker}"`));
  }
  assert.match(model, /makerIdentityLabel\(\{ maker, modelId \}\)/);
  assert.match(model, /data-maker-absence/);

  const boundary = source("components/ScoringErrorBoundary.tsx");
  assert.match(boundary, /reportClientFault\(CLIENT_REPORTS\.scoring\)/);
  assert.match(boundary, /this\.props\.fallback \?\?/);
  assert.match(boundary, /role="status" aria-live="polite"/);

  const toast = source("components/Toast.tsx");
  assert.match(toast, /className="toast" role="status"/);
  assert.match(toast, /className="toastDot"/);
  assert.match(toast, /\{message\}/);
});

test("the English allowlist no longer exempts misc-owned files", () => {
  const allowlist = source("lib/i18n/english-allowlist.txt");
  for (const path of ownedFiles) {
    assert.doesNotMatch(
      allowlist,
      new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m")
    );
  }
});
