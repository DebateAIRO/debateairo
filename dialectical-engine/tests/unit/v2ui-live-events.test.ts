import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, createContractClient, RunEventSchema, type RunEvent } from "@debateai/contract";
import {
  applyRunEvent,
  createLiveEventGate,
  createLiveRunState,
  LIVE_STREAM_RECONNECT,
  liveReconnectDelay,
  liveTreeFromState,
  refreshTriggeredBy,
  startLiveEventStream
} from "../../apps/ui/lib/v3/liveEvents.js";
import { newerVersionReason } from "../../apps/ui/lib/v3/releaseWatch.js";

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

describe("pending progress copy (UI honesty: never claim 'connecting' while work is visible)", () => {
  it("says connecting only while the stream is down AND no evidence has arrived", async () => {
    const { pendingProgressCopy } = await import("../../apps/ui/lib/v3/liveEvents.js");
    expect(pendingProgressCopy(createLiveRunState(), { status: "connecting" }))
      .toBe("Connecting to the coordinator…");
  });

  it("reports phase and node counts once events flow", async () => {
    const { pendingProgressCopy } = await import("../../apps/ui/lib/v3/liveEvents.js");
    let state = createLiveRunState();
    state = applyRunEvent(state, event("run.accepted"));
    state = applyRunEvent(state, event("run.running"));
    state = applyRunEvent(state, event("node.spawned", { parent_ref: null }, "node:a"));
    state = applyRunEvent(state, event("node.generating", {}, "node:a"));
    state = applyRunEvent(state, event("node.spawned", { parent_ref: "node:a" }, "node:b"));
    state = applyRunEvent(state, event("node.being_judged", {}, "node:b"));
    const copy = pendingProgressCopy(state, { status: "live" });
    expect(copy).toContain("Debating");
    expect(copy).toContain("2 nodes");
    expect(copy).not.toContain("Connecting");
  });

  it("counts judged nodes and surfaces the composing phase", async () => {
    const { pendingProgressCopy } = await import("../../apps/ui/lib/v3/liveEvents.js");
    let state = createLiveRunState();
    state = applyRunEvent(state, event("run.running"));
    state = applyRunEvent(state, event("node.spawned", { parent_ref: null }, "node:a"));
    state = applyRunEvent(state, event("node.complete", {}, "node:a"));
    state = applyRunEvent(state, event("serve.composition_started"));
    const copy = pendingProgressCopy(state, { status: "live" });
    expect(copy).toContain("1 of 1");
    expect(copy).toContain("Composing");
  });

  it("admits a lost connection but keeps the progress it saw", async () => {
    const { pendingProgressCopy } = await import("../../apps/ui/lib/v3/liveEvents.js");
    let state = createLiveRunState();
    state = applyRunEvent(state, event("run.running"));
    state = applyRunEvent(state, event("node.spawned", { parent_ref: null }, "node:a"));
    const copy = pendingProgressCopy(state, { status: "reconnecting", retryInMs: 4000 });
    expect(copy).toContain("Reconnecting");
    expect(copy).toContain("1 node");
  });
});

/**
 * Live run events (2026-10-11): the page held one tab's whole `publicReads`
 * budget in about two minutes — it reset its back-off on the first REPLAYED
 * event, reconnected about once a second, and re-read the page on every
 * connect and for every replayed node event. These pin the stream loop.
 */
describe("live stream loop (one open stream, honest back-off)", () => {
  afterEach(() => { vi.useRealTimers(); });

  function streamEvent(sequence: number, eventType: RunEvent["event_type"] = "node.complete"): RunEvent {
    return RunEventSchema.parse({
      event_id: `stream:${sequence}`, event_type: eventType, run_ref: "run:live",
      subject_ref: "node:a", at_sequence: sequence, payload: {}
    });
  }

  type Script = (emit: (event: RunEvent) => void) => Promise<void>;

  function harness(scripts: Script[]) {
    const opened: number[] = [];
    const consumed: string[] = [];
    const refreshes: Array<boolean | undefined> = [];
    const statuses: Array<{ status: string; retryInMs?: number }> = [];
    let terminal = false;
    const stop = startLiveEventStream({
      open: (emit) => {
        opened.push(Date.now());
        const script = scripts.shift();
        return script === undefined ? new Promise<void>(() => {}) : script(emit);
      },
      consume: (event) => {
        consumed.push(event.event_id);
        if (event.event_type === "run.terminal") terminal = true;
        if (refreshTriggeredBy(event.event_type)) refreshes.push(event.event_type === "run.terminal");
      },
      refresh: (answerExpected) => { refreshes.push(answerExpected); },
      isTerminal: () => terminal,
      onStatus: (status) => { statuses.push(status); },
      onFatal: () => false,
      gate: createLiveEventGate()
    });
    return { opened, consumed, refreshes, statuses, stop };
  }

  it("waits at least 5 s after a clean close, and doubling, while only replayed events arrive", async () => {
    vi.useFakeTimers({ now: 0 });
    const replay: Script = async (emit) => { emit(streamEvent(1, "run.running")); emit(streamEvent(2)); };
    const run = harness([replay, replay, replay, replay]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run.opened).toEqual([0]);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(run.opened).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run.opened).toEqual([0, 5_000]);
    // The replayed events of the 2nd stream are not new: no back-off reset.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run.opened).toEqual([0, 5_000, 15_000]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(run.opened).toEqual([0, 5_000, 15_000, 35_000]);
    // Each event was applied once, however often it was replayed.
    expect(run.consumed).toEqual(["stream:1", "stream:2"]);
    run.stop();
  });

  it("re-reads the page only for NEW events (and once per close), never for replayed history", async () => {
    vi.useFakeTimers({ now: 0 });
    const run = harness([
      async (emit) => { emit(streamEvent(1, "run.running")); emit(streamEvent(2)); },
      async (emit) => { emit(streamEvent(1, "run.running")); emit(streamEvent(2)); emit(streamEvent(3)); }
    ]);
    await vi.advanceTimersByTimeAsync(0);
    // node.complete #2 is new (one refresh), then the clean close (one refresh).
    expect(run.refreshes).toEqual([false, undefined]);
    await vi.advanceTimersByTimeAsync(5_000);
    // Only #3 is new on the second stream, then its close.
    expect(run.refreshes).toEqual([false, undefined, false, undefined]);
    expect(run.consumed).toEqual(["stream:1", "stream:2", "stream:3"]);
    run.stop();
  });

  it("a NEW event resets the back-off to the 5 s floor", async () => {
    vi.useFakeTimers({ now: 0 });
    const run = harness([
      async (emit) => { emit(streamEvent(1, "run.running")); },
      async (emit) => { emit(streamEvent(1, "run.running")); },
      async (emit) => { emit(streamEvent(1, "run.running")); emit(streamEvent(2)); }
    ]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run.opened).toEqual([0, 5_000, 15_000]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run.opened).toEqual([0, 5_000, 15_000, 20_000]);
    run.stop();
  });

  it("honours the server's Retry-After on a 429, and waits at least a minute without one", async () => {
    vi.useFakeTimers({ now: 0 });
    const run = harness([
      async () => { throw new ContractHttpError("RATE_LIMITED", 429, "ADMISSION_RATE_LIMITED", "ADMISSION_RATE_LIMITED", null, null, 780_000); },
      async () => { throw new ContractHttpError("RATE_LIMITED", 429, "ADMISSION_RATE_LIMITED"); }
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run.statuses.at(-1)).toEqual({ status: "reconnecting", retryInMs: 780_000 });
    await vi.advanceTimersByTimeAsync(779_999);
    expect(run.opened).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run.opened).toHaveLength(2);
    expect(run.statuses.at(-1)).toEqual({ status: "reconnecting", retryInMs: LIVE_STREAM_RECONNECT.rateLimitedFloorMs });
    run.stop();
  });

  it("an answer this page cannot read shows the reload note instead of retrying the same event forever (side-by-side C13)", async () => {
    // Page-wide state: nothing before this case may have announced it, or the last assertion would prove nothing.
    expect(newerVersionReason()).toBeNull();
    vi.useFakeTimers({ now: 0 });
    const run = harness([async () => { throw new ContractHttpError("INVALID_RESPONSE", 200, "x"); }]);
    await vi.advanceTimersByTimeAsync(LIVE_STREAM_RECONNECT.maxGapMs * 3);
    expect(run.opened).toEqual([0]);
    expect(run.refreshes).toEqual([]);
    expect(run.statuses.some((status) => status.status === "reconnecting")).toBe(false);
    expect(newerVersionReason()).toBe("NEWER_BUILD");
    // Final fix wave W3: the stream is offline for good under the note, not left "connecting".
    expect(run.statuses.at(-1)).toEqual({ status: "offline" });
    run.stop();
  });

  it("a stream that was live and then meets an event this page cannot read goes offline, never stays 'live' (W3)", async () => {
    vi.useFakeTimers({ now: 0 });
    const run = harness([async (emit) => {
      emit(streamEvent(1, "run.running"));
      throw new ContractHttpError("INVALID_RESPONSE", 200, "x");
    }]);
    await vi.advanceTimersByTimeAsync(LIVE_STREAM_RECONNECT.maxGapMs * 3);
    expect(run.opened).toEqual([0]);
    expect(run.statuses).toEqual([{ status: "connecting" }, { status: "live" }, { status: "offline" }]);
    run.stop();
  });

  it("stops on terminal: no reconnect, one settled re-read", async () => {
    vi.useFakeTimers({ now: 0 });
    const run = harness([async (emit) => { emit(streamEvent(1, "run.running")); emit(streamEvent(2, "run.terminal")); }]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run.opened).toHaveLength(1);
    expect(run.refreshes).toEqual([true, true]);
    run.stop();
  });

  it("computes the reconnect delay from the 5 s floor, doubling to the 60 s ceiling, never under Retry-After", () => {
    expect([0, 1, 2, 3, 4, 5].map((attempt) => liveReconnectDelay(attempt, null))).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
    expect(liveReconnectDelay(0, new ContractHttpError("RATE_LIMITED", 429, "x", null, null, null, 120_000))).toBe(120_000);
    expect(liveReconnectDelay(5, new ContractHttpError("RATE_LIMITED", 429, "x", null, null, null, 2_000))).toBe(60_000);
    expect(liveReconnectDelay(0, new ContractHttpError("NETWORK_FAILURE", 0, "x"))).toBe(5_000);
  });

  it("the contract client reads Retry-After (seconds or a date) and skips SSE heartbeats", async () => {
    const limited = (retryAfter: string) => createContractClient("https://api.example.test", async () => new Response(
      JSON.stringify({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" }),
      { status: 429, headers: { "content-type": "application/json", "retry-after": retryAfter } }
    ));
    await expect(limited("780").streamEvents("run:test", () => {})).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 780_000 });
    const inTwoMinutes = new Date(Date.now() + 120_000).toUTCString();
    const dated = await limited(inTwoMinutes).streamEvents("run:test", () => {}).catch((error: ContractHttpError) => error);
    expect((dated as ContractHttpError).retryAfterMs).toBeGreaterThan(100_000);
    expect((dated as ContractHttpError).retryAfterMs).toBeLessThanOrEqual(120_000);
    await expect(limited("soon").streamEvents("run:test", () => {})).rejects.toMatchObject({ retryAfterMs: null });

    const event = JSON.stringify({ event_id: "1", event_type: "run.running", run_ref: "run:test", at_sequence: 1, payload: {} });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`: keep-alive\n\nid: 1\nevent: run.running\ndata: ${event}\n\n: keep-alive\n\n`));
        controller.close();
      }
    });
    const observed: RunEvent[] = [];
    await createContractClient("https://api.example.test", async () => new Response(body, { status: 200 }))
      .streamEvents("run:test", (candidate) => observed.push(candidate));
    expect(observed.map((candidate) => candidate.event_id)).toEqual(["1"]);
  });

  it("reads a Retry-After that names no usable wait as no wait at all, so a 429 keeps the 60 s floor", async () => {
    const pastDate = new Date(Date.now() - 120_000).toUTCString();
    for (const retryAfter of ["0", "-5", "1.5", pastDate]) {
      const refused = await createContractClient("https://api.example.test", async () => new Response(
        JSON.stringify({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" }),
        { status: 429, headers: { "content-type": "application/json", "retry-after": retryAfter } }
      )).streamEvents("run:test", () => {}).catch((error: unknown) => error);
      expect(refused, retryAfter).toBeInstanceOf(ContractHttpError);
      expect((refused as ContractHttpError).retryAfterMs, retryAfter).toBeNull();
      expect(liveReconnectDelay(0, refused), retryAfter).toBe(LIVE_STREAM_RECONNECT.rateLimitedFloorMs);
    }
  });

  it("clamps a huge Retry-After to 15 minutes, so the reconnect timer can never overflow", async () => {
    const refused = await createContractClient("https://api.example.test", async () => new Response(
      JSON.stringify({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" }),
      { status: 429, headers: { "content-type": "application/json", "retry-after": "99999999" } }
    )).streamEvents("run:test", () => {}).catch((error: unknown) => error);
    expect((refused as ContractHttpError).retryAfterMs).toBe(99_999_999_000);
    expect(liveReconnectDelay(0, refused)).toBe(900_000);
    expect(liveReconnectDelay(5, new ContractHttpError("RATE_LIMITED", 429, "x", null, null, null, 1_200_000))).toBe(900_000);
  });

  it("a huge Retry-After reconnects at the 15 minute cap, not after one millisecond", async () => {
    vi.useFakeTimers({ now: 0 });
    const run = harness([
      async () => { throw new ContractHttpError("RATE_LIMITED", 429, "ADMISSION_RATE_LIMITED", null, null, null, 99_999_999_000); }
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run.statuses.at(-1)).toEqual({ status: "reconnecting", retryInMs: 900_000 });
    await vi.advanceTimersByTimeAsync(899_999);
    expect(run.opened).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run.opened).toHaveLength(2);
    run.stop();
  });
});
