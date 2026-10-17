// Engine redesign R1d, Task 5 (INTERFACE §1.5, §3.3): the runner reads the engine ONLY from each run's receipt; the row is
// read at boot alone (engine-boot.ts), to resolve the settings an engine-2 run needs. The wiring is pinned in the source.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { computeStructuralCeilingBasis, ENGINE_ONE, engineOfRun } from "@debateai/register";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
const RUNNER = read("apps/runner/src/index.ts");
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });

describe("the runner reads the engine from the receipt only", () => {
  it("row absent = today's run: a receipt without the member is engine 1", () => {
    const today = parseCostEnvelopeBasis(computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1 }));
    expect(engineOfRun(today)).toBe(ENGINE_ONE);
  });

  it("per run: engineOfRun over the parsed receipt, after the shape's per-run check, and an engine-2 run on an unconfigured runner is refused", () => {
    const shapeAt = RUNNER.indexOf("const shapeShape = envelopeBasis.shape ?? null;");
    const engineAt = RUNNER.indexOf("const engine = engineOfRun(envelopeBasis);");
    expect(shapeAt).toBeGreaterThan(0);
    expect(engineAt).toBeGreaterThan(shapeAt);
    expect(engineAt).toBeLessThan(RUNNER.indexOf("const shapeSettings = shapeShape === null ? null : debateShapeSettingsOf(run.depthParams);"));
    expect(RUNNER).toContain("if (engine.engine === 2 && this.settings.engine == null) {");
    expect(RUNNER).toContain("throw new TypedDomainError(\"ENGINE_RUNNER_UNCONFIGURED\",");
  });

  it("no runner source reads the engine row except the boot read", () => {
    const dir = new URL("../../apps/runner/src/", import.meta.url);
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ts"))) {
      const source = readFileSync(new URL(name, dir), "utf8");
      expect(source.includes("readEngineVersionPolicy") && name !== "engine-boot.ts", name).toBe(false);
    }
    expect(RUNNER).not.toContain("ENGINE_VERSION_POLICY_ROW_KEY");
    expect(RUNNER).not.toContain("readEngineRunnerSettings");
  });

  it("the runner's settings carry the boot settings beside the debate shape's", () => {
    const shapeAt = RUNNER.indexOf("readonly debateShape?: DebateShapeRunnerSettings | null;");
    expect(shapeAt).toBeGreaterThan(0);
    expect(RUNNER.indexOf("readonly engine?: EngineRunnerSettings | null;")).toBeGreaterThan(shapeAt);
  });

  it("main.ts and the practice runner read the boot settings once, after the shape's, and hand them on", () => {
    for (const file of ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts"]) {
      const text = read(file);
      const engineRead = "const engine = await readEngineRunnerSettings(pool, environment.REGISTER_VERSION);";
      expect(text.split(engineRead), file).toHaveLength(2);
      expect(text.indexOf(engineRead), file).toBeGreaterThan(text.indexOf("const debateShape = await readDebateShapeRunnerSettings(pool, environment.REGISTER_VERSION);"));
      expect(text, file).not.toContain("resolveEngineRunnerSettings(");
    }
  });

  it("the per-run refusal is a declared diagnostic code in both alphabets", () => {
    for (const file of ["apps/runner/src/index.ts", "apps/api/src/index.ts"]) {
      expect(read(file), file).toContain("  \"EMPTY_PROPAGATION\",\n  \"ENGINE_RUNNER_UNCONFIGURED\",\n  \"ENVELOPE_EXHAUSTED_WITHOUT_VERIFIED_COMPONENTS\",");
    }
  });
});
