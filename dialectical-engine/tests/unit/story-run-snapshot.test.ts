import { describe, expect, it } from "vitest";
import type { ProviderGateway } from "@debateai/providers";
import {
  engineSettingsOf,
  engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues,
  resolveLengthGuidance
} from "@debateai/register";
import type { StoryBackupCandidate, StoryCostFallback, StoryStepLease } from "@debateai/story";
import {
  CONTENT_REFUSED_HALT_REASON, buildStoryRunSnapshot, storyBackupCandidatesFrom, storyBackupMakersFrom, storyRotationRoleMakers, storySeatRoleMaker, type StorySnapshotSource
} from "../../apps/runner/src/story-snapshot.js";

/**
 * Verdict story, Task 9 — the runner's in-memory material, projected for the
 * story at the post-settle hook. Pure: the hook guards it anyway.
 */

const ROOT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const FROZEN = "33333333-3333-4333-8333-333333333333";
const ARROW_CHILD = "44444444-4444-4444-8444-444444444444";
const ARROW_FROZEN = "55555555-5555-4555-8555-555555555555";
const provider: ProviderGateway = { call: async () => { throw new Error("unused"); } };
const stepLease: StoryStepLease = (use) => use();
/** Task M7: the run's cost fallback travels to the writer untouched. */
const costFallback: StoryCostFallback = async ({ planned, request, call }) => ({
  result: await call(planned, request), servedBy: planned
});
const UUID_SHAPED = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
/** What the story reads for a frozen branch: the runner's own reason names node ids, so it is replaced. */
const FROZEN_REASON = "BRANCH-FROZEN-LOW-LEVERAGE: Adaptive stopping froze this branch: its leverage on the positions "
  + "was below the sealed branch-freeze threshold, so nothing was expanded beneath it";

function source(): StorySnapshotSource {
  return {
    runId: "run-1",
    workItemId: "work-1",
    answerId: "answer-1",
    answerVersion: 2,
    questionLine: "Should we?",
    argumentLanguage: { tag: "ro", name: "Romanian" },
    compositionBudgetTier: "medium",
    verdict: { label: "CONTESTED", rung: 2, trigger: "MARGIN_WITHIN_GAMMA" },
    servedRootNodeId: ROOT,
    servedStrength: 0.62,
    runnerUp: { nodeId: CHILD, strength: 0.58 },
    margin: { kind: "MEASURED", value: 0.04 },
    disagreement: { kind: "MEASURED", value: 0.12 },
    thresholds: { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 },
    confidenceBand: "CAPPED",
    answerMarks: ["BRANCH-FROZEN-LOW-LEVERAGE"],
    servedSegments: [{ text: "First segment." }, { text: "Second segment." }],
    authored: [
      {
        nodeId: ROOT, statement: "Root claim.", provenanceRef: "artifact-root", wayOfKnowing: "LOOKED_UP",
        reversalPoint: "Root objection.", maker: "maker-a", panelDispersion: 0.1
      },
      {
        nodeId: CHILD, statement: "Child claim.", provenanceRef: "artifact-child", wayOfKnowing: "REASONING",
        reversalPoint: "Child objection.", maker: "maker-b", panelDispersion: null
      },
      {
        nodeId: FROZEN, statement: "Frozen claim.", provenanceRef: "artifact-frozen", wayOfKnowing: "REASONING",
        reversalPoint: "Frozen objection.", maker: "maker-a", panelDispersion: null
      }
    ],
    positionNodeIds: new Set([ROOT, CHILD]),
    baseStrengths: [
      { nodeId: ROOT, baseStrength: 0.7 }, { nodeId: CHILD, baseStrength: null }, { nodeId: FROZEN, baseStrength: 0.2 }
    ],
    finalStrengths: [{ nodeId: ROOT, strength: 0.62 }, { nodeId: CHILD, strength: 0.58 }],
    arrows: [
      { arrowId: ARROW_CHILD, sourceNodeId: CHILD, targetKind: "NODE", targetNodeId: ROOT, polarity: "attack" },
      { arrowId: ARROW_FROZEN, sourceNodeId: FROZEN, targetKind: "EDGE", targetNodeId: null, polarity: "support" }
    ],
    arrowOrder: [ARROW_CHILD, ARROW_FROZEN],
    sensitivity: [{ removedNodeId: ROOT, leverage: 0.5 }],
    conditionMarkRecords: [
      {
        // The runner's real reason names the branch and the roots by node id
        // (apps/runner/src/index.ts buildBranchFrozenRecord).
        mark: "BRANCH-FROZEN-LOW-LEVERAGE", scope: "node", subjectRef: FROZEN,
        reason: `Adaptive stopping froze branch ${FROZEN}: its root-scoped leverage 0.001 over roots ${ROOT}, ${CHILD} `
          + "is strictly below the sealed branch-freeze epsilon 0.005 (t16:epsilon); nothing was expanded beneath it",
        affectedNodeIds: [FROZEN]
      },
      {
        mark: "SINGLE-LINEAGE", scope: "answer", subjectRef: ROOT,
        reason: "MONO_MAKER_RUN", affectedNodeIds: [ROOT]
      }
    ],
    resolveProvider: (roleRef) => (roleRef === "provider:a" ? { provider, providerRef: roleRef } : null),
    stepLease,
    costFallback
  };
}

describe("buildStoryRunSnapshot", () => {
  it("maps the verdict basis to the stored snake-case shape", () => {
    expect(buildStoryRunSnapshot(source()).verdictBasis).toEqual({
      label: "CONTESTED", rung: 2, trigger: "MARGIN_WITHIN_GAMMA",
      winner_node_id: ROOT, winner_strength: 0.62,
      runner_up_node_id: CHILD, runner_up_strength: 0.58, margin: 0.04, disagreement: 0.12,
      thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
      confidence_band: "CAPPED", marks: ["BRANCH-FROZEN-LOW-LEVERAGE"]
    });
    // A single position: no runner-up, no margin, and a panel of one, so no
    // measured disagreement either. All three are null, never a zero.
    const single = buildStoryRunSnapshot({
      ...source(),
      runnerUp: null,
      margin: { kind: "ABSENT", reason: "SINGLE_SERVABLE_ROOT" },
      disagreement: { kind: "ABSENT", reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" }
    });
    expect(single.verdictBasis).toMatchObject({
      runner_up_node_id: null, runner_up_strength: null, margin: null, disagreement: null
    });
  });

  it("projects each authored node with its scores, author, dispersion and critic line", () => {
    const snapshot = buildStoryRunSnapshot(source());
    expect(snapshot.nodes).toEqual([
      {
        nodeId: ROOT, claim: "Root claim.", isPosition: true, wayOfKnowing: "LOOKED_UP", baseScore: 0.7,
        finalStrength: 0.62, excludedReason: null, authorModel: "maker-a", panelDispersion: 0.1,
        criticSummary: "Root objection."
      },
      {
        nodeId: CHILD, claim: "Child claim.", isPosition: true, wayOfKnowing: "REASONING", baseScore: null,
        finalStrength: 0.58, excludedReason: null, authorModel: "maker-b", panelDispersion: null,
        criticSummary: "Child objection."
      },
      {
        nodeId: FROZEN, claim: "Frozen claim.", isPosition: false, wayOfKnowing: "REASONING", baseScore: 0.2,
        finalStrength: null, excludedReason: FROZEN_REASON,
        authorModel: "maker-a", panelDispersion: null, criticSummary: "Frozen objection."
      }
    ]);
    expect(snapshot.servedStatement).toEqual(["First segment.", "Second segment."]);
    expect(snapshot).toMatchObject({
      runId: "run-1", workItemId: "work-1", answerId: "answer-1", answerVersion: 2,
      questionLine: "Should we?", compositionBudgetTier: "medium"
    });
  });

  it("carries the question's language the run recorded, for the story's prompts and its stored tag (R1)", () => {
    expect(buildStoryRunSnapshot(source()).argumentLanguage).toEqual({ tag: "ro", name: "Romanian" });
    expect(buildStoryRunSnapshot({ ...source(), argumentLanguage: null }).argumentLanguage).toBeNull();
  });

  it("marks the language as the run's lock only when the caller says so (question-language spec 2026-10-13)", () => {
    expect(buildStoryRunSnapshot({ ...source(), languageLocked: true }).languageLocked).toBe(true);
    // Today's run: no member at all, so the writer builds today's bytes.
    expect(Object.hasOwn(buildStoryRunSnapshot(source()), "languageLocked")).toBe(false);
    expect(Object.hasOwn(buildStoryRunSnapshot({ ...source(), languageLocked: false }), "languageLocked")).toBe(false);
  });

  it("hands the story the run's engine, its length table and its backup storytellers only when given (engine redesign R1d)", () => {
    const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 3, mapOpening: false });
    const guidance = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "premium", answerLength: "standard" });
    const candidates: readonly StoryBackupCandidate[] = [Object.freeze({ provider, providerRef: "provider:b", maker: "maker y" })];
    const made = buildStoryRunSnapshot({ ...source(), engine, lengthGuidance: guidance, backupCandidates: candidates });
    expect(made.engine).toBe(engine);
    expect(made.lengthGuidance).toBe(guidance);
    expect(made.backupCandidates).toEqual(candidates);
    expect(made.backupCandidates?.[0]?.provider).toBe(provider);
    // Task 18 review 1 (final wave B12): its own frozen copy, never the caller's array.
    expect(made.backupCandidates).not.toBe(candidates);
    expect(Object.isFrozen(made.backupCandidates)).toBe(true);
    // A run admitted without them (engine 1, no length row): no member at all, so the writer builds today's bytes.
    const today = buildStoryRunSnapshot(source());
    for (const member of ["engine", "lengthGuidance", "backupCandidates"]) expect(Object.hasOwn(today, member)).toBe(false);
    expect(Object.hasOwn(buildStoryRunSnapshot({ ...source(), engine: null }), "engine")).toBe(false);
  });

  it("hands the backup's maker rule every claim-eligible member's maker, unfiltered, as its own frozen copy (ruling W1)", () => {
    // Whole-branch review Minor 1: the sit-out filter thins the candidates only; the makers of the resolved roles (a
    // benched first storyteller, an out-of-panel register checker) stay known.
    // The runner's claim-eligible members carry their gateways; the makers keep only ref and maker.
    const claimEligible: readonly StoryBackupCandidate[] = [
      { provider, providerRef: "provider:a", maker: "maker x" },
      { provider, providerRef: "provider:sealed-checker", maker: "maker y" }
    ];
    const makers = storyBackupMakersFrom(claimEligible);
    expect(makers).toEqual([
      { providerRef: "provider:a", maker: "maker x" },
      { providerRef: "provider:sealed-checker", maker: "maker y" }
    ]);
    expect(Object.isFrozen(makers)).toBe(true);
    expect(makers.every((entry) => Object.isFrozen(entry) && !Object.hasOwn(entry, "provider"))).toBe(true);
    const made = buildStoryRunSnapshot({ ...source(), backupMakers: makers });
    expect(made.backupMakers).toEqual(makers);
    expect(made.backupMakers).not.toBe(makers);
    expect(Object.isFrozen(made.backupMakers)).toBe(true);
    expect(Object.hasOwn(buildStoryRunSnapshot(source()), "backupMakers")).toBe(false);
  });

  // Task 15 review (a): the receipt's numbers pass to the story's input, and no key without them.
  it("passes the run's length guidance through, and carries no lengthGuidance key without it", () => {
    const guidance = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "pro", answerLength: "standard" });
    expect(buildStoryRunSnapshot({ ...source(), lengthGuidance: guidance }).lengthGuidance).toBe(guidance);
    expect(Object.hasOwn(buildStoryRunSnapshot(source()), "lengthGuidance")).toBe(false);
    expect(Object.hasOwn(buildStoryRunSnapshot({ ...source(), lengthGuidance: undefined }), "lengthGuidance")).toBe(false);
  });

  it("drops an arrow onto an edge to a null target", () => {
    expect(buildStoryRunSnapshot(source()).arrows).toEqual([
      { sourceNodeId: CHILD, targetNodeId: ROOT, polarity: "attack" },
      { sourceNodeId: FROZEN, targetNodeId: null, polarity: "support" }
    ]);
  });

  it("orders the arrows by the engine's fixed arrow order, and loses none it does not list", () => {
    const LATE = "66666666-6666-4666-8666-666666666666";
    const snapshot = buildStoryRunSnapshot({
      ...source(),
      arrows: [
        { arrowId: LATE, sourceNodeId: FROZEN, targetKind: "NODE", targetNodeId: CHILD, polarity: "attack" },
        { arrowId: ARROW_FROZEN, sourceNodeId: FROZEN, targetKind: "EDGE", targetNodeId: null, polarity: "support" },
        { arrowId: ARROW_CHILD, sourceNodeId: CHILD, targetKind: "NODE", targetNodeId: ROOT, polarity: "attack" }
      ],
      arrowOrder: [ARROW_CHILD, ARROW_FROZEN]
    });
    expect(snapshot.arrows).toEqual([
      { sourceNodeId: CHILD, targetNodeId: ROOT, polarity: "attack" },
      { sourceNodeId: FROZEN, targetNodeId: null, polarity: "support" },
      { sourceNodeId: FROZEN, targetNodeId: CHILD, polarity: "attack" }
    ]);
    // The same debate read back in any order numbers its points the same way.
    const reversed = buildStoryRunSnapshot({ ...source(), arrows: [...source().arrows].reverse() });
    expect(reversed.arrows).toEqual(buildStoryRunSnapshot(source()).arrows);
  });

  it("never hands the story a node id inside a free-text field", () => {
    const snapshot = buildStoryRunSnapshot({
      ...source(),
      authored: source().authored.map((node) => ({ ...node, reversalPoint: `Objection citing ${CHILD} directly.` })),
      answerMarks: ["BRANCH-FROZEN-LOW-LEVERAGE", `ODD-MARK-${ROOT}`],
      conditionMarkRecords: [
        ...source().conditionMarkRecords,
        {
          mark: "UNAUTHORED-BRANCH-HALTED", scope: "node", subjectRef: CHILD,
          reason: `Expansion under ${CHILD} halted`, affectedNodeIds: [CHILD]
        }
      ]
    });
    const freeText = [
      ...snapshot.nodes.flatMap((node) => [node.excludedReason, node.criticSummary]),
      ...snapshot.setAside.map((entry) => entry.reason),
      ...snapshot.verdictBasis.marks
    ].filter((text): text is string => text !== null);
    expect(freeText.length).toBeGreaterThan(0);
    for (const text of freeText) expect(text).not.toMatch(UUID_SHAPED);
    expect(snapshot.nodes[0]?.criticSummary).toBe("Objection citing (a point) directly.");
    expect(snapshot.setAside).toContainEqual({ nodeId: CHILD, reason: "UNAUTHORED-BRANCH-HALTED: Expansion under (a point) halted" });
  });

  // Task 14 (Task 12 NOTE): the debate shape's twelve marks (DEBATE_SHAPE_MARKS) are about how the debate was run (the
  // map's fallbacks, R3's four answer-check marks, the two extensions); their records carry codes only (`MAP_MERGE_FALLBACK:MERGE`, `SCRUTINY_EXTENDED:2`). The story is
  // never handed them — neither the mark codes nor a record's reason — so the story writer never reads a raw code.
  it("never hands the story a debate-shape mark or its coded reason", () => {
    const shapeMarks = ["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK", "MAP_UNAVAILABLE_TODAYS_OPENING",
      "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED", "MAP_CHECK_UNAVAILABLE", "MAP_ANSWER_REPLACED", "MAP_ANSWER_DROPPED",
      "MAP_ANSWER_KEPT_UNCHECKED", "PANEL-CLOSE-CALL-EXTENDED", "SCRUTINY-EXTENDED"];
    const snapshot = buildStoryRunSnapshot({
      ...source(),
      answerMarks: ["BRANCH-FROZEN-LOW-LEVERAGE", ...shapeMarks],
      conditionMarkRecords: [
        ...source().conditionMarkRecords,
        { mark: "MAP_MERGE_FALLBACK", scope: "answer", subjectRef: "run-1", reason: "MAP_MERGE_FALLBACK:MERGE", affectedNodeIds: [ROOT] },
        { mark: "SCRUTINY-EXTENDED", scope: "node", subjectRef: CHILD, reason: "SCRUTINY_EXTENDED:2", affectedNodeIds: [CHILD] },
        { mark: "PANEL-CLOSE-CALL-EXTENDED", scope: "node", subjectRef: CHILD, reason: "PANEL_CLOSE_CALL_EXTENDED:1", affectedNodeIds: [CHILD] }
      ]
    });
    expect(snapshot.verdictBasis.marks).toEqual(["BRANCH-FROZEN-LOW-LEVERAGE"]);
    const freeText = JSON.stringify({ nodes: snapshot.nodes, setAside: snapshot.setAside, marks: snapshot.verdictBasis.marks });
    for (const code of [...shapeMarks, "SCRUTINY_EXTENDED", "PANEL_CLOSE_CALL_EXTENDED"]) expect(freeText).not.toContain(code);
  });

  // Engine redesign R3 (spec §5.5): the answer check's four marks are debate-shape marks too, so the story is never
  // handed them either (the story's left-out list reads DEBATE_SHAPE_MARKS, not a hand-written list).
  it("never hands the story one of the answer check's four marks or its coded reason", () => {
    const checkMarks = ["MAP_CHECK_UNAVAILABLE", "MAP_ANSWER_REPLACED", "MAP_ANSWER_DROPPED", "MAP_ANSWER_KEPT_UNCHECKED"];
    const snapshot = buildStoryRunSnapshot({
      ...source(),
      answerMarks: ["BRANCH-FROZEN-LOW-LEVERAGE", ...checkMarks],
      conditionMarkRecords: [
        ...source().conditionMarkRecords,
        { mark: "MAP_ANSWER_REPLACED", scope: "answer", subjectRef: "run-1", reason: "MAP_ANSWER_REPLACED:CHECK", affectedNodeIds: [ROOT] }
      ]
    });
    expect(snapshot.verdictBasis.marks).toEqual(["BRANCH-FROZEN-LOW-LEVERAGE"]);
    const freeText = JSON.stringify({ nodes: snapshot.nodes, setAside: snapshot.setAside, marks: snapshot.verdictBasis.marks });
    for (const code of [...checkMarks, "CHECK"]) expect(freeText).not.toContain(code);
  });

  it("lists set-aside branches from their records, never an answer-scoped mark", () => {
    const snapshot = buildStoryRunSnapshot(source());
    expect(snapshot.setAside).toEqual([{ nodeId: FROZEN, reason: FROZEN_REASON }]);
    expect(snapshot.sensitivity).toEqual([{ removedNodeId: ROOT, leverage: 0.5 }]);
  });

  // R22 (owner ruling 2026-10-29): a reply or cross-exchange given up because its author's reply was refused after its
  // repairs carries a coded reason until the owner approves its words; the story writer never reads that code. The
  // answer still carries the mark, which the story already sees by name, and a transport halt is handed on as today.
  it("never hands the story a halted branch's coded content-refusal reason", () => {
    const halted = {
      mark: "UNAUTHORED-BRANCH-HALTED", scope: "node" as const, subjectRef: ROOT, affectedNodeIds: [ROOT]
    };
    const snapshot = buildStoryRunSnapshot({
      ...source(),
      answerMarks: ["UNAUTHORED-BRANCH-HALTED"],
      conditionMarkRecords: [...source().conditionMarkRecords, { ...halted, reason: CONTENT_REFUSED_HALT_REASON }]
    });
    expect(snapshot.setAside).toEqual([{ nodeId: FROZEN, reason: FROZEN_REASON }]);
    expect(snapshot.nodes.find((node) => node.nodeId === ROOT)?.excludedReason).toBeNull();
    expect(JSON.stringify([snapshot.nodes, snapshot.setAside])).not.toContain(CONTENT_REFUSED_HALT_REASON);
    expect(snapshot.verdictBasis.marks).toEqual(["UNAUTHORED-BRANCH-HALTED"]);
    const transport = buildStoryRunSnapshot({
      ...source(),
      conditionMarkRecords: [...source().conditionMarkRecords, { ...halted, reason: "Expansion halted after transport exhaustion" }]
    });
    expect(transport.setAside).toContainEqual({ nodeId: ROOT, reason: "UNAUTHORED-BRANCH-HALTED: Expansion halted after transport exhaustion" });
  });

  it("carries each node's judge artifact, the run's own role resolver and its step lease", () => {
    const snapshot = buildStoryRunSnapshot(source());
    // The story runs after the run's lease; each of its steps takes this one.
    expect(snapshot.stepLease).toBe(stepLease);
    expect([...snapshot.judgeArtifactRefs]).toEqual([
      [ROOT, "artifact-root"], [CHILD, "artifact-child"], [FROZEN, "artifact-frozen"]
    ]);
    expect(snapshot.resolveProvider?.("provider:a")).toEqual({ provider, providerRef: "provider:a" });
    expect(snapshot.resolveProvider?.("provider:b")).toBeNull();
    // Task M7: and the run's cost fallback over the same makers, untouched.
    expect(snapshot.costFallback).toBe(costFallback);
  });

  it("engine 2 names a position by the map's words (R3, P2.6); without positionWords the claim is the node's statement", () => {
    const built = buildStoryRunSnapshot({ ...source(), positionWords: new Map([[ROOT, "Only on night lines."]]) });
    expect(built.nodes.find((node) => node.nodeId === ROOT)!.claim).toBe("Only on night lines.");
    const today = buildStoryRunSnapshot(source());
    expect(built.nodes.find((node) => node.nodeId === CHILD)!.claim).toBe(today.nodes.find((node) => node.nodeId === CHILD)!.claim);
    expect(today.nodes.find((node) => node.nodeId === ROOT)!.claim).not.toBe("Only on night lines.");
  });
});

/**
 * Part 4, P4-D (P3-N1; controller C3): the story's per-run role makers travel
 * through the snapshot untouched, and each role takes the seat member the
 * served round recorded — main or runner-up — or the seat's main when no round
 * answered (a floor). No seat (legacy, or a FALLBACK seat): null, so the
 * register's ref decides.
 */
describe("the story's per-run role makers (P4-D)", () => {
  // C-17: each member has its OWN gateway double, so a role that paired one member's ref with the other's gateway (the
  // story run on the main's route under the runner-up's name) fails here, not only in an integration suite.
  const gateway = (): ProviderGateway => ({ call: async () => { throw new Error("unused"); } });
  const mainGateway = gateway();
  const runnerUpGateway = gateway();
  const seat = {
    main: { provider: mainGateway, providerRef: "provider:main" },
    runnerUp: { provider: runnerUpGateway, providerRef: "provider:runner-up" }
  };
  /** The role is exactly that member: its own ref AND its own gateway object. */
  const expectMember = (
    made: ReturnType<typeof storySeatRoleMaker>, member: Readonly<{ provider: ProviderGateway; providerRef: string }>
  ) => {
    expect(made?.providerRef).toBe(member.providerRef);
    expect(made?.provider).toBe(member.provider);
  };

  it("passes the role makers through untouched, and leaves them out when the runner set none", () => {
    const roleMakers = { storyteller: { provider: gateway(), providerRef: "provider:w" }, checker: null };
    expect(buildStoryRunSnapshot({ ...source(), roleMakers }).roleMakers).toBe(roleMakers);
    expect(buildStoryRunSnapshot(source()).roleMakers).toBeUndefined();
  });

  it("takes the member the served round recorded, main or runner-up, each on its own gateway", () => {
    expectMember(storySeatRoleMaker(seat, "provider:runner-up"), seat.runnerUp);
    expectMember(storySeatRoleMaker(seat, "provider:main"), seat.main);
  });

  it("takes the seat's main when no round answered, or the recorded ref is neither member", () => {
    expectMember(storySeatRoleMaker(seat, undefined), seat.main);
    expectMember(storySeatRoleMaker(seat, "provider:elsewhere"), seat.main);
    expectMember(storySeatRoleMaker({ main: seat.main, runnerUp: null }, "provider:elsewhere"), seat.main);
  });

  it("keeps the register's ref (null) for a role with no scorecard seat", () => {
    expect(storySeatRoleMaker(null, "provider:main")).toBeNull();
  });
});

/**
 * Role rotation, Task 12 (spec 2026-10-11 Part 6, "Story roles"; "always an answer"): a rotated run's story pair.
 * A pinned member that is claim-eligible keeps its role. One that is not hands it to another claim-eligible member of
 * the run's stored panel, in that panel's order: the storyteller first to a member of another maker than the pinned
 * story checker (when that checker can serve), else to the first one; the story checker to the first member whose
 * maker differs from the storyteller actually serving (re-checked when the storyteller fell back). None: null, and the
 * story package then takes the register's story ref (the runner only resolves it when it is a panel ref).
 */
describe("the story's rotated role makers, with a panel stand-in for an absent pinned member (role rotation, Task 12)", () => {
  const member = (providerRef: string, maker: string) => Object.freeze({
    provider: { call: async () => { throw new Error("unused"); } } as ProviderGateway, providerRef, maker
  });
  const A = member("provider:a", "maker x");
  const B = member("provider:b", "maker y");
  const C = member("provider:c", "maker z");
  const D = member("provider:d", "maker w");
  const C2 = member("provider:c2", "maker z");
  const pick = (
    panel: readonly (typeof A)[], eligible: readonly (typeof A)[], storyteller: typeof A, checker: typeof A
  ) => storyRotationRoleMakers({
    panelRefs: panel.map((entry) => entry.providerRef), claimEligible: eligible,
    storytellerRef: storyteller.providerRef, storyCheckerRef: checker.providerRef
  });
  /** The role is exactly that member: its own ref AND its own gateway object. */
  const expectRoles = (made: ReturnType<typeof pick>, storyteller: typeof A | null, checker: typeof A | null) => {
    expect(made.storyteller === null ? null : { ref: made.storyteller.providerRef, provider: made.storyteller.provider })
      .toEqual(storyteller === null ? null : { ref: storyteller.providerRef, provider: storyteller.provider });
    expect(made.storyteller?.provider).toBe(storyteller?.provider);
    expect(made.checker === null ? null : { ref: made.checker.providerRef, provider: made.checker.provider })
      .toEqual(checker === null ? null : { ref: checker.providerRef, provider: checker.provider });
    expect(made.checker?.provider).toBe(checker?.provider);
  };

  it("keeps both pinned members when both are claim-eligible", () => {
    expectRoles(pick([A, B, C], [A, B, C], C, A), C, A);
  });

  it("an absent storyteller: the next claim-eligible panel member of another maker than the pinned checker", () => {
    // C absent; A is the pinned checker's maker, so B (panel order, skipping A) writes and A still checks.
    expectRoles(pick([A, B, C], [A, B], C, A), B, A);
    // Panel order decides among several: D before B when D comes first.
    expectRoles(pick([A, D, B, C], [A, D, B], C, A), D, A);
  });

  it("an absent storyteller whose only stand-ins share the pinned checker's maker: the first one, and the checker is re-checked", () => {
    // C absent; the only claim-eligible members are of maker x (A and its second ref). The storyteller falls to A; the
    // pinned checker (maker x) now shares its maker, and no member of another maker is left: null (the register's ref).
    const A2 = member("provider:a2", "maker x");
    expectRoles(pick([A, A2, C], [A, A2], C, A2), A, null);
  });

  it("an absent story checker: the next claim-eligible panel member whose maker differs from the storyteller's", () => {
    // A absent; the storyteller is C (maker z): B is the first other-maker member in panel order.
    expectRoles(pick([A, B, C], [B, C], C, A), C, B);
    // C2 shares the storyteller's maker and is skipped although it comes first; D serves.
    expectRoles(pick([A, C2, D, C], [C2, D, C], C, A), C, D);
  });

  it("no claim-eligible panel member of another maker: null, so the register's story ref is tried", () => {
    expectRoles(pick([A, B], [A], A, B), A, null);
    expectRoles(pick([A, C2, C], [C2, C], C, A), C, null);
  });

  it("never takes a claim-eligible member that is not on the run's panel", () => {
    const offPanel = member("provider:off-panel", "maker y");
    expectRoles(pick([A, B], [A, offPanel], A, B), A, null);
    expectRoles(pick([A, B, C], [offPanel, B, C], C, A), C, B);
  });

  it("offers the backup storytellers in the stored panel's order, claim-eligible members only, each once (R1d)", () => {
    const offPanel = member("provider:off-panel", "maker y");
    const made = storyBackupCandidatesFrom({
      panelRefs: [C, A, B, C, D].map((entry) => entry.providerRef),
      claimEligible: [A, B, C, offPanel]
    });
    expect(made.map((entry) => [entry.providerRef, entry.maker]))
      .toEqual([["provider:c", "maker z"], ["provider:a", "maker x"], ["provider:b", "maker y"]]);
    expect(made[0]!.provider).toBe(C.provider);
    expect(Object.isFrozen(made)).toBe(true);
    expect(storyBackupCandidatesFrom({ panelRefs: [], claimEligible: [A, B] })).toEqual([]);
  });
});
