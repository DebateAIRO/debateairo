import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const productionEntrypoints = [
  "apps/api/src/index.ts",
  "apps/runner/src/index.ts",
  "apps/scheduler/src/index.ts",
  "apps/evaluator-worker/src/index.ts"
];

describe("evaluator judge selector dark launch", () => {
  it("has zero production callers while evaluator dispatch is UNBOUND", () => {
    const callers = productionEntrypoints.filter((path) =>
      readFileSync(join(process.cwd(), path), "utf8").includes("selectJudgesByBiasRank("));

    expect(callers).toEqual([]);
  });
});
