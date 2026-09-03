import { AnswerSchema, type Answer, type NodeReview } from "@debateai/contract";

/**
 * UI-01 test fixture: a FAIR-01-shaped served answer — two nodes, one attack
 * edge (the defeater attacks the position). Test-layer data only (never
 * reachable from production configuration); AnswerSchema.parse guarantees the
 * fixture stays contract-valid as the contract evolves.
 */
export function buildFairShapedAnswer(overrides: Partial<Answer> = {}): Answer {
  const labeled = (value: number, source: string) => ({
    value,
    kind: "strength",
    source,
    producer: "judgement",
    provenance_ref: `prov:${source}`,
    replay_handle: `replay:${source}`
  });
  const review = (outcome: NodeReview["outcome"], reviewer: string) => ({
    outcome,
    reasons: [`${reviewer} recorded a cross-maker test-layer review.`],
    provenance_ref: `artifact:review:${reviewer}`,
    reviewer_lineage: {
      maker: reviewer,
      model_id: `model:${reviewer}`,
      transport: "openai-compatible-http",
      provider_ref: `provider:${reviewer}`
    }
  });
  return AnswerSchema.parse({
    answer_id: "answer:fair-test",
    answer_version: 1,
    run_ref: "run:fair-test",
    question_line: "Should the test question stand?",
    terminal: "SERVED",
    verdict_state: "CONTESTED",
    verdict_unavailable: null,
    confidence_band: null,
    band_ceiling: null,
    answer_form: null,
    serve_state: "COMPOSED",
    composed_text: [
      { segment_id: "seg:1", text: "The served answer prose.", load_bearing: true, served_number_refs: [] }
    ],
    number_slots: [],
    abstention: null,
    shadow_suppressions: [],
    nodes: [
      {
        node_id: "node:position",
        claim: "The position claim under test.",
        way_of_knowing: "REASONING",
        base_score: labeled(0.62, "judge:base:position"),
        final_strength: labeled(0.41, "propagation:final:position"),
        provenance_ref: "prov:node:position",
        maker_lineage: {
          maker: "OpenAI",
          model_id: "gpt-5",
          transport: "openai-compatible-http",
          provider_ref: "provider:openai"
        },
        review: review("agree", "Reviewer-B"),
        locator: null,
        stranger_restatement: { check_status: "PASS" },
        defeater_refs: ["node:defeater"],
        defeater_exhaustion_marked: false,
        disagreement: null,
        condition_marks: [],
        abstention: null,
        staleness_state: "FRESH",
        relevant_as_of: "2026-08-10T00:00:00.000Z"
      },
      {
        node_id: "node:defeater",
        claim: "The defeater claim attacking the position.",
        way_of_knowing: "REASONING",
        base_score: labeled(0.55, "judge:base:defeater"),
        final_strength: labeled(0.55, "propagation:final:defeater"),
        provenance_ref: "prov:node:defeater",
        maker_lineage: null,
        review: review("dispute", "Reviewer-A"),
        locator: null,
        stranger_restatement: { check_status: "PASS" },
        defeater_refs: [],
        defeater_exhaustion_marked: false,
        disagreement: null,
        condition_marks: ["SINGLE-LINEAGE"],
        abstention: null,
        staleness_state: "FRESH",
        relevant_as_of: "2026-08-10T00:00:00.000Z"
      }
    ],
    edges: [
      {
        edge_id: "edge:attack:1",
        from_node_ref: "node:defeater",
        target_kind: "NODE",
        target_ref: "node:position",
        relation: "attack",
        strength: { status: "PRESENT", number: labeled(0.55, "judgement:edge:attack") },
        provenance_ref: "prov:edge:attack:1",
        placeholder: false
      }
    ],
    badges: ["defeater-explored"],
    residual_objections: ["The defeater objection stands unresolved."],
    value_hinges: [],
    condition_marks: ["OWED-CHECK-UNEXECUTED", "UNRESOLVED-TYPE-FALLBACK"],
    condition_mark_records: [
      {
        mark: "OWED-CHECK-UNEXECUTED",
        scope: "answer",
        subject_ref: "battery:row:consistency",
        reason: "The owed consistency check has no recorded execution at terminal.",
        lift_path: "execute the owed check and re-serve",
        served_root_rule: null
      },
      {
        mark: "UNRESOLVED-TYPE-FALLBACK",
        scope: "answer",
        subject_ref: "question-type:resolver",
        reason: "Question type unresolved; fallback composition entry served.",
        lift_path: null,
        served_root_rule: null
      }
    ],
    reversal_point: "A verified counter-example to the position claim.",
    builds_on_previous: { value: false, answer_ref: null },
    memory_disclosure: null,
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:test",
    cost_envelope: {
      basis: { max_model_attempts: 42 },
      state: "WITHIN",
      consumed_model_attempts: 3,
      protected_core: "NEVER_SKIPPABLE"
    },
    composition_budget_tier: "low",
    conformance_outcome: "PASS",
    ledger_digest_handle: "ledger:digest:fair-test",
    inspection_handle: "inspect:fair-test",
    as_of: "2026-08-10T00:00:00.000Z",
    staleness_state: "FRESH",
    relevant_as_of: "2026-08-10T00:00:00.000Z",
    ...overrides
  });
}

/** UI-02c's named regression: two recorded houses reporting the same model id. */
export function buildSameModelDifferentMakerAnswer(): Answer {
  const base = buildFairShapedAnswer();
  return buildFairShapedAnswer({
    nodes: base.nodes.map((node, index) => ({
      ...node,
      maker_lineage: {
        maker: index === 0 ? "OpenAI" : "Anthropic",
        model_id: "test-layer/model",
        transport: "openai-compatible-http",
        provider_ref: index === 0 ? "provider:openai" : "provider:anthropic"
      }
    }))
  });
}
