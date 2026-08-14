import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// W7 depth-of-scrutiny control: the new-debate form exposes the per-debate
// adaptive-expansion budgets as a single preset control. "Standard" sends no
// adaptive_expansion key at all (site-wide env defaults apply); deeper presets
// send only the coordinator's three sanctioned budget knobs, within the
// coordinator's BUDGET_BOUNDS (max_rounds/max_per_node <= 20,
// max_per_debate <= 100).
const root = process.cwd();
const newPagePath = join(root, "app", "new", "page.tsx");
const libPath = join(root, "lib", "scrutinyDepth.ts");

test("new-debate form wires the depth-of-scrutiny presets into config.adaptive_expansion", () => {
  const pageSource = readFileSync(newPagePath, "utf8");
  const libSource = readFileSync(libPath, "utf8");

  // The page consumes the shared preset helper (no inline budget literals).
  assert.match(pageSource, /from "@\/lib\/scrutinyDepth"/, "page must import the scrutiny preset helper");
  assert.match(
    pageSource,
    /adaptiveExpansionBudgetsFor\(/,
    "page must derive budgets through adaptiveExpansionBudgetsFor"
  );
  assert.match(
    pageSource,
    /config\.adaptive_expansion\s*=/,
    "submit must attach the budgets as config.adaptive_expansion"
  );
  assert.match(pageSource, /Depth of scrutiny/, "the control must be labeled 'Depth of scrutiny'");
  assert.doesNotMatch(
    pageSource,
    /max_per_debate|max_per_node|max_rounds/,
    "budget literals live in lib/scrutinyDepth.ts, not in the page"
  );

  // The helper: standard sends nothing; deeper presets send exactly the three
  // coordinator knobs.
  assert.match(libSource, /"standard"[\s\S]{0,400}?return null/, "standard preset must send no budgets");
  for (const knob of ["max_rounds", "max_per_node", "max_per_debate"]) {
    assert.match(libSource, new RegExp(knob), `helper must set ${knob}`);
  }

  // Every numeric budget in the helper stays within the coordinator's
  // sanitization bounds, so a preset can never be silently dropped.
  const budgets = [...libSource.matchAll(/(max_rounds|max_per_node|max_per_debate):\s*(\d+)/g)];
  assert.ok(budgets.length >= 6, "expected budget literals for the non-standard presets");
  for (const [, knob, rawValue] of budgets) {
    const value = Number(rawValue);
    const bound = knob === "max_per_debate" ? 100 : 20;
    assert.ok(value >= 1 && value <= bound, `${knob}=${value} must stay within coordinator bounds`);
  }
});
