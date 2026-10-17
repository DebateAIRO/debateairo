// tests/unit/r2-investigation-step.test.ts
import { describe, expect, it, vi } from "vitest";
import { LENGTH_GUIDANCE_START, TypedDomainError, type PointInvestigationMaterial } from "@debateai/kernel";
import { Judge, type PointInvestigationCandidate, type PointInvestigationSeat } from "@debateai/judgement";
import { ProviderContentUnacceptedError, type ProviderCallRequest, type ProviderGateway } from "@debateai/providers";
import { engineSettingsOf, engineVersionPolicyStartValues, type EngineSettings } from "@debateai/register";
import {
  recordPointInvestigationRows, runPointInvestigations, type PointInvestigationCallOutcome, type PointInvestigationRow
} from "../../apps/runner/src/engine-investigations.js";
import type { EngineNodeFacts } from "../../apps/runner/src/engine-links.js";
import { pointInvestigationFailureOutcome } from "../../apps/runner/src/index.js";
// The A14 dispatch's controller carries (the reviewer role, the cannot-assess guard, fails = dispute for the links AND
// the material, the stored row on ALREADY_PRESENT).
import { debateRoleFromCallSiteKey, engineMaterialOf } from "@debateai/kernel";
import { honestDisputeFactor, type StoredPointInvestigation } from "@debateai/judgement";
import type { EvaluationSnapshot, SnapshotArrow } from "@debateai/propagation";
import { engineFactsWithInvestigations, pointInvestigationRowOfStored } from "../../apps/runner/src/engine-investigations.js";
import { engineLinkedGraph } from "../../apps/runner/src/engine-links.js";
import { engineMaterialGraphOf, engineMaterialSourceOf } from "../../apps/runner/src/engine-material-reader.js";
// A14 fix round 1: defects fail the step, every unavailable call leaves one content-free line, one status rule.
import { POINT_INVESTIGATION_RESULTS } from "@debateai/judgement";
import {
  engineInvestigatedStatuses, investigatedStatusEntry, investigatedStatusOf
} from "../../apps/runner/src/engine-investigations.js";
import { logPointInvestigation, pointInvestigationFailureCode } from "../../apps/runner/src/index.js";

const ENGINE: EngineSettings = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 4, mapOpening: false });
const SEAL = "e".repeat(64);
const GUIDE = Object.freeze({ words: 60, languageCode: "en", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord });
const BOUND = Object.freeze({ maxAttempts: 2, tokenCeiling: 4096, deadlineMs: 60000 });
const STOP = { finishReason: "stop" } as const;

const fact = (nodeId: string): EngineNodeFacts =>
  Object.freeze({ nodeId, status: "CANNOT_ASSESS", cannotAssessReview: true, ownReplyEdgeIds: Object.freeze([]) });
const FACTS: ReadonlyMap<string, EngineNodeFacts> = new Map([["p1", fact("p1")], ["p2", fact("p2")], ["p3", fact("p3")]]);
const candidate = (nodeId: string, authorMaker: string, reviewerMaker: string, distanceToAnswer: number, honestScore: number,
  reviewOrder: number): PointInvestigationCandidate => ({ nodeId, authorMaker, reviewerMaker, distanceToAnswer, honestScore, reviewOrder });
/** Fixed order: p2 (closest, higher score), p1, p3 (one link further). */
const CANDIDATES = Object.freeze([
  candidate("p1", "m-a", "m-b", 1, 0.6, 1), candidate("p2", "m-a", "m-c", 1, 0.8, 2), candidate("p3", "m-b", "m-c", 2, 0.9, 3)
]);
const SEATS: readonly PointInvestigationSeat[] = Object.freeze(["a", "b", "c", "d"]
  .map((name) => Object.freeze({ maker: `m-${name}`, providerRef: `ref-${name}` })));
const ARGUING: ReadonlySet<string> = new Set(["m-a", "m-b", "m-c"]);
const materialFor = (nodeId: string): PointInvestigationMaterial => Object.freeze({
  question: "Should the city build a new tram line?", answer: "Yes, build the tram line.",
  point: `The point written as ${nodeId} about rush-hour crowding.`, targetPoint: "A tram line moves more people.",
  targetRelation: "SUPPORTS", restsOn: null, reviewerReason: "No ridership numbers are given."
});
const reply = (outcome: "holds" | "fails" | "dead_end", found = "Trams of this kind carry about twice the riders of buses.",
  basis: "established" | "assumption" | "none" = "established") => JSON.stringify({
  missing: "Rush-hour ridership on the planned route.", found, basis, outcome,
  reason: "With that piece the point can be decided as stated."
});

/** A gateway double: replies by call-site key, read through the request's own classifier, as the real gateway does. */
function scriptedGateway(replies: Readonly<Record<string, string | Error>>, seen: ProviderCallRequest[]): ProviderGateway {
  return {
    async call(request) {
      seen.push(request);
      const scripted = replies[request.callSiteKey];
      if (scripted === undefined) throw new Error(`UNSCRIPTED:${request.callSiteKey}`);
      if (scripted instanceof Error) throw scripted;
      const verdict = request.classifyContent?.(scripted, STOP);
      if (verdict !== undefined && verdict.parseStatus !== "PARSED") {
        throw new ProviderContentUnacceptedError(2, verdict.parseStatus, verdict.parseError, "artifact:refused", "ledger:refused");
      }
      const name = request.providerRef.replace("ref-", "");
      return { rawArtifactRef: `artifact:${request.callSiteKey}`, ledgerEntryRef: `ledger:${request.callSiteKey}`,
        content: scripted, provider: "openai-compatible-http", model: `model-${name}`, maker: `m-${name}`, modelVersion: `model-${name}` };
    }
  };
}

/**
 * The runner's wiring, with a real Judge over the scripted gateway and the runner's own failure rule: the step, then
 * (as the runner does after the serve decision, Ruling PF-R2a8.10) the record with its standings. `stepOnly` stops after
 * the step.
 */
function investigate(input: Readonly<{
  replies: Readonly<Record<string, string | Error>>;
  candidates?: readonly PointInvestigationCandidate[];
  engine?: EngineSettings;
  spendStopped?: boolean;
  seats?: readonly PointInvestigationSeat[];
  stepOnly?: boolean;
}>) {
  const seen: ProviderCallRequest[] = [];
  const recorded: PointInvestigationRow[] = [];
  const standingsAsked: Array<Readonly<{ nodeId: string; statuses: Readonly<Record<string, string>> }>> = [];
  const judge = new Judge(scriptedGateway(input.replies, seen));
  const seatsFor = vi.fn(() => input.seats ?? SEATS);
  const step = () => runPointInvestigations({
    engine: input.engine ?? ENGINE,
    facts: FACTS,
    candidates: input.candidates ?? CANDIDATES,
    spendStopped: input.spendStopped ?? false,
    arguingMakers: ARGUING,
    seatsFor,
    rotationOffsetOf: () => 0,
    materialOf: materialFor,
    call: async ({ callSiteKey, investigator, material }): Promise<PointInvestigationCallOutcome> => {
      try {
        const answered = await judge.investigatePoint({ runId: "run-1", subjectItemId: "work-1", callSiteKey,
          providerRef: investigator.providerRef, contractHash: SEAL, bound: BOUND, material, length: GUIDE });
        return { kind: "ANSWERED", answer: { reply: answered.reply, rawArtifactRef: answered.provenanceRef,
          maker: answered.maker, providerRef: investigator.providerRef, modelId: answered.model } };
      } catch (error) {
        if (pointInvestigationFailureOutcome(error) === "RETHROW") throw error;
        return { kind: "UNAVAILABLE" };
      }
    }
  });
  const result = (async () => {
    const ran = await step();
    if (input.stepOnly === true) return ran;
    const rows = await recordPointInvestigationRows({
      rows: ran.rows,
      facts: ran.facts,
      standingsOf: (nodeId, facts) => {
        standingsAsked.push({ nodeId, statuses: Object.fromEntries([...facts.values()].map((entry) => [entry.nodeId, entry.status])) });
        return { leaderWithoutRootNodeId: "root-b", leaderWithRootNodeId: nodeId === "p2" ? "root-a" : "root-b", moved: nodeId === "p2" };
      },
      record: async (row) => { recorded.push(row); }
    });
    return Object.freeze({ facts: ran.facts, rows });
  })();
  return { result, seen, recorded, standingsAsked, seatsFor };
}

const NOT_CALLED = { basis: null, maker: null, providerRef: null, modelId: null, rawArtifactRef: null,
  leaderWithoutRootNodeId: null, leaderWithRootNodeId: null, standingsMoved: null, content: null } as const;

describe("engine 2: the investigation step (spec §4.2b, INTERFACE §8.4-§8.7)", () => {
  it("investigates up to the cap in the fixed order, reads holds as agree and fails as dispute, and counts the rest", async () => {
    const run = investigate({ replies: { "VERDICT:investigate:1": reply("holds"), "VERDICT:investigate:2": reply("fails") } });
    const { facts, rows } = await run.result;
    expect(run.seen.map((request) => request.callSiteKey)).toEqual(["VERDICT:investigate:1", "VERDICT:investigate:2"]);
    for (const request of run.seen) {
      expect(request).toMatchObject({ providerRef: "ref-d", contractHash: SEAL, role: "JUDGE", lane: "served",
        modelRole: "REVIEWER", guidedWords: 60 });
    }
    expect(facts.get("p2")?.status).toBe("AGREE");
    expect(facts.get("p1")?.status).toBe("DISPUTE");
    expect(facts.get("p3")?.status).toBe("CANNOT_ASSESS");
    expect(FACTS.get("p2")?.status).toBe("CANNOT_ASSESS");
    expect(rows).toEqual([
      { nodeId: "p2", investigationOrder: 1, result: "HOLDS", basis: "established", maker: "m-d", providerRef: "ref-d",
        modelId: "model-d", rawArtifactRef: "artifact:VERDICT:investigate:1", leaderWithoutRootNodeId: "root-b",
        leaderWithRootNodeId: "root-a", standingsMoved: true,
        content: { missing: "Rush-hour ridership on the planned route.",
          found: "Trams of this kind carry about twice the riders of buses.",
          reason: "With that piece the point can be decided as stated." } },
      { nodeId: "p1", investigationOrder: 2, result: "FAILS", basis: "established", maker: "m-d", providerRef: "ref-d",
        modelId: "model-d", rawArtifactRef: "artifact:VERDICT:investigate:2", leaderWithoutRootNodeId: "root-b",
        leaderWithRootNodeId: "root-b", standingsMoved: false,
        content: { missing: "Rush-hour ridership on the planned route.",
          found: "Trams of this kind carry about twice the riders of buses.",
          reason: "With that piece the point can be decided as stated." } },
      { nodeId: "p3", investigationOrder: 3, result: "INVESTIGATION_CAPPED", ...NOT_CALLED }
    ]);
    expect(run.recorded).toEqual(rows);
    expect(run.standingsAsked).toEqual([
      { nodeId: "p2", statuses: { p1: "DISPUTE", p2: "AGREE", p3: "CANNOT_ASSESS" } },
      { nodeId: "p1", statuses: { p1: "DISPUTE", p2: "AGREE", p3: "CANNOT_ASSESS" } }
    ]);
  });

  it("keeps a dead end at cannot-assess and records what would decide it", async () => {
    const run = investigate({ candidates: [CANDIDATES[0]!], replies: { "VERDICT:investigate:1": reply("dead_end", "", "none") } });
    const { facts, rows } = await run.result;
    expect(facts.get("p1")?.status).toBe("CANNOT_ASSESS");
    expect(rows).toMatchObject([{ nodeId: "p1", result: "DEAD_END", basis: "none", content: { found: "" } }]);
    // Ruling PF-R2a6.1: a whitespace-only `found` is stored as the reader read it, "" (A10 accepts it with basis "none").
    const blank = investigate({ candidates: [CANDIDATES[0]!], replies: { "VERDICT:investigate:1": reply("dead_end", "   ", "none") } });
    expect((await blank.result).rows).toMatchObject([{ nodeId: "p1", result: "DEAD_END", basis: "none", content: { found: "" } }]);
  });

  it("leaves a point at the reduced weight when its call fails after the repairs, or its vendor fails, and goes on", async () => {
    const run = investigate({ replies: {
      "VERDICT:investigate:1": reply("holds", "", "established"),
      "VERDICT:investigate:2": new Error("vendor down")
    } });
    const { facts, rows } = await run.result;
    expect(facts.get("p2")?.status).toBe("CANNOT_ASSESS");
    expect(facts.get("p1")?.status).toBe("CANNOT_ASSESS");
    expect(rows.slice(0, 2)).toEqual([
      { nodeId: "p2", investigationOrder: 1, result: "INVESTIGATION_UNAVAILABLE", ...NOT_CALLED, maker: "m-d", providerRef: "ref-d" },
      { nodeId: "p1", investigationOrder: 2, result: "INVESTIGATION_UNAVAILABLE", ...NOT_CALLED, maker: "m-d", providerRef: "ref-d" }
    ]);
    expect(run.standingsAsked).toEqual([]);
  });

  it("skips a point no eligible maker can investigate, without using a slot", async () => {
    const run = investigate({ seats: [SEATS[0]!, SEATS[1]!], replies: {
      "VERDICT:investigate:1": reply("holds"), "VERDICT:investigate:2": reply("holds")
    } });
    const { rows } = await run.result;
    expect(rows.map((row) => [row.nodeId, row.result, row.providerRef])).toEqual([
      ["p2", "HOLDS", "ref-b"], ["p1", "INVESTIGATION_SKIPPED", null], ["p3", "HOLDS", "ref-a"]
    ]);
    expect(run.seen.map((request) => [request.callSiteKey, request.providerRef])).toEqual([
      ["VERDICT:investigate:1", "ref-b"], ["VERDICT:investigate:2", "ref-a"]
    ]);
  });

  it("runs none at maxPerDebate 0: every qualifying point is recorded as capped", async () => {
    const run = investigate({ engine: { ...ENGINE, investigate: { maxPerDebate: 0 } }, replies: {} });
    const { facts, rows } = await run.result;
    expect(run.seen).toEqual([]);
    expect(run.seatsFor).not.toHaveBeenCalled();
    expect(rows.map((row) => [row.nodeId, row.investigationOrder, row.result])).toEqual([
      ["p2", 1, "INVESTIGATION_CAPPED"], ["p1", 2, "INVESTIGATION_CAPPED"], ["p3", 3, "INVESTIGATION_CAPPED"]
    ]);
    expect([...facts.values()].every((entry) => entry.status === "CANNOT_ASSESS")).toBe(true);
  });

  it("calls nothing after a money stop the debate already met: slot-holders are unavailable, the rest capped", async () => {
    const run = investigate({ spendStopped: true, replies: {} });
    const { rows } = await run.result;
    expect(run.seen).toEqual([]);
    // Ruling PF-R2a8.1 (deviation 20): an UNAVAILABLE row names the investigator it was planned with, so A10's record
    // check and 0121's CHECK accept it and the money-stopped debate still answers.
    expect(rows).toEqual([
      { nodeId: "p2", investigationOrder: 1, result: "INVESTIGATION_UNAVAILABLE", ...NOT_CALLED, maker: "m-d", providerRef: "ref-d" },
      { nodeId: "p1", investigationOrder: 2, result: "INVESTIGATION_UNAVAILABLE", ...NOT_CALLED, maker: "m-d", providerRef: "ref-d" },
      { nodeId: "p3", investigationOrder: 3, result: "INVESTIGATION_CAPPED", ...NOT_CALLED }
    ]);
    expect(run.recorded).toEqual(rows);
  });

  it("plans, calls and reads without recording: the standings wait for the serve decision (Ruling PF-R2a8.10)", async () => {
    const run = investigate({ stepOnly: true, replies: { "VERDICT:investigate:1": reply("holds"), "VERDICT:investigate:2": reply("fails") } });
    const { facts, rows } = await run.result;
    expect(run.recorded).toEqual([]);
    expect(run.standingsAsked).toEqual([]);
    expect(facts.get("p2")?.status).toBe("AGREE");
    expect(facts.get("p1")).toEqual({ nodeId: "p1", status: "DISPUTE", cannotAssessReview: true, ownReplyEdgeIds: [] });
    expect(rows.map((row) => [row.nodeId, row.result, row.leaderWithoutRootNodeId, row.leaderWithRootNodeId, row.standingsMoved]))
      .toEqual([["p2", "HOLDS", null, null, null], ["p1", "FAILS", null, null, null], ["p3", "INVESTIGATION_CAPPED", null, null, null]]);
  });

  it("lets the keep-alive's refusal leave as it arrived, after every sent call settled, recording nothing", async () => {
    const run = investigate({ replies: {
      "VERDICT:investigate:1": new TypedDomainError("RUNNER_CLAIM_LOST", "claim lost"),
      "VERDICT:investigate:2": reply("holds")
    } });
    await expect(run.result).rejects.toMatchObject({ code: "RUNNER_CLAIM_LOST" });
    expect(run.seen).toHaveLength(2);
    expect(run.recorded).toEqual([]);
  });

  it("does nothing when no point qualifies (the same facts object back)", async () => {
    const run = investigate({ candidates: [], replies: {} });
    const { facts, rows } = await run.result;
    expect(facts).toBe(FACTS);
    expect(rows).toEqual([]);
    expect(run.recorded).toEqual([]);
  });

  it.each([
    ["the keep-alive's refusal", new TypedDomainError("RUNNER_CLAIM_LOST", "x"), "RETHROW"],
    ["the time limit", new TypedDomainError("RUNNER_TIME_LIMIT_REACHED", "x"), "RETHROW"],
    ["a stopped lane", new TypedDomainError("CALL_LANE_STOPPED", "x"), "RETHROW"],
    ["a money stop", new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x"), "UNAVAILABLE"],
    ["a reply refused after the repairs", new TypedDomainError("POINT_INVESTIGATION_SCHEMA_FAILURE", "x"), "UNAVAILABLE"],
    ["the call budget", new TypedDomainError("CALL_BUDGET_EXHAUSTED", "x"), "UNAVAILABLE"],
    ["any other error", new Error("socket hang up"), "UNAVAILABLE"]
  ] as const)("reads %s as %s", (_name, error, outcome) => {
    expect(pointInvestigationFailureOutcome(error)).toBe(outcome);
  });
});

describe("engine 2: the investigation step's controller carries (A14 dispatch)", () => {
  it("sends every investigation as a REVIEWER call, the role its key names on the ledger", async () => {
    const run = investigate({ stepOnly: true, replies: { "VERDICT:investigate:1": reply("holds"), "VERDICT:investigate:2": reply("fails") } });
    await run.result;
    expect(run.seen).toHaveLength(2);
    for (const request of run.seen) {
      expect([request.callSiteKey, request.modelRole, debateRoleFromCallSiteKey(request.callSiteKey)])
        .toEqual([request.callSiteKey, "REVIEWER", "REVIEWER"]);
    }
  });

  it.each([
    ["agreed", Object.freeze({ nodeId: "p2", status: "AGREE", cannotAssessReview: false, ownReplyEdgeIds: Object.freeze([]) })],
    ["cannot-assess by status only", Object.freeze({ nodeId: "p2", status: "CANNOT_ASSESS", cannotAssessReview: false, ownReplyEdgeIds: Object.freeze([]) })],
    ["without facts", undefined]
  ] as const)("refuses a candidate whose review is not cannot-assess (%s) before any material or call", async (_name, entry) => {
    const facts = new Map(FACTS);
    if (entry === undefined) facts.delete("p2"); else facts.set("p2", entry);
    const materialOf = vi.fn(materialFor);
    const call = vi.fn(async (): Promise<PointInvestigationCallOutcome> => ({ kind: "UNAVAILABLE" }));
    await expect(runPointInvestigations({
      engine: ENGINE, facts, candidates: CANDIDATES, spendStopped: false, arguingMakers: ARGUING,
      seatsFor: () => SEATS, rotationOffsetOf: () => 0, materialOf, call
    })).rejects.toThrow("POINT_INVESTIGATION_NOT_CANNOT_ASSESS");
    expect(materialOf).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses the standings of a point whose review was not cannot-assess, before any row is written", async () => {
    const ran = await investigate({ stepOnly: true, replies: { "VERDICT:investigate:1": reply("holds"), "VERDICT:investigate:2": reply("fails") } }).result;
    const facts = new Map(ran.facts);
    facts.set("p1", Object.freeze({ nodeId: "p1", status: "DISPUTE", cannotAssessReview: false, ownReplyEdgeIds: Object.freeze([]) }));
    const standingsOf = vi.fn((_nodeId: string) => ({ leaderWithoutRootNodeId: "root-a", leaderWithRootNodeId: "root-a", moved: false }));
    const record = vi.fn(async () => undefined);
    await expect(recordPointInvestigationRows({ rows: ran.rows, facts, standingsOf, record }))
      .rejects.toThrow("POINT_INVESTIGATION_NOT_CANNOT_ASSESS");
    expect(standingsOf.mock.calls.map(([nodeId]) => nodeId)).toEqual(["p2"]);
    expect(record).not.toHaveBeenCalled();
  });

  it("reads a failed point as disputed and a held one as agreed, in the link weights and in the material alike", async () => {
    const ran = await investigate({ stepOnly: true, replies: { "VERDICT:investigate:1": reply("holds"), "VERDICT:investigate:2": reply("fails") } }).result;
    // The runner's fill of `engineInvestigated` (index.ts): the settled outcomes as review statuses.
    const investigated = new Map([...ran.facts].flatMap(([nodeId, entry]) =>
      entry.cannotAssessReview && entry.status !== "CANNOT_ASSESS" ? [[nodeId, entry.status] as const] : []));
    expect(Object.fromEntries(investigated)).toEqual({ p1: "DISPUTE", p2: "AGREE" });
    const arrow = (arrowId: string, source: string, target: string, polarity: "support" | "attack"): SnapshotArrow => ({
      arrowId, sourceNodeId: source, targetKind: "NODE", targetNodeId: target, targetEdgeId: null, polarity, kind: null,
      strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER"
    });
    const snapshot: EvaluationSnapshot = {
      nodes: ["root-a", "root-b", "p1", "p2", "p3"].map((nodeId) => ({ nodeId, baseStrength: 0.5 })),
      arrows: [arrow("e-p1", "p1", "root-a", "support"), arrow("e-p2", "p2", "root-b", "support"), arrow("e-p3", "p3", "root-a", "attack")],
      arrowOrder: ["e-p1", "e-p2", "e-p3"],
      operatorResolutions: [],
      clusterRecords: []
    };
    // A8's link-weighted graph, as `engineLinkedGraphNow` builds it for the serve decision.
    const linked = engineLinkedGraph({ engine: ENGINE, snapshot, reviewedNodeIds: [], disputedNodeIds: [],
      cannotAssessNodeIds: ["p1", "p2", "p3"], ownReplyEdgeIds: new Map(), investigated });
    expect(linked).not.toBeNull();
    if (linked === null) return;
    expect([...linked.facts.values()].map((entry) => [entry.nodeId, entry.status, entry.cannotAssessReview])).toEqual([
      ["p1", "DISPUTE", true], ["p2", "AGREE", true], ["p3", "CANNOT_ASSESS", true]
    ]);
    const weight = ENGINE.links.cannotAssessWeight;
    expect(linked.snapshot.arrows.map((entry) => [entry.arrowId, entry.strength])).toEqual([["e-p1", weight], ["e-p2", 1], ["e-p3", weight]]);
    const base = new Map(linked.snapshot.nodes.map((node) => [node.nodeId, node.baseStrength] as const));
    expect(base.get("p1")).toBe(0.5 * honestDisputeFactor("DISPUTE", ENGINE.scoring));
    expect(honestDisputeFactor("DISPUTE", ENGINE.scoring)).toBeLessThan(1);
    expect(base.get("p2")).toBe(0.5);
    expect(linked.unassessedNodeIds).toEqual(["p3"]);
    // A11's material from the same facts: the judges see the failed point as disputed, the held one as checked.
    const material = engineMaterialOf(engineMaterialSourceOf(engineMaterialGraphOf({
      question: "Should the city build a new tram line?", rootCount: 2,
      authored: new Map([
        [0, { nodeId: "root-a", statement: "Yes, build the tram line." }], [1, { nodeId: "root-b", statement: "No, run better buses." }],
        [2, { nodeId: "p1", statement: "A tram carries more people per hour." }], [3, { nodeId: "p2", statement: "Buses cost less." }],
        [4, { nodeId: "p3", statement: "Rush hour lasts two hours." }]
      ]),
      mapWords: [null, null], snapshot, facts: linked.facts, honestFinalStrength: new Map([["p1", 0.5], ["p2", 0.5], ["p3", 0.5]])
    }), new Map(), new Map()));
    const points = new Map(material.answers.flatMap((answer) => [...answer.supports, ...answer.objections])
      .map((point) => [point.pointRef, [point.disputed, point.notYetChecked]] as const));
    expect(Object.fromEntries(points)).toEqual({ p1: [true, false], p2: [false, false], p3: [false, true] });
    expect(material.disputed.map((point) => [point.letter, point.pointRef])).toEqual([["A", "p1"]]);
  });

  it("keeps the stored row when the record answers ALREADY_PRESENT, and reads every later fact from it", async () => {
    const ran = await investigate({ stepOnly: true, replies: { "VERDICT:investigate:1": reply("holds"), "VERDICT:investigate:2": reply("fails") } }).result;
    const stored: StoredPointInvestigation = Object.freeze({
      runId: "run-1", nodeId: "p2", investigationOrder: 1, result: "FAILS", basis: "assumption",
      investigator: Object.freeze({ maker: "m-d", providerRef: "ref-d", modelId: "model-d-old" }),
      rawArtifactRef: "artifact:first-copy",
      standings: Object.freeze({ leaderWithoutRootNodeId: "root-b", leaderWithRootNodeId: "root-b", moved: false }),
      content: Object.freeze({ missing: "The first copy's missing piece.", found: "Its find.", reason: "Its reason." }),
      recordedAt: "2026-10-17T00:00:00.000Z"
    });
    const recorded: PointInvestigationRow[] = [];
    const rows = await recordPointInvestigationRows({
      rows: ran.rows,
      facts: ran.facts,
      standingsOf: () => ({ leaderWithoutRootNodeId: "root-b", leaderWithRootNodeId: "root-a", moved: true }),
      record: async (row) => {
        recorded.push(row);
        return row.nodeId === "p2" ? pointInvestigationRowOfStored(stored) : undefined;
      }
    });
    expect(recorded.map((row) => [row.nodeId, row.result])).toEqual([["p2", "HOLDS"], ["p1", "FAILS"], ["p3", "INVESTIGATION_CAPPED"]]);
    expect(rows[0]).toEqual({ nodeId: "p2", investigationOrder: 1, result: "FAILS", basis: "assumption", maker: "m-d",
      providerRef: "ref-d", modelId: "model-d-old", rawArtifactRef: "artifact:first-copy", leaderWithoutRootNodeId: "root-b",
      leaderWithRootNodeId: "root-b", standingsMoved: false,
      content: { missing: "The first copy's missing piece.", found: "Its find.", reason: "Its reason." } });
    expect(rows.slice(1).map((row) => [row.nodeId, row.result])).toEqual([["p1", "FAILS"], ["p3", "INVESTIGATION_CAPPED"]]);
    const facts = engineFactsWithInvestigations(ran.facts, rows);
    expect([...facts.values()].map((entry) => [entry.nodeId, entry.status, entry.cannotAssessReview])).toEqual([
      ["p1", "DISPUTE", true], ["p2", "DISPUTE", true], ["p3", "CANNOT_ASSESS", true]
    ]);
    // A stored row that never reached an outcome puts the point back at cannot-assess, whatever this copy's call found.
    const unavailable = engineFactsWithInvestigations(ran.facts, [{ ...rows[0]!, result: "INVESTIGATION_UNAVAILABLE", basis: null,
      rawArtifactRef: null, leaderWithoutRootNodeId: null, leaderWithRootNodeId: null, standingsMoved: null, content: null }]);
    expect(unavailable.get("p2")?.status).toBe("CANNOT_ASSESS");
    expect(ran.facts.get("p2")?.status).toBe("AGREE");
    expect(() => engineFactsWithInvestigations(new Map(), rows)).toThrow("POINT_INVESTIGATION_NOT_CANNOT_ASSESS");
  });

  it("maps a stored row with no investigator and no outcome to the flat row", () => {
    expect(pointInvestigationRowOfStored({ runId: "run-1", nodeId: "p3", investigationOrder: 3, result: "INVESTIGATION_CAPPED",
      basis: null, investigator: null, rawArtifactRef: null, standings: null, content: null }))
      .toEqual({ nodeId: "p3", investigationOrder: 3, result: "INVESTIGATION_CAPPED", ...NOT_CALLED });
  });
});

describe("engine 2: the investigation step, A14 fix round 1", () => {
  it.each([
    ["HOLDS", "AGREE"], ["FAILS", "DISPUTE"], ["DEAD_END", null], ["INVESTIGATION_UNAVAILABLE", null],
    ["INVESTIGATION_SKIPPED", null], ["INVESTIGATION_CAPPED", null]
  ] as const)("reads a recorded %s as the review status %s (null: the point stays cannot-assess)", (result, status) => {
    expect(investigatedStatusOf(result)).toBe(status);
  });

  it("covers every recorded result, and the statuses map names only the settled points", () => {
    expect([...POINT_INVESTIGATION_RESULTS].sort()).toEqual(["DEAD_END", "FAILS", "HOLDS", "INVESTIGATION_CAPPED",
      "INVESTIGATION_SKIPPED", "INVESTIGATION_UNAVAILABLE"]);
    expect(investigatedStatusOf("NOT_A_RESULT")).toBeNull();
    const rows = POINT_INVESTIGATION_RESULTS.map((result, index) => ({ nodeId: `p${String(index + 1)}`, result }));
    expect(Object.fromEntries(engineInvestigatedStatuses(rows))).toEqual({ p1: "AGREE", p2: "DISPUTE" });
    expect(rows.flatMap(investigatedStatusEntry)).toEqual([["p1", "AGREE"], ["p2", "DISPUTE"]]);
  });

  it.each([
    ["a named investigation defect", new TypeError("POINT_INVESTIGATION_CANDIDATE_INVALID"), "RETHROW"],
    ["a length-field defect", new TypeError("LENGTH_FIELD_INVALID"), "RETHROW"],
    ["a material defect", new TypeError("ENGINE_MATERIAL_INVALID:points.nodeId"), "RETHROW"],
    ["a seat with no eligible member", new TypedDomainError("DEBATE_MAKER_UNRESOLVED", "x"), "RETHROW"],
    ["fetch's network failure", new TypeError("fetch failed"), "UNAVAILABLE"],
    ["a socket ended mid-reply", new TypeError("terminated"), "UNAVAILABLE"],
    ["an unreadable reply", new TypedDomainError("POINT_INVESTIGATION_PARSE_FAILURE", "x"), "UNAVAILABLE"],
    ["a reply refused after the repairs", new TypedDomainError("POINT_INVESTIGATION_SCHEMA_FAILURE", "x"), "UNAVAILABLE"]
  ] as const)("reads %s as %s (by its code, never by its class alone)", (_name, error, outcome) => {
    expect(pointInvestigationFailureOutcome(error)).toBe(outcome);
  });

  it("fails the step on a code defect inside the call, after every sent call settled", async () => {
    const run = investigate({ replies: {
      "VERDICT:investigate:1": new TypeError("LENGTH_FIELD_INVALID"), "VERDICT:investigate:2": reply("holds")
    } });
    await expect(run.result).rejects.toThrow("LENGTH_FIELD_INVALID");
    expect(run.seen).toHaveLength(2);
    expect(run.recorded).toEqual([]);
  });

  it("keeps a network failure unavailable: the debate goes on", async () => {
    const run = investigate({ replies: { "VERDICT:investigate:1": new TypeError("fetch failed"), "VERDICT:investigate:2": reply("holds") } });
    const { rows } = await run.result;
    expect(rows.map((row) => [row.nodeId, row.result])).toEqual([
      ["p2", "INVESTIGATION_UNAVAILABLE"], ["p1", "HOLDS"], ["p3", "INVESTIGATION_CAPPED"]
    ]);
  });

  it("names a failure by its code, or its class when it has none, never by its message", () => {
    expect(pointInvestigationFailureCode(new TypedDomainError("POINT_INVESTIGATION_SCHEMA_FAILURE", "the reply said: secret"))).toBe(
      "POINT_INVESTIGATION_SCHEMA_FAILURE");
    expect(pointInvestigationFailureCode(Object.assign(new Error("read ECONNRESET at the vendor"), { code: "ECONNRESET" }))).toBe("ECONNRESET");
    expect(pointInvestigationFailureCode(Object.assign(new Error("x"), { code: "not a code, words" }))).toBe("Error");
    expect(pointInvestigationFailureCode(new TypeError("fetch failed"))).toBe("TypeError");
    expect(pointInvestigationFailureCode("a thrown string")).toBe("UNKNOWN");
  });

  it("writes one content-free line per unavailable call: kind, event, ids and the code, no message", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const error = new TypedDomainError("POINT_INVESTIGATION_SCHEMA_FAILURE", "Vendor text: the AI wrote this sentence.");
      logPointInvestigation("INVESTIGATION_UNAVAILABLE", { runId: "run-1", callSiteKey: "VERDICT:investigate:1",
        code: pointInvestigationFailureCode(error) });
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]?.[0]);
      expect(JSON.parse(line)).toEqual({ runId: "run-1", callSiteKey: "VERDICT:investigate:1",
        code: "POINT_INVESTIGATION_SCHEMA_FAILURE", kind: "DEBATEAI_POINT_INVESTIGATION", event: "INVESTIGATION_UNAVAILABLE" });
      expect(line).not.toContain("AI wrote");
    } finally {
      warn.mockRestore();
    }
  });
});
