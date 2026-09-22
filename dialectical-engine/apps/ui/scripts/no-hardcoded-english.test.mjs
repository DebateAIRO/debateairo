import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const allowlist = readFileSync(resolve(root, "lib/i18n/english-allowlist.txt"), "utf8")
  .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
const normalized = (path) => path.split(sep).join("/");
const allowed = (path) => allowlist.some((entry) =>
  entry.endsWith("/**") ? path.startsWith(entry.slice(0, -3)) : path === entry
);
const brandOrToken = new Set(["Dialectical Engine", "dezbatere.ro", "DebateAI", "AI"]);
const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const labelTableName = /(?:label|copy|message|title|text|hint|placeholder)/i;

const addIfEnglish = (failures, text) => {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (/[A-Za-z]{3,}/.test(normalizedText) && !brandOrToken.has(normalizedText)) failures.push(normalizedText);
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
    if (node.kind === ts.SyntaxKind.JsxText) {
      addIfEnglish(failures, node.getText(parsed));
    }
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
      path.endsWith(".ts") && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
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

test("the English scanner sees user-visible attributes and TypeScript label tables", () => {
  assert.deepEqual(
    visibleEnglishFromSource("fixture.tsx", '<input aria-label="Account name" placeholder="Type a claim" />'),
    ["Account name", "Type a claim"]
  );
  assert.deepEqual(
    visibleEnglishFromSource("fixture.tsx", '<span>{"Hard-coded English"}</span>'),
    ["Hard-coded English"]
  );
  assert.deepEqual(
    visibleEnglishFromSource("fixture.ts", 'const labels = { submit: "Start debate", cancel: "Cancel" };'),
    ["Start debate", "Cancel"]
  );
});

test("migrated JSX contains no hard-coded user-visible English", () => {
  const failures = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const absolute = resolve(directory, entry);
      if (statSync(absolute).isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const path = normalized(relative(root, absolute));
      if (allowed(path)) continue;
      const source = readFileSync(absolute, "utf8");
      failures.push(...visibleEnglishFromSource(path, source).map((text) => `${path}: ${text}`));
    }
  };
  visit(root);
  assert.deepEqual(failures, []);
});
