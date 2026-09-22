import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const placement = /<LanguageSwitcher\s*\/>\s*<ModeToggle(?:\s+compact)?\s*\/>/g;

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
  const source = files.map((path) => readFileSync(path, "utf8")).join("\n").toLowerCase()
    .replace(/\{\s*["']\s+["']\s*\}/g, " ")
    .replace(/[\s\u00a0]+/g, " ");
  assert.doesNotMatch(source, /debate content stays in the language it was argued in/);
  assert.doesNotMatch(source, /interface only\./);
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
