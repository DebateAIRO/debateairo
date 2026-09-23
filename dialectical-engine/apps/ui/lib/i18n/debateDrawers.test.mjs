import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { t, tPlural } from "./translate.ts";
import { assertLocalizedCatalog, assertTranslationSample } from "./catalogContractAssertions.mjs";

const root = process.cwd();
const namespace = "debateDrawers";
const sourceFiles = [
  "components/NodeDetailDrawer.tsx",
  "components/VerdictBanner.tsx",
  "components/SynthesisPanel.tsx",
  "components/GuideModal.tsx",
  "components/DebateWorkspaceDrawer.tsx",
  "components/InvestigationDrawer.tsx",
  "components/RecommendedInvestigations.tsx",
  "components/ChallengePopover.tsx"
];
const read = (path) => readFileSync(join(root, path), "utf8");
const sourceEntries = sourceFiles.map((path) => [path, read(path)]);
const englishPath = join(root, "messages", "en", `${namespace}.json`);
const readEnglish = () => existsSync(englishPath)
  ? JSON.parse(readFileSync(englishPath, "utf8"))
  : {};

const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const allowedCodeTokens = new Set([
  "abandon",
  "abandoned",
  "absent",
  "active",
  "agree",
  "archived",
  "cannot-assess",
  "contested",
  "continue",
  "deepen",
  "dialectical",
  "dispute",
  "evidence_unverified",
  "gold",
  "claim_type_unknown",
  "refuted",
  "reopen",
  "root",
  "seek_evidence",
  "strengthened",
  "structural",
  "supported",
  "suppressed_no_evidence",
  "unavailable",
  "unsupported",
  "working"
]);

function visibleEnglish(path, source) {
  const failures = [];
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const add = (node, value) => {
    const text = value.replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{2,}/.test(text)) return;
    const line = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
    failures.push(`${path}:${line}: ${text}`);
  };
  const insideInvisibleAttribute = (node) => {
    let current = node.parent;
    while (current) {
      if (ts.isJsxAttribute(current)) return !visibleAttributes.has(current.name.getText(parsed));
      if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return false;
      current = current.parent;
    }
    return false;
  };
  const structuralString = (node) => {
    const value = node.text;
    if (value.startsWith(`${namespace}.`)) return true;
    if (value.startsWith("var(--")) return true;
    if (allowedCodeTokens.has(value)) return true;
    if (node.parent && ts.isImportDeclaration(node.parent)) return true;
    if (node.parent && ts.isExportDeclaration(node.parent)) return true;
    if (node.parent && ts.isExpressionStatement(node.parent) && value === "use client") return true;
    if (node.parent && ts.isLiteralTypeNode(node.parent)) return true;
    let ancestor = node.parent;
    while (ancestor) {
      if (ts.isTypeNode(ancestor)) return true;
      if (ts.isExpression(ancestor) || ts.isStatement(ancestor)) break;
      ancestor = ancestor.parent;
    }
    if (node.parent && ts.isPropertyAssignment(node.parent) && node.parent.name === node) return true;
    if (node.parent && ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node) return true;
    if (
      node.parent && ts.isBinaryExpression(node.parent) &&
      [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken
      ].includes(node.parent.operatorToken.kind)
    ) return true;
    if (insideInvisibleAttribute(node)) return true;
    return false;
  };
  const inspect = (node) => {
    if (ts.isJsxText(node)) add(node, node.text);
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !structuralString(node)
    ) add(node, node.text);
    if (ts.isTemplateExpression(node) && !insideInvisibleAttribute(node)) {
      const literalText = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
      add(node, literalText);
    }
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return failures;
}

test("all drawer components default to the English drawer catalogue and every used key exists", () => {
  assert.ok(existsSync(englishPath), "messages/en/debateDrawers.json must exist");
  const english = readEnglish();
  const usedKeys = new Set();
  const pluralRoots = new Set();
  for (const [path, source] of sourceEntries) {
    assert.match(source, /import debateDrawersEnglish from "@\/messages\/en\/debateDrawers\.json"/, `${path} imports the safe English fallback`);
    assert.match(source, /catalog\s*=\s*debateDrawersEnglish/, `${path} defaults its catalogue prop safely`);
    for (const match of source.matchAll(/"(debateDrawers\.[^"]+)"/g)) {
      usedKeys.add(match[1]);
    }
    for (const match of source.matchAll(/\btPlural\(catalog,\s*"(debateDrawers\.[^"]+)"/g)) {
      pluralRoots.add(match[1]);
    }
  }
  assert.ok(usedKeys.size > 0, "drawer sources must use debateDrawers translation keys");
  const expectedKeys = [...usedKeys]
    .filter((key) => !pluralRoots.has(key))
    .concat([...pluralRoots].flatMap((root) => [`${root}.one`, `${root}.other`]))
    .sort();
  assert.deepEqual(
    Object.keys(english).sort(),
    expectedKeys,
    "the English catalogue exactly matches every drawer translation key"
  );
  assert.equal(t(english, "debateDrawers.node.argument"), "Argument");
  assert.equal(
    t(english, "debateDrawers.node.pathExpanded", { kind: "challenge" }),
    "This path expanded because of a challenge decision."
  );
  assert.equal(
    tPlural(english, "debateDrawers.recommendations.more", 2, "en"),
    "2 more recommendations"
  );
});

test("all 35 locales carry the exact debateDrawers contract and translated sample", () => {
  const english = readEnglish();
  const localeDirectories = readdirSync(join(root, "messages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(localeDirectories.length, 35);
  const missing = localeDirectories.filter((locale) =>
    !existsSync(join(root, "messages", locale, `${namespace}.json`))
  );
  assert.deepEqual(missing, [], "every locale has a debateDrawers catalogue");
  const catalogs = new Map();
  for (const locale of localeDirectories) {
    const path = join(root, "messages", locale, `${namespace}.json`);
    if (!existsSync(path)) continue;
    const localized = JSON.parse(readFileSync(path, "utf8"));
    catalogs.set(locale, localized);
    assertLocalizedCatalog({ english, localized, locale, namespace });
  }
  assertTranslationSample({ catalogs, english, namespace });
});

test("drawer sources contain no hard-coded user-visible English", () => {
  assert.deepEqual(sourceEntries.flatMap(([path, source]) => visibleEnglish(path, source)), []);
});

test("the Turn 5 drawer keeps its reference hierarchy after localisation", () => {
  const drawer = read("components/NodeDetailDrawer.tsx");
  const css = read("app/globals.css");
  assert.match(drawer, /data-design-turn="5"/);
  assert.match(drawer, /className="drawerIntro"/);
  assert.match(drawer, /className="drawerReviewLine"/);
  assert.match(drawer, /className="drawerActions drawerReferenceActions"/);
  assert.match(drawer, /className="drawerHistoryRule"/);
  assert.match(css, /\.drawer\[data-drawer-panel\] \{[\s\S]*?width: min\(440px, 100vw\);/);
  assert.match(css, /\.drawerRecordTable \{[\s\S]*?border-radius: 12px;[\s\S]*?background: var\(--shell\);/);
  assert.match(css, /\.historyCardBody \{[\s\S]*?-webkit-line-clamp: 2;/);
});
