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
  // 58ba1376 restored the inactive-link weight to 600 so that
  // tests/unit/pda-s03-keyboard-accessibility.test.ts:193 — which pins
  // inactiveStyle.fontWeight to "600" — reads the ruled value. This pin held
  // the pre-merge 700 and is the same constant, so it follows that ruling.
  assert.match(css, /\.libTab \{[^}]*font-weight: 600;/);
  // The pin reads inside the .libRow rule only ([^}]*): a lazy [\s\S]*? span
  // let a double-bezel .libRow shell pass by borrowing .libRowCore's padding.
  // Dev's library row is one Link box; the port only localizes its copy.
  assert.match(css, /\.libRow \{[^}]*border-radius: 13px;[^}]*padding: 14px 18px;/);
  assert.doesNotMatch(css, /\.libRowCore\b/);
  assert.match(library, /<Link className="libRow" href=\{href\} data-library-row>\s*<div className="libRowBody">/);
  assert.match(css, /\.libRow:hover \{ transform: translateX\(4px\);/);
});
