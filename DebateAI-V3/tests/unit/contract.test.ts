import { describe, expect, it } from "vitest";
import {
  AskRequestSchema,
  AskAcceptedSchema,
  SessionSchema,
  NodeSchema,
  AnswerSchema,
  InspectionSchema,
  NumberSlotSchema,
  RunProjectionSchema,
  TierSourceSchema,
  contractInventory
} from "@debateai/contract";

describe("P3 / AC-59 / AC-60 — one declared wire contract", () => {
  it("declares POST /v1/asks and the Answer/Node reads before the facade", () => {
    expect(contractInventory.routes).toEqual(expect.arrayContaining([
      "POST /v1/asks",
      "GET /v1/session",
      "GET /v1/deployment",
      "GET /v1/answers/{id}",
      "GET /v1/answers/{id}/inspection",
      "GET /v1/answers/{id}/nodes/{nodeId}",
      "GET /v1/runs/{id}/events"
      ,"GET /v1/runs/{id}"
    ]));
    expect(AskRequestSchema.parse({
      question_line: "What follows from this evidence?",
      risk_tier: "casual",
      tier_source: "ASKER",
      tier_provenance_ref: "asker-declaration:test",
      composition_budget_tier: "low",
      depth_params: { depth: 1 },
      agent_count: 1,
      decision_owner: "asker:test",
      action_owner: "asker:test",
      decision_scope: "test-layer scope",
      caller_scope: "ASKER",
      as_of: "2026-08-07T00:00:00.000Z",
      steering_presets: [],
      steering_annotations: []
    }).question_line).toContain("evidence");
    expect(AskRequestSchema.parse({
      question_line: "What follows from this evidence?",
      risk_tier: "standard",
      tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "machine:deployment-floor",
      composition_budget_tier: "low",
      depth_params: { depth: 1 },
      agent_count: 2,
      decision_owner: "asker:test",
      action_owner: "asker:test",
      decision_scope: "test-layer scope",
      caller_scope: "ASKER",
      as_of: "2026-08-07T00:00:00.000Z",
      steering_presets: [],
      steering_annotations: []
    }).tier_source).toBe("MACHINE_DEFAULT");
    expect(TierSourceSchema.options).toEqual(["ASKER", "MACHINE_DEFAULT", "DEPLOYMENT_POLICY"]);
    expect(() => AskRequestSchema.parse({ question_line: "missing ruled fields" })).toThrow();
  });

  it("generates runtime-validatable accepted/session/answer/node resources", () => {
    expect(AskAcceptedSchema.parse({ run_ref: "run:test", status: "QUEUED" }).status).toBe("QUEUED");
    expect(SessionSchema.parse({
      asker_id: "asker:test",
      session_id: "session:test",
      caller_scope: "ASKER",
      ownership_provenance: "user_dev_token",
      provisional_identity_model: true
    }).ownership_provenance).toBe("user_dev_token");
    expect(NodeSchema).toBeDefined();
    expect(AnswerSchema).toBeDefined();
    expect(InspectionSchema).toBeDefined();
  });

  it("keeps loading and loud-stop run states typed on the wire", () => {
    expect(RunProjectionSchema.parse({
      run_ref: "run:queued",
      question_line: "Messi or Ronaldo?",
      state: "QUEUED",
      terminal_reason: null,
      hold_until: null
    }).state).toBe("QUEUED");
    expect(RunProjectionSchema.parse({
      run_ref: "run:settled",
      question_line: "Messi or Ronaldo?",
      state: "SETTLED",
      terminal_reason: null,
      hold_until: null
    }).state).toBe("SETTLED"); // MUT-BUG02-SETTLED-TYPE: remove SETTLED from the wire vocabulary -> RED.
    expect(RunProjectionSchema.parse({
      run_ref: "run:failed",
      question_line: "Messi or Ronaldo?",
      state: "FAILED",
      terminal_reason: "TOTAL_REVIEW_COVERAGE_UNSATISFIED",
      hold_until: null
    }).terminal_reason).toBe("TOTAL_REVIEW_COVERAGE_UNSATISFIED");
    expect(() => RunProjectionSchema.parse({
      run_ref: "run:failed",
      question_line: "Messi or Ronaldo?",
      state: "FAILED",
      terminal_reason: null,
      hold_until: null
    })).toThrow();
    expect(RunProjectionSchema.parse({
      run_ref: "run:holding",
      question_line: "Messi or Ronaldo?",
      state: "HOLDING",
      terminal_reason: null,
      hold_until: "2026-08-14T12:10:00.000Z"
    }).state).toBe("HOLDING");
  });

  it("admits recorded per-node maker lineage and requires typed null when it is absent", () => {
    const node = {
      node_id: "node:test-lineage",
      claim: "A test-layer claim",
      way_of_knowing: "REASONING",
      base_score: {
        value: 0.7, kind: "test-layer", source: "test-layer", producer: "test-layer",
        provenance_ref: "number:test-base", replay_handle: "replay:test-base"
      },
      final_strength: {
        value: 0.6, kind: "test-layer", source: "test-layer", producer: "test-layer",
        provenance_ref: "number:test-final", replay_handle: "replay:test-final"
      },
      provenance_ref: "artifact:test-lineage",
      maker_lineage: {
        maker: "maker:test-layer",
        model_id: "model:test-layer",
        transport: "provider-kind:test-layer",
        provider_ref: "provider:test-layer"
      },
      review: null,
      locator: null,
      stranger_restatement: { check_status: "PASS" },
      defeater_refs: [],
      defeater_exhaustion_marked: false,
      disagreement: null,
      condition_marks: [],
      abstention: null,
      staleness_state: "FRESH",
      relevant_as_of: "2026-08-12T00:00:00.000Z"
    };

    expect(NodeSchema.parse(node).maker_lineage).toEqual(node.maker_lineage);
    expect(NodeSchema.parse({ ...node, maker_lineage: null }).maker_lineage).toBeNull();
    const { maker_lineage: _omitted, ...withoutTypedAbsence } = node;
    expect(() => NodeSchema.parse(withoutTypedAbsence)).toThrow();
    expect(() => NodeSchema.parse({ ...node, maker_lineage: { ...node.maker_lineage, maker: "" } })).toThrow();
    expect(() => NodeSchema.parse({
      ...node,
      maker_lineage: { ...node.maker_lineage, provider: "misleading-legacy-name" }
    })).toThrow();
    expect(NodeSchema.parse({
      ...node,
      review: {
        outcome: "agree",
        reasons: ["The reasoning supports the conclusion."],
        provenance_ref: "artifact:review",
        reviewer_lineage: {
          maker: "maker:reviewer",
          model_id: "model:reviewer",
          transport: "provider-kind:test-layer",
          provider_ref: "provider:reviewer"
        }
      }
    }).review).toMatchObject({ outcome: "agree" });
    expect(() => NodeSchema.parse({ ...node, review: { outcome: "concurs" } })).toThrow();
    const { review: _review, ...withoutReviewAbsence } = node;
    expect(() => NodeSchema.parse(withoutReviewAbsence)).toThrow();
  });

  it("FX-SRV-14/15 makes typed segments and honesty projections non-optional", () => {
    const answer = {
      answer_id: "answer:test",
      answer_version: 1,
      run_ref: "run:test",
      question_line: "What follows?",
      terminal: "SERVED",
      verdict_state: "SUPPORTED",
      verdict_unavailable: null,
      confidence_band: "TEST_LAYER_BAND",
      band_ceiling: {
        label: "TEST_LAYER_CEILING",
        basis: { LOOKED_UP: 1, RAN: 0, REASONING: 0 },
        register_row_key: "wayOfKnowingCeiling",
        register_version: 1,
        source_ref: "test-layer:DR-086",
        lift_path: "test-layer:improve-basis"
      },
      answer_form: { kind: "VERDICT", text: "A test answer." },
      serve_state: "COMPOSED",
      composed_text: [{
        segment_id: "segment:test",
        text: "A test answer.",
        load_bearing: true,
        served_number_refs: ["number:test"]
      }],
      number_slots: [{
        status: "PRESENT",
        number: {
          value: 0.7,
          kind: "test-layer",
          source: "test-layer",
          producer: "test-layer",
          provenance_ref: "propagation:test-layer",
          replay_handle: "replay:test"
        }
      }],
      abstention: null,
      shadow_suppressions: [],
      nodes: [],
      edges: [],
      badges: [],
      residual_objections: [],
      value_hinges: [],
      condition_marks: [],
      condition_mark_records: [],
      reversal_point: "A contrary test-layer observation.",
      builds_on_previous: { value: false, answer_ref: null },
      memory_disclosure: null,
      risk_tier: "standard",
      tier_source: "ASKER",
      tier_provenance_ref: "asker:test-layer",
      cost_envelope: {
        basis: { source_ref: "test-layer:run-cost-envelope" },
        state: "WITHIN",
        consumed_model_attempts: 0,
        protected_core: "NEVER_SKIPPABLE"
      },
      composition_budget_tier: "low",
      conformance_outcome: "PASS",
      ledger_digest_handle: "ledger:test",
      inspection_handle: "inspection:test",
      as_of: "2026-08-08T00:00:00.000Z",
      staleness_state: "FRESH",
      relevant_as_of: "2026-08-08T00:00:00.000Z"
    };
    expect(AnswerSchema.parse(answer).composed_text[0]?.segment_id).toBe("segment:test");
    expect(() => AnswerSchema.parse({ ...answer, band_ceiling: null })).toThrow();
    expect(AnswerSchema.parse({
      ...answer,
      terminal: "COMPONENTS_ONLY",
      verdict_state: null,
      verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_DEFECT" },
      confidence_band: null,
      band_ceiling: null,
      answer_form: null,
      serve_state: "COMPONENTS_ONLY",
      composed_text: []
    }).verdict_unavailable).toEqual({ reason_ref: "serve-gate:COMPONENTS_ONLY_DEFECT" });
    expect(() => AnswerSchema.parse({ ...answer, serve_state: "BLOCKED" })).toThrow();
  });

  it("FX-SRV-06 admits exactly PRESENT, EVICTED, and strict-AND WITHHELD slots", () => {
    const number = {
      value: 0.7,
      kind: "test-layer",
      source: "test-layer",
      producer: "test-layer",
      provenance_ref: "propagation:test-layer",
      replay_handle: "replay:test"
    };
    expect(NumberSlotSchema.parse({ status: "PRESENT", number }).status).toBe("PRESENT");
    expect(NumberSlotSchema.parse({ status: "EVICTED", mark: "MISSING-NUMBER" }).status).toBe("EVICTED");
    expect(NumberSlotSchema.parse({
      status: "WITHHELD",
      reason: "STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED",
      components: [number]
    }).status).toBe("WITHHELD");
    expect(() => NumberSlotSchema.parse({ status: "ABSENT" })).toThrow();
    expect(() => NumberSlotSchema.parse({
      status: "WITHHELD", reason: "NO_OPERATOR_DECLARATION", components: []
    })).toThrow();
  });
});
