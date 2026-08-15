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
  it("has zero production callers in apps or peer packages while evaluator dispatch is UNBOUND", () => {
    const definition = join(process.cwd(), "packages/evaluator/src/index.ts");
    const callers = [
      ...productionSources(join(process.cwd(), "apps")),
      ...productionSources(join(process.cwd(), "packages"))
    ].filter((path) => path !== definition).filter((path) =>
      ["selectJudgesByBiasRank(", "allocateEvaluatorSeatShare(", "computeAndPersistShadowDecision("]
        .some((call) => readFileSync(path, "utf8").includes(call)));

    expect(callers).toEqual([]);
  });
});
