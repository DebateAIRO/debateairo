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
const brandOrToken = new Set(["Dialectical Engine", "dezbatere.ro", "Dialectical Engine", "AI"]);
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

test("the V4 map's dig choice, money lines (W3-4) and rewrites (W4-6) are scanned, never allowlisted, and carry no hard-coded English", () => {
  const files = [
    "components/v4/V4DigSuggest.tsx", "components/v4/V4DebateClient.tsx", "components/v4/V4MapTree.tsx",
    "components/v4/V4Outline.tsx", "components/v4/V4Panel.tsx", "components/v4/V4Rail.tsx", "components/v4/V4AskClient.tsx",
    "lib/v4/suggestions.ts", "lib/v4/money.ts",
    "components/v4/V4PathRewrite.tsx", "components/v4/V4LevelTrail.tsx", "components/v4/V4ChangesBar.tsx",
    "lib/v4/mapModel.ts", "lib/v4/changes.ts", "lib/v4/load.ts", "app/v4/debate/[id]/page.tsx",
    // V4 start step, Task 61: the trust word on a path's bar and the main answer's trust line.
    "components/v4/V4TrustBar.tsx", "components/v4/V4MainAnswer.tsx",
    // V4 start step, Task 62: what sits under the map's first card while the debate runs, and the ready moments.
    "components/v4/V4RunPaths.tsx", "components/v4/useV4Ready.tsx"
  ];
  for (const path of files) {
    assert.equal(allowed(path), false, path);
    assert.deepEqual(visibleEnglishFromSource(path, readFileSync(resolve(root, path), "utf8")), [], path);
  }
});

// V4 start step, Task 82 (amended 4 Nov and 4 Nov night): every shipped file the start step added to the V4 pages is scanned and never
// allowlisted, the choosing card's and the saved questions' among them. tests/unit/v4-storage.test.ts names the same files.
const startStepFiles = [
  // Tasks 72-75: the choosing card's seven V4Start* pieces.
  "components/v4/V4StartBar.tsx", "components/v4/V4StartCard.tsx", "components/v4/V4StartCombineBar.tsx", "components/v4/V4StartMore.tsx",
  "components/v4/V4StartRow.tsx", "components/v4/V4StartSuggest.tsx", "components/v4/V4StartWays.tsx",
  // Task 62: the paths under the map's first card. Task 79: a dig's paths and their plan.
  "components/v4/V4RunPaths.tsx", "components/v4/V4DigPaths.tsx", "lib/v4/digPathPlan.ts",
  // Tasks 64, 70, 76g, 76c and 76b, and Task 76e's update banner (owner answer Q8).
  "lib/v4/pathPlan.ts", "lib/v4/useStartPaths.ts", "lib/v4/questionBox.ts", "lib/v4/askHistory.ts", "lib/v4/startUndo.ts",
  "lib/v4/siteVersion.ts",
  // 4 Nov night: the saved questions and the kept step 2 (Tasks 76f and 76e), the clarifying questions (Task 76h), the map before the
  // first read and the hand-over (Tasks 76b and 76i), the fold (Task 76b) and the report's paths (Task 55c).
  "lib/v4/savedQuestion.ts", "lib/v4/useSavedQuestion.ts", "lib/v4/startKept.ts", "components/v4/V4NotStarted.tsx",
  "components/v4/V4AskQuestions.tsx", "lib/v4/clarifyWait.ts", "components/v4/V4PendingMap.tsx", "lib/v4/startHandOff.ts",
  "lib/v4/foldMove.ts", "lib/v4/reportPaths.ts",
  // Found by Task 82 among the files this branch added: the carry-on switch (Task 56), the site's country first (Task 76d), a dig's
  // failed page reading its map (Task 76j) and the stopped page's "Continue where it stopped" (Task 57g).
  "lib/v4/carryOn.ts", "lib/v4/clarifyPlace.ts", "lib/v4/useParentDigRetry.ts", "components/v4/useStoppedContinue.tsx"
];

test("the V4 start step's files (Task 82) are scanned, never allowlisted, and carry no hard-coded English", () => {
  // Every V4Start* piece on disk is on the list, so a new piece joins it.
  const startPieces = readdirSync(resolve(root, "components/v4")).filter((name) => /^V4Start.*\.tsx$/u.test(name))
    .map((name) => `components/v4/${name}`);
  assert.ok(startPieces.length > 0);
  assert.deepEqual(startPieces.filter((path) => !startStepFiles.includes(path)), []);
  assert.deepEqual(startStepFiles.filter(allowed), []);
  // Every file's English at once, so one failure names every file that has some.
  const failures = startStepFiles.flatMap((path) =>
    visibleEnglishFromSource(path, readFileSync(resolve(root, path), "utf8")).map((text) => `${path}: ${text}`));
  assert.deepEqual(failures, []);
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
