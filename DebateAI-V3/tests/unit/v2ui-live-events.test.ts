import { describe, expect, it } from "vitest";
import { RunEventSchema, type RunEvent } from "@debateai/contract";
import {
  applyRunEvent,
  createLiveRunState,
  liveTreeFromState,
  refreshTriggeredBy
} from "../../apps/v2-ui/lib/v3/liveEvents.js";

let sequence = 0;
function event(eventType: RunEvent["event_type"], payload: Record<string, unknown> = {}, subject?: string): RunEvent {
  sequence += 1;
  return RunEventSchema.parse({
    event_id: `event:${sequence}`,
    event_type: eventType,
    run_ref: "run:live",
    ...(subject === undefined ? {} : { subject_ref: subject }),
    at_sequence: sequence,
    payload
  });
}

describe("v2-ui live event translation (V3 stream -> V2 live vocabulary)", () => {
  it("tracks run and serve phases", () => {
    let state = createLiveRunState();
    state = applyRunEvent(state, event("run.accepted"));
    state = applyRunEvent(state, event("run.running"));
    state = applyRunEvent(state, event("serve.composition_started"));
    state = applyRunEvent(state, event("serve.composition_delta", { delta: "Served " }));
    state = applyRunEvent(state, event("serve.composition_delta", { delta: "prose." }));
    expect(state.runPhase).toBe("running");
    expect(state.servePhase).toBe("composing");
    expect(state.compositionText).toBe("Served prose.");
  });

  it("preserves the typed reason when a run terminates in failure", () => {
    const state = applyRunEvent(createLiveRunState(), event("run.terminal", {
      state: "FAILED",
      reason: "ACCEPTANCE_EXECUTION_FAILED"
    }));
    expect(state.runPhase).toBe("terminal");
    expect(state.terminalFailure).toBe("ACCEPTANCE_EXECUTION_FAILED");
  });

  it("materializes a live V2 tree from spawned nodes, relations, and text deltas only", () => {
    let state = createLiveRunState();
    state = applyRunEvent(state, event("node.spawned", {}, "node:position"));
    state = applyRunEvent(state, event("node.generating", {}, "node:position"));
    state = applyRunEvent(state, event("node.text_delta", { delta: "The position " }, "node:position"));
    state = applyRunEvent(state, event("node.text_delta", { delta: "claim." }, "node:position"));
    state = applyRunEvent(state, event("node.spawned", { parent_ref: "node:position", relation: "attack" }, "node:defeater"));
    state = applyRunEvent(state, event("node.complete", {}, "node:position"));

    const tree = liveTreeFromState(state, "run:live", "");
    expect(tree).not.toBeNull();
    expect(tree!.node_type).toBe("ROOT_CLAIM");
    expect(tree!.claim).toBe("");
    expect(tree!.children).toHaveLength(1);
    const position = tree!.children[0]!;
    expect(position.id).toBe("node:position");
    expect(position.status).toBe("complete");
    expect(position.claim).toBe("The position claim.");
    expect(position.active_generation?.argument).toBe("The position claim.");
    const defeater = position.children[0]!;
    expect(defeater.node_type).toBe("CON");
    expect(defeater.status).toBe("pending");
    expect(defeater.claim).toBe("");
    expect(defeater.active_generation).toBeNull();
  });

  it("collects honesty, ledger, cycle, and investigation-gap events without dropping them", () => {
    let state = createLiveRunState();
    state = applyRunEvent(state, event("graph.cycle_refused", { code: "CIRCULAR_DEPENDENCY_FOUND" }));
    state = applyRunEvent(state, event("ledger.attempt", {}, "node:position"));
    state = applyRunEvent(state, event("honesty.abstention_typed", {}, "answer:live"));
    state = applyRunEvent(
      state,
      event("honesty.investigation_gap_opened", {
        gap_ref: "gap:1",
        gap: "Uncovered scope",
        verdict: "UNCOVERED-SCOPE",
        why: "The run never sampled the flank.",
        effort_grade: "medium",
        constructed_prompt: "Investigate the flank.",
        accepts_user_input: true,
        model_authored: true
      })
    );
    expect(state.cycleRefusals).toEqual(["CIRCULAR_DEPENDENCY_FOUND"]);
    expect(state.ledgerEvents).toEqual(["ledger.attempt"]);
    expect(state.honestyEvents).toEqual(["honesty.abstention_typed", "honesty.investigation_gap_opened"]);
    expect(state.investigationGaps).toHaveLength(1);
    expect(state.investigationGaps[0]!.gap_ref).toBe("gap:1");
  });

  it("names the events that re-read the settled projection", () => {
    expect(refreshTriggeredBy("run.terminal")).toBe(true);
    expect(refreshTriggeredBy("node.complete")).toBe(true);
    expect(refreshTriggeredBy("honesty.staleness_trigger_fired")).toBe(true);
    expect(refreshTriggeredBy("node.text_delta")).toBe(false);
    expect(refreshTriggeredBy("serve.composition_delta")).toBe(false);
  });
});
