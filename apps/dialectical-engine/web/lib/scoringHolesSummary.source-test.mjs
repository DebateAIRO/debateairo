import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const debatePageSource = readFileSync("app/debate/[id]/DebatePageClient.tsx", "utf8");

test("DebatePageClient derives debate-level holes summary from real scoring payload", () => {
  assert.match(
    debatePageSource,
    /import \{[\s\S]*?indexScoringResponse,[\s\S]*?summarizeScoringHoles[\s\S]*?\} from "@\/lib\/scoringResponse";/,
    "DebatePageClient should import the real scoring holes summary helper"
  );
  assert.match(
    debatePageSource,
    /const scoringHolesSummary = useMemo\(\s*\(\) => summarizeScoringHoles\(scoringState\.data\),\s*\[scoringState\.data\]\s*\);/,
    "DebatePageClient should memoize holes summary from the fetched scoring response"
  );
  assert.match(
    debatePageSource,
    /<ScoringHolesSummaryPanel[\s\S]*?enabled=\{scoringEnabled\}[\s\S]*?state=\{scoringState\}[\s\S]*?holesSummary=\{scoringHolesSummary\}[\s\S]*?fatalFlagsSummary=\{scoringFatalFlagsSummary\}[\s\S]*?strongestIssue=\{strongestUnresolvedScoringIssue\}[\s\S]*?\/>/,
    "DebatePageClient should render the debate-level holes summary panel"
  );
});

test("debate-level holes panel surfaces unavailable and empty states without fake holes", () => {
  assert.match(
    debatePageSource,
    /function ScoringHolesSummaryPanel/,
    "DebatePageClient should own a focused scoring holes summary panel"
  );
  assert.match(
    debatePageSource,
    /Enable scoring to summarize unresolved holes and fatal flags from scored claims\./,
    "Panel should honestly report that scoring must be enabled before holes are summarized"
  );
  assert.match(
    debatePageSource,
    /No unresolved scoring holes or fatal flags were returned by the current scoring payload\./,
    "Panel should show an empty real-payload state instead of placeholder holes"
  );
  assert.match(
    debatePageSource,
    /holesSummary\.items\.slice\(0, 4\)\.map/,
    "Panel should render a compact set of real holes from the summary"
  );
  assert.match(
    debatePageSource,
    /fatalFlagsSummary\.items\.slice\(0, 4\)\.map/,
    "Panel should render a compact set of real fatal flags from the summary"
  );
});
