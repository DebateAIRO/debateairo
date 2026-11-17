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
  // Design Document v2 (screen 3a, owner's instruction of 2026-11-16: the UI looks exactly like
  // that document): both tabs are weight 700, the current one told apart by its fill, its text
  // colour and its shadow (tests/unit/pda-s03-keyboard-accessibility.test.ts). This replaces the
  // 600 that 58ba1376 had restored.
  assert.match(css, /\.libTab \{[^}]*font-weight: 700;/);
  // Design Document v2 (screen 3a, same instruction): the library row is ONE box, the core's
  // (fill, hairline, 13px radius, 14px 18px padding); the link around it draws nothing and only
  // slides on hover. This replaces V's ruling of 2026-09-28 (option a: a shell tray around the
  // core). The markup keeps its two elements and their data-bezel names, so only the tray's
  // look is gone. Each rule is read inside its own braces ([^}]*).
  assert.match(library, /<Link className="libRow" href=\{href\} data-library-row data-bezel="shell"[^>]*>\s*<div className="libRowCore" data-bezel="core"[^>]*>\s*<div className="libRowBody">/);
  assert.doesNotMatch(library, /className="libRow(Core)?"[^>]*style=/);
  const libRowRule = css.match(/\.libRow \{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(libRowRule, /background|border:|padding/);
  assert.match(css, /\.libRowCore \{[^}]*background: var\(--core\);[^}]*border: 1px solid var\(--line\);[^}]*border-radius: 13px;[^}]*padding: 14px 18px;/);
  assert.match(css, /\.libRow:hover \{ transform: translateX\(4px\);/);
});
