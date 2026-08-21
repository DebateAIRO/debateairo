import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pagePath = join(root, "app", "debate", "[id]", "DebatePageClient.tsx");
const canvasPath = join(root, "components", "DebateCanvas.tsx");

test("DebatePageClient wires score-aware navigation from real scoring payloads", () => {
  const pageSource = readFileSync(pagePath, "utf8");
  const canvasSource = readFileSync(canvasPath, "utf8");

  assert.match(
    pageSource,
    /import \{ RecommendedInvestigations \} from "@\/components\/RecommendedInvestigations";/,
    "The debate page should use the shared recommended-investigations component"
  );
  assert.match(
    pageSource,
    /const \[scoreAwareFilter, setScoreAwareFilter\] = useState<ScoreAwareFilter>\("all"\)/,
    "Score-aware filtering should be explicit page state, not implicit fake data"
  );
  assert.doesNotMatch(
    pageSource,
    /scoringEnabled|setScoringEnabled/,
    "Score-aware navigation should no longer depend on a normal scoring toggle"
  );
  assert.match(
    pageSource,
    /function matchesScoreAwareFilter\(scoring: NodeScoringPayload, filter: ScoreAwareFilter\)[\s\S]*scoring\.scores\.strength <= 0\.45[\s\S]*scoring\.scores\.uncertainty >= 0\.65[\s\S]*scoring\.scores\.impact >= 0\.7/,
    "Filters should derive weak, uncertain, and decisive matches from real node scores"
  );
  assert.match(
    pageSource,
    /scoring\.fatal_flags\.some[\s\S]*scoring\.holes\.some/,
    "Issue filtering should derive from real fatal flags and holes"
  );
  assert.match(
    pageSource,
    /if \(scoreAwareFilter === "unavailable"\) \{[\s\S]*new Set\(Array\.from\(scoringErrorsByNodeId\.keys\(\)\)\)/,
    "Unavailable filtering should derive from real per-node scoring errors"
  );
  assert.match(
    pageSource,
    /function collectRecommendedInvestigations\(response: DebateScoringResponse \| null\): RecommendedInvestigation\[\] \{[\s\S]*response\?\.items[\s\S]*recommended_investigations/,
    "Debate-level recommendations should aggregate real scoring response recommendations"
  );
  assert.match(
    pageSource,
    /<ScoreAwareFilterPanel[\s\S]*enabled=\{true\}[\s\S]*filter=\{scoreAwareFilter\}[\s\S]*onChange=\{setScoreAwareFilter\}/,
    "The page should render controls for the score-aware filter state"
  );
  assert.match(
    pageSource,
    /<RecommendedInvestigations[\s\S]*recommendations=\{debateRecommendations\}[\s\S]*canOpenTarget=\{canFocusRecommendationNode\}[\s\S]*onOpenTarget=\{focusRecommendationNode\}/,
    "Recommended investigations should surface at debate level with existing target navigation guards"
  );
  assert.match(
    pageSource,
    /<DebateCanvas[\s\S]*scoreFilterNodeIds=\{scoreAwareFilterNodeIds\}/,
    "The tree should receive real matching node ids from default scoring state"
  );
  assert.match(
    pageSource,
    /<DebateCanvas[\s\S]*selectedNodeId=\{selectedNodeId\}[\s\S]*scoringByNodeId=\{scoringByNodeId\}[\s\S]*scoringErrorsByNodeId=\{scoringErrorsByNodeId\}[\s\S]*scoreFilterNodeIds=\{scoreAwareFilterNodeIds\}/,
    "The tree canvas should receive scoring metadata plus selected and filtered node state from the page"
  );
  assert.match(
    canvasSource,
    /scoreFilterNodeIds\?: Set<string> \| null/,
    "DebateCanvas should expose a narrow optional filter-node contract"
  );
  assert.match(
    canvasSource,
    /data-score-filter-match=\{scoreFilterMatch \? "true" : "false"\}/,
    "Canvas filter matches should remain inspectable without depending on CSS"
  );
  assert.doesNotMatch(
    pageSource + canvasSource,
    /provider:\s*"fake|model:\s*"fake|recommended_investigations\s*=\s*\[|strength:\s*0\.[0-9]|score:\s*0\.[0-9]/i,
    "Score-aware navigation must not embed fake scores, recommendations, or provider output"
  );
});
