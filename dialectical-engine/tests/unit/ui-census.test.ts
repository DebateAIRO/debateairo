import { describe, expect, it } from "vitest";
import type { Answer } from "@debateai/contract";
import { projectCanvasCensus } from "../../apps/ui/lib/v3/census.js";

function answerWithNode(node: Partial<Answer["nodes"][number]>): Answer {
  return {
    nodes: [{
      node_id: "node:root",
      review: null,
      final_strength: {
        value: 0.9,
        kind: "propagated-probability",
        source: "test",
        producer: "test",
        provenance_ref: "test",
        replay_handle: "test"
      },
      ...node
    }],
    condition_mark_records: []
  } as unknown as Answer;
}

describe("V3 canvas census", () => {
  it("counts a reduced-and-propagated node as judged even without a cross-maker review", () => {
    expect(projectCanvasCensus(answerWithNode({}))).toEqual({
      claims: 1,
      judged: 1,
      derivedStanding: 0,
      setAside: 0
    });
  });

  it("keeps an explicitly derived-standing node out of the judged count", () => {
    const answer = answerWithNode({});
    expect(projectCanvasCensus({
      ...answer,
      condition_mark_records: [{
        mark: "DERIVED-STANDING-UNREVIEWED",
        scope: "node",
        subject_ref: "node:root",
        reason: "test",
        lift_path: null,
        served_root_rule: null,
        affected_node_ids: ["node:root"],
        call_site_key: null,
        planned_leg_count: null,
        terminal_transport_outcome: null,
        hidden_strength: null,
        hidden_score_threshold: null,
        hidden_score_threshold_source_ref: null,
        excluded_from_served_number: false,
        judged_basis_count: 1
      }]
    })).toMatchObject({ judged: 0, derivedStanding: 1, setAside: 0 });
  });
});
