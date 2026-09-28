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
  // V's ruling of 2026-09-28 (option a): the library row is the two-layer card
  // the approved design names ("Card = shell + core double bezel", Turn 3a
  // library). T3-C2 built it (fd82d84e) and merge 690ebe14 dropped it. The
  // one-box pins that stood here froze dev's single Link box so the i18n port
  // (f76e47f9) could only localize copy; the ruling supersedes them, and
  // tests/render/t3-library.test.tsx (T3-C2-3) is the behaviour of record.
  // Each rule is read inside its own braces ([^}]*) so neither layer can pass
  // by borrowing the other's values: the shell is the tray, the core keeps the
  // row's former box, padding and radius.
  assert.match(library, /<Link className="libRow" href=\{href\} data-library-row data-bezel="shell"[^>]*>\s*<div className="libRowCore" data-bezel="core"[^>]*>\s*<div className="libRowBody">/);
  assert.match(css, /\.libRow \{[^}]*background: var\(--shell\);[^}]*padding: 4px;/);
  assert.match(css, /\.libRowCore \{[^}]*background: var\(--core\);[^}]*border-radius: 13px;[^}]*padding: 14px 18px;/);
  assert.match(css, /\.libRow:hover \{ transform: translateX\(4px\);/);
});
