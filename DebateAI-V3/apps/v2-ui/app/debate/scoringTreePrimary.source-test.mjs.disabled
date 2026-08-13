import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const debatePageSource = readFileSync("app/debate/[id]/DebatePageClient.tsx", "utf8");
const globalsSource = readFileSync("app/globals.css", "utf8");

test("scoring insights are contained before the debate tree shell", () => {
  const scoringPanelIndex = debatePageSource.indexOf('className="scoringInsightsPanel"');
  const debateMainIndex = debatePageSource.indexOf('className="debateMain"');

  assert.ok(scoringPanelIndex > -1, "DebatePageClient should render a scoring insights disclosure panel");
  assert.ok(debateMainIndex > -1, "DebatePageClient should still render the debate main tree shell");
  assert.ok(
    scoringPanelIndex < debateMainIndex,
    "The scoring panel should stay before the main shell without replacing the debateMain tree region"
  );

  assert.match(
    debatePageSource,
    /<summary className="scoringInsightsSummary">[\s\S]*?\{scoringVisibility\.title\}[\s\S]*?\{scoringVisibility\.detail\}[\s\S]*?<\/summary>/,
    "The collapsed scoring summary should expose real scoring visibility copy"
  );
  assert.match(
    debatePageSource,
    /<div className="scoringInsightsBody scroll">[\s\S]*?<ScoringHolesSummaryPanel[\s\S]*?<RecommendedInvestigations[\s\S]*?<AdaptiveDepthDryRunPanel[\s\S]*?<\/div>/,
    "The full scoring overview should remain accessible inside the contained body"
  );
});

test("scoring insights body is bounded so the tree remains visible", () => {
  assert.match(
    globalsSource,
    /\.scoringInsightsBody\s*\{[\s\S]*?max-height:\s*min\(36vh,\s*360px\);[\s\S]*?overflow:\s*auto;/,
    "The scoring insights body should scroll within a bounded height instead of displacing the canvas"
  );
  assert.match(
    globalsSource,
    /\.debateMain\s*\{[\s\S]*?flex:\s*1;[\s\S]*?min-height:\s*0;/,
    "The main debate shell should keep the remaining viewport for the tree/canvas"
  );
});
