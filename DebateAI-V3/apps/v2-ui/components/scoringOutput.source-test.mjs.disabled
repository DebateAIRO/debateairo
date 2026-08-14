import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const canvasSource = readFileSync(join(root, "components", "DebateCanvas.tsx"), "utf8");
const drawerSource = readFileSync(join(root, "components", "NodeDetailDrawer.tsx"), "utf8");
const recommendationsSource = readFileSync(join(root, "components", "RecommendedInvestigations.tsx"), "utf8");

test("score chips render STR/UNC/IMP from the real node scoring payload", () => {
  assert.match(
    canvasSource,
    /function ScoreBadges\([\s\S]*scoring: NodeScoringPayload/,
    "DebateCanvas should render score chips from NodeScoringPayload"
  );
  assert.match(
    canvasSource,
    /const strength = formatScorePercent\(scoring\.scores\.strength\);[\s\S]*const uncertainty = formatScorePercent\(scoring\.scores\.uncertainty\);[\s\S]*const impact = formatScorePercent\(scoring\.scores\.impact\);/,
    "STR/UNC/IMP chip values should be formatted from scoring.scores"
  );
  assert.match(
    canvasSource,
    /const uncertaintyPill = formatUncertaintyPill\(scoring\.uncertainty_drivers, scoring\.uncertainty_source, uncertainty\);[\s\S]*const strengthPill = formatStrengthPill\(scoring\.strength_kind, strength\);/,
    "STR/UNC chip content should be derived from the driver-first formatters using the real uncertainty_drivers/uncertainty_source/strength_kind fields (Task 4/5)"
  );
  assert.match(
    canvasSource,
    /formatScoreBadgeLabel\("Strength", scoring\.labels\.strength_label, strength\)[\s\S]*title=\{strengthPill\.title\}[\s\S]*\{strengthPill\.pillText\}/,
    "Strength chip should pair the returned strength label with the driver-first strength pill (formatStrengthPill)"
  );
  assert.match(
    canvasSource,
    /formatScoreBadgeLabel\("Uncertainty", scoring\.labels\.uncertainty_label, uncertainty\)[\s\S]*title=\{uncertaintyPill\.title\}[\s\S]*\{uncertaintyPill\.pillText\}/,
    "Uncertainty chip should pair the returned uncertainty label with the driver-first uncertainty pill (formatUncertaintyPill)"
  );
  assert.match(
    canvasSource,
    /formatScoreBadgeLabel\("Impact", scoring\.labels\.impact_label, impact\)[\s\S]*IMP \{impact\.value\}/,
    "Impact chip should pair the returned impact label with the returned score"
  );
});

test("drawer renders rationale, holes, fatal flags, and recommendations from scoring state", () => {
  assert.match(
    drawerSource,
    /function NodeScoringDetails\([\s\S]*scoring\?: NodeScoringPayload/,
    "NodeDetailDrawer should render scoring details from NodeScoringPayload"
  );
  assert.match(
    drawerSource,
    /const rationaleShort = scoring\?\.rationale\?\.short\?\.trim\(\);[\s\S]*aria-label="Scoring rationale"[\s\S]*<p>\{rationaleShort\}<\/p>/,
    "Drawer should show the returned scoring rationale"
  );
  assert.match(
    drawerSource,
    /const holes = scoring\?\.holes\.filter\(\(hole\) => hole\.description\.trim\(\)\) \?\? \[\];[\s\S]*holes\.map\(\(hole, index\) =>[\s\S]*\{hole\.severity\}[\s\S]*\{hole\.type\}[\s\S]*\{hole\.source \? <span>\{hole\.source\}<\/span> : null\}[\s\S]*\{hole\.description\}/,
    "Drawer should show meaningful holes from the returned scoring payload"
  );
  assert.match(
    drawerSource,
    /const fatalFlags = scoring\?\.fatal_flags\.filter\(\(flag\) => flag\.description\.trim\(\)\) \?\? \[\];[\s\S]*fatalFlags\.map\(\(flag, index\) =>[\s\S]*\{flag\.severity\}[\s\S]*\{flag\.type\}[\s\S]*\{flag\.description\}/,
    "Drawer should show meaningful fatal flags from the returned scoring payload"
  );
  assert.match(
    drawerSource,
    /selectTopRecommendation\(scoring\?\.recommended_investigations\)[\s\S]*selectAdditionalRecommendations\(scoring\?\.recommended_investigations\)[\s\S]*formatRecommendationAction\(topRecommendation\.action\)[\s\S]*priority \{topRecommendation\.priority\}[\s\S]*\{topRecommendation\.reason\}/,
    "Drawer should show top recommendation details from the returned scoring payload"
  );
  assert.match(
    drawerSource,
    /additionalRecommendations\.map\(\(recommendation, index\) =>[\s\S]*formatRecommendationAction\(recommendation\.action\)[\s\S]*priority \{recommendation\.priority\}[\s\S]*\{recommendation\.reason\}/,
    "Drawer should show additional returned recommendations"
  );
});

test("recommended investigations component stays presentational over real recommendations", () => {
  assert.match(
    recommendationsSource,
    /recommendations: RecommendedInvestigation\[\]/,
    "RecommendedInvestigations should receive typed scoring recommendations"
  );
  assert.match(
    recommendationsSource,
    /const topRecommendation = selectTopRecommendation\(recommendations\);[\s\S]*const additionalRecommendations = selectAdditionalRecommendations\(recommendations\);/,
    "RecommendedInvestigations should rank the provided recommendations"
  );
  assert.match(
    recommendationsSource,
    /formatRecommendationAction\(recommendation\.action\)[\s\S]*priority \{recommendation\.priority\}[\s\S]*\{recommendation\.reason\}/,
    "RecommendedInvestigations should render action, priority, and reason from each recommendation"
  );
  assert.doesNotMatch(
    canvasSource + drawerSource + recommendationsSource,
    /provider:\s*"fake|model:\s*"fake|score:\s*0\.[0-9]|strength:\s*0\.[0-9]|STR 85|placeholder score|recommended_investigations\s*=\s*\[/i,
    "Scoring output components should not embed fake runtime scores or recommendations"
  );
});
