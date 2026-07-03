import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const drawerSource = readFileSync(join(root, "components", "NodeDetailDrawer.tsx"), "utf8");
const pageSource = readFileSync(join(root, "app", "debate", "[id]", "DebatePageClient.tsx"), "utf8");

test("NodeDetailDrawer renders user feedback controls without model confidence wording", () => {
  assert.match(drawerSource, /function ScoringFeedbackControls/);
  assert.match(drawerSource, /data-scoring-feedback="user-feedback"/);
  assert.match(drawerSource, /<div className="drawerSectionTitle">Your feedback<\/div>/);
  assert.match(drawerSource, /Was this scoring explanation useful for reviewing the claim\?/);
  assert.doesNotMatch(drawerSource, /feedback[\s\S]{0,160}(model confidence|truth verdict)/i);
});

test("NodeDetailDrawer exposes persisted current vote and aggregate counts", () => {
  assert.match(drawerSource, /currentVote=\{currentUserFeedback\?\.vote\}/);
  assert.match(drawerSource, /const upCount = summary\?\.up \?\? 0;/);
  assert.match(drawerSource, /const downCount = summary\?\.down \?\? 0;/);
  assert.match(drawerSource, /aria-pressed=\{currentVote === "up"\}/);
  assert.match(drawerSource, /aria-pressed=\{currentVote === "down"\}/);
});

test("DebatePageClient submits scoring feedback through the API and updates from response", () => {
  assert.match(pageSource, /submitScoringFeedback/);
  assert.match(pageSource, /async function submitNodeFeedback\(nodeId: string, vote: ScoringFeedbackVote\)/);
  assert.match(pageSource, /const feedback = await submitScoringFeedback\(id, nodeId, vote, actionToken\);/);
  assert.match(pageSource, /applyFeedbackResponse\(current\.data, feedback\)/);
  assert.match(pageSource, /onSubmitFeedback=\{\(vote\) => submitNodeFeedback\(detailNode\.id, vote\)\}/);
  assert.match(drawerSource, /onClick=\{\(\) => onSubmit\("up"\)\}/);
  assert.match(drawerSource, /onClick=\{\(\) => onSubmit\("down"\)\}/);
  assert.doesNotMatch(
    pageSource,
    /startDebateScoringRefresh|getDebateScoringJobStatus|waitForScoringJobCompletion|refreshScoringFromJob/,
    "UP/DOWN feedback must call the feedback helper, not the removed scoring refresh path"
  );
});

test("DebatePageClient surfaces feedback API failure without applying fake success", () => {
  assert.match(pageSource, /setFeedbackSubmitState\(\{ nodeId, status: "submitting", error: null \}\);/);
  assert.match(pageSource, /catch \(exc\) \{[\s\S]*setFeedbackSubmitState\(\{ nodeId, status: "error", error: message \}\);/);
  assert.match(drawerSource, /Feedback was not saved: \{submitState\.error\}/);
  assert.doesNotMatch(pageSource, /setScoringState\([\s\S]{0,240}submitScoringFeedback\(id, nodeId, vote, actionToken\)/);
});
