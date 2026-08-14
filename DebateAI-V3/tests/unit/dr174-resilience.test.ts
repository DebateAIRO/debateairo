import { describe, expect, it, vi } from "vitest";
import { evaluate, type EvaluationSnapshot } from "@debateai/propagation";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError
} from "@debateai/providers";
import {
  excludeHiddenSubtrees,
  remainingProviderAttempts,
  withCooldownRetry
} from "@debateai/runner";
import { assertRequiredConditionMarkRecords, type ConditionMarkRecord } from "@debateai/serve";
import { CONDITION_MARKS } from "@debateai/kernel";
import { isLowStrengthNode } from "../../apps/v2-ui/lib/debateTreeUtils.js";
import {
  debateDetailFromAnswer,
  hiddenNodeScoreThresholdFromDeployment
} from "../../apps/v2-ui/lib/v3/adapter.js";

const policy = Object.freeze({
  cooldownMs: 600_000,
  finalRetryAttempts: 1,
  maxCooldownHoldsPerRun: 2
});

const transportFailure = () => new ProviderCallFailedError(
  new Error("test-layer transport down"),
  3,
  "FAILED",
  "ledger:test:3"
);

function recorder(holds: number) {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    countCooldownHolds: vi.fn(async () => holds),
    record: vi.fn(async (event: Record<string, unknown>) => { events.push(event); }),
    wait: vi.fn(async () => undefined)
  };
}

describe("RESIL-01 / DR-174 lifecycle mutation ledger", () => {
  it("T10 computes exactly one wrapper attempt after three consumed attempts", () => {
    expect(remainingProviderAttempts(4, 3)).toBe(1);
    expect(remainingProviderAttempts(3, 3)).toBe(0);
  });

  it("T13 schema exhaustion never enters the cooldown path", async () => {
    const hold = recorder(0);
    const schemaFailure = new ProviderContentUnacceptedError(3, "SCHEMA_FAILED", "bad schema", "artifact:3", "ledger:3");
    await expect(withCooldownRetry({
      runId: "run:test",
      callSiteKey: "JUDGE:test",
      parentNodeId: "node:parent",
      plannedLegCount: 1,
      baseMaxAttempts: 3,
      policy,
      hold,
      attempt: async () => { throw schemaFailure; }
    })).rejects.toBe(schemaFailure);
    expect(hold.countCooldownHolds).not.toHaveBeenCalled();
    expect(hold.wait).not.toHaveBeenCalled();
  });

  it("T25/T26 recovers the per-run cap from recorded holds and the third exhaustion neither waits nor retries", async () => {
    const hold = recorder(2);
    const attempt = vi.fn(async () => { throw transportFailure(); });
    await expect(withCooldownRetry({
      runId: "run:test",
      callSiteKey: "JUDGE:third-site",
      parentNodeId: "node:parent",
      plannedLegCount: 3,
      baseMaxAttempts: 3,
      policy,
      hold,
      attempt
    })).resolves.toMatchObject({ kind: "HALTED", record: { callSiteKey: "JUDGE:third-site" } });
    expect(hold.countCooldownHolds).toHaveBeenCalledWith("run:test");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(hold.wait).not.toHaveBeenCalled();
  });

  it("T25 holds 1 and 2 record, wait, and issue exactly one final same-key retry", async () => {
    const hold = recorder(1);
    const attempt = vi.fn()
      .mockRejectedValueOnce(transportFailure())
      .mockResolvedValueOnce("authored");
    await expect(withCooldownRetry({
      runId: "run:test",
      callSiteKey: "JUDGE:same-key",
      parentNodeId: "node:parent",
      plannedLegCount: 1,
      baseMaxAttempts: 3,
      policy,
      hold,
      attempt
    })).resolves.toEqual({ kind: "AUTHORED", value: "authored" });
    expect(attempt.mock.calls).toEqual([[3], [4]]);
    expect(hold.wait).toHaveBeenCalledOnce();
    expect(hold.wait).toHaveBeenCalledWith(600_000);
    expect(hold.events.map((event) => event.state)).toEqual(["COOLDOWN_HOLD", "COOLDOWN_RETRY"]);
    expect(hold.events.every((event) => event.callSiteKey === "JUDGE:same-key")).toBe(true);
  });
});

const fullSnapshot: EvaluationSnapshot = Object.freeze({
  nodes: Object.freeze([
    { nodeId: "root", baseStrength: 0.5, parentNodeId: null },
    { nodeId: "hidden", baseStrength: 0.9, parentNodeId: "root" },
    { nodeId: "hidden-child", baseStrength: 0.8, parentNodeId: "hidden" },
    { nodeId: "sibling", baseStrength: 0.4, parentNodeId: "root" }
  ]),
  arrows: Object.freeze([
    { arrowId: "a:hidden", sourceNodeId: "hidden", targetKind: "NODE", targetNodeId: "root", targetEdgeId: null, polarity: "attack", kind: "rebutting", strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "EVIDENCE_VERIFIER" },
    { arrowId: "a:hidden-child", sourceNodeId: "hidden-child", targetKind: "NODE", targetNodeId: "hidden", targetEdgeId: null, polarity: "support", kind: null, strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "EVIDENCE_VERIFIER" },
    { arrowId: "a:sibling", sourceNodeId: "sibling", targetKind: "NODE", targetNodeId: "root", targetEdgeId: null, polarity: "support", kind: null, strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "EVIDENCE_VERIFIER" }
  ]),
  arrowOrder: Object.freeze(["a:hidden-child", "a:hidden", "a:sibling"]),
  operatorResolutions: Object.freeze([{ parentNodeId: "root", operator: "accumulate", suppliedBy: "deployment" }]),
  clusterRecords: Object.freeze([])
});

describe("RESIL-01 / DR-174-A hidden-frame mutation ledger", () => {
  it("T27/T28 excludes a class-H whole subtree from scoring without deleting or re-parenting it", () => {
    const judged = excludeHiddenSubtrees(fullSnapshot, ["hidden"]);
    expect(judged.nodes.map((node) => node.nodeId)).toEqual(["root", "sibling"]);
    expect(judged.arrows.map((arrow) => arrow.arrowId)).toEqual(["a:sibling"]);
    expect(judged.arrowOrder).toEqual(["a:sibling"]);
    expect(judged.nodes.find((node) => node.nodeId === "hidden-child")?.parentNodeId).not.toBe("root");
    expect(fullSnapshot.nodes.map((node) => node.nodeId)).toContain("hidden");
    const outcome = evaluate(judged);
    expect(outcome.strengths.map((row) => row.nodeId)).toEqual(expect.arrayContaining(["root", "sibling"]));
    expect(outcome.strengths.map((row) => row.nodeId)).not.toContain("hidden");
    expect(outcome.arrowOrder).not.toContain("a:hidden");
    expect(outcome.graphFingerprintMaterial).not.toContain("hidden-child");
  });

  it("T29 maps class H onto the existing set-aside affordance with disclosed-as-unjudged copy", () => {
    const detail = debateDetailFromAnswer({
      answer_id: "answer:test", answer_version: 1, run_ref: "run:test", question_line: "Question?",
      terminal: "SERVED", verdict_state: "SUPPORTED", verdict_unavailable: null, confidence_band: "FULL", band_ceiling: null,
      answer_form: {}, serve_state: "COMPOSED", composed_text: [], number_slots: [], abstention: null,
      shadow_suppressions: [], badges: [], residual_objections: [], value_hinges: [],
      condition_marks: ["HIDDEN-UNJUDGEABLE"], reversal_point: "test", builds_on_previous: { value: false, answer_ref: null },
      memory_disclosure: null, risk_tier: "standard", tier_source: "ASKER", tier_provenance_ref: "test",
      cost_envelope: { basis: {}, state: "WITHIN", consumed_model_attempts: 1, protected_core: "NEVER_SKIPPABLE" },
      composition_budget_tier: "low", conformance_outcome: "PASS", ledger_digest_handle: "ledger:test", inspection_handle: "inspection:test",
      as_of: "2026-08-14T00:00:00.000Z", staleness_state: "FRESH", relevant_as_of: "2026-08-14T00:00:00.000Z",
      edges: [],
      nodes: [{
        node_id: "node:hidden", claim: "Unjudged material", way_of_knowing: "REASONING",
        base_score: { value: 0.8, kind: "tau", source: "test", producer: "test", provenance_ref: "p", replay_handle: "r" },
        final_strength: null, provenance_ref: "artifact:test", maker_lineage: null, review: null, locator: null,
        stranger_restatement: { check_status: "PASS" }, defeater_refs: [], defeater_exhaustion_marked: false,
        disagreement: null, condition_marks: ["HIDDEN-UNJUDGEABLE"], abstention: null, staleness_state: "FRESH",
        relevant_as_of: "2026-08-14T00:00:00.000Z"
      }],
      condition_mark_records: [{
        mark: "HIDDEN-UNJUDGEABLE", scope: "node", subject_ref: "node:hidden",
        reason: "Cross-maker review transport exhausted", lift_path: null, served_root_rule: null,
        call_site_key: "JUDGE:review:node:hidden", planned_leg_count: null,
        terminal_transport_outcome: "FAILED", hidden_strength: null, hidden_score_threshold: null,
        hidden_score_threshold_source_ref: null, excluded_from_served_number: true,
        affected_node_ids: ["node:hidden"]
      }]
    } as never);
    const hidden = detail.tree.children[0]!;
    expect(hidden.path_status).toBe("abandoned");
    expect(hidden.stopping_reason_human).toContain("Disclosed as unjudged");
    expect(hidden.stopping_reason_human).not.toContain("served opinion");
  });

  it("T30/T31 keeps missing score distinct from low and resolves 0.35 with register provenance", () => {
    expect(isLowStrengthNode(null, 0.35)).toBe(false);
    expect(isLowStrengthNode(undefined, 0.35)).toBe(false);
    expect(isLowStrengthNode(0.35, 0.35)).toBe(true);
    expect(isLowStrengthNode.length).toBe(2);
    expect(hiddenNodeScoreThresholdFromDeployment({
      register: { register_version: 1, rows: [{ row_key: "hiddenNodeScoreThreshold", value: 0.35, source_ref: "acceptance:DR-176:V-approved" }] },
      scorecards: [], model_ledger: []
    })).toEqual({ value: 0.35, sourceRef: "acceptance:DR-176:V-approved", registerVersion: 1 });
  });

  it("T32 mints exactly H/L/N and enforces typed required records without pretending class N is revealable", () => {
    expect(CONDITION_MARKS).toHaveLength(27);
    expect(CONDITION_MARKS).toEqual(expect.arrayContaining([
      "HIDDEN-UNJUDGEABLE", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"
    ]));
    const records = [
      { mark: "HIDDEN-UNJUDGEABLE", affectedNodeIds: ["node:h"], excludedFromServedNumber: true },
      { mark: "HIDDEN-LOW-SCORE", affectedNodeIds: ["node:l"], excludedFromServedNumber: true },
      { mark: "UNAUTHORED-BRANCH-HALTED", affectedNodeIds: ["node:surviving-parent"], excludedFromServedNumber: null }
    ].map((row) => ({
      scope: "node", subjectRef: row.affectedNodeIds[0]!, reason: "test-layer",
      liftPath: null, servedRootRule: null, callSiteKey: null, plannedLegCount: null,
      terminalTransportOutcome: null, hiddenStrength: null, hiddenScoreThreshold: null,
      hiddenScoreThresholdSourceRef: null, ...row
    })) as ConditionMarkRecord[];
    expect(() => assertRequiredConditionMarkRecords(CONDITION_MARKS.slice(-3), records)).not.toThrow();
    expect(() => assertRequiredConditionMarkRecords(["HIDDEN-UNJUDGEABLE"], [])).toThrowError(
      expect.objectContaining({ code: "CONDITION_MARK_RECORD_REQUIRED" })
    );
  });

  it("T33 computes the served root from the judged graph, not the merely-labelled full graph", () => {
    const judged = evaluate(excludeHiddenSubtrees(fullSnapshot, ["hidden"]));
    const expected = evaluate({
      ...fullSnapshot,
      nodes: fullSnapshot.nodes.filter((node) => ["root", "sibling"].includes(node.nodeId)),
      arrows: fullSnapshot.arrows.filter((arrow) => arrow.arrowId === "a:sibling"),
      arrowOrder: ["a:sibling"]
    });
    expect(judged.strengths.find((row) => row.nodeId === "root")?.strength)
      .toBe(expected.strengths.find((row) => row.nodeId === "root")?.strength);
    expect(judged.strengths.map((row) => row.nodeId)).not.toContain("hidden");
  });
});
