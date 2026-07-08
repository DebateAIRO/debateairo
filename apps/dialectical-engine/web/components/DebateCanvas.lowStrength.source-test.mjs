import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const canvasPath = join(process.cwd(), "components", "DebateCanvas.tsx");

test("DebateCanvas.tsx imports isLowStrengthNode from the shared debateTreeUtils module (no local duplicate)", () => {
  const source = readFileSync(canvasPath, "utf8");

  assert.match(
    source,
    /import \{ isLowStrengthNode \} from "@\/lib\/debateTreeUtils";/,
    "DebateCanvas should import isLowStrengthNode from lib/debateTreeUtils rather than redefining a threshold locally"
  );

  // Guard against a duplicated local threshold constant/function creeping back in.
  assert.doesNotMatch(
    source,
    /function isLowStrengthNode/,
    "DebateCanvas must not define its own isLowStrengthNode -- reuse the 9.3 helper"
  );
  assert.doesNotMatch(
    source,
    /<=\s*0\.35/,
    "DebateCanvas must not hardcode/duplicate the 0.35 threshold -- it belongs solely in debateTreeUtils.isLowStrengthNode"
  );
});

test("DebateCanvas.tsx declares the same NEXT_PUBLIC_VERDICT_FIRST_UI flag constant as DebateTree.tsx", () => {
  const source = readFileSync(canvasPath, "utf8");

  assert.match(
    source,
    /const VERDICT_FIRST_UI_ENABLED = process\.env\.NEXT_PUBLIC_VERDICT_FIRST_UI === "true";/,
    "A module-level flag constant must be derived directly from process.env.NEXT_PUBLIC_VERDICT_FIRST_UI (house pattern)"
  );
});

test("cardStyle.opacity composes the new low-strength dim onto the existing scoreFilterMatch/abandoned expression", () => {
  const source = readFileSync(canvasPath, "utf8");

  // The pre-existing base expression (scoreFilterMatch ? (abandoned ? 0.58 : 1) : 0.38) must survive
  // verbatim as a sub-expression -- composition, not replacement.
  assert.match(
    source,
    /scoreFilterMatch \? \(state === "abandoned" \? 0\.58 : 1\) : 0\.38/,
    "The existing scoreFilterMatch/abandoned opacity terms (0.58 abandoned, 1 normal, 0.38 filtered-out) must remain unchanged and present verbatim"
  );

  // The opacity assignment itself must multiply/compose that base expression with a low-strength dim factor.
  const opacityMatch = source.match(/opacity:\s*\(scoreFilterMatch[^\n]+/);
  assert.ok(opacityMatch, "Expected to find the cardStyle opacity: (scoreFilterMatch ...) assignment");
  const opacityExpr = opacityMatch[0];

  assert.match(
    opacityExpr,
    /scoreFilterMatch \? \(state === "abandoned" \? 0\.58 : 1\) : 0\.38/,
    "The opacity expression must still contain the existing scoreFilterMatch/abandoned/filtered terms"
  );
  assert.match(
    opacityExpr,
    /\*\s*lowStrengthDim/,
    "The opacity expression must compose (multiply) the existing base opacity with a new lowStrengthDim factor"
  );
});

test("low-strength dim factor is flag-gated and honors the honesty contract via isLowStrengthNode", () => {
  const source = readFileSync(canvasPath, "utf8");

  assert.match(
    source,
    /const lowStrength = isLowStrengthNode\(scoring\?\.scores\?\.strength\)/,
    "lowStrength must be derived from isLowStrengthNode(scoring?.scores?.strength) -- missing scoring must never dim (honesty contract)"
  );

  assert.match(
    source,
    /const lowStrengthDim = VERDICT_FIRST_UI_ENABLED && lowStrength \? [\d.]+ : 1/,
    "lowStrengthDim must be gated behind VERDICT_FIRST_UI_ENABLED, defaulting to a neutral 1 (no-op) factor when the flag is off or the node isn't low-strength"
  );
});

test("data-low-strength attribute is present on the dimmed card and gated identically to the dim factor", () => {
  const source = readFileSync(canvasPath, "utf8");

  assert.match(
    source,
    /data-low-strength=\{VERDICT_FIRST_UI_ENABLED && lowStrength \? "true" : undefined\}/,
    "A data-low-strength attribute must be applied to the card, gated behind VERDICT_FIRST_UI_ENABLED && lowStrength, rendering literal \"true\" or undefined"
  );
});

test("nodes remain fully rendered and clickable -- no conditional return/filter introduced for low-strength", () => {
  const source = readFileSync(canvasPath, "utf8");

  // openIfDone must remain gated purely on state, not on low-strength.
  assert.match(
    source,
    /function openIfDone\(\) \{\s*if \(state === "done" \|\| state === "abandoned"\) onOpenNode\(node\.id\);\s*\}/,
    "openIfDone must remain unchanged -- low-strength must never affect click/open behavior"
  );

  assert.doesNotMatch(
    source,
    /if\s*\(\s*lowStrength[\s\S]{0,40}return null/,
    "Low-strength nodes must never be conditionally removed from rendering"
  );

  // layout.placed.map(...) must still render every placed card unconditionally (no low-strength filter).
  assert.match(
    source,
    /layout\.placed\.map\(\(placed\) => \(/,
    "All placed claims must still be mapped/rendered directly -- no low-strength based filtering of the placed list"
  );
});
