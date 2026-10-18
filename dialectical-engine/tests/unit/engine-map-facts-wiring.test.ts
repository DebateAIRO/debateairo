// tests/unit/engine-map-facts-wiring.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Engine redesign R3, Task 15 (cross-plan ruling PF-R41.7 / PF-R35.9): the map's facts reach EVERY reader through R2's
 * in-memory material, pinned on the SOURCE (one case per reader; the whole run is driven by Task 17's integration suite,
 * which the CI gate does not run). Each pin fails on deletion or reordering.
 */
const RUNNER = new URL("../../apps/runner/src/index.ts", import.meta.url);
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  expect(start, from).toBeGreaterThan(0);
  const end = source.indexOf(to, start);
  expect(end, to).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("R3: the map's words, assumptions and bases in the run body", () => {
  it("are built once from the saved nodes (synchronous, never a pending slot)", async () => {
    const source = await readFile(RUNNER, "utf8");
    expect(source.split("const engineMapFactsNow = ").length - 1).toBe(1);
    const built = between(source, "const engineMapFactsNow = ", "engineMapFactsOf({");
    expect(built).toContain("engineMap && shapeMapArgued");
    const call = between(source, "const engineMapFactsNow = ", "\n      : null;");
    expect(call).toContain("nodeIdAt: (position) => authoredNodes.get(position)?.nodeId ?? null");
    expect(call.includes("savedNodes")).toBe(false);
  });

  it("the investigations read them (R2a A14's in-memory source)", async () => {
    const body = between(await readFile(RUNNER, "utf8"), "const reviews = await readEngineReviews(this.pool, run.runId, cannotAssess);",
      "const investigated = await runPointInvestigations({");
    expect(body).toContain("const source = engineSourceWithMap(engineMaterialSourceOf(engineMaterialGraphOf({");
    expect(body).toContain("}), reviews, new Map()), engineMapFactsNow());");
  });

  it("the judges read them, and so does the writer's verdict material built from the judges' source (R2b B5)", async () => {
    const body = between(await readFile(RUNNER, "utf8"), "const comparingJudges = engineTwo === null ? null : await (async () => {",
      "const makerPositionServe = decideMakerPositionServe({");
    expect(body).toContain("const source = engineSourceWithMap(engineMaterialSourceOf(graph,");
    expect(body).toContain("engineMaterialInvestigationsOf(engineInvestigation?.rows ?? [])), engineMapFactsNow());");
    expect(body.indexOf("comparingJudgesSourceOf({")).toBeGreaterThan(body.indexOf("engineSourceWithMap(")); // Task 0 amendment A0-1
    expect(body.includes("readEngineMaterialSource(")).toBe(false);
  });

  it("the story names each position by the map's words", async () => {
    const story = between(await readFile(RUNNER, "utf8"), "input: buildStoryRunSnapshot({", "answersNote:");
    // R3 final wave P15: omitted, never undefined, when the run has no map facts (`enginePositionWordsOf`).
    expect(story).toContain("...(engineMap ? enginePositionWordsOf(engineMapFactsNow()) : {})");
  });
});
