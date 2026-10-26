import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("the runner resolves the debate shape at its register version, at boot (spec 2026-10-12 §3.1, §4)", () => {
  it("reads the row and the map hash once, before the runner is built, and carries no Phase 2a boot guard", async () => {
    // Side-by-side spec §13: the read is the one per-version loader's (exactly once in run-settings.ts, never in
    // main.ts), and main.ts loads its site version through it before the runner is built.
    const main = await readFile("apps/runner/src/main.ts", "utf8");
    const loader = await readFile("apps/runner/src/run-settings.ts", "utf8");
    const resolve = "const debateShape = await readDebateShapeRunnerSettings(pool, version);";
    expect(loader.split(resolve)).toHaveLength(2);
    expect(main).not.toContain("readDebateShapeRunnerSettings(");
    // Before the runner is built, so a refused boot claims no debate.
    const boot = "const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);";
    expect(main.indexOf(boot)).toBeGreaterThan(-1);
    expect(main.indexOf(boot)).toBeLessThan(main.indexOf("new WalkingSkeletonRunner("));
    expect(main).not.toContain("assertDebateShapeRunnerReady");
    expect(loader).not.toContain("assertDebateShapeRunnerReady");
  });
});
