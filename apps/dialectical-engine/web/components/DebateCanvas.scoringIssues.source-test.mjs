import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "components", "DebateCanvas.tsx"), "utf8");

test("scored cards derive compact chips from real high-priority scoring issues", () => {
  assert.match(
    source,
    /function summarizeCardScoringIssues\(\s*scoring: NodeScoringPayload\s*\)/,
    "DebateCanvas should derive issue chips from the real node scoring payload"
  );
  assert.match(
    source,
    /scoring\.holes\.filter\(\s*\(hole\) => hole\.severity === "high" && hole\.description\.trim\(\)\s*\)/,
    "Card holes chip should include only high-severity holes with meaningful descriptions"
  );
  assert.match(
    source,
    /scoring\.fatal_flags\.filter\(\s*\(flag\) => flag\.description\.trim\(\)\s*\)/,
    "Card fatal flag chip should include meaningful real fatal flags"
  );
  assert.match(
    source,
    /<span className="scoreBadge issue" aria-label=\{issueSummary\.ariaLabel\}>\s*\{issueSummary\.label\}\s*<\/span>/,
    "Card issue chip should render compactly inside the score badge control"
  );
});
