import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const componentPaths = [
  "components/DebateCanvas.tsx",
  "components/CanvasViewport.tsx",
  "components/DebateThread.tsx",
  "components/DebateSplit.tsx",
  "components/DebateTree.tsx",
  "components/DebateMap.tsx",
  "components/DebateOutline.tsx",
  "components/ArgumentFocusView.tsx",
  "components/ReferenceNodeMeta.tsx"
];
const read = (path) => readFileSync(join(root, path), "utf8");
const sources = new Map(componentPaths.map((path) => [path, read(path)]));

const english = JSON.parse(read("messages/en/debateViews.json"));
const usedKeys = new Set();
for (const source of sources.values()) {
  for (const match of source.matchAll(/\bt\(\s*catalog,\s*"(debateViews\.[A-Za-z0-9.]+)"/g)) {
    usedKeys.add(match[1]);
  }
  for (const match of source.matchAll(/\btPlural\(\s*catalog,\s*"(debateViews\.[A-Za-z0-9.]+)"/g)) {
    usedKeys.add(`${match[1]}.one`);
    usedKeys.add(`${match[1]}.other`);
  }
}

test("every debateViews key used by the view components exists in English", () => {
  assert.ok(usedKeys.size > 0, "expected debateViews translation calls");
  for (const key of usedKeys) {
    assert.equal(typeof english[key], "string", `missing English message: ${key}`);
    assert.notEqual(english[key].trim(), "", `empty English message: ${key}`);
  }
  assert.deepEqual(Object.keys(english).sort(), [...usedKeys].sort(), "catalog contains unused or unreferenced keys");
});

const brandOrToken = new Set(["AI"]);
const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const addIfEnglish = (failures, text) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (/[A-Za-z]{3,}/.test(normalized) && !brandOrToken.has(normalized)) failures.push(normalized);
};

function visibleEnglish(path, source) {
  const failures = [];
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
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
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return failures;
}

const legacyCopy = [
  "Unable to load generation history",
  "Queued",
  "Select argument:",
  "Scoring issues:",
  "Open scoring explanation for",
  "Open the recorded V3 scores for",
  "Evidence sourcing for",
  "Scoring summary for",
  "REVIEW AGREED BY:",
  "REVIEW DISPUTED BY:",
  "REVIEW COULD NOT ASSESS:",
  "Pro",
  "Con",
  "Even",
  "Supports",
  "Opposes",
  "Rebuts",
  "Branches",
  "Stopped",
  "Active",
  "Archived"
];

test("debate view components contain no hard-coded user-visible English", () => {
  const failures = [];
  for (const [path, source] of sources) {
    failures.push(...visibleEnglish(path, source).map((copy) => `${path}: ${copy}`));
    for (const copy of legacyCopy) {
      if (source.includes(`"${copy}"`) || source.includes(`\`${copy}`)) {
        failures.push(`${path}: ${copy}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("known role labels and regeneration capability copy go through debateViews", () => {
  for (const path of [
    "components/DebateCanvas.tsx",
    "components/DebateThread.tsx",
    "components/DebateSplit.tsx",
    "components/DebateOutline.tsx"
  ]) {
    assert.doesNotMatch(sources.get(path), /\{roleLabel\(/, `${path} renders roleLabel directly`);
  }
  assert.doesNotMatch(
    sources.get("components/DebateMap.tsx"),
    /readoutRole === "root" \? [^:]+ : readoutRole/,
    "DebateMap renders raw known role tokens"
  );
  for (const path of [
    "components/DebateCanvas.tsx",
    "components/DebateThread.tsx",
    "components/DebateTree.tsx"
  ]) {
    assert.doesNotMatch(
      sources.get(path),
      /V3_MISSING_CAPABILITIES\.nodeRegeneration/,
      `${path} bypasses the debateViews catalog for its regeneration tooltip`
    );
  }
});

test("the reference view anatomy remains intact after copy migration", () => {
  const canvas = sources.get("components/DebateCanvas.tsx");
  const viewport = sources.get("components/CanvasViewport.tsx");
  const thread = sources.get("components/DebateThread.tsx");
  const split = sources.get("components/DebateSplit.tsx");
  const map = sources.get("components/DebateMap.tsx");
  const meta = sources.get("components/ReferenceNodeMeta.tsx");

  assert.match(canvas, /className="nodeArgHeader"/);
  assert.match(canvas, /className="nodeScoreRow"/);
  assert.match(canvas, /className="modelPill metaLine"/);
  assert.match(canvas, /data-reference-tree-footer/);
  assert.match(canvas, /initialAnchorTop=\{allCardsMeasured \? layout\.placed\[0\]\?\.y \?\? null : null\}/);
  assert.match(viewport, /surface\.scrollTo\(\{ left: 0, top: Math\.max\(0, initialAnchorTop \* fitStateRef\.current\.zoom - 120\) \}\)/);
  assert.match(thread, /data-reference-thread-card/);
  assert.match(thread, /<ReferenceReviewLine review=\{v3Node\?\.review\}/);
  assert.match(meta, /className="nodeReviewLine"/);
  assert.match(thread, /data-reference-thread-footer/);
  assert.match(split, /data-reference-split-focus/);
  assert.match(split, /className="splitCardShell"/);
  assert.match(map, /className="mapLegendItem">[\s\S]*?debateViews\.mapReasoning/);
  assert.match(map, /data-reference-map-readout/);
});
