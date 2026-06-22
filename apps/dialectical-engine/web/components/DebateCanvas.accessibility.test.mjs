import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "components", "DebateCanvas.tsx"), "utf8");

test("scored node badges expose a keyboard-operable details control", () => {
  assert.match(source, /<button\s+type="button"\s+className="scoreBadgeButton"/);
  assert.match(source, /aria-label=\{`Open scoring explanation for \$\{node\.claim\}`\}/);
  assert.match(source, /event\.stopPropagation\(\);\s*openIfDone\(\);/s);
});
