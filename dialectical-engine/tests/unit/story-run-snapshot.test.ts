import { describe, expect, it } from "vitest";
import type { ProviderGateway } from "@debateai/providers";
import type { StoryCostFallback, StoryStepLease } from "@debateai/story";
import { buildStoryRunSnapshot, storySeatRoleMaker, type StorySnapshotSource } from "../../apps/runner/src/story-snapshot.js";

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

  it("lists set-aside branches from their records, never an answer-scoped mark", () => {
    const snapshot = buildStoryRunSnapshot(source());
    expect(snapshot.setAside).toEqual([{ nodeId: FROZEN, reason: FROZEN_REASON }]);
    expect(snapshot.sensitivity).toEqual([{ removedNodeId: ROOT, leverage: 0.5 }]);
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
});

/**
 * Part 4, P4-D (P3-N1; controller C3): the story's per-run role makers travel
 * through the snapshot untouched, and each role takes the seat member the
 * served round recorded — main or runner-up — or the seat's main when no round
 * answered (a floor). No seat (legacy, or a FALLBACK seat): null, so the
 * register's ref decides.
 */
describe("the story's per-run role makers (P4-D)", () => {
  const member = (providerRef: string) => ({ provider, providerRef });
  const seat = { main: member("provider:main"), runnerUp: member("provider:runner-up") };

  it("passes the role makers through untouched, and leaves them out when the runner set none", () => {
    const roleMakers = { storyteller: member("provider:w"), checker: null };
    expect(buildStoryRunSnapshot({ ...source(), roleMakers }).roleMakers).toBe(roleMakers);
    expect(buildStoryRunSnapshot(source()).roleMakers).toBeUndefined();
  });

  it("takes the member the served round recorded, main or runner-up", () => {
    expect(storySeatRoleMaker(seat, "provider:runner-up")).toEqual({ provider, providerRef: "provider:runner-up" });
    expect(storySeatRoleMaker(seat, "provider:main")).toEqual({ provider, providerRef: "provider:main" });
  });

  it("takes the seat's main when no round answered, or the recorded ref is neither member", () => {
    expect(storySeatRoleMaker(seat, undefined)).toEqual({ provider, providerRef: "provider:main" });
    expect(storySeatRoleMaker({ main: member("provider:main"), runnerUp: null }, "provider:elsewhere"))
      .toEqual({ provider, providerRef: "provider:main" });
  });

  it("keeps the register's ref (null) for a role with no scorecard seat", () => {
    expect(storySeatRoleMaker(null, "provider:main")).toBeNull();
  });
});
