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

describe("evaluator judge selector dark launch", () => {
  it("has zero production callers while evaluator dispatch is UNBOUND", () => {
    const callers = productionSources(join(process.cwd(), "apps")).filter((path) =>
      readFileSync(path, "utf8").includes("selectJudgesByBiasRank("));

    expect(callers).toEqual([]);
  });
});
