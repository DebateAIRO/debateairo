import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const debatePagePath = join(root, "app", "debate", "[id]", "DebatePageClient.tsx");
const apiPath = join(root, "lib", "api.ts");
const responsePath = join(root, "lib", "scoringResponse.ts");
const statusCopyPath = join(root, "lib", "scoringStatusCopy.ts");

test("DebatePageClient loads scoring by default without normal toggle or refresh controls", () => {
  const debatePageSource = readFileSync(debatePagePath, "utf8");
  const apiSource = readFileSync(apiPath, "utf8");
  const responseSource = readFileSync(responsePath, "utf8");
  const statusCopySource = readFileSync(statusCopyPath, "utf8");

  assert.doesNotMatch(
    debatePageSource,
    /useState\(false\)[\s\S]{0,80}scoringEnabled|setScoringEnabled|aria-label="Toggle scoring"|role="switch"/,
    "Normal debate UI should not expose a scoring on/off switch"
  );
  assert.doesNotMatch(
    debatePageSource,
    /Refresh scoring|Refresh Scoring|Enable scoring|Disable scoring|refreshScoringFromJob|waitForScoringJobCompletion|startDebateScoringRefresh|getDebateScoringJobStatus/,
    "Normal debate UI should not expose or wire a manual Refresh Scoring path"
  );
  assert.doesNotMatch(
    debatePageSource,
    /<button(?![\s\S]{0,240}aria-label="Open scoring diagnostics")[\s\S]{0,240}(Scoring|Refresh Scoring|Enable scoring|Disable scoring)[\s\S]{0,240}<\/button>/,
    "Normal debate UI should not render button controls for enabling or refreshing scoring"
  );
  assert.doesNotMatch(
    debatePageSource,
    /aria-label="[^"]*(Scoring toggle|Toggle scoring|Refresh scoring)[^"]*"/i,
    "Normal debate UI should not expose accessibility labels for removed scoring toggle or refresh controls"
  );
  assert.match(
    debatePageSource,
    /data-scoring-state=\{scoringState\.status\}[\s\S]*?data-scoring-enabled=\{true\}/,
    "The page should expose scoring as enabled by default for focused UI checks"
  );
  assert.match(
    debatePageSource,
    /useEffect\(\(\) => \{[\s\S]*?setScoringState\(\(current\) => \(\{ status: "loading", data: current\.data, error: null \}\)\);[\s\S]*?getDebateScoring\(id\)[\s\S]*?\}, \[id\]\);/,
    "Persisted scoring should be requested by default when the debate id changes"
  );
  assert.match(
    debatePageSource,
    /status: payload\.status === "unavailable" \? "unavailable" : "loaded",[\s\S]*?data: payload/,
    "The scoring response status should drive loaded versus unavailable UI state"
  );
  assert.match(
    debatePageSource,
    /formatScoringStatusCopy\(\{[\s\S]*?enabled: true,[\s\S]*?scoringStatus: scoringState\.status,[\s\S]*?responseStatus: scoringState\.data\?\.status,[\s\S]*?reason: scoringState\.data\?\.reason,[\s\S]*?error: scoringRefreshState\.error \|\| scoringState\.error/,
    "Status text should be computed from the real async state and response reason/error"
  );
  assert.match(
    debatePageSource,
    /formatScoringVisibilityState\(\{[\s\S]*?enabled: true,[\s\S]*?hasActionToken: Boolean\(actionToken\),[\s\S]*?scoringStatus: scoringState\.status,[\s\S]*?refreshStatus: scoringRefreshState\.status,[\s\S]*?response: scoringState\.data,[\s\S]*?error: scoringRefreshState\.error \|\| scoringState\.error/,
    "Visible scoring state should be computed from persisted scoring state without gating reads on the action token"
  );
  assert.match(
    debatePageSource,
    /data-scoring-visibility=\{scoringVisibility\.kind\}[\s\S]*?<ScoringVisibilityPanel state=\{scoringVisibility\} \/>/,
    "The page should expose and render the visible scoring state for pending, unavailable, refreshing, partial, and scored states"
  );
  for (const label of [
    "Scoring pending",
    "Scoring provider required",
    "Scoring unavailable",
    "Scoring in progress",
    "Real scores displayed",
  ]) {
    assert.match(responseSource, new RegExp(label), `Scoring visibility copy should include ${label}`);
  }
  assert.doesNotMatch(
    responseSource,
    /User token required|Unlock actions with a user token to refresh scoring|Refresh scoring to generate judge outputs/,
    "Default scoring visibility copy should not make scoring reads depend on an action token or manual refresh"
  );
  assert.match(
    statusCopySource,
    /input\.scoringStatus === "loading"[\s\S]*?Checking scores with Codex/,
    "Default scoring should report an honest loading state while persisted responses are pending"
  );
  assert.match(
    statusCopySource,
    /isMissingJudgeOutputReason\(input\.reason\)[\s\S]*?return withMetadata\("Scoring pending", input\)/,
    "Missing judge outputs should be presented as default scoring pending, not a manual refresh prompt"
  );
  assert.doesNotMatch(
    statusCopySource,
    /refresh scoring/i,
    "Status copy should not prompt the removed normal refresh action"
  );
  assert.match(
    debatePageSource,
    /<ScoringHolesSummaryPanel[\s\S]*?enabled=\{true\}[\s\S]*?state=\{scoringState\}/,
    "The scoring summary panel should receive the default-enabled response state"
  );
  assert.match(
    debatePageSource,
    /const scoringInsightsExpandable = scoringState\.status === "loaded" && scoringByNodeId\.size > 0/,
    "The full scoring insights panel should only expand after real scored claims are available"
  );
  assert.match(
    debatePageSource,
    /state\.status === "loading"[\s\S]*?Loading scoring issue summary[\s\S]*?Waiting for scored claims\./,
    "The summary panel should show a loading state for pending persisted scoring"
  );
  assert.match(
    debatePageSource,
    /state\.status === "error" \|\| state\.status === "unavailable"[\s\S]*?\{reason \|\| "No scoring payload is available\."\}/,
    "The summary panel should show unavailable reasons without inventing scores"
  );
  assert.match(
    apiSource,
    /export async function getDebateScoring\(id: string\): Promise<DebateScoringResponse> \{[\s\S]*?apiFetch<DebateScoringResponse>\(`\/api\/debates\/\$\{id\}\/scoring`\)/,
    "The default path should use the real scoring endpoint so tests can control API responses"
  );
  assert.doesNotMatch(
    debatePageSource,
    /const .*scores?\s*=\s*\{[^}]*strength|score:\s*\d|provider:\s*"fake|model:\s*"fake/i,
    "The UI path should not embed fake runtime score or provider data"
  );
});

test("default scoring states render from real response state without an action-token gate", () => {
  const debatePageSource = readFileSync(debatePagePath, "utf8");
  const responseSource = readFileSync(responsePath, "utf8");
  const statusCopySource = readFileSync(statusCopyPath, "utf8");

  assert.match(
    debatePageSource,
    /const scoringVisibility = useMemo\([\s\S]*?formatScoringVisibilityState\(\{[\s\S]*?enabled: true,[\s\S]*?hasActionToken: Boolean\(actionToken\),[\s\S]*?response: scoringState\.data/,
    "Visibility state should be produced with default scoring enabled while action token remains only metadata"
  );
  assert.match(
    responseSource,
    /input\.refreshStatus === "starting" \|\| input\.scoringStatus === "loading"[\s\S]*?title: input\.scoringStatus === "loading" && input\.refreshStatus === "idle" \? "Loading scoring" : "Scoring in progress"[\s\S]*?detail:[\s\S]*?"Reading persisted scoring state for this debate\."/,
    "Loading state should render as persisted default scoring reads, not as a manual refresh prompt"
  );
  assert.match(
    responseSource,
    /input\.scoringStatus === "unavailable" && isMissingJudgeOutputReason\(reason\)[\s\S]*?kind: "empty"[\s\S]*?title: "Scoring pending"[\s\S]*?detail: "No persisted judge outputs are available yet\."/,
    "Missing default scoring output should render as pending state"
  );
  assert.match(
    responseSource,
    /if \(reason && looksProviderOrTokenRequired\(reason\)\) \{[\s\S]*?kind: "provider_required"[\s\S]*?title: "Scoring provider required"/,
    "Provider-required responses should render as an honest default scoring state"
  );
  assert.match(
    responseSource,
    /if \(input\.response\?\.status === "partial"\) \{[\s\S]*?title: "Scores partially checked"[\s\S]*?partialScoreDetail\(input\.response\)/,
    "Partial responses should render the partial scoring state"
  );
  assert.match(
    responseSource,
    /return \{[\s\S]*?kind: "scores"[\s\S]*?title: "Real scores displayed"[\s\S]*?scoredClaimDetail\(input\.response\)/,
    "Available responses should render scored-claim state from persisted scoring payloads"
  );
  assert.doesNotMatch(
    statusCopySource,
    /Unlock actions|user token.*scoring|refresh scoring/i,
    "Status copy for default scoring states should not require action-token or refresh UX"
  );
});
