import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RUNNER_BRANCHING_FACTOR,
  RUNNER_COMPOSITION_SEGMENT_CAP,
  RUNNER_FIXED_ORGANS_PER_COMPOSITION,
  RUNNER_MAX_RECOMPOSE,
  buildCrossRootExchangePlan,
  buildMultiMakerExpansionPlan
} from "@debateai/runner";
import { computeStructuralCeilingBasis } from "@debateai/register";

describe("DR-181 computed structural tripwire", () => {
  it("dominates an independently enumerated worst-case plan for M=1..8 and depth=1..5", () => {
    for (let panelSize = 1; panelSize <= 8; panelSize += 1) {
      for (let depth = 1; depth <= 5; depth += 1) {
        const expansion = panelSize === 1 ? [] : buildMultiMakerExpansionPlan(depth, panelSize);
        const exchange = buildCrossRootExchangePlan(panelSize);
        const authored = panelSize + expansion.length + exchange.length;
        const reviews = panelSize === 1 ? 0 : authored;
        const fixedSites = 2 * RUNNER_FIXED_ORGANS_PER_COMPOSITION;
        const independentWorstCase = (authored + reviews) * 3 + fixedSites * 3 + 2;
        const basis = computeStructuralCeilingBasis({
          panelSize,
          depth,
          judgeMaxAttempts: 3,
          organMaxAttempts: 3,
          maxRecompose: RUNNER_MAX_RECOMPOSE,
          maxCooldownHoldsPerRun: 2,
          finalRetryAttempts: 1,
          branchingFactor: RUNNER_BRANCHING_FACTOR,
          compositionSegmentCap: RUNNER_COMPOSITION_SEGMENT_CAP,
          fixedOrgansPerComposition: RUNNER_FIXED_ORGANS_PER_COMPOSITION
        });
        expect(basis.max_model_attempts).toBeGreaterThanOrEqual(independentWorstCase);
        expect(basis.max_model_attempts).toBeGreaterThanOrEqual(2 * authored);
      }
    }
  });

  it("pins the formula facts to exported engine facts", () => {
    expect(RUNNER_BRANCHING_FACTOR).toBe(2);
    expect(RUNNER_COMPOSITION_SEGMENT_CAP).toBe(2);
    expect(RUNNER_FIXED_ORGANS_PER_COMPOSITION).toBe(4);
    expect(RUNNER_MAX_RECOMPOSE).toBe(2);
  });
});

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

describe("DR-181 M-apparatus retirement", () => {
  it("keeps retired symbols out of shipped source", async () => {
    const roots = ["apps", "packages", "acceptance"];
    const files = (await Promise.all(roots.map(sourceFiles))).flat();
    const shipped = (await Promise.all(files.map((file) => readFile(file))))
      .map((value) => value.toString("utf8")).join("\n");
    for (const symbol of [
      "DR159_RATIFIED_MAKER_COUNT",
      "assertRatifiedMakerCount",
      "RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE",
      "TEST_ONLY_UNRATIFIED_MAKER_COUNT_BYPASS",
      "deriveRatifiedMakerMaximum",
      "ratifiedEnvelopeAttempts"
    ]) expect(shipped).not.toContain(symbol);
  });
});
