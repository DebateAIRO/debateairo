import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const boundaryPath = join(root, "components", "ScoringErrorBoundary.tsx");
const debatePagePath = join(root, "app", "debate", "[id]", "DebatePageClient.tsx");
const canvasPath = join(root, "components", "DebateCanvas.tsx");
const drawerPath = join(root, "components", "NodeDetailDrawer.tsx");

test("scoring UI has a local class error boundary around scoring surfaces", () => {
  assert.equal(existsSync(boundaryPath), true, "components/ScoringErrorBoundary.tsx should exist");

  const boundarySource = readFileSync(boundaryPath, "utf8");
  const debatePageSource = readFileSync(debatePagePath, "utf8");
  const canvasSource = readFileSync(canvasPath, "utf8");
  const drawerSource = readFileSync(drawerPath, "utf8");

  assert.match(boundarySource, /extends React\.Component<.*ScoringErrorBoundaryProps/s);
  assert.match(boundarySource, /static getDerivedStateFromError/);
  assert.match(boundarySource, /role="status"/);
  assert.match(boundarySource, /aria-live="polite"/);
  assert.match(boundarySource, /Scoring UI unavailable/);

  assert.match(
    debatePageSource,
    /<ScoringErrorBoundary[\s\S]*?<div className="topSwitch">[\s\S]*?<\/ScoringErrorBoundary>/,
    "DebatePageClient should keep default scoring status inside a local boundary"
  );
  assert.match(
    debatePageSource,
    /<ScoringErrorBoundary[\s\S]*?<AdaptiveDepthDryRunPanel[\s\S]*?enabled=\{true\}[\s\S]*?state=\{adaptiveDepthDryRunState\}[\s\S]*?\/>[\s\S]*?<\/ScoringErrorBoundary>/,
    "DebatePageClient should keep the adaptive dry-run panel inside a local boundary"
  );
  assert.match(
    canvasSource,
    /<ScoringErrorBoundary[\s\S]*?(scoreBadgeButton|scoreBadge unavailable)[\s\S]*?<\/ScoringErrorBoundary>/,
    "DebateCanvas should isolate scoring badge render failures from the tree"
  );
  assert.match(
    drawerSource,
    /<ScoringErrorBoundary>\s*<NodeScoringDetails[\s\S]*?<\/ScoringErrorBoundary>/,
    "NodeDetailDrawer should isolate scoring detail rendering in a child boundary"
  );
  assert.match(
    drawerSource,
    /function NodeScoringDetails[\s\S]*(drawerScoringUnavailable|drawerScoringRationale|drawerScoringFindings|drawerScoringRecommendation)/,
    "NodeScoringDetails should own the scoring-specific drawer UI"
  );
});
