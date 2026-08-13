import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "components", "DebateCanvas.tsx"), "utf8");

// Task 13 (P1.5, evidence independence bookkeeping): the sourcing-breadth
// chip is derived straight from the real node field (DebateNode.
// evidence_independence, additive from coordinator/app/services/
// serialization.py), not from the scoring payload -- it must render
// regardless of whether scoring is available/loading/erroring.

test("card imports and computes the independence pill from the real node field", () => {
  assert.match(
    source,
    /import\s*\{[\s\S]*formatIndependencePill[\s\S]*\}\s*from\s*"@\/lib\/scoringFormat";/,
    "DebateCanvas should import formatIndependencePill from the shared scoring format lib"
  );
  assert.match(
    source,
    /const independencePill = formatIndependencePill\(node\.evidence_independence\);/,
    "Card should derive the independence pill from the real node.evidence_independence field"
  );
});

test("card renders the independence chip as a sibling of the scoring badges, not gated on scoring being available", () => {
  assert.match(
    source,
    /<\/ScoringErrorBoundary>\s*\{independencePill \? \([\s\S]*?className="scoreBadge independence"[\s\S]*?title=\{independencePill\.title\}[\s\S]*?\{independencePill\.pillText\}[\s\S]*?\) : null\}/,
    "Independence chip should render as its own sibling badge after the scoring badges, using the pill's real pillText/title"
  );
});

test("card gives the independence chip an accessible label describing what it shows", () => {
  assert.match(
    source,
    /aria-label=\{`Evidence sourcing for \$\{node\.claim\}: \$\{independencePill\.title\}`\}/,
    "Independence chip should have a descriptive aria-label distinct from the visual pillText"
  );
});
