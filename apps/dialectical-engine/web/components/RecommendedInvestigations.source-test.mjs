import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const componentPath = join(root, "components", "RecommendedInvestigations.tsx");
const globalsPath = join(root, "app", "globals.css");

test("RecommendedInvestigations is a presentational real-recommendation list", () => {
  assert.equal(existsSync(componentPath), true, "components/RecommendedInvestigations.tsx should exist");

  const source = readFileSync(componentPath, "utf8");

  assert.match(source, /import type \{ RecommendedInvestigation \} from "@\/lib\/types"/);
  assert.match(source, /recommendations:\s*RecommendedInvestigation\[\]/);
  assert.match(source, /onOpenTarget\?:\s*\(targetNodeId: string\) => void/);
  assert.match(source, /onStartInvestigation\?:\s*\(recommendation: RecommendedInvestigation\) => void/);
  assert.match(source, /canOpenTarget\?:\s*\(targetNodeId: string\) => boolean/);

  assert.match(source, /selectTopRecommendation/);
  assert.match(source, /selectAdditionalRecommendations/);
  assert.match(source, /formatRecommendationAction/);
  assert.match(source, /recommendationTargetNodeId/);
  assert.match(source, /topRecommendation \? \[topRecommendation, \.\.\.additionalRecommendations\] : \[\]/);

  assert.match(source, /aria-label="Recommended investigations"/);
  assert.match(source, /className="recommendationsPanel"/);
  assert.match(source, /className="recommendationsList"/);
  assert.match(source, /className="recommendationsList recommendationsPrimary"/);
  assert.match(source, /className="recommendationsDetails"/);
  assert.match(source, /className="recommendationsSummary"/);
  assert.match(source, /className="recommendationItem"/);
  assert.match(source, /className="recommendationMeta"/);
  assert.match(source, /className="recommendationReason"/);
  assert.match(source, /className="recommendationActions"/);
  assert.match(source, /No recommended investigations are available from the current scoring data\./);
  assert.match(source, /function renderRecommendationItem\(recommendation: RecommendedInvestigation, index: number\)/);
  assert.match(source, /renderRecommendationItem\(rankedRecommendations\[0\], 0\)/);
  assert.match(source, /additionalRecommendations\.map\(\(recommendation, index\) => renderRecommendationItem\(recommendation, index \+ 1\)\)/);
  assert.match(source, /Recommendation #\{index \+ 1\}/);
  assert.match(source, /priority \{recommendation\.priority\}/);
  assert.match(source, /Target available/);
  assert.match(source, /Target unavailable/);
  assert.match(source, /Open target/);
  assert.match(source, /Start investigation/);

  assert.doesNotMatch(source, /fetch\(|useEffect|useState|nodeGenerations|recommended_investigations\s*=\s*\[/);
});

test("RecommendedInvestigations contains additional items behind a compact disclosure", () => {
  const source = readFileSync(componentPath, "utf8");
  const globals = readFileSync(globalsPath, "utf8");

  assert.match(
    source,
    /<ol className="recommendationsList recommendationsPrimary">[\s\S]*?renderRecommendationItem\(rankedRecommendations\[0\], 0\)[\s\S]*?<\/ol>/,
    "Only the top recommendation should render immediately"
  );
  assert.match(
    source,
    /<details className="recommendationsDetails">[\s\S]*?<summary className="recommendationsSummary">[\s\S]*?more recommendation[\s\S]*?<\/summary>[\s\S]*?<ol className="recommendationsList">/,
    "Additional recommendations should be intentionally opened from a native disclosure"
  );
  assert.match(
    globals,
    /\.recommendationsPrimary\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?\}/,
    "The primary recommendation should occupy one contained row"
  );
  assert.match(
    globals,
    /\.recommendationsSummary\s*\{[\s\S]*?width:\s*fit-content;[\s\S]*?text-transform:\s*uppercase;[\s\S]*?\}/,
    "The additional recommendation disclosure should be compact"
  );
});
