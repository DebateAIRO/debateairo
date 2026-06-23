import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const debatePagePath = join(root, "app", "debate", "[id]", "DebatePageClient.tsx");
const apiPath = join(root, "lib", "api.ts");
const responsePath = join(root, "lib", "scoringResponse.ts");
const statusCopyPath = join(root, "lib", "scoringStatusCopy.ts");

test("DebatePageClient enables scoring through the real toggle and controlled scoring responses", () => {
  const debatePageSource = readFileSync(debatePagePath, "utf8");
  const apiSource = readFileSync(apiPath, "utf8");
  const statusCopySource = readFileSync(statusCopyPath, "utf8");

  assert.match(
    debatePageSource,
    /const \[scoringEnabled, setScoringEnabled\] = useState\(false\)/,
    "Scoring should start disabled so the first UI state is honestly unchecked"
  );
  assert.match(
    debatePageSource,
    /role="switch"[\s\S]*?aria-checked=\{scoringEnabled\}[\s\S]*?aria-label="Toggle scoring"[\s\S]*?onClick=\{\(\) => setScoringEnabled\(\(current\) => !current\)\}/,
    "The visible scoring switch should be the state transition that enables scoring"
  );
  assert.match(
    debatePageSource,
    /data-scoring-state=\{scoringState\.status\}[\s\S]*?data-scoring-enabled=\{scoringEnabled\}/,
    "The page should expose scoring enabled and async state for focused UI checks"
  );
  assert.match(
    debatePageSource,
    /if \(!scoringEnabled\) return;[\s\S]*?setScoringState\(\(current\) => \(\{ status: "loading", data: current\.data, error: null \}\)\);[\s\S]*?getDebateScoring\(id\)/,
    "Controlled scoring responses should only be requested after the scoring toggle is enabled"
  );
  assert.match(
    debatePageSource,
    /status: payload\.status === "unavailable" \? "unavailable" : "loaded",[\s\S]*?data: payload/,
    "The scoring response status should drive loaded versus unavailable UI state"
  );
  assert.match(
    debatePageSource,
    /if \(!scoringEnabled\) setScoringState\(\{ status: "idle", data: null, error: null \}\)/,
    "Toggling scoring off should clear scoring data instead of leaving stale scores visible"
  );
  assert.match(
    debatePageSource,
    /formatScoringStatusCopy\(\{[\s\S]*?enabled: scoringEnabled,[\s\S]*?scoringStatus: scoringState\.status,[\s\S]*?responseStatus: scoringState\.data\?\.status,[\s\S]*?reason: scoringState\.data\?\.reason,[\s\S]*?error: scoringRefreshState\.error \|\| scoringState\.error/,
    "Status text should be computed from the real async state and response reason/error"
  );
  assert.match(
    debatePageSource,
    /formatScoringVisibilityState\(\{[\s\S]*?enabled: scoringEnabled,[\s\S]*?hasActionToken: Boolean\(actionToken\),[\s\S]*?scoringStatus: scoringState\.status,[\s\S]*?refreshStatus: scoringRefreshState\.status,[\s\S]*?response: scoringState\.data,[\s\S]*?error: scoringRefreshState\.error \|\| scoringState\.error/,
    "Visible scoring state should be computed from the real toggle, token, async, refresh, and response state"
  );
  assert.match(
    debatePageSource,
    /data-scoring-visibility=\{scoringVisibility\.kind\}[\s\S]*?<ScoringVisibilityPanel state=\{scoringVisibility\} \/>/,
    "The page should expose and render the visible scoring state for off, token-required, unavailable, refreshing, and scored states"
  );
  const responseSource = readFileSync(responsePath, "utf8");
  for (const label of [
    "Scoring off",
    "User token required",
    "Scoring provider required",
    "Scoring unavailable",
    "Refreshing scoring",
    "Real scores displayed",
  ]) {
    assert.match(responseSource, new RegExp(label), `Scoring visibility copy should include ${label}`);
  }
  assert.match(
    statusCopySource,
    /if \(!input\.enabled\) return withMetadata\("Scores unchecked", input\)/,
    "Disabled scoring should report an honest unchecked state"
  );
  assert.match(
    statusCopySource,
    /input\.scoringStatus === "loading"[\s\S]*?Checking scores with Codex/,
    "Enabled scoring should report an honest loading state while controlled responses are pending"
  );
  assert.match(
    statusCopySource,
    /input\.scoringStatus === "unavailable"[\s\S]*?appendDetail\("Scoring check failed", input\.reason\)/,
    "Unavailable scoring payloads should surface their real reason"
  );
  assert.match(
    debatePageSource,
    /<ScoringHolesSummaryPanel[\s\S]*?enabled=\{scoringEnabled\}[\s\S]*?state=\{scoringState\}/,
    "The scoring summary panel should receive the same toggle and response state"
  );
  assert.match(
    debatePageSource,
    /Scoring issue summary unavailable[\s\S]*?Enable scoring to summarize unresolved holes and fatal flags from scored nodes\./,
    "The summary panel should be honest before scoring is enabled"
  );
  assert.match(
    debatePageSource,
    /state\.status === "loading"[\s\S]*?Loading scoring issue summary[\s\S]*?Waiting for scored nodes\./,
    "The summary panel should show a loading state for pending controlled responses"
  );
  assert.match(
    debatePageSource,
    /state\.status === "error" \|\| state\.status === "unavailable"[\s\S]*?\{reason \|\| "No scoring payload is available\."\}/,
    "The summary panel should show unavailable reasons without inventing scores"
  );
  assert.match(
    debatePageSource,
    /const scoringRefreshDisabled = !hasTree \|\| !actionToken \|\| scoringState\.status === "loading" \|\| scoringRefreshBusy/,
    "The refresh action should stay gated until a real user token exists and loading has finished"
  );
  assert.match(
    debatePageSource,
    /function scoringRefreshDisabledReason\(\)[\s\S]*?Refresh scoring unavailable: unlock actions with a user token to run manual scoring refresh\.[\s\S]*?Refresh scoring unavailable: waiting for persisted scoring state before starting another refresh\./,
    "The refresh action should explain the exact disabled reason, especially when no action token is available"
  );
  assert.match(
    debatePageSource,
    /const scoringRefreshDisabledReasonText = scoringRefreshDisabled \? scoringRefreshDisabledReason\(\) : null;[\s\S]*\{scoringRefreshDisabledReasonText \? <span className="topSwitchStatus">\{scoringRefreshDisabledReasonText\}<\/span> : null\}/,
    "The disabled refresh reason should be visible next to the refresh control"
  );
  assert.match(
    debatePageSource,
    /const job = await startDebateScoringRefresh\(id, actionToken\);[\s\S]*?if \(job\.status === "failed"\)[\s\S]*?if \(job\.status !== "complete"\)[\s\S]*?const payload = await getDebateScoring\(id\);/,
    "Manual refresh should POST the Option B scoring job and then GET persisted scoring after complete"
  );
  assert.match(
    apiSource,
    /export async function getDebateScoring\(id: string\): Promise<DebateScoringResponse> \{[\s\S]*?apiFetch<DebateScoringResponse>\(`\/api\/debates\/\$\{id\}\/scoring`\)/,
    "The enabled path should use the real scoring endpoint so tests can control API responses"
  );
  assert.doesNotMatch(
    debatePageSource,
    /const .*scores?\s*=\s*\{[^}]*strength|score:\s*\d|provider:\s*"fake|model:\s*"fake/i,
    "The UI path should not embed fake runtime score or provider data"
  );
});
