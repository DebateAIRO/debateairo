import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const componentPath = join(root, "components", "RecommendedInvestigations.tsx");

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
  assert.match(source, /No recommended investigations are available from the current scoring data\./);
  assert.match(source, /Recommendation #\{index \+ 1\}/);
  assert.match(source, /priority \{recommendation\.priority\}/);
  assert.match(source, /Target available/);
  assert.match(source, /Target unavailable/);
  assert.match(source, /Open target/);
  assert.match(source, /Start investigation/);

  assert.doesNotMatch(source, /fetch\(|useEffect|useState|nodeGenerations|recommended_investigations\s*=\s*\[/);
});
