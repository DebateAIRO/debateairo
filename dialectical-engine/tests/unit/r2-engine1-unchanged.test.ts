/**
 * Engine redesign R2, Task A1 (spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md §4.5, §14.1, §15): what
 * engine 1 reads and writes, pinned BEFORE any R2 change and kept green by every R2 task.
 *
 * Literal values where the value IS the rule: the composition, selection and label rows, the verdict ladder's table, the
 * judged-standing projection of a cannot-assess point, a receipt's role split. A recorded file
 * (tests/fixtures/r2/engine1-unchanged.json) where the value is a digest or long text: the engine-1 contract seals, the
 * four engine-1 fingerprint texts, deriveVerdictLabel's source, today's receipt bytes and one propagation outcome. The file
 * is written ONCE, at Task A1, by `R2_ENGINE1_PINS_WRITE=1` on the unchanged code; no later task rewrites it.
 * One owner-ruled move since, edited by hand (never re-recorded): the V4 reading level and the language-neutral length
 * sentence (owner N6 and 17 Oct #5, 2026-10-29) added sealed writer and checker variants, so the composer seal moved
 * 879d2c5d… -> 6fb174d4… and the conformance seal 108f1b29… -> 02e01cbf… (in `contractRows` and `fingerprints`); every
 * other recorded value is A1's.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT } from "@debateai/judgement";
import { CLAIM_TYPES } from "@debateai/kernel";
import { mapPromptFingerprintText } from "@debateai/map";
import { evaluate, type EvaluationSnapshot } from "@debateai/propagation";
import {
  ENGINE_ONE, VERDICT_LABEL_ROW_KEYS, buildAlgorithmRegisterRows, computeStructuralCeilingBasis,
  debateShapePolicyStartValues, engineOfRun, resolveDebateShape
} from "@debateai/register";
// Pre-flight PF-R2a1.9: the conformance seal covers v2 AND LG-C2's `serve.evaluator.length.v1`, so the record takes the
// whole text the seal digests (apps/runner/src/dev-deployment-register.ts:562-563, R1c part 2), not v2's alone.
import { EVALUATOR_CONTRACTS_FINGERPRINT_TEXT, projectJudgedStanding } from "@debateai/runner";
import { SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT, deriveVerdictLabel } from "@debateai/serve";
import { expectedCallsByRoleFromBasis } from "../../apps/api/src/ask-model-picker.js";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";
import { T16_GOAL_RULING_REF, T16_JUDGE_RULING_REF } from "../../packages/register/src/algorithm-policy.js";

const FIXTURE = new URL("../fixtures/r2/engine1-unchanged.json", import.meta.url);
const RECORD = process.env.R2_ENGINE1_PINS_WRITE === "1";
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
/**
 * Seals that are not engine 1's prompt fingerprints: two digests of whole source files (they move with any edit of the
 * file and boot never compares them, apps/runner/src/index.ts:771-773), and engine 2's own seal (it moves in A13 and B1
 * by design).
 */
const NOT_ENGINE1_SEALS = new Set(["serveContractHash", "propagationContractHash", "engineContractHash"]);

/** The same terms tests/unit/debate-shape-role-shares.test.ts:9-16 sizes today's and a shaped receipt with. */
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const SHAPE = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "free", makers: 3,
  settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } })!;
const todayReceipt = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 });
const shapedReceipt = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, shape: SHAPE });

const arrow = (arrowId: string, sourceNodeId: string, targetNodeId: string, polarity: "support" | "attack",
  strength: number | null): EvaluationSnapshot["arrows"][number] => ({
  arrowId, sourceNodeId, targetKind: "NODE", targetNodeId, targetEdgeId: null, polarity,
  kind: polarity === "attack" ? "rebutting" : null, strength, magnitudeStatus: strength === null ? "UNKNOWN" : "MEASURED",
  strengthSource: "REVIEWER"
});

/**
 * An engine-1-shaped graph: root A's own cross-reply supports A (and attacks B), and a point under B whose review said
 * "cannot assess" attacks A with no measured bearing. Engine 1 propagates it as it stands.
 */
const PROPAGATION_SNAPSHOT: EvaluationSnapshot = {
  nodes: [
    { nodeId: "root-a", baseStrength: 0.6, parentNodeId: null },
    { nodeId: "root-b", baseStrength: 0.5, parentNodeId: null },
    { nodeId: "reply-a", baseStrength: 0.7, parentNodeId: "root-a" },
    { nodeId: "point-b", baseStrength: 0.4, parentNodeId: "root-b" }
  ],
  arrows: [
    arrow("own-support", "reply-a", "root-a", "support", 0.8),
    arrow("reply-attack", "reply-a", "root-b", "attack", 0.9),
    arrow("unassessed-attack", "point-b", "root-a", "attack", null)
  ],
  arrowOrder: ["own-support", "reply-attack", "unassessed-attack"],
  operatorResolutions: [
    { parentNodeId: "root-a", operator: "accumulate", suppliedBy: "deployment" },
    { parentNodeId: "root-b", operator: "accumulate", suppliedBy: "deployment" }
  ],
  clusterRecords: []
};

/** A reviewed supporter under A; a point under B whose only review said "cannot assess" (so it is not in the reviewed list). */
const STANDING_SNAPSHOT: EvaluationSnapshot = {
  nodes: [
    { nodeId: "root-a", baseStrength: 0.6, parentNodeId: null },
    { nodeId: "root-b", baseStrength: 0.5, parentNodeId: null },
    { nodeId: "supporter", baseStrength: 0.7, parentNodeId: "root-a" },
    { nodeId: "unassessed", baseStrength: 0.4, parentNodeId: "root-b" }
  ],
  arrows: [arrow("support-a", "supporter", "root-a", "support", 0.8), arrow("attack-a", "unassessed", "root-a", "attack", null)],
  arrowOrder: ["support-a", "attack-a"],
  operatorResolutions: [{ parentNodeId: "root-a", operator: "accumulate", suppliedBy: "deployment" }],
  clusterRecords: []
};

function deriveVerdictLabelSource(source: string): string {
  const start = source.indexOf("export function deriveVerdictLabel(");
  const end = source.indexOf("\n}\n", start);
  if (start < 0 || end < 0) throw new Error("test: deriveVerdictLabel not found in packages/serve/src/index.ts");
  return source.slice(start, end + 2);
}

async function recordedValues(): Promise<Record<string, unknown>> {
  const contractRows = Object.fromEntries((await buildDevelopmentRunnerRegisterRows())
    .filter((row) => row.rowKey.endsWith("ContractHash") && !NOT_ENGINE1_SEALS.has(row.rowKey))
    .map((row) => [row.rowKey, row.value]));
  const serveSource = await readFile(new URL("../../packages/serve/src/index.ts", import.meta.url), "utf8");
  return {
    contractRows,
    fingerprints: {
      judge: sha256(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT),
      composer: sha256(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT),
      map: sha256(mapPromptFingerprintText()),
      conformance: sha256(EVALUATOR_CONTRACTS_FINGERPRINT_TEXT)
    },
    deriveVerdictLabelSource: deriveVerdictLabelSource(serveSource),
    todayReceipt: JSON.stringify(todayReceipt),
    shapedReceipt: JSON.stringify(shapedReceipt),
    propagation: evaluate(PROPAGATION_SNAPSHOT).strengths.map((record) => ({
      nodeId: record.nodeId, strength: record.strength, supportedBy: record.supportedBy, attackedBy: record.attackedBy
    }))
  };
}

const CONTROLS = { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 } as const;
const measured = (value: number) => ({ kind: "MEASURED", value }) as const;
const ABSENT_MARGIN = { kind: "ABSENT", reason: "SINGLE_SERVABLE_ROOT" } as const;
const ABSENT_SPREAD = { kind: "ABSENT", reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" } as const;

describe("engine 1 is unchanged by R2 (spec §15)", () => {
  it("keeps the composition row: fidelity × 1, no caps, every claim type, byte for byte", async () => {
    const composition = {
      branch: "EVIDENCE_AWARE", clarityDecayPerAmbiguity: 0.1,
      terms: [{ metric: "steelman_fidelity", coefficient: 1 }], caps: [],
      uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }]
    };
    const row = (await buildDevelopmentRunnerRegisterRows()).find((entry) => entry.rowKey === "claimTypeCompositionMap");
    expect(JSON.stringify(row?.value)).toBe(JSON.stringify({
      kind: "CLAIM_TYPE_COMPOSITION_MAP",
      entries: Object.fromEntries(CLAIM_TYPES.map((claimType) => [claimType, composition]))
    }));
  });

  it("keeps the selection row: the highest weighted voice", async () => {
    const row = (await buildDevelopmentRunnerRegisterRows()).find((entry) => entry.rowKey === "judgementSelectionPolicy");
    expect(JSON.stringify(row?.value)).toBe(JSON.stringify({
      kind: "MAXIMIZE_WEIGHTED_TAU", earnedWeight: 1,
      judgeWeightVersion: "development:single-judge:v1", reducerVersion: "development:weighted-tau:v1"
    }));
  });

  it("keeps the five label rows and their rulings", () => {
    const rows = buildAlgorithmRegisterRows({
      deploymentSourceRef: "test-layer:r2", synthesizerRoleRef: "provider:a", evaluatorRoleRef: "provider:b",
      providerFamilies: [{ familyRef: "family:a", providerRefs: ["provider:a"] }, { familyRef: "family:b", providerRefs: ["provider:b"] }]
    });
    const label = Object.fromEntries(rows
      .filter((row) => (VERDICT_LABEL_ROW_KEYS as readonly string[]).includes(row.rowKey))
      .map((row) => [row.rowKey, { value: row.value, sourceRef: row.sourceRef }]));
    const goal = `test-layer:r2+${T16_GOAL_RULING_REF}`;
    expect(label).toEqual({
      verdictMarginGamma: { value: { kind: "VERDICT_MARGIN_GAMMA", gamma: 0.05 }, sourceRef: goal },
      verdictHighCut: { value: { kind: "VERDICT_HIGH_CUT", highCut: 0.7 }, sourceRef: goal },
      verdictLowCut: { value: { kind: "VERDICT_LOW_CUT", lowCut: 0.35 }, sourceRef: goal },
      disagreementThreshold: {
        value: { kind: "DISAGREEMENT_THRESHOLD", threshold: 0.25, scaleRowKey: "dispersionScale" },
        sourceRef: `test-layer:r2+${T16_JUDGE_RULING_REF}`
      },
      disagreementQuantity: {
        value: { kind: "DISAGREEMENT_QUANTITY", quantityRef: "reducedJudgement.dispersion", scope: "WINNING_ROOT",
          scaleRowKey: "dispersionScale", absentReason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" },
        sourceRef: goal
      }
    });
  });

  it.each([
    [1, ABSENT_MARGIN, measured(0), "CONTESTED", 0, "BASIS_INCOMPLETE", ["MARGIN"]],
    [1, measured(0.9), ABSENT_SPREAD, "CONTESTED", 0, "BASIS_INCOMPLETE", ["DISAGREEMENT"]],
    [0.01, ABSENT_MARGIN, ABSENT_SPREAD, "CONTESTED", 0, "BASIS_INCOMPLETE", ["MARGIN", "DISAGREEMENT"]],
    [0.34, measured(0.3), measured(0), "UNSUPPORTED", 1, "BELOW_LOW_CUT", []],
    [0.35, measured(0.3), measured(0), "CONTESTED", 4, "MID_BAND", []],
    [0.95, measured(0.05), measured(0), "CONTESTED", 2, "MARGIN_WITHIN_GAMMA", []],
    [0.95, measured(0.4), measured(0.25), "CONTESTED", 2, "DISAGREEMENT_AT_THRESHOLD", []],
    [0.95, measured(0.01), measured(0.9), "CONTESTED", 2, "MARGIN_WITHIN_GAMMA", []],
    [0.7, measured(0.4), measured(0.1), "SUPPORTED", 3, "AT_OR_ABOVE_HIGH_CUT", []],
    [0.5, measured(0.4), measured(0.1), "CONTESTED", 4, "MID_BAND", []]
  ] as const)("keeps today's ladder: winner %s gives %s", (winner, margin, disagreement, label, rung, trigger, basisAbsence) => {
    expect(deriveVerdictLabel({ winner, margin, disagreement, controls: CONTROLS })).toEqual({
      label, rung, trigger, basisAbsence: [...basisAbsence], marks: rung === 0 ? ["LABEL-BASIS-INCOMPLETE"] : []
    });
  });

  it("keeps the ladder's refusal of a low cut that is not below the high cut", () => {
    expect(() => deriveVerdictLabel({ winner: 0.5, margin: measured(0.4), disagreement: measured(0.1), controls: { ...CONTROLS, lowCut: 0.7 } }))
      .toThrowError(expect.objectContaining({ code: "VERDICT_LABEL_CONTROLS_INVALID" }));
  });

  it("still hides a cannot-assess point that nothing judged feeds, and its root (projectJudgedStanding)", () => {
    const projected = projectJudgedStanding(STANDING_SNAPSHOT, ["supporter"]);
    expect(projected.hiddenNodeIds).toEqual(["root-b", "unassessed"]);
    expect(projected.derivedStandingNodeIds).toEqual(["root-a"]);
    expect(projected.judgedBasisCounts).toEqual({ "root-a": 1 });
    expect(projected.snapshot.nodes.map((node) => node.nodeId)).toEqual(["root-a", "supporter"]);
    expect(projected.snapshot.arrows.map((entry) => entry.arrowId)).toEqual(["support-a"]);
  });

  it("parses and prices a receipt without the engine member as today", () => {
    for (const receipt of [todayReceipt, shapedReceipt]) {
      expect(Object.keys(receipt)).not.toContain("engine");
      const parsed = parseCostEnvelopeBasis(JSON.parse(JSON.stringify(receipt)));
      expect(parsed.engine).toBeUndefined();
      expect(engineOfRun(parsed)).toBe(ENGINE_ONE);
    }
    expect(expectedCallsByRoleFromBasis(todayReceipt))
      .toEqual({ POSITION: 3, SUPPORT_ATTACK: 18, CROSS_EXCHANGE: 6, JUDGE: 54, REVIEWER: 27, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
    expect(expectedCallsByRoleFromBasis(shapedReceipt))
      .toEqual({ POSITION: 13, SUPPORT_ATTACK: 15, CROSS_EXCHANGE: 3, JUDGE: 42, REVIEWER: 21, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
  });

  it("keeps the engine-1 seals, fingerprints, deriveVerdictLabel's source, today's receipts and a propagation outcome as recorded at A1", async () => {
    const now = JSON.parse(JSON.stringify(await recordedValues())) as Record<string, unknown>;
    // Not vacuous: the four engine-1 prompt seals are among the recorded rows.
    expect(Object.keys(now.contractRows as object)).toEqual(expect.arrayContaining(
      ["judgeContractHash", "composerContractHash", "conformanceContractHash", "mapContractHash"]));
    if (RECORD) {
      await mkdir(new URL("../fixtures/r2/", import.meta.url), { recursive: true });
      await writeFile(FIXTURE, `${JSON.stringify(now, null, 2)}\n`, "utf8");
    }
    expect(now).toEqual(JSON.parse(await readFile(FIXTURE, "utf8")) as unknown);
  });
});
