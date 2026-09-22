import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const placement = /<LanguageSwitcher\s*\/>\s*<ModeToggle(?:\s+compact)?\s*\/>/;

test("the language switcher is immediately before ModeToggle in all four headers", () => {
  for (const path of [
    "components/TopBar.tsx",
    "components/landing/LandingChrome.tsx",
    "app/debate/[id]/DebatePageClient.tsx",
    "components/support/Assistant.tsx"
  ]) assert.match(read(path), placement, path);
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
  const source = files.map((path) => readFileSync(path, "utf8")).join("\n").toLowerCase();
  const rejectedCaption = new RegExp("debate content stays" + " in the language it was argued in");
  assert.doesNotMatch(source, rejectedCaption);
});
