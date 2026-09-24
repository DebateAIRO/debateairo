import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function productionSources(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    return entry.isFile() && /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

describe("evaluator selectors dark launch", () => {
  it("has zero callers in every workspace source root while evaluator dispatch is UNBOUND", () => {
    const definition = join(process.cwd(), "packages/evaluator/src/index.ts");
    // pin updated 2026-09-02: the root-level web/ app was removed from the tree (dev drift, see docs/missions/2026-09-01-security-hardening/VERIFICATION.md)
    const workspaceSourceRoots = ["apps", "packages", "tools", "acceptance"];
    const callers = workspaceSourceRoots
      .flatMap((root) => productionSources(join(process.cwd(), root)))
      .filter((path) => path !== definition).filter((path) =>
      ["selectJudgesByBiasRank(", "allocateEvaluatorSeatShare(", "computeAndPersistShadowDecision("]
        .some((call) => readFileSync(path, "utf8").includes(call)));

    expect(callers).toEqual([]);
  });
});
