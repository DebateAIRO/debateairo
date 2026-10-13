import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("the runner resolves the debate shape at its register version, at boot (spec 2026-10-12 §3.1, §4)", () => {
  it("reads the row and the map hash once, before the runner is built, and carries no Phase 2a boot guard", async () => {
    const main = await readFile("apps/runner/src/main.ts", "utf8");
    const resolve = "const debateShape = await readDebateShapeRunnerSettings(pool, environment.REGISTER_VERSION);";
    expect(main.split(resolve)).toHaveLength(2);
    // Before the runner is built, so a refused boot claims no debate.
    expect(main.indexOf(resolve)).toBeLessThan(main.indexOf("new WalkingSkeletonRunner("));
    expect(main).not.toContain("assertDebateShapeRunnerReady");
  });
});
