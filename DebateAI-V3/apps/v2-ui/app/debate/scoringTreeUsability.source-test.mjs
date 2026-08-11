import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(join(root, "app", "debate", "[id]", "DebatePageClient.tsx"), "utf8");
const canvasSource = readFileSync(join(root, "components", "DebateCanvas.tsx"), "utf8");

test("score chips open the same tree node details path as node cards", () => {
  assert.match(
    canvasSource,
    /const openNodeDetails = \(\) => onOpenNode\(node\.id\);/,
    "Canvas score chips should open details for the real rendered node id"
  );
  assert.match(
    canvasSource,
    /<ScoreBadges[\s\S]*node=\{node\}[\s\S]*scoring=\{scoring\}[\s\S]*openNodeDetails=\{openNodeDetails\}/,
    "ScoreBadges should receive the same node-local detail opener used by the canvas card"
  );
  assert.match(
    canvasSource,
    /className="scoreBadgeButton"[\s\S]*event\.stopPropagation\(\);[\s\S]*openNodeDetails\(\);/,
    "Clicking STR/UNC/IMP chips should open details without also toggling the parent node"
  );
  assert.match(
    pageSource,
    /onOpenNode=\{\(nodeId\) => \{[\s\S]*setSelectedNodeId\(nodeId\);[\s\S]*setDetailNodeId\(nodeId\);[\s\S]*\}\}/,
    "The page should convert canvas detail opens into selected node plus drawer state"
  );
});

test("recommendation Open target keeps the user in Tree context", () => {
  assert.match(
    pageSource,
    /function focusRecommendationNode\(targetNodeId: string\): boolean \{[\s\S]*findNode\(debate\?\.tree \?\? null, targetNodeId\)[\s\S]*setView\("tree"\);[\s\S]*setSelectedNodeId\(targetNodeId\);[\s\S]*setDetailNodeId\(targetNodeId\);[\s\S]*return true;/,
    "Recommendation targets should verify a real tree node, switch back to Tree, select it, and open details"
  );
  assert.match(
    pageSource,
    /showToast\("Recommendation target is no longer visible\."\);[\s\S]*return false;/,
    "Stale recommendation targets should fail honestly instead of fabricating a tree target"
  );
  assert.match(
    pageSource,
    /<RecommendedInvestigations[\s\S]*canOpenTarget=\{canFocusRecommendationNode\}[\s\S]*onOpenTarget=\{focusRecommendationNode\}/,
    "The recommendation list should use the guarded Tree-focus callback"
  );
});
