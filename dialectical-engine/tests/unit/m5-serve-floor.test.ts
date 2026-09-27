import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SERVE_CRASH_CLASSES, deriveVerdictLabel, type ServeCrashClass } from "@debateai/serve";
import {
  buildServeDisclosureRecord,
  catchUpFloorWouldMove,
  rederiveCatchUpFloor,
  serveFloorOf
} from "../../apps/runner/src/index.js";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.4), TASK M5 — THE FLOOR.
 *
 * The owner's rule: "No debate ends without a final verdict unless there is a
 * technical problem." When a run still ends COMPONENTS_ONLY — whatever the cause:
 * money after every cheaper maker, a digest that cannot exist, a dead transport,
 * a draft with nothing to serve, a round-1 checker that could not be paid — the
 * arithmetic label the runner derived BEFORE the answer-writing step still
 * exists. The owner's row then keeps it, with the position it rests on and the
 * sealed cause as a code. The sealed answer stays COMPONENTS_ONLY: nothing is
 * faked, no artifact and no checker verdict are invented.
 *
 * What only the real runner can show — the floor landing on the row for each
 * cause, a FAILED run getting none, the floor answer getting a story — is in
 * `tests/integration/database.test.ts` ("Engine money rule M5 …") and
 * `tests/integration/story-end-to-end.test.ts`.
 */

const LEADING = "00000000-0000-4000-8000-00000000c001";
const ENGINE_CODE = /^[A-Z][A-Z0-9_]{0,95}$/u;

describe("M5 · the floor is the label and the leading position of an answer no model could write", () => {
  it.each(Object.keys(SERVE_CRASH_CLASSES) as ServeCrashClass[])("records a floor for a components-only answer that ended on %s", (crashClass) => {
    expect(serveFloorOf({ terminal: "COMPONENTS_ONLY", crashClass, label: "CONTESTED", leadingNodeId: LEADING }))
      .toEqual({ verdictState: "CONTESTED", leadingNodeId: LEADING, reason: crashClass });
    // The reason is a code the table's CHECK and the repository admit.
    expect(crashClass).toMatch(ENGINE_CODE);
  });

  it.each(["SUPPORTED", "CONTESTED", "UNSUPPORTED"] as const)("keeps the label exactly as derived: %s", (label) => {
    expect(serveFloorOf({ terminal: "COMPONENTS_ONLY", crashClass: "ENVELOPE_EXHAUSTED", label, leadingNodeId: LEADING }))
      .toMatchObject({ verdictState: label });
  });

  it.each(["SERVED", "DOWNGRADED"] as const)("records none for a %s answer: it carries its own label", (terminal) => {
    expect(serveFloorOf({ terminal, crashClass: null, label: "SUPPORTED", leadingNodeId: LEADING })).toBeNull();
  });

  it("stops, typed, on a components-only result that names no crash class: a floor is never written without its cause", () => {
    // M5 review, M5: every sealed components-only constructor names its class.
    expect(() => serveFloorOf({ terminal: "COMPONENTS_ONLY", crashClass: null, label: "UNSUPPORTED", leadingNodeId: LEADING }))
      .toThrowError(expect.objectContaining({ code: "SERVE_FLOOR_REASON_UNRESOLVED" }));
  });

  it("is frozen, so no later step can edit the floor the row records", () => {
    const floor = serveFloorOf({ terminal: "COMPONENTS_ONLY", crashClass: "DIGEST_CANNOT_EXIST", label: "CONTESTED", leadingNodeId: LEADING });
    expect(Object.isFrozen(floor)).toBe(true);
  });
});

describe("M5 · the owner's row carries the floor", () => {
  const ids = Object.freeze({
    answerId: "00000000-0000-4000-8000-00000000a001",
    answerVersion: 1,
    runId: "00000000-0000-4000-8000-00000000b001"
  });
  const row = (floor: ReturnType<typeof serveFloorOf>) => buildServeDisclosureRecord({
    ...ids,
    planned: { writerRef: "provider:a", checkerRef: "provider:a" },
    served: null,
    body: { bodyStop: null, pointsWithoutReview: null },
    serveStop: "MONEY",
    digest: { rung: 0, pointsOmitted: 0 },
    floor
  });

  it("writes the floor's three fields together", () => {
    const floor = serveFloorOf({ terminal: "COMPONENTS_ONLY", crashClass: "ENVELOPE_EXHAUSTED", label: "SUPPORTED", leadingNodeId: LEADING });
    expect(row(floor)).toMatchObject({
      writerServedRef: null, checkerServedRef: null, serveStop: "MONEY",
      floorVerdictState: "SUPPORTED", floorLeadingNodeId: LEADING, floorReason: "ENVELOPE_EXHAUSTED"
    });
  });

  it("writes none of them for an answer with no floor", () => {
    expect(row(null)).toMatchObject({ floorVerdictState: null, floorLeadingNodeId: null, floorReason: null });
  });
});

describe("M5 · wired into the shipped runner", () => {
  const runner = () => readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");

  it("derives the floor from the sealed result and the label taken before the answer-writing step", async () => {
    const source = await runner();
    const label = source.indexOf("const verdictLabel = deriveVerdictLabel(verdictLabelBasis);");
    const chain = source.indexOf("result = await runnerStage(\"SERVE_GATE_CHAIN_FAILED\", () => runServeGateChain({");
    const floor = source.indexOf("const floor = serveFloorOf({");
    const persist = source.indexOf("const persisted = await runnerStage(\"ANSWER_PERSIST_FAILED\"");
    expect(label).toBeGreaterThan(-1);
    expect(chain).toBeGreaterThan(label);
    expect(floor).toBeGreaterThan(chain);
    expect(persist).toBeGreaterThan(floor);
    expect(source.split("serveFloorOf({")).toHaveLength(2);
    const call = source.slice(floor, source.indexOf("});", floor));
    expect(call).toContain("terminal: result.terminal");
    expect(call).toContain("crashClass: result.crashClass");
    expect(call).toContain("label: verdictLabel.label");
    // The same node the label's `servedNodeId` names.
    expect(call).toContain("leadingNodeId: servedRoot.nodeId");
    // The sealed persist is handed no basis for a floor: the answer stays COMPONENTS_ONLY.
    expect(source).toContain("verdictLabelBasis: answerCarriesLabel ? verdictLabelBasis : null");
  });

  it("hands the floor to the owner's row and to the story, whose statement is the leading position's", async () => {
    const source = await runner();
    const write = source.indexOf("await this.#recordServeDisclosure(");
    expect(source.slice(write, source.indexOf("}));", write))).toContain("floor");
    // Final review, Minor 2: a floor's story waits for the floor's row.
    expect(source).toContain("const floorRecorded = floor !== null && disclosureRecorded;");
    expect(source).toContain("storyWriter !== undefined && (answerCarriesLabel || floorRecorded)");
    expect(source).toContain("servedSegments: floor === null ? finalSegments : [{ text: servedRootJudgement.statement }]");
  });
});

describe("M5 review (M1) · a catch-up version may not move the floor", () => {
  const CONTROLS = Object.freeze({ gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 });
  const MEASURED = Object.freeze({ kind: "MEASURED" as const, value: 0.1 });
  const ROOT_A = "00000000-0000-4000-8000-0000000000aa";
  const ROOT_B = "00000000-0000-4000-8000-0000000000bb";
  const CHILD = "00000000-0000-4000-8000-0000000000cc";
  const nodes = [
    { nodeId: ROOT_A, parentNodeId: null }, { nodeId: ROOT_B, parentNodeId: null }, { nodeId: CHILD, parentNodeId: ROOT_A }
  ];
  const rederive = (strengths: readonly { nodeId: string; strength: number }[], leadingNodeId = ROOT_A) =>
    rederiveCatchUpFloor({ nodes, strengths, leadingNodeId, disagreement: MEASURED, controls: CONTROLS });

  it("re-derives the same floor from unchanged numbers, with the sealed label ladder", () => {
    const strengths = [{ nodeId: ROOT_A, strength: 0.9 }, { nodeId: ROOT_B, strength: 0.2 }, { nodeId: CHILD, strength: 0.95 }];
    // The child never leads: only a parentless position can.
    const floor = rederive(strengths);
    expect(floor?.leadingNodeId).toBe(ROOT_A);
    expect(floor?.verdictState).toBe(deriveVerdictLabel({
      winner: 0.9, margin: { kind: "MEASURED", value: 0.9 - 0.2 }, disagreement: MEASURED, controls: CONTROLS
    }).label);
    expect(catchUpFloorWouldMove({ leadingNodeId: ROOT_A, verdictState: floor!.verdictState }, floor)).toBe(false);
  });

  it("reports a moved leader, and no label for it, when another position now leads", () => {
    const floor = rederive([{ nodeId: ROOT_A, strength: 0.3 }, { nodeId: ROOT_B, strength: 0.6 }]);
    expect(floor).toEqual({ leadingNodeId: ROOT_B, verdictState: null });
    expect(catchUpFloorWouldMove({ leadingNodeId: ROOT_A, verdictState: "CONTESTED" }, floor)).toBe(true);
  });

  it("reports a moved label when the same position leads by a different margin", () => {
    const before = rederive([{ nodeId: ROOT_A, strength: 0.9 }, { nodeId: ROOT_B, strength: 0.2 }]);
    const after = rederive([{ nodeId: ROOT_A, strength: 0.9 }, { nodeId: ROOT_B, strength: 0.89 }]);
    expect(after?.leadingNodeId).toBe(ROOT_A);
    expect(after?.verdictState).not.toBe(before?.verdictState);
    expect(catchUpFloorWouldMove(before, after)).toBe(true);
  });

  it("reports no floor when no position propagated, and a floor-less answer never moves", () => {
    expect(rederive([{ nodeId: CHILD, strength: 0.5 }])).toBeNull();
    expect(catchUpFloorWouldMove({ leadingNodeId: ROOT_A, verdictState: "CONTESTED" }, null)).toBe(true);
    expect(catchUpFloorWouldMove(null, null)).toBe(false);
    expect(catchUpFloorWouldMove(null, { leadingNodeId: ROOT_A, verdictState: "CONTESTED" })).toBe(false);
  });

  it("is wired into the catch-up: re-derived in prepareVersion and refused before the version persists", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    const guard = source.indexOf("if (catchUpFloorWouldMove(candidate.floorBefore, candidate.floorAfter)) {");
    const numberGuard = source.indexOf("if (!Object.is(candidate.numberAfter, candidate.numberBefore)) {");
    const persist = source.indexOf("const persisted = await candidate.persist();");
    expect(numberGuard).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(numberGuard);
    expect(persist).toBeGreaterThan(guard);
    expect(source).toContain("const floorReceipt = await disclosures.readLatestFloorReceipt(answerId);");
    expect(source).toContain("return rederiveCatchUpFloor({");
  });
});
