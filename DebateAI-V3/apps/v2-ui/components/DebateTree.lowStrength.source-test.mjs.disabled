import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const treePath = join(process.cwd(), "components", "DebateTree.tsx");
const utilsPath = join(process.cwd(), "lib", "debateTreeUtils.ts");

test("debateTreeUtils exports isLowStrengthNode with an honest missing-score contract", () => {
  const source = readFileSync(utilsPath, "utf8");

  assert.match(
    source,
    /export function isLowStrengthNode\(\s*strength: number \| null \| undefined,\s*threshold = 0\.35,?\s*\): boolean/,
    "isLowStrengthNode should be a pure exported helper with the documented 0.35 default threshold"
  );

  // Citation of the shared threshold source so the two numbers don't silently drift apart.
  assert.match(
    source,
    /VERDICT_THRESHOLDS_VERSION/,
    "isLowStrengthNode must cite coordinator/app/scoring/verdict.py's VERDICT_THRESHOLDS_VERSION in a comment"
  );

  const fnMatch = source.match(
    /export function isLowStrengthNode\([\s\S]*?\n\}/
  );
  assert.ok(fnMatch, "Expected to find the isLowStrengthNode function body");
  const fnBody = fnMatch[0];

  assert.match(
    fnBody,
    /strength == null/,
    "isLowStrengthNode must explicitly guard on strength == null (covers null and undefined)"
  );
  assert.match(
    fnBody,
    /return false/,
    "Missing strength must return false -- unknown strength is never treated as low-strength"
  );
});

test("DebateTree.tsx imports isLowStrengthNode alongside the existing isAbandonedArgumentStatus", () => {
  const source = readFileSync(treePath, "utf8");

  assert.match(
    source,
    /import \{ isAbandonedArgumentStatus, isLowStrengthNode \} from "@\/lib\/debateTreeUtils";/,
    "DebateTree should import isLowStrengthNode from the shared debateTreeUtils module"
  );
});

test("DebateTree.tsx threads an optional scoringByNodeId prop in the DebateOutline-established style", () => {
  const source = readFileSync(treePath, "utf8");

  assert.match(
    source,
    /import type \{[\s\S]*NodeScoringPayload[\s\S]*\} from "@\/lib\/types";/,
    "DebateTree should import NodeScoringPayload for the optional scoring prop"
  );
  assert.match(
    source,
    /scoringByNodeId\?: Map<string, NodeScoringPayload>;/,
    "DebateTree props should accept an optional scoringByNodeId map, backward-compatible with existing callers"
  );
});

test("low-strength dimming is additive, flag-gated, and does not alter existing abandoned handling", () => {
  const source = readFileSync(treePath, "utf8");

  // Pre-existing abandoned-node handling must remain present, verbatim, unchanged.
  assert.match(
    source,
    /isAbandonedNode\(node\) \? " abandoned" : ""/,
    "Existing abandoned className logic must remain unchanged"
  );
  assert.match(
    source,
    /className=\{`badge\$\{isAbandonedNode\(node\) \? " abandonedBadge" : ""\}`\}/,
    "Existing abandonedBadge className logic must remain unchanged"
  );
  assert.match(
    source,
    /"abandonedPaths"/,
    "Existing abandonedPaths block must remain unchanged"
  );

  // New low-strength additions must exist.
  assert.match(
    source,
    /lowStrengthNode/,
    "A lowStrengthNode className must be introduced"
  );
  assert.match(
    source,
    /data-low-strength=\{[\s\S]{0,80}\? "true" : undefined\}/,
    "A data-low-strength attribute (rendering the literal string \"true\" when active, mirroring the existing data-selected convention) must be introduced for CSS/testing hooks"
  );

  // The lowStrengthNode className application must reference a flag constant that is itself
  // derived directly from NEXT_PUBLIC_VERDICT_FIRST_UI (confirming the flag gate wraps this
  // new behavior), and the data-low-strength attribute must use that same flag-derived value.
  assert.match(
    source,
    /const VERDICT_FIRST_UI_ENABLED = process\.env\.NEXT_PUBLIC_VERDICT_FIRST_UI === "true";/,
    "A module-level flag constant must be derived directly from process.env.NEXT_PUBLIC_VERDICT_FIRST_UI"
  );
  assert.match(
    source,
    /VERDICT_FIRST_UI_ENABLED[\s\S]{0,200}lowStrengthNode/,
    "lowStrengthNode className application must be gated behind the NEXT_PUBLIC_VERDICT_FIRST_UI-derived flag"
  );
  assert.match(
    source,
    /data-low-strength=\{VERDICT_FIRST_UI_ENABLED[\s\S]{0,80}\? "true" : undefined\}/,
    "data-low-strength attribute application must be gated behind the NEXT_PUBLIC_VERDICT_FIRST_UI-derived flag"
  );

  // isLowStrengthNode must actually be invoked using a node's resolved strength score.
  assert.match(
    source,
    /isLowStrengthNode\(scoring\?\.scores\?\.strength\)|isLowStrengthNode\(scoring\?\.scores\.strength\)/,
    "isLowStrengthNode should be derived from the node's resolved scoring payload strength"
  );
});

test("node remains fully clickable/inspectable -- no conditional return or filter introduced", () => {
  const source = readFileSync(treePath, "utf8");

  // The active/abandoned children split logic must remain the sole partitioning of children --
  // no additional filter/return based on low strength.
  assert.match(
    source,
    /const activeChildren = node\.children\.filter\(\(c\) => !isAbandonedNode\(c\)\);/,
    "activeChildren split must remain unchanged (no low-strength filtering introduced)"
  );
  assert.match(
    source,
    /const abandonedChildren = node\.children\.filter\(isAbandonedNode\);/,
    "abandonedChildren split must remain unchanged (no low-strength filtering introduced)"
  );

  // No new low-strength-based early return should exist in the card renderer.
  assert.doesNotMatch(
    source,
    /if\s*\(\s*lowStrength[\s\S]{0,40}return null/,
    "Low-strength nodes must never be conditionally removed from rendering"
  );
});
