import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { assertLocalizedCatalog, assertTranslationSample } from "./catalogContractAssertions.mjs";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const sourcePaths = [
  "app/debate/[id]/DebatePageClient.tsx",
  "app/debate/[id]/DebatePageGate.tsx",
  "app/debate/[id]/page.tsx",
  "app/debate/[id]/loading.tsx",
  "lib/v3/labels.ts",
  "lib/scoringStatusCopy.ts",
  "lib/scoringFormat.ts",
  "lib/debatePresentation.ts"
];
const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const labelTableName = /(?:label|copy|message|title|text|hint|placeholder)/i;
const brandOrMachineText = new Set([
  "AI",
  "Codex",
  "Dialectical Engine",
  "UTC",
  "no scoring judge outputs are available for this debate."
]);

const addIfEnglish = (failures, text) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (/[A-Za-z]{3,}/.test(normalized) && !brandOrMachineText.has(normalized)) failures.push(normalized);
};

const visibleEnglishFromSource = (path, source) => {
  const failures = [];
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    false,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const inspect = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) addIfEnglish(failures, node.getText(parsed));
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(parsed))) {
      const initializer = node.initializer;
      if (initializer && ts.isStringLiteral(initializer)) addIfEnglish(failures, initializer.text);
      if (
        initializer && ts.isJsxExpression(initializer) && initializer.expression &&
        (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression))
      ) addIfEnglish(failures, initializer.expression.text);
    }
    if (
      ts.isJsxExpression(node) && node.expression &&
      (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
    ) addIfEnglish(failures, node.expression.text);
    if (
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      labelTableName.test(node.name.text) && node.initializer && ts.isObjectLiteralExpression(node.initializer)
    ) {
      const inspectTable = (tableNode) => {
        if (ts.isStringLiteral(tableNode) || ts.isNoSubstitutionTemplateLiteral(tableNode)) {
          addIfEnglish(failures, tableNode.text);
          return;
        }
        ts.forEachChild(tableNode, inspectTable);
      };
      inspectTable(node.initializer);
      return;
    }
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return failures;
};

test("all 35 locales expose the exact debate chrome contract and translated sample", () => {
  const localeDirectories = readdirSync(join(root, "messages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(localeDirectories.length, 35);
  const english = JSON.parse(read("messages/en/debateChrome.json"));
  assert.ok(Object.keys(english).length > 0);
  const catalogs = new Map();
  for (const locale of localeDirectories) {
    const catalog = JSON.parse(read(`messages/${locale}/debateChrome.json`));
    catalogs.set(locale, catalog);
    assertLocalizedCatalog({ english, localized: catalog, locale, namespace: "debateChrome" });
  }
  assertTranslationSample({ catalogs, english, namespace: "debateChrome" });
});

test("every debateChrome key used by the owned sources exists in English", () => {
  const english = JSON.parse(read("messages/en/debateChrome.json"));
  const usedKeys = new Set(
    sourcePaths.flatMap((path) =>
      [...read(path).matchAll(/["'`](debateChrome\.[A-Za-z0-9.]+)["'`]/g)].map((match) => match[1])
    )
  );
  assert.ok(usedKeys.size > 0);
  assert.deepEqual(
    [...usedKeys].filter((key) =>
      !Object.hasOwn(english, key) && !Object.hasOwn(english, `${key}.other`)
    ),
    []
  );
});

test("owned debate chrome sources contain no hard-coded visible English", () => {
  const failures = sourcePaths.flatMap((path) =>
    visibleEnglishFromSource(path, read(path)).map((copy) => `${path}: ${copy}`)
  );
  assert.deepEqual(failures, []);
});

test("the server threads debateChrome through the existing server-client boundary", () => {
  const page = read("app/debate/[id]/page.tsx");
  const gate = read("app/debate/[id]/DebatePageGate.tsx");
  const client = read("app/debate/[id]/DebatePageClient.tsx");
  assert.match(page, /loadNamespace\(locale, "debateChrome"\)/);
  assert.match(page, /debateChromeCatalog=\{debateChromeCatalog\}/);
  assert.match(gate, /debateChromeCatalog/);
  assert.match(client, /debateChromeCatalog/);
});

test("the English allowlist no longer exempts owned debate chrome files", () => {
  const allowlist = read("lib/i18n/english-allowlist.txt");
  assert.doesNotMatch(allowlist, /^app\/debate\/\*\*$/m);
  assert.doesNotMatch(allowlist, /^lib\/(?:debatePresentation|scoringFormat)\.ts$/m);
});
