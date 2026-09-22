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
      if (!entry.endsWith(".tsx")) continue;
      const path = normalized(relative(root, absolute));
      if (allowed(path)) continue;
      const source = readFileSync(absolute, "utf8");
      const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
      const inspect = (node) => {
        if (node.kind === ts.SyntaxKind.JsxText) {
          const text = node.getText(parsed).replace(/\s+/g, " ").trim();
          if (/[A-Za-z]{3,}/.test(text) && !brandOrToken.has(text)) failures.push(`${path}: ${text}`);
        }
        ts.forEachChild(node, inspect);
      };
      inspect(parsed);
    }
  };
  visit(root);
  assert.deepEqual(failures, []);
});
