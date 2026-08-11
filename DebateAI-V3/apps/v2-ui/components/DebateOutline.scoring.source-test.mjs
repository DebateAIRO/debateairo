import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const outlinePath = join(process.cwd(), "components", "DebateOutline.tsx");

test("DebateOutline accepts optional scoring metadata without requiring page wiring", () => {
  const source = readFileSync(outlinePath, "utf8");

  assert.match(
    source,
    /import type \{ DebateNode, NodeScoringError, NodeScoringPayload \} from "@\/lib\/types";/,
    "Outline should use the existing frontend scoring payload and error types"
  );
  assert.match(
    source,
    /import \{ formatScoreBadgeLabel, formatScorePercent, formatStrengthPill, formatUncertaintyPill \} from "@\/lib\/scoringFormat";/,
    "Outline scoring chips should use the shared score formatting helpers, including the driver-first strength/uncertainty pill formatters (Task 4/5)"
  );
  assert.match(
    source,
    /type DebateOutlineProps = \{[\s\S]*root: DebateNode;[\s\S]*selectedNodeId\?: string \| null;[\s\S]*selectedPathNodeIds\?: Set<string>;[\s\S]*scoringByNodeId\?: Map<string, NodeScoringPayload>;[\s\S]*scoringErrorsByNodeId\?: Map<string, NodeScoringError>;[\s\S]*\};/,
    "Outline should expose a compact optional scoring and selection prop contract"
  );
  assert.match(
    source,
    /export function DebateOutline\(\{[\s\S]*root,[\s\S]*selectedNodeId = null,[\s\S]*selectedPathNodeIds,[\s\S]*scoringByNodeId,[\s\S]*scoringErrorsByNodeId[\s\S]*\}: DebateOutlineProps\)/,
    "Plain outline callers should remain valid because scoring and selection props are optional"
  );
  assert.match(
    source,
    /const scoring = scoringByNodeId\?\.get\(node\.id\);[\s\S]*const scoringError = scoringErrorsByNodeId\?\.get\(node\.id\);/,
    "Rows should select caller-provided scoring metadata by real node id"
  );
  assert.match(
    source,
    /const selected = selectedNodeId === node\.id;[\s\S]*const inSelectedPath = selectedPathNodeIds\?\.has\(node\.id\) \?\? false;/,
    "Selected-node and selected-path highlighting should have an explicit component contract"
  );
  assert.match(
    source,
    /className=\{`outlineRow\$\{selected \? " selected" : ""\}\$\{inSelectedPath \? " inSelectedPath" : ""\}`\}/,
    "Outline rows should mark selected node and selected path states for styling and tests"
  );
  assert.match(
    source,
    /data-selected=\{selected \? "true" : undefined\}[\s\S]*data-selected-path=\{inSelectedPath \? "true" : undefined\}/,
    "Selection state should be inspectable without depending on CSS"
  );
  assert.match(
    source,
    /<OutlineScoringMetadata scoring=\{scoring\} scoringError=\{scoringError\} nodeClaim=\{node\.claim\} \/>/,
    "Scoring metadata should render from row-local real scoring payloads"
  );
  assert.match(
    source,
    /function OutlineScoringMetadata\([\s\S]*scoring\?: NodeScoringPayload;[\s\S]*scoringError\?: NodeScoringError;[\s\S]*nodeClaim: string;[\s\S]*\)/,
    "Scoring metadata should stay local to DebateOutline instead of requiring page wiring"
  );
  assert.match(
    source,
    /const uncertaintyPill = formatUncertaintyPill\(scoring\.uncertainty_drivers, scoring\.uncertainty_source, uncertainty\);[\s\S]*const strengthPill = formatStrengthPill\(scoring\.strength_kind, strength\);/,
    "Compact metadata's strength/uncertainty chips should be computed via the driver-first pill formatters, not the raw percentages alone"
  );
  assert.match(
    source,
    /className="scoreBadge strength"[\s\S]*title=\{strengthPill\.title\}[\s\S]*\{strengthPill\.pillText\}[\s\S]*className="scoreBadge uncertainty"[\s\S]*title=\{uncertaintyPill\.title\}[\s\S]*\{uncertaintyPill\.pillText\}[\s\S]*HOLES \{issueCount\}/,
    "Compact metadata should show the driver-first strength/uncertainty pill text and title, plus the hole count"
  );
  assert.match(
    source,
    /className="scoreBadge unavailable"[\s\S]*Scoring unavailable/,
    "Per-node scoring errors should render an honest unavailable state"
  );
});
