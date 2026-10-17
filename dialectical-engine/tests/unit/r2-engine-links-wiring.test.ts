// tests/unit/r2-engine-links-wiring.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EvaluationSnapshot, SnapshotArrow } from "@debateai/propagation";
import { ENGINE_ONE, engineSettingsOf, engineVersionPolicyStartValues } from "@debateai/register";
import { assertRequiredConditionMarkRecords } from "@debateai/serve";
import {
  engineCatchUpSelectionRule, engineLinkedGraph, engineNodeFactsOf, engineOwnReplyEdgeIdsOf, engineUnassessedRecords
} from "../../apps/runner/src/engine-links.js";

const ENGINE = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 3, mapOpening: true });
const RUNNER = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
const arrow = (arrowId: string, sourceNodeId: string, targetNodeId: string, polarity: "support" | "attack",
  strength: number | null): SnapshotArrow => ({
  arrowId, sourceNodeId, targetKind: "NODE", targetNodeId, targetEdgeId: null, polarity,
  kind: polarity === "attack" ? "rebutting" : null, strength, magnitudeStatus: strength === null ? "UNKNOWN" : "MEASURED",
  strengthSource: "REVIEWER"
});
/**
 * The runner's real link pattern (apps/runner/src/index.ts:8587-8590, :8649-8652, :8500-8501 at 1bc8f549b): a cross-reply
 * is saved under its own root with [support -> own root, attack -> rival root]; a point or reply has one link to its parent.
 */
const SNAPSHOT: EvaluationSnapshot = {
  nodes: [
    { nodeId: "root-a", baseStrength: 0.6, parentNodeId: null }, { nodeId: "root-b", baseStrength: 0.5, parentNodeId: null },
    { nodeId: "cross-a", baseStrength: 0.8, parentNodeId: "root-a" }, { nodeId: "point-s", baseStrength: 0.7, parentNodeId: "root-a" },
    { nodeId: "point-t", baseStrength: 0.4, parentNodeId: "root-b" }, { nodeId: "reply-t", baseStrength: 0.3, parentNodeId: "point-t" }
  ],
  arrows: [
    arrow("own", "cross-a", "root-a", "support", 0.9), arrow("rival", "cross-a", "root-b", "attack", 0.5),
    arrow("s-a", "point-s", "root-a", "support", 0.6), arrow("t-b", "point-t", "root-b", "attack", null),
    arrow("r-t", "reply-t", "point-t", "attack", 0.7)
  ],
  arrowOrder: ["own", "rival", "s-a", "t-b", "r-t"],
  operatorResolutions: ["root-a", "root-b", "point-t"].map((parentNodeId) => ({ parentNodeId, operator: "accumulate" as const, suppliedBy: "deployment" as const })),
  clusterRecords: []
};
const REVIEWS = {
  reviewedNodeIds: ["root-a", "root-b", "cross-a", "point-s", "reply-t"], disputedNodeIds: ["point-s"],
  cannotAssessNodeIds: ["point-t"], ownReplyEdgeIds: new Map([["cross-a", ["own"]]])
};
/** A TypedDomainError carries its code on `code`, not in its message. */
const code = (value: string) => expect.objectContaining({ code: value });
/** The body of one top-level exported function: from its `export` to the next. */
const bodyOf = (name: string): string => {
  const start = RUNNER.indexOf(`export function ${name}`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = RUNNER.indexOf("\nexport ", start + 1);
  return RUNNER.slice(start, next === -1 ? RUNNER.length : next);
};

describe("engine 2: the facts the link rules read (A8)", () => {
  it("reads each node's review status, its cannot-assess review and its own-reply links", () => {
    const facts = engineNodeFactsOf(REVIEWS);
    expect(facts.get("root-a")).toEqual({ nodeId: "root-a", status: "AGREE", cannotAssessReview: false, ownReplyEdgeIds: [] });
    expect(facts.get("point-s")!.status).toBe("DISPUTE");
    expect(facts.get("point-t")).toEqual({ nodeId: "point-t", status: "CANNOT_ASSESS", cannotAssessReview: true, ownReplyEdgeIds: [] });
    expect(facts.get("cross-a")!.ownReplyEdgeIds).toEqual(["own"]);
    expect(facts.has("unreviewed")).toBe(false);
  });

  it("takes an investigation's status for a cannot-assess point only (A14's input)", () => {
    const facts = engineNodeFactsOf({ ...REVIEWS, investigated: new Map([["point-t", "AGREE" as const]]) });
    expect(facts.get("point-t")).toMatchObject({ status: "AGREE", cannotAssessReview: true });
    expect(() => engineNodeFactsOf({ ...REVIEWS, investigated: new Map([["point-s", "AGREE" as const]]) })).toThrowError(code("ENGINE_FACTS_INVALID"));
    expect(() => engineNodeFactsOf({ ...REVIEWS, investigated: new Map([["point-t", "NONE" as const]]) })).toThrowError(code("ENGINE_FACTS_INVALID"));
    expect(() => engineNodeFactsOf({ ...REVIEWS, cannotAssessNodeIds: ["root-a"] })).toThrowError(code("ENGINE_FACTS_INVALID"));
    expect(() => engineNodeFactsOf({ ...REVIEWS, disputedNodeIds: ["nowhere"] })).toThrowError(code("ENGINE_FACTS_INVALID"));
  });

  it("finds the own-reply links from the graph alone, as the save sites record them", () => {
    // The save sites keep a cross-reply's support links (`sourcedEdges` filtered on "support"); the graph reading agrees.
    expect([...engineOwnReplyEdgeIdsOf(SNAPSHOT)]).toEqual([["cross-a", ["own"]]]);
  });
});

describe("engine 2: the linked graph (A8)", () => {
  it("engine 1 pin: nothing is linked on engine 1", () => {
    expect(engineLinkedGraph({ ...REVIEWS, engine: ENGINE_ONE, snapshot: SNAPSHOT })).toBeNull();
  });

  it("weights the graph, keeps the cannot-assess point standing and names it for disclosure", () => {
    const linked = engineLinkedGraph({ ...REVIEWS, engine: ENGINE, snapshot: SNAPSHOT })!;
    expect(linked.reviewedNodeIds).toEqual(["root-a", "root-b", "cross-a", "point-s", "reply-t", "point-t"]);
    expect(linked.unassessedNodeIds).toEqual(["point-t"]);
    expect(linked.cannotAssessWeight).toBe(0.66);
    expect(linked.snapshot.arrows.find((item) => item.arrowId === "own")!.strength).toBe(0);
    expect(linked.snapshot.arrows.find((item) => item.arrowId === "t-b")).toMatchObject({ strength: 0.66, magnitudeStatus: "MEASURED" });
    expect(linked.snapshot.nodes.find((node) => node.nodeId === "point-s")!.baseStrength).toBeCloseTo(0.49, 12);
  });

  // Pre-flight PF-R2a4.5 (controller ruling, spec §4.2b and §17; supersedes INTERFACE §8.5): through A8's door — the one
  // A14 and A16 use — holds counts at full weight, fails keeps its links at the cannot-assess weight and its score × the
  // dispute factor. t-b is unmeasured, so its bearing reads as 1; 0.4 × 0.7 = 0.28. Passes only with A6's corrected line.
  it("an investigated point is no longer unassessed: holds counts at full weight, fails keeps its links at 0.66 and its score × 0.7", () => {
    const failed = engineLinkedGraph({ ...REVIEWS, investigated: new Map([["point-t", "DISPUTE" as const]]), engine: ENGINE, snapshot: SNAPSHOT })!;
    expect(failed.unassessedNodeIds).toEqual([]);
    expect(failed.snapshot.arrows.find((item) => item.arrowId === "t-b")).toMatchObject({ strength: 0.66, magnitudeStatus: "MEASURED" });
    expect(failed.snapshot.nodes.find((node) => node.nodeId === "point-t")!.baseStrength).toBeCloseTo(0.28, 12);
    const held = engineLinkedGraph({ ...REVIEWS, investigated: new Map([["point-t", "AGREE" as const]]), engine: ENGINE, snapshot: SNAPSHOT })!;
    expect(held.unassessedNodeIds).toEqual([]);
    expect(held.snapshot.arrows.find((item) => item.arrowId === "t-b")).toMatchObject({ strength: 1, magnitudeStatus: "MEASURED" });
    expect(held.snapshot.nodes.find((node) => node.nodeId === "point-t")!.baseStrength).toBeCloseTo(0.4, 12);
  });

  // A6 review carry (controller ruling): an own reply is one of that node's own links, never another node's.
  it("refuses an own-reply id that names another node's link", () => {
    expect(() => engineLinkedGraph({ ...REVIEWS, ownReplyEdgeIds: new Map([["point-s", ["own"]]]), engine: ENGINE, snapshot: SNAPSHOT }))
      .toThrowError(code("ENGINE_FACTS_INVALID"));
  });

  it("discloses each unassessed point with a record the serve guard accepts", () => {
    const records = engineUnassessedRecords(engineLinkedGraph({ ...REVIEWS, engine: ENGINE, snapshot: SNAPSHOT })!);
    expect(records).toEqual([{ mark: "UNASSESSED-AT-REDUCED-WEIGHT", scope: "node", subjectRef: "point-t",
      reason: "UNASSESSED_AT_REDUCED_WEIGHT:0.66", liftPath: null, servedRootRule: null, affectedNodeIds: ["point-t"],
      reviewOutcome: "cannot-assess" }]);
    expect(() => assertRequiredConditionMarkRecords(["UNASSESSED-AT-REDUCED-WEIGHT"], records)).not.toThrow();
  });
});

describe("engine 2: the runner's wiring (source pins; no pool-free harness for execute exists, as v28's pins say)", () => {
  it("builds the ring for engine 2 only, at both position builders", () => {
    expect(RUNNER).toMatch(/shapePositionsFromMap\(\{[^)]*?ring: engine\.engine === 2[^)]*?\}\)/u);
    expect(RUNNER).toMatch(/shapePositionsForTodaysOpening\(\{[^)]*?ring: engine\.engine === 2[^)]*?\}\)/u);
  });

  it("notes the own-reply links at the three cross-reply save sites, and only on engine 2", () => {
    expect(RUNNER.split("noteOwnReplyEdges(").length - 1).toBe(3);
    const note = RUNNER.indexOf("const noteOwnReplyEdges = (");
    expect(RUNNER.slice(note, note + 300)).toContain("if (engine.engine !== 2) return;");
    // R2a final wave B6 (Ruling (A8 Minors) 2): WHERE each of the three sits, not only how many there are: inside the
    // shape's cross leg and the cross chain, right after a saved node, and at the serial exchange's save.
    const sliceOf = (start: string, end: string): string => {
      const from = RUNNER.indexOf(start);
      expect(from, start).toBeGreaterThan(0);
      return RUNNER.slice(from, RUNNER.indexOf(end, from));
    };
    const savedThenNoted = "if (saved === null) return;\n        noteOwnReplyEdges(saved);";
    expect(sliceOf("const argueShapeCross = async (", "const crossChain = async (")).toContain(savedThenNoted);
    expect(sliceOf("const crossChain = async (", "\n      };\n")).toContain(savedThenNoted);
    expect(RUNNER).toContain("if (authored.kind === \"HALTED\") haltedExpansionRecords.push(authored.record);\n        else noteOwnReplyEdges(authored.value);");
  });

  it("links the graph at the round boundary and at the serve decision, and returns nothing on engine 1", () => {
    expect(RUNNER.split("engineLinkedGraphNow(").length - 1).toBe(2);
    const helper = RUNNER.indexOf("const engineLinkedGraphNow = async (");
    expect(RUNNER.slice(helper, helper + 400)).toContain("if (engine.engine !== 2) return null;");
    expect(RUNNER).toMatch(/const engineServeLinked = engine\.engine === 2\s*\? await engineLinkedGraphNow\(/u);
    expect(RUNNER).toContain("snapshot: engineServeLinked === null ? snapshot : engineServeLinked.snapshot,");
    expect(RUNNER).toMatch(/const roundLinked = await engineLinkedGraphNow\(roundSnapshot, roundReviewedNodeIds\);/u);
  });

  it("discloses unassessed points on the answer and in its records", () => {
    expect(RUNNER).toContain("...new Set(engineLinkRecords.map((record) => record.mark))");
    expect(RUNNER).toMatch(/\.\.\.shapeRecords,\s*\/\/ Engine 2[^\n]*\n\s*\.\.\.engineLinkRecords,/u);
  });

  it("the review catch-up links an engine-2 run's graph the same way, and keeps engine 1's path", () => {
    const catchUp = bodyOf("createPostgresReviewCatchUpDependencies");
    expect(catchUp).toContain("engineOfRun(await budget.readPinnedBasis(runId))");
    expect(catchUp).toContain("engineOwnReplyEdgeIdsOf(fullSnapshot)");
    expect(catchUp).toContain("engineUnassessedRecords(linked)");
    expect(catchUp).toContain("projectJudgedStanding(linked === null ? fullSnapshot : linked.snapshot,");
    // Pre-flight PF-R2a2.3: the version records the rule engineCatchUpSelectionRule picks, read before it is written.
    expect(catchUp).toContain("previousRule: engine.engine === 2 ? await ledger.readLatestJudgementSelectionRule(runId) : null");
    expect(catchUp).toContain("judgementSelectionRule: catchUpSelectionRule,");
    expect(catchUp).not.toContain("judgementSelectionRule: input.judgementSelectionRule,");
    const picked = catchUp.indexOf("const catchUpSelectionRule = engineCatchUpSelectionRule({");
    expect(picked).toBeGreaterThan(-1);
    expect(picked).toBeLessThan(catchUp.indexOf("await ledger.recordPropagation({"));
  });

  it("R2a interim: the served root is still chosen by strength inside the one serve decision", () => {
    expect(bodyOf("decideMakerPositionServe")).toContain("selectServedRootByStrength(");
  });
});

// Pre-flight PF-R2a2.3 (ruling option (a); OVERVIEW §4 item 1: the review catch-up keeps the receipt's engine).
describe("engine 2: the review catch-up keeps the run's judgement-selection rule (A8)", () => {
  const BOOT = Object.freeze({ kind: "MAXIMIZE_WEIGHTED_TAU", rowKey: "claimTypeCompositionMap", registerVersion: 1, sourceRef: "register:1" });
  const PREVIOUS = Object.freeze({ kind: "ENGINE2_HONEST_MEDIAN", rowKey: "engineVersionPolicy", registerVersion: 2, sourceRef: "register:2" });

  it("engine 1 pin: the catch-up records its boot rule, the very same object, whatever the previous version held", () => {
    expect(engineCatchUpSelectionRule({ engine: ENGINE_ONE, bootRule: BOOT, previousRule: PREVIOUS })).toBe(BOOT);
    expect(engineCatchUpSelectionRule({ engine: ENGINE_ONE, bootRule: BOOT, previousRule: null })).toBe(BOOT);
  });

  it("engine 2: the catch-up records the previous propagation version's rule, and refuses when there is none", () => {
    expect(engineCatchUpSelectionRule({ engine: ENGINE, bootRule: BOOT, previousRule: PREVIOUS })).toEqual(PREVIOUS);
    expect(() => engineCatchUpSelectionRule({ engine: ENGINE, bootRule: BOOT, previousRule: null }))
      .toThrowError(code("ENGINE_CATCH_UP_RULE_MISSING"));
  });
});
