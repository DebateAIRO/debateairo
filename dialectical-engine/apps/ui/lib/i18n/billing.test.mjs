import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { assertLocalizedCatalog, assertTranslationSample } from "./catalogContractAssertions.mjs";

// The billing namespace (paid-plans spec §2.10; contract §10). B10c creates it
// with the usage bars; P18 adds its pages' keys and its files to `ownedFiles`.
const root = process.cwd();
const ownedFiles = ["components/billing/UsageBars.tsx"];
const source = (path) => readFileSync(join(root, path), "utf8");
const englishPath = join(root, "messages/en/billing.json");
const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);

function hardCodedVisibleEnglish(path, fileSource) {
  const failures = [];
  const parsed = ts.createSourceFile(path, fileSource, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const add = (text) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (/[A-Za-z]{3,}/.test(normalized)) failures.push(normalized);
  };
  const inspect = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) add(node.getText(parsed));
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(parsed))
      && node.initializer && ts.isStringLiteral(node.initializer)) add(node.initializer.text);
    if (ts.isJsxExpression(node) && node.expression
      && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))) add(node.expression.text);
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return failures;
}

test("every billing key the owned sources name exists in English", () => {
  assert.ok(existsSync(englishPath), "messages/en/billing.json must exist");
  const english = JSON.parse(readFileSync(englishPath, "utf8"));
  const used = new Set(ownedFiles.flatMap((path) =>
    [...source(path).matchAll(/"(billing\.[A-Za-z0-9.]+)"/g)].map((match) => match[1])));
  assert.ok(used.size > 0, "expected the billing sources to name billing keys");
  for (const key of used) assert.ok(Object.hasOwn(english, key), `${key} exists in English`);
});

test("all 35 locales expose the exact billing contract and a translated sample", () => {
  const english = JSON.parse(readFileSync(englishPath, "utf8"));
  const locales = readdirSync(join(root, "messages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.equal(locales.length, 35);
  const catalogs = new Map();
  for (const locale of locales) {
    const catalog = JSON.parse(source(`messages/${locale}/billing.json`));
    catalogs.set(locale, catalog);
    assertLocalizedCatalog({ english, localized: catalog, locale, namespace: "billing" });
    for (const [key, value] of Object.entries(catalog)) {
      assert.doesNotMatch(value, /\$|USD|€/u, `${locale}/billing:${key} shows no money`);
    }
  }
  assertTranslationSample({ catalogs, english, namespace: "billing" });
});

test("the billing sources carry no hard-coded visible English", () => {
  const failures = ownedFiles.flatMap((path) => hardCodedVisibleEnglish(path, source(path)).map((text) => `${path}: ${text}`));
  assert.deepEqual(failures, []);
});

test("the namespace is registered with the provider union and the server loader for every locale", () => {
  assert.match(source("lib/i18n/I18nProvider.tsx"), /\| "billing"/);
  const loaders = source("lib/i18n/server.ts");
  const locales = readdirSync(join(root, "messages"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const { name } of locales) {
    assert.ok(loaders.includes(`billing: () => import("../../messages/${name}/billing.json")`), `${name} billing loader`);
  }
});
