import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// NOTE: deliberately placed outside app/debate/[id]/ (see
// headerToolbarResilience.source-test.mjs / lifecycleDecisions.source-test.mjs
// for the same established pattern) -- the bracketed directory name is not
// reliably picked up by `node --test` when it is itself the argument path, so
// this file lives one level up and reads sources via a relative path instead.
const root = process.cwd();
const debatePagePath = join(root, "app", "debate", "[id]", "DebatePageClient.tsx");
const canvasPath = join(root, "components", "DebateCanvas.tsx");
const drawerPath = join(root, "components", "NodeDetailDrawer.tsx");
const responsePath = join(root, "lib", "scoringResponse.ts");
const statusCopyPath = join(root, "lib", "scoringStatusCopy.ts");
const typesPath = join(root, "lib", "types.ts");

test("cached real scoring responses display metadata and claim badges through the debate page path", () => {
  const debatePageSource = readFileSync(debatePagePath, "utf8");
  const canvasSource = readFileSync(canvasPath, "utf8");
  const drawerSource = readFileSync(drawerPath, "utf8");
  const responseSource = readFileSync(responsePath, "utf8");
  const statusCopySource = readFileSync(statusCopyPath, "utf8");
  const typesSource = readFileSync(typesPath, "utf8");

  assert.match(
    typesSource,
    /export type DebateScoringResponse = \{[\s\S]*items: NodeScoringPayload\[\];[\s\S]*model_metadata\?: ScoringModelMetadata \| null;[\s\S]*cache\?: ScoringCacheMetadata \| null;/,
    "The frontend scoring contract should carry real node scores plus model and cache metadata"
  );
  assert.match(
    responseSource,
    /export function indexScoringResponse\(response: DebateScoringResponse \| null\): IndexedScoringResponse \{[\s\S]*scoringByNodeId: new Map<string, NodeScoringPayload>\(\s*\(response\?\.items \?\? \[\]\)\.map\(\(item\) => \[item\.node_id, item\]\)\s*\)/,
    "The page path should index returned scoring items by their real node_id"
  );
  assert.match(
    debatePageSource,
    /const \{ scoringByNodeId, scoringErrorsByNodeId \} = useMemo\(\s*\(\) => indexScoringResponse\(scoringState\.data\),\s*\[scoringState\.data\]\s*\)/,
    "DebatePageClient should derive displayed node scoring from the actual loaded scoring response"
  );
  assert.match(
    debatePageSource,
    /cacheHit: scoringState\.data\?\.cache\?\.hit,[\s\S]*checkedAt: scoringState\.data\?\.model_metadata\?\.checked_at,[\s\S]*provider: scoringState\.data\?\.model_metadata\?\.provider,[\s\S]*model: scoringState\.data\?\.model_metadata\?\.model/,
    "DebatePageClient should pass cached response metadata into scoring status copy"
  );
  assert.match(
    statusCopySource,
    /if \(input\.cacheHit\) return "Cached scores";[\s\S]*return parts\.length > 0 \? `\$\{label\} - \$\{parts\.join\(" - "\)\}` : label;/,
    "Cached responses should render as cached scores with real provider and checked-at metadata when present"
  );
  assert.match(
    debatePageSource,
    /<DebateCanvas[\s\S]*scoringByNodeId=\{scoringByNodeId\}[\s\S]*scoringErrorsByNodeId=\{scoringErrorsByNodeId\}/,
    "The debate page should pass indexed scoring maps into the canvas"
  );
  assert.match(
    canvasSource,
    /scoring=\{scoringByNodeId\?\.get\(placed\.id\)\}[\s\S]*scoringError=\{scoringErrorsByNodeId\?\.get\(placed\.id\)\}/,
    "Canvas nodes should select scoring payloads by rendered node id"
  );
  assert.match(
    canvasSource,
    /function ScoreBadges[\s\S]*const strength = formatScorePercent\(scoring\.scores\.strength\);[\s\S]*const uncertainty = formatScorePercent\(scoring\.scores\.uncertainty\);[\s\S]*const impact = formatScorePercent\(scoring\.scores\.impact\);/,
    "Node badges should display score values from the returned NodeScoringPayload"
  );
  assert.match(
    canvasSource,
    /const uncertaintyPill = formatUncertaintyPill\(scoring\.uncertainty_drivers, scoring\.uncertainty_source, uncertainty\);[\s\S]*const strengthPill = formatStrengthPill\(scoring\.strength_kind, strength\);/,
    "Strength and uncertainty badge content should be derived from the real driver-first scoring fields (uncertainty_drivers/uncertainty_source/strength_kind), not just the raw percentages"
  );
  assert.match(
    canvasSource,
    /className="scoreBadgeButton"[\s\S]*aria-label=\{`Open scoring explanation for \$\{node\.claim\}`\}[\s\S]*className="scoreBadge strength"[\s\S]*title=\{strengthPill\.title\}[\s\S]*\{strengthPill\.pillText\}[\s\S]*className="scoreBadge uncertainty"[\s\S]*title=\{uncertaintyPill\.title\}[\s\S]*\{uncertaintyPill\.pillText\}[\s\S]*IMP \{impact\.value\}/,
    "Cached real scores should be exposed as the visible node badge triplet: driver-first strength/uncertainty pill text and title from the shared formatters, plus the unchanged plain impact badge"
  );
  assert.match(
    debatePageSource,
    /<NodeDetailDrawer[\s\S]*scoring=\{scoringByNodeId\.get\(detailNode\.id\)\}[\s\S]*scoringError=\{scoringErrorsByNodeId\.get\(detailNode\.id\)\}/,
    "Opening a scored claim should route the same cached score payload into the detail drawer"
  );
  assert.match(
    drawerSource,
    /function NodeScoringDetails[\s\S]*const rationaleShort = scoring\?\.rationale\?\.short\?\.trim\(\);[\s\S]*const holes = scoring\?\.holes\.filter[\s\S]*const fatalFlags = scoring\?\.fatal_flags\.filter[\s\S]*selectTopRecommendation\(scoring\?\.recommended_investigations\)/,
    "The drawer should display details from the same real node scoring payload"
  );
  assert.doesNotMatch(
    debatePageSource + canvasSource + drawerSource,
    /provider:\s*"fake|model:\s*"fake|cache:\s*\{\s*hit:\s*true\s*\}|score:\s*0\.[0-9]|strength:\s*0\.[0-9]|STR 85|Cached scores" \+ /i,
    "The display path should not embed fake cached scores or provider output in runtime UI code"
  );
});
