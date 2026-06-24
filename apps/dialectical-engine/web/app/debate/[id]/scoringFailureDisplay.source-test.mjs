import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const debatePagePath = join(root, "app", "debate", "[id]", "DebatePageClient.tsx");
const canvasPath = join(root, "components", "DebateCanvas.tsx");
const drawerPath = join(root, "components", "NodeDetailDrawer.tsx");
const responsePath = join(root, "lib", "scoringResponse.ts");
const statusCopyPath = join(root, "lib", "scoringStatusCopy.ts");
const typesPath = join(root, "lib", "types.ts");

test("scoring provider/API failures and per-node scoring errors surface non-crashing UI", () => {
  const debatePageSource = readFileSync(debatePagePath, "utf8");
  const canvasSource = readFileSync(canvasPath, "utf8");
  const drawerSource = readFileSync(drawerPath, "utf8");
  const responseSource = readFileSync(responsePath, "utf8");
  const statusCopySource = readFileSync(statusCopyPath, "utf8");
  const typesSource = readFileSync(typesPath, "utf8");

  assert.match(
    typesSource,
    /export type DebateScoringResponse = \{[\s\S]*status: ScoringStatus;[\s\S]*items: NodeScoringPayload\[\];[\s\S]*errors\?: NodeScoringError\[\] \| null;[\s\S]*reason\?: string;/,
    "The frontend scoring contract should carry provider/API reasons and per-node errors"
  );
  assert.match(
    typesSource,
    /export type NodeScoringError = \{[\s\S]*node_id: string;[\s\S]*status: "unavailable";[\s\S]*reason: string;/,
    "Per-node scoring errors should carry the exact unavailable reason shown in UI"
  );
  assert.match(
    debatePageSource,
    /getDebateScoring\(id\)[\s\S]*?status: payload\.status === "unavailable" \? "unavailable" : "loaded",[\s\S]*?data: payload,[\s\S]*?error: null/,
    "Unavailable scoring payloads should become a non-crashing unavailable state with their response data retained"
  );
  assert.match(
    debatePageSource,
    /\.catch\(\(exc\) => \{[\s\S]*?setScoringState\(\(current\) => \(\{[\s\S]*?status: "error",[\s\S]*?data: current\.data,[\s\S]*?error: exc instanceof Error \? exc\.message : "Unable to load scoring"/,
    "Provider/API request failures should become an error state instead of throwing through the page"
  );
  assert.match(
    debatePageSource,
    /formatScoringStatusCopy\(\{[\s\S]*?scoringStatus: scoringState\.status,[\s\S]*?responseStatus: scoringState\.data\?\.status,[\s\S]*?reason: scoringState\.data\?\.reason,[\s\S]*?error: scoringRefreshState\.error \|\| scoringState\.error/,
    "The top-level scoring status should be computed from real failure state and response reason"
  );
  assert.match(
    statusCopySource,
    /if \(input\.scoringStatus === "error"\) \{[\s\S]*?appendDetail\("Scoring check failed", input\.error\)/,
    "API failures should show clear scoring failure copy"
  );
  assert.match(
    statusCopySource,
    /if \(input\.scoringStatus === "unavailable"\) \{[\s\S]*?appendDetail\("Scoring check failed", input\.reason\)/,
    "Provider unavailable responses should show their real reason"
  );
  assert.match(
    debatePageSource,
    /state\.status === "error" \|\| state\.status === "unavailable"[\s\S]*?<span className="progressLabel">Scoring issue summary unavailable<\/span>[\s\S]*?<span className="progressCount">\{reason \|\| "No scoring payload is available\."\}<\/span>/,
    "The scoring summary should surface failure reasons without requiring scored nodes"
  );
  assert.match(
    debatePageSource,
    /const error = refreshState\.error \|\| scoringState\.error \|\| data\?\.reason \|\| "No scoring error reported\.";[\s\S]*\["Error", error\]/,
    "Diagnostics should expose the real scoring failure message when opened"
  );
  assert.match(
    responseSource,
    /scoringErrorsByNodeId: new Map<string, NodeScoringError>\(\s*\(response\?\.errors \?\? \[\]\)\.map\(\(error\) => \[error\.node_id, error\]\)\s*\)/,
    "Per-node errors should be indexed by node id separately from successful scores"
  );
  assert.match(
    debatePageSource,
    /const \{ scoringByNodeId, scoringErrorsByNodeId \} = useMemo\([\s\S]*?indexScoringResponse\(scoringState\.data\)[\s\S]*?\)/,
    "The debate page should derive both score and error maps from the same scoring response"
  );
  assert.match(
    debatePageSource,
    /<DebateCanvas[\s\S]*?scoringByNodeId=\{scoringByNodeId\}[\s\S]*?scoringErrorsByNodeId=\{scoringErrorsByNodeId\}/,
    "The canvas should receive per-node scoring errors alongside successful node scores"
  );
  assert.match(
    canvasSource,
    /scoring=\{scoringByNodeId\?\.get\(placed\.id\)\}[\s\S]*?scoringError=\{scoringErrorsByNodeId\?\.get\(placed\.id\)\}/,
    "Canvas cards should select the per-node error for the rendered node"
  );
  assert.match(
    canvasSource,
    /<ScoringErrorBoundary>[\s\S]*?scoringError \? \([\s\S]*?<span className="scoreBadge unavailable" aria-label=\{`Scoring unavailable: \$\{scoringError\.reason\}`\}>[\s\S]*?SCORING N\/A[\s\S]*?<\/ScoringErrorBoundary>/,
    "Canvas scoring errors should render clear unavailable badges inside the local scoring boundary"
  );
  assert.match(
    debatePageSource,
    /<NodeDetailDrawer[\s\S]*?scoring=\{scoringByNodeId\.get\(detailNode\.id\)\}[\s\S]*?scoringError=\{scoringErrorsByNodeId\.get\(detailNode\.id\)\}/,
    "Opening a node should route its scoring error into the detail drawer"
  );
  assert.match(
    drawerSource,
    /<ScoringErrorBoundary>\s*<NodeScoringDetails[\s\S]*?scoringError=\{scoringError\}[\s\S]*?<\/ScoringErrorBoundary>/,
    "Drawer scoring error display should be isolated from the rest of the argument drawer"
  );
  assert.match(
    drawerSource,
    /scoringError \? \([\s\S]*?<section className="drawerScoringUnavailable" aria-label="Scoring unavailable">[\s\S]*?<div className="drawerSectionTitle">Scoring unavailable<\/div>[\s\S]*?<p>\{scoringError\.reason\}<\/p>/,
    "The detail drawer should honestly show the per-node scoring error reason"
  );
  assert.doesNotMatch(
    debatePageSource + canvasSource + drawerSource,
    /provider:\s*"fake|model:\s*"fake|score:\s*0\.[0-9]|Scoring failed for test|placeholder score/i,
    "Failure UI should not embed fake provider output, placeholder scores, or test-only failure copy in runtime code"
  );
});
