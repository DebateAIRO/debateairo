import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("the runner reads the debate shape row at its register version (spec 2026-10-12 §3.1)", () => {
  it("reads it once, at boot, and refuses a present row until Phase 2b", async () => {
    const main = await readFile("apps/runner/src/main.ts", "utf8");
    const call = "assertDebateShapeRunnerReady(await readDebateShapePolicy(pool, environment.REGISTER_VERSION));";
    expect(main.split(call)).toHaveLength(2);
    // Before the runner is built, so a refused boot claims no debate.
    expect(main.indexOf(call)).toBeLessThan(main.indexOf("new WalkingSkeletonRunner("));
  });
});
