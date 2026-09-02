import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicDebatePresentation } from "./publicDebatePresentation.ts";

const number = (value) => ({
  value,
  kind: "probability",
  source: "published score",
  producer: "judge panel",
  provenance_ref: "REDACTED_OWNER_ONLY",
  replay_handle: "REDACTED_OWNER_ONLY"
});

const lineage = (maker, modelId) => ({
  maker,
  model_id: modelId,
  transport: "responses",
  provider_ref: `provider:${maker.toLowerCase()}`
});

const node = ({ id, score, final = score, maker = "OpenAI", model = "gpt-5.6-sol", review = "agree" }) => ({
  node_id: id,
  claim: `Claim ${id}`,
  way_of_knowing: "REASONING",
  base_score: number(score),
  final_strength: final === null ? null : number(final),
  provenance_ref: "REDACTED_OWNER_ONLY",
  maker_lineage: lineage(maker, model),
  review: review === null ? null : {
    outcome: review,
    reasons: ["Recorded review"],
    provenance_ref: "REDACTED_OWNER_ONLY",
    reviewer_lineage: lineage("Anthropic", "claude-opus-5")
  },
  locator: null,
  stranger_restatement: { check_status: "PASS" },
  defeater_refs: [],
  defeater_exhaustion_marked: false,
  disagreement: null,
  condition_marks: [],
  abstention: null,
  staleness_state: "FRESH",
  relevant_as_of: "2026-09-01T12:00:00.000Z"
});

const edge = (id, from, relation) => ({
  edge_id: id,
  from_node_ref: from,
  target_kind: "NODE",
  target_ref: "root",
  relation,
  strength: { status: "UNKNOWN", reason: "NO_JUDGEMENT_OR_MAGNITUDE" },
  provenance_ref: "REDACTED_OWNER_ONLY",
  placeholder: false
});

function debate(nodes, edges) {
  return {
    public_ref: "11111111-1111-4111-8111-111111111111",
    author_pseudonym: "cobalt-falcon-0fa351",
    question: "Should compensation ignore location?",
    published_at: "2026-09-01T12:00:00.000Z",
    answer: {
      terminal: "SERVED",
      verdict: "CONTESTED",
      verdict_available: true,
      confidence_band: "moderate",
      summary_segments: [{ text: "The evidence remains balanced." }],
      badges: [],
      residual_objections: ["Local purchasing power remains unresolved."],
      reversal_point: "Reliable cross-market retention evidence.",
      as_of: "2026-09-01T12:00:00.000Z",
      nodes,
      edges,
      tree_included: true
    }
  };
}

test("selects the strongest recorded argument per side and derives honest metrics", () => {
  const view = buildPublicDebatePresentation(debate([
    node({ id: "pro-low", score: 0.4, final: 0.55 }),
    node({ id: "pro-high", score: 0.7, final: 0.9, maker: "Anthropic", model: "claude-opus-5" }),
    node({ id: "con-high", score: 0.6, final: 0.8, review: null })
  ], [
    edge("e1", "pro-low", "support"),
    edge("e2", "pro-high", "support"),
    edge("e3", "con-high", "attack")
  ]));

  assert.equal(view.strongestPro?.nodeId, "pro-high");
  assert.equal(view.strongestCon?.nodeId, "con-high");
  assert.deepEqual(view.models, ["gpt-5.6-sol", "claude-opus-5"]);
  assert.equal(view.metrics.reviewed, "2 / 3");
  assert.equal(view.metrics.judged, "3 / 3");
  assert.equal(view.metrics.convergence, "2 / 2 agreed");
  assert.equal(view.caveat, "Local purchasing power remains unresolved.");
  assert.equal(view.proPercent, 64);
});

test("keeps typed absence visible when a side, reviews, or final scores are missing", () => {
  const view = buildPublicDebatePresentation(debate([
    node({ id: "pro-only", score: 0.5, final: null, review: null })
  ], [edge("e1", "pro-only", "support")]));

  assert.equal(view.strongestPro?.nodeId, "pro-only");
  assert.equal(view.strongestCon, null);
  assert.equal(view.metrics.reviewed, "0 / 1");
  assert.equal(view.metrics.judged, "0 / 1");
  assert.equal(view.metrics.convergence, "Not measured");
  assert.equal(view.proPercent, 100);
});

test("uses a balanced unavailable meter when no node has a side relation", () => {
  const view = buildPublicDebatePresentation(debate([
    node({ id: "shared", score: 0.75 })
  ], [edge("e1", "shared", "shared-crux")]));

  assert.equal(view.strongestPro, null);
  assert.equal(view.strongestCon, null);
  assert.equal(view.proPercent, 50);
  assert.equal(view.supportMeasured, false);
});
