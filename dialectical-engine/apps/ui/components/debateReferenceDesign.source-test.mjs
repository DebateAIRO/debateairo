import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const library = read("components/DebatesBuffer.tsx");
const css = read("app/globals.css");

test("Turn 3 library shares one row anatomy and carries real public model metadata", () => {
  assert.match(library, /models=\{debate\.models \?\? \[\]\}/);
  assert.match(library, /modelCount/);
  assert.match(css, /\.libTab \{[^}]*font-weight: 600;/);
  assert.match(css, /\.libRow \{[\s\S]*?border-radius: 13px;[\s\S]*?padding: 14px 18px;/);
  assert.match(css, /\.libRow:hover \{ transform: translateX\(4px\);/);
});
