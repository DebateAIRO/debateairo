import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const placement = /<LanguageSwitcher\s*\/>\s*<ModeToggle(?:\s+compact)?\s*\/>/g;
const normalizeRejectedCopy = (source) => source.toLowerCase()
  .replace(/&(?:nbsp|#160|#x0*a0);/gi, " ")
  .replace(/\{\s*["']\s+["']\s*\}/g, " ")
  .replace(/\$\{[^{}]*\}/g, " ")
  .replace(/["'`]\s*\+\s*["'`]/g, "")
  .replace(/[\s\u00a0]+/g, " ");

const assembledStrings = (path, source) => {
  if (!/\.tsx?$/.test(path)) return [];
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    false,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const bindings = new Map();
  const collectBindings = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      bindings.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectBindings);
  };
  collectBindings(parsed);

  const resolving = new Set();
  const resolveExpression = (node) => {
    if (!node) return undefined;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isParenthesizedExpression(node)) return resolveExpression(node.expression);
    if (ts.isTemplateExpression(node)) {
      return node.head.text + node.templateSpans.map((span) =>
        `${resolveExpression(span.expression) ?? " "}${span.literal.text}`
      ).join("");
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = resolveExpression(node.left);
      const right = resolveExpression(node.right);
      if (left !== undefined || right !== undefined) return `${left ?? " "}${right ?? " "}`;
    }
    if (ts.isIdentifier(node) && bindings.has(node.text) && !resolving.has(node.text)) {
      resolving.add(node.text);
      const value = resolveExpression(bindings.get(node.text));
      resolving.delete(node.text);
      return value;
    }
    return undefined;
  };
  const resolveJsx = (node) => {
    if (ts.isJsxText(node)) return node.getText(parsed);
    if (ts.isJsxExpression(node)) return resolveExpression(node.expression) ?? " ";
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      return node.children.map(resolveJsx).join("");
    }
    return "";
  };
  const strings = [];
  const collectStrings = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const value = resolveExpression(node.initializer);
      if (value !== undefined) strings.push(value);
    }
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) strings.push(resolveJsx(node));
    ts.forEachChild(node, collectStrings);
  };
  collectStrings(parsed);
  return strings;
};

const rejectedCopyCorpus = (sources) => normalizeRejectedCopy([
  ...sources.map(({ source }) => source),
  ...sources.flatMap(({ path, source }) => assembledStrings(path, source))
].join("\n"));

test("the language switcher is immediately before ModeToggle in all four headers", () => {
  const expectedPlacements = new Map([
    ["components/TopBar.tsx", 2],
    ["components/landing/LandingChrome.tsx", 1],
    ["app/debate/[id]/DebatePageClient.tsx", 1],
    ["components/support/Assistant.tsx", 1]
  ]);
  for (const [path, expected] of expectedPlacements) {
    assert.equal(read(path).match(placement)?.length ?? 0, expected, path);
  }
});

test("the owner-rejected debate-content caption is absent from UI source", () => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (entry === "node_modules" || entry === ".next") continue;
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.(?:ts|tsx|css|json)$/.test(entry)) files.push(path);
    }
  };
  visit(process.cwd());
  for (const path of files) {
    const source = rejectedCopyCorpus([{ path, source: readFileSync(path, "utf8") }]);
    assert.doesNotMatch(source, /debate content stays in the language it was argued in/, path);
    assert.doesNotMatch(source, /interface only\./, path);
  }
});

test("the rejected-copy scanner resolves source-level sentence assembly", () => {
  const fixtures = new Map([
    ["string concatenation", '<p>{"Debate content stays " + "in the language it was argued in."}</p>'],
    ["template interpolation", '<p>{`Debate content stays${gap}in the language it was argued in.`}</p>'],
    ["two-variable assembly", 'const lead = "Debate content stays "; const tail = "in the language it was argued in."; const caption = <p>{lead}{tail}</p>;'],
    ["HTML non-breaking space", "<p>Debate content stays&nbsp;in the language it was argued in.</p>"]
  ]);
  for (const [shape, source] of fixtures) {
    assert.match(
      rejectedCopyCorpus([{ path: "fixture.tsx", source }]),
      /debate content stays in the language it was argued in/,
      shape
    );
  }
});

test("the switcher exposes keyboard highlight and dismissal state to assistive technology", () => {
  const switcher = read("components/LanguageSwitcher.tsx");
  assert.match(switcher, /role="combobox"/);
  assert.match(switcher, /aria-activedescendant=\{[^}]+\}/);
  assert.match(switcher, /className="languageSwitcherList"[\s\S]*?role="listbox"/);
  assert.match(switcher, /role="option"/);
  assert.match(switcher, /tabIndex=\{-1\}/);
  assert.match(switcher, /aria-selected=\{selected\}/);
  assert.match(switcher, /onBlur=\{[^}]*relatedTarget/);
  assert.match(switcher, /useMemo\(\(\) => filtered\.map/);
  assert.doesNotMatch(switcher, /onPointerMove=\{\(\) => setHighlightedCode/);
});
