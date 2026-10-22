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
    // Side-by-side spec §13: the read is the one per-version loader's (run-settings.ts), exactly once, after the shape's;
    // neither composition calls it, and both hand the version's engine on through runnerSettingsOfVersion.
    const loader = read("apps/runner/src/run-settings.ts");
    const engineRead = "const engine = await readEngineRunnerSettings(pool, version);";
    expect(loader.split(engineRead)).toHaveLength(2);
    const shapeAt = loader.indexOf("const debateShape = await readDebateShapeRunnerSettings(pool, version);");
    expect(shapeAt).toBeGreaterThan(-1);
    expect(loader.indexOf(engineRead)).toBeGreaterThan(shapeAt);
    expect(loader).toContain("engine: version.engine,");
    expect(loader).not.toContain("resolveEngineRunnerSettings(");
    for (const file of ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts"]) {
      const text = read(file);
      expect(text, file).not.toContain("readEngineRunnerSettings(");
      expect(text, file).toContain("...runnerSettingsOfVersion(siteVersionSettings),");
      expect(text, file).not.toContain("resolveEngineRunnerSettings(");
    }
  });

  // Ruling R3-T14.1: R3 adds ENGINE_MAP_CHECK_UNBUDGETED in its alphabetical place beside R1d's refusal, so the pin reads
  // the declared list (both codes, in both alphabets) and its order, not one adjacency.
  it("the per-run refusals are declared diagnostic codes in both alphabets, each alphabet in sorted order", () => {
    for (const file of ["apps/runner/src/index.ts", "apps/api/src/index.ts"]) {
      const source = read(file);
      const block = source.slice(source.indexOf("// ─── BEGIN OPERATIONAL DIAGNOSTIC ALPHABET"),
        source.indexOf("// ─── END OPERATIONAL DIAGNOSTIC ALPHABET"));
      const declaration = block.slice(block.indexOf("const KNOWN_DOMAIN_CODES"));
      const codes = [...declaration.slice(declaration.indexOf("["), declaration.indexOf("]);")).matchAll(/"([A-Z][A-Z0-9_]*)"/gu)]
        .map((match) => match[1]!);
      expect(codes.length, file).toBeGreaterThan(100);
      expect(codes, file).toEqual(expect.arrayContaining(["ENGINE_RUNNER_UNCONFIGURED", "ENGINE_MAP_CHECK_UNBUDGETED"]));
      // R3 final wave P14: truly sorted, with no allowance (no pin or hash reads the order: every other reader sorts first).
      expect(codes, file).toEqual([...codes].sort());
    }
  });
});
