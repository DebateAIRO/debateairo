import { describe, expect, it } from "vitest";
import { createCallScheduler, callPriorityOf, CALL_LANE_HELD_BACK, CALL_LANE_STOPPED, type CallTicket } from "../../apps/runner/src/call-scheduler.js";

const deferred = () => { let resolve!: (v: string) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const flush = () => new Promise((r) => setTimeout(r, 0));
const policy = { perDebate: 3, perModelPerDebate: 2, perModelPerRunner: { default: 4, deepinfra: 3 } };
const t = (model: string, priority: "AUTHOR" | "PANEL" | "REVIEW" | "OTHER" = "AUTHOR", gate: string | null = null, vendor = "deepinfra") =>
  ({ model, vendor, gate, priority });
/** A final writer (LG-B) through `gate`. */
const fw = (model: string, gate: string | null): CallTicket => ({ ...t(model, "OTHER", gate, "x"), finalWriter: true });

describe("call scheduler", () => {
  it("respects perModelPerDebate and perDebate", async () => {
    const s = createCallScheduler({ policy }); const lane = s.openLane("d1");
    const started: string[] = []; const gates = [deferred(), deferred(), deferred(), deferred()];
    const calls = [t("A"), t("A"), t("A"), t("B")].map((ticket, i) => lane.run(ticket, () => { started.push(`${ticket.model}${i}`); return gates[i]!.promise; }));
    await flush();
    expect(started).toEqual(["A0", "A1", "B3"]); // A2 waits: 2 per model; B3 fills perDebate 3
    gates[0]!.resolve("ok"); await flush();
    expect(started).toEqual(["A0", "A1", "B3", "A2"]);
    gates.forEach((g) => g.resolve("ok")); await Promise.all(calls);
    expect(lane.stats().peakInFlight).toBe(3);
  });
  it("tells each lane how many of its debate's calls may run at once (Task 10: the runner reads it to run calls together)", () => {
    expect(createCallScheduler({ policy }).openLane("d1").callsAtOnce).toBe(3);
    expect(createCallScheduler({ policy: { ...policy, perDebate: 1 } }).openLane("d1").callsAtOnce).toBe(1);
  });
  /**
   * Side-by-side spec §13 (runner point 5): a lane opens with its own debate's limits (`perDebate`, `perModelPerDebate`,
   * from the debate's settings version), not the scheduler policy's. The runner-wide `perModelPerRunner` stays the scheduler's.
   */
  it("a lane opened with its own limits runs at its own perDebate and perModelPerDebate, not the scheduler policy's", async () => {
    const s = createCallScheduler({ policy: { perDebate: 2, perModelPerDebate: 2, perModelPerRunner: { default: 1000 } } });
    const one = s.openLane("d1", { perDebate: 1, perModelPerDebate: 1 });
    const three = s.openLane("d2", { perDebate: 3, perModelPerDebate: 2 });
    const started: string[] = []; const gs = Array.from({ length: 5 }, deferred);
    const oneRuns = [0, 1].map((i) => one.run(t("A"), () => { started.push(`one${i}`); return gs[i]!.promise; }));
    const threeRuns = [t("A"), t("A"), t("B")].map((ticket, i) => three.run(ticket, () => { started.push(`three${i}`); return gs[2 + i]!.promise; }));
    await flush();
    expect(started).toEqual(["one0", "three0", "three1", "three2"]); // one1 waits for its debate's one slot; three takes all three
    gs[0]!.resolve("ok"); await flush();
    expect(started).toEqual(["one0", "three0", "three1", "three2", "one1"]);
    gs.forEach((g) => g.resolve("ok")); await Promise.all([...oneRuns, ...threeRuns]);
    expect(one.callsAtOnce).toBe(1);
    expect(three.callsAtOnce).toBe(3);
    expect(one.stats().peakInFlight).toBe(1);
    expect(three.stats().peakInFlight).toBe(3);
  });
  it("reads perModelPerDebate from the lane, not the policy: a lane allowing one call of a model holds its second back, and one allowing three runs all three", async () => {
    const s = createCallScheduler({ policy: { perDebate: 2, perModelPerDebate: 2, perModelPerRunner: { default: 1000 } } });
    const narrow = s.openLane("d1", { perDebate: 3, perModelPerDebate: 1 });
    const started: string[] = []; const gs = Array.from({ length: 3 }, deferred);
    const runs = [t("A"), t("A"), t("B")].map((ticket, i) => narrow.run(ticket, () => { started.push(`${ticket.model}${i}`); return gs[i]!.promise; }));
    await flush();
    expect(started).toEqual(["A0", "B2"]); // A1 waits: the lane allows one call of A, the policy's two would start it
    gs.forEach((g) => g.resolve("ok")); await Promise.all(runs);
    const wide = s.openLane("d2", { perDebate: 3, perModelPerDebate: 3 });
    const wideStarted: string[] = []; const ws = Array.from({ length: 3 }, deferred);
    const wideRuns = [0, 1, 2].map((i) => wide.run(t("A"), () => { wideStarted.push(`A${i}`); return ws[i]!.promise; }));
    await flush();
    expect(wideStarted).toEqual(["A0", "A1", "A2"]); // all three: the lane allows three of A, the policy's two would hold the third
    ws.forEach((g) => g.resolve("ok")); await Promise.all(wideRuns);
  });
  it("copies a lane's limits when it opens: changing the caller's object afterwards changes nothing", async () => {
    const s = createCallScheduler({ policy });
    const limits = { perDebate: 1, perModelPerDebate: 1 };
    const lane = s.openLane("d1", limits);
    limits.perDebate = 3; limits.perModelPerDebate = 3;
    expect(lane.callsAtOnce).toBe(1);
    const gs = Array.from({ length: 2 }, deferred); const started: string[] = [];
    const runs = gs.map((g, i) => lane.run(t("A"), () => { started.push(`A${i}`); return g.promise; }));
    await flush(); expect(started).toEqual(["A0"]);
    gs.forEach((g) => g.resolve("ok")); await Promise.all(runs);
  });
  it("the runner-wide per-model cap still holds across two lanes that each carry their own limits: a model with cap 2 never runs three", async () => {
    const s = createCallScheduler({ policy: { perDebate: 2, perModelPerDebate: 2, perModelPerRunner: { default: 2 } } });
    const l1 = s.openLane("d1", { perDebate: 3, perModelPerDebate: 3 });
    const l2 = s.openLane("d2", { perDebate: 3, perModelPerDebate: 3 });
    const started: string[] = []; const gs = Array.from({ length: 6 }, deferred);
    const runs = [l1, l1, l1, l2, l2, l2].map((lane, i) => lane.run(t("M"), () => { started.push(`${lane === l1 ? "x" : "y"}${i}`); return gs[i]!.promise; }));
    await flush(); expect(started).toEqual(["x0", "x1"]); // each lane would take three; the runner's cap of 2 holds the rest
    gs[0]!.resolve("ok"); await flush(); expect(started.at(-1)).toBe("y3"); // round robin hands the slot to d2
    gs[1]!.resolve("ok"); await flush(); expect(started.at(-1)).toBe("x2");
    gs.forEach((g) => g.resolve("ok")); await Promise.all(runs);
    expect(s.stats().peakByModel).toEqual({ M: 2 });
    expect(l1.callsAtOnce).toBe(3);
  });
  it("a lane opened without limits runs on the scheduler policy's two members, exactly as before", async () => {
    const s = createCallScheduler({ policy }); const lane = s.openLane("d1");
    const started: string[] = []; const gates = [deferred(), deferred(), deferred(), deferred()];
    const calls = [t("A"), t("A"), t("A"), t("B")].map((ticket, i) => lane.run(ticket, () => { started.push(`${ticket.model}${i}`); return gates[i]!.promise; }));
    await flush();
    expect(started).toEqual(["A0", "A1", "B3"]); // A2 waits: 2 per model; B3 fills perDebate 3
    gates[0]!.resolve("ok"); await flush();
    expect(started).toEqual(["A0", "A1", "B3", "A2"]);
    gates.forEach((g) => g.resolve("ok")); await Promise.all(calls);
    expect(lane.stats().peakInFlight).toBe(3);
    expect(lane.callsAtOnce).toBe(3);
  });
  it("refuses lane limits outside the policy's bounds or not whole numbers with CALL_LANE_LIMITS_INVALID", () => {
    const s = createCallScheduler({ policy });
    const refused = [
      { perDebate: 0, perModelPerDebate: 1 }, { perDebate: 65, perModelPerDebate: 1 },
      { perDebate: 1, perModelPerDebate: 0 }, { perDebate: 1, perModelPerDebate: 17 },
      { perDebate: 1.5, perModelPerDebate: 1 }, { perDebate: 1, perModelPerDebate: 2.5 }, { perDebate: Number.NaN, perModelPerDebate: 1 }
    ];
    for (const limits of refused) {
      expect(() => s.openLane("d1", limits)).toThrowError(TypeError);
      expect(() => s.openLane("d1", limits)).toThrow(new TypeError("CALL_LANE_LIMITS_INVALID"));
    }
    // The bounds themselves are allowed.
    expect(s.openLane("d2", { perDebate: 64, perModelPerDebate: 16 }).callsAtOnce).toBe(64);
    expect(s.openLane("d3", { perDebate: 1, perModelPerDebate: 1 }).callsAtOnce).toBe(1);
  });
  it("orders waiting calls by priority then arrival", async () => {
    const s = createCallScheduler({ policy: { ...policy, perDebate: 1 } }); const lane = s.openLane("d1");
    const order: string[] = []; const first = deferred();
    const a = lane.run(t("A"), () => first.promise);
    const rest = [["r", "REVIEW"], ["p", "PANEL"], ["a", "AUTHOR"], ["p2", "PANEL"]].map(([name, pr]) =>
      lane.run(t("B", pr as never), async () => { order.push(name!); return "ok"; }));
    first.resolve("ok"); await Promise.all([a, ...rest]);
    expect(order).toEqual(["a", "p", "p2", "r"]);
  });
  it("applies the runner-wide per-vendor cap across lanes with round robin", async () => {
    const s = createCallScheduler({ policy: { perDebate: 10, perModelPerDebate: 10, perModelPerRunner: { default: 10, deepinfra: 2 } } });
    const l1 = s.openLane("d1"); const l2 = s.openLane("d2"); const started: string[] = [];
    const gs = Array.from({ length: 6 }, deferred);
    const runs = [l1, l1, l1, l2, l2, l2].map((lane, i) => lane.run(t("M"), () => { started.push(`${lane === l1 ? "x" : "y"}${i}`); return gs[i]!.promise; }));
    await flush(); expect(started).toEqual(["x0", "x1"]);
    gs[0]!.resolve("ok"); await flush(); expect(started.at(-1)).toBe("y3");     // round robin hands the slot to d2
    gs[1]!.resolve("ok"); await flush(); expect(started.at(-1)).toBe("x2");
    gs.forEach((g) => g.resolve("ok")); await Promise.all(runs);
  });
  it("hands a shared slot to the debate that waited longest for it, whatever other debates start meanwhile", async () => {
    const s = createCallScheduler({ policy: { perDebate: 10, perModelPerDebate: 10, perModelPerRunner: { default: 10, x: 1 } } });
    const lanes = [s.openLane("d1"), s.openLane("d2"), s.openLane("d3")];
    const started: string[] = []; const gates = new Map<string, ReturnType<typeof deferred>>();
    const runs = [0, 1].flatMap((l) => Array.from({ length: 5 }, (_, i) => {
      const name = `L${l + 1}-M${i}`; const g = deferred(); gates.set(name, g);
      return lanes[l]!.run(t("M", "AUTHOR", null, "x"), () => { started.push(name); return g.promise; });
    }));
    const cheap: Promise<string>[] = [];
    for (let k = 0; k < 9; k++) {
      cheap.push(lanes[2]!.run(t("N", "AUTHOR", null, "y"), async () => "ok")); // d3 starts something else before each release
      gates.get(started.at(-1)!)!.resolve("ok"); await flush();
    }
    expect(started).toEqual(["L1-M0", "L2-M0", "L1-M1", "L2-M1", "L1-M2", "L2-M2", "L1-M3", "L2-M3", "L1-M4", "L2-M4"]);
    gates.forEach((g) => g.resolve("ok")); await Promise.all([...runs, ...cheap]);
  });
  it("takes turns on a gate's slots per gate, whatever model each debate asks for", async () => {
    const s = createCallScheduler({ policy: { perDebate: 10, perModelPerDebate: 10, perModelPerRunner: { default: 10 } } });
    s.setGateCapacity("g", 1); const lanes = [s.openLane("d1"), s.openLane("d2"), s.openLane("d3")];
    const started: string[] = []; const gates = new Map<string, ReturnType<typeof deferred>>();
    const runs = [0, 1].flatMap((l) => Array.from({ length: 3 }, (_, i) => {
      const name = `L${l + 1}-${i}`; const g = deferred(); gates.set(name, g);
      return lanes[l]!.run(t(`M${l}${i}`, "AUTHOR", "g", "x"), () => { started.push(name); return g.promise; });
    }));
    const cheap: Promise<string>[] = [];
    for (let k = 0; k < 5; k++) {
      cheap.push(lanes[2]!.run(t("N", "AUTHOR", "other", "y"), async () => "ok"));
      gates.get(started.at(-1)!)!.resolve("ok"); await flush();
    }
    expect(started).toEqual(["L1-0", "L2-0", "L1-1", "L2-1", "L1-2", "L2-2"]);
    gates.forEach((g) => g.resolve("ok")); await Promise.all([...runs, ...cheap]);
  });
  it("limits a gate to its capacity and to one call while unhealthy", async () => {
    const s = createCallScheduler({ policy: { perDebate: 10, perModelPerDebate: 10, perModelPerRunner: { default: 10 } } });
    s.setGateCapacity("g", 2); const lane = s.openLane("d1"); const started: number[] = [];
    const gs = Array.from({ length: 4 }, deferred);
    const runs = gs.map((g, i) => lane.run(t(`M${i}`, "AUTHOR", "g", "x"), () => { started.push(i); return g.promise; }));
    await flush(); expect(started).toEqual([0, 1]);
    s.markGateUnhealthy("g"); gs[0]!.resolve("ok"); await flush(); expect(started).toEqual([0, 1]); // 1 still running ≥ 1
    gs[1]!.resolve("ok"); await flush(); expect(started).toEqual([0, 1, 2]);
    s.markGateHealthy("g"); await flush(); expect(started).toEqual([0, 1, 2, 3]);
    gs.forEach((g) => g.resolve("ok")); await Promise.all(runs);
  });
  /**
   * LG-B Task 5, fix round 1 (review): a gate whose /remaining names final-writer slots (finalWriterMaxInFlight, F) takes
   * at most F final-writer calls at once. A further final writer WAITS here, holding no slot, instead of failing at the
   * gate (CONCURRENCY_LIMIT_REACHED); every other call goes on through the gate's other slots.
   */
  it("a second final writer waits on a gate's final-writer slots while a STANDARD call proceeds, then starts when the first ends", async () => {
    const s = createCallScheduler({ policy: { perDebate: 10, perModelPerDebate: 10, perModelPerRunner: { default: 10 } } });
    s.setGateCapacity("g", 2); s.setGateFinalWriterCapacity("g", 1); const lane = s.openLane("d1");
    const started: string[] = []; const gs = new Map<string, ReturnType<typeof deferred>>();
    const go = (name: string, ticket: CallTicket) => { const g = deferred(); gs.set(name, g);
      return lane.run(ticket, () => { started.push(name); return g.promise; }); };
    const fw1 = go("fw1", fw("A", "g")); const fw2 = go("fw2", fw("B", "g")); const std = go("std", t("C", "OTHER", "g", "x"));
    await flush();
    expect(started).toEqual(["fw1", "std"]); // fw2 waits holding no gate slot: the STANDARD call took the second one
    expect(lane.stats().running).toBe(2);
    gs.get("std")!.resolve("ok"); await flush();
    expect(started).toEqual(["fw1", "std"]); // a free gate slot alone does not start it: the final writer's slot is taken
    gs.get("fw1")!.resolve("ok"); await flush();
    expect(started).toEqual(["fw1", "std", "fw2"]);
    gs.get("fw2")!.resolve("ok"); await Promise.all([fw1, fw2, std]);
    expect(s.stats().peakByGate).toEqual({ g: 2 });
    // Its slot is free again: two final writers in a row still run, one at a time.
    const after: string[] = []; const a = deferred(); const b = deferred();
    const both = [lane.run(fw("A", "g"), () => { after.push("a"); return a.promise; }), lane.run(fw("B", "g"), () => { after.push("b"); return b.promise; })];
    await flush(); expect(after).toEqual(["a"]);
    a.resolve("ok"); await flush(); expect(after).toEqual(["a", "b"]);
    b.resolve("ok"); await Promise.all(both);
  });
  it("puts no cap on final writers when the gate named no final-writer slots, and none on another gate's", async () => {
    const s = createCallScheduler({ policy: { perDebate: 10, perModelPerDebate: 10, perModelPerRunner: { default: 10 } } });
    s.setGateCapacity("g", 3); s.setGateCapacity("h", 3); s.setGateFinalWriterCapacity("h", 1); const lane = s.openLane("d1");
    const started: string[] = []; const gs = Array.from({ length: 3 }, deferred);
    const runs = gs.map((g, i) => lane.run(fw(`M${i}`, "g"), () => { started.push(`g${i}`); return g.promise; }));
    await flush(); expect(started).toEqual(["g0", "g1", "g2"]);
    gs.forEach((g) => g.resolve("ok")); await Promise.all(runs);
    // Behind no gate a final writer is never capped either.
    const free = Array.from({ length: 3 }, (_, i) => lane.run(fw(`N${i}`, null), async () => "ok"));
    await expect(Promise.all(free)).resolves.toEqual(["ok", "ok", "ok"]);
  });
  it("a stopped lane rejects a final writer waiting on the gate's final-writer slots, and frees no slot it never took", async () => {
    const s = createCallScheduler({ policy: { perDebate: 10, perModelPerDebate: 10, perModelPerRunner: { default: 10 } } });
    s.setGateCapacity("g", 2); s.setGateFinalWriterCapacity("g", 1);
    const lane = s.openLane("d1"); const other = s.openLane("d2");
    const first = deferred(); const running = other.run(fw("A", "g"), () => first.promise);
    let sent = false;
    const waiting = lane.run(fw("B", "g"), async () => { sent = true; return "never"; });
    await flush();
    lane.stop();
    await expect(waiting).rejects.toMatchObject({ code: CALL_LANE_STOPPED });
    expect(sent).toBe(false);
    first.resolve("done"); await expect(running).resolves.toBe("done");
    // The other debate's next final writer gets the slot: the stopped waiter held none and left none behind.
    await expect(other.run(fw("C", "g"), async () => "ok")).resolves.toBe("ok");
  });
  it("stop rejects waiting calls, leaves running ones, never leaks a slot", async () => {
    const s = createCallScheduler({ policy: { ...policy, perDebate: 1 } }); const lane = s.openLane("d1");
    const g = deferred(); const running = lane.run(t("A"), () => g.promise);
    const waiting = lane.run(t("A"), async () => "never");
    lane.stop();
    await expect(waiting).rejects.toMatchObject({ code: CALL_LANE_STOPPED });
    g.resolve("done"); await expect(running).resolves.toBe("done"); await lane.drained();
    const other = s.openLane("d2"); await expect(other.run(t("A"), async () => "ok")).resolves.toBe("ok");
  });
  it("releases on rejection and propagates the error unchanged", async () => {
    const s = createCallScheduler({ policy: { ...policy, perDebate: 1 } }); const lane = s.openLane("d1");
    const boom = new Error("boom");
    await expect(lane.run(t("A"), async () => { throw boom; })).rejects.toBe(boom);
    await expect(lane.run(t("A"), async () => "ok")).resolves.toBe("ok");
  });
  it("releases a call that throws before returning a promise, refuses runs on a stopped lane, frees a closed lane's rotation", async () => {
    const s = createCallScheduler({ policy: { perDebate: 1, perModelPerDebate: 1, perModelPerRunner: { default: 1 } } });
    const lane = s.openLane("d1"); const boom = new Error("sync boom");
    await expect(lane.run(t("A"), () => { throw boom; })).rejects.toBe(boom);
    await expect(lane.run(t("A"), async () => "ok")).resolves.toBe("ok");
    lane.close(); lane.close();
    let sent = false;
    await expect(lane.run(t("A"), async () => { sent = true; return "x"; })).rejects.toMatchObject({ code: CALL_LANE_STOPPED });
    expect(sent).toBe(false);
    await lane.drained();
    const other = s.openLane("d2"); await expect(other.run(t("A"), async () => "ok")).resolves.toBe("ok");
    expect(s.stats().peakByModel).toEqual({ A: 1 });
    expect(lane.stats()).toMatchObject({ calls: 2, peakInFlight: 1, peakByModel: { A: 1 } });
  });
  it("admits one call to an unhealthy gate even when it announced no slots", async () => {
    const s = createCallScheduler({ policy: { perDebate: 10, perModelPerDebate: 10, perModelPerRunner: { default: 10 } } });
    s.markGateUnhealthy("g"); const lane = s.openLane("d1"); const started: number[] = [];
    const gs = Array.from({ length: 2 }, deferred);
    const runs = gs.map((g, i) => lane.run(t(`M${i}`, "AUTHOR", "g", "x"), () => { started.push(i); return g.promise; }));
    expect(started).toEqual([0]);
    gs[0]!.resolve("ok"); await flush(); expect(started).toEqual([0, 1]);
    gs[1]!.resolve("ok"); await Promise.all(runs);
    expect(s.stats().peakByGate).toEqual({ g: 1 });
  });
  /**
   * Task 12 (spec 2026-10-12 §2.3, O6; Task 10 review carry): once the debate's arguing has stopped, no AUTHOR or REVIEW
   * call starts — not even one already WAITING in the lane when the stop is recorded. The lane asks its start guard,
   * synchronously, each time it would start a call; a refused call is never sent and rejects CALL_LANE_HELD_BACK, while a
   * waiting PANEL call (the panel of a node whose author call was already sent) still starts. Running calls are untouched.
   */
  it("a start guard refuses waiting AUTHOR and REVIEW calls at dispatch, lets PANEL calls start, and touches no running call", async () => {
    const s = createCallScheduler({ policy: { ...policy, perDebate: 1 } }); const lane = s.openLane("d1");
    const started: string[] = []; const running = deferred();
    const first = lane.run(t("A"), () => { started.push("running"); return running.promise; });
    const waiting = (name: string, priority: CallTicket["priority"]) =>
      lane.run(t("A", priority), async () => { started.push(name); return name; });
    const author = waiting("author", "AUTHOR"); const review = waiting("review", "REVIEW");
    const panel = waiting("panel", "PANEL"); const other = waiting("other", "OTHER");
    let stopped = false;
    lane.guardStarts((ticket) => !(stopped && (ticket.priority === "AUTHOR" || ticket.priority === "REVIEW")));
    await flush();
    expect(started).toEqual(["running"]);
    // The stop is recorded while all four wait for the debate's one slot; the running call is not touched.
    stopped = true;
    running.resolve("done");
    await expect(first).resolves.toBe("done");
    await expect(author).rejects.toMatchObject({ code: CALL_LANE_HELD_BACK });
    await expect(review).rejects.toMatchObject({ code: CALL_LANE_HELD_BACK });
    await expect(panel).resolves.toBe("panel");
    await expect(other).resolves.toBe("other");
    expect(started).toEqual(["running", "panel", "other"]);
    // A new AUTHOR call is refused at once, never sent; a new PANEL call still runs.
    await expect(waiting("late author", "AUTHOR")).rejects.toMatchObject({ code: CALL_LANE_HELD_BACK });
    await expect(waiting("late panel", "PANEL")).resolves.toBe("late panel");
    expect(started).toEqual(["running", "panel", "other", "late panel"]);
    expect(lane.stats()).toMatchObject({ running: 0, heldBack: 3, calls: 4 });
    // The guard removed (the arguing is over: the answer's own calls follow), every call may start again.
    lane.guardStarts(null);
    await expect(waiting("after", "AUTHOR")).resolves.toBe("after");
    await lane.drained();
  });
  it("a refused call frees no slot it never took, and another debate's lane is never asked", async () => {
    const s = createCallScheduler({ policy: { perDebate: 2, perModelPerDebate: 1, perModelPerRunner: { default: 1 } } });
    const mine = s.openLane("d1"); const theirs = s.openLane("d2");
    const hold = deferred(); const started: string[] = [];
    const held = mine.run(t("A"), () => { started.push("mine:A"); return hold.promise; });
    // Both wait for model A's one runner-wide slot.
    const myAuthor = mine.run(t("A", "AUTHOR"), async () => { started.push("mine:author"); return "x"; });
    const theirAuthor = theirs.run(t("A", "AUTHOR"), async () => { started.push("theirs:author"); return "y"; });
    mine.guardStarts((ticket) => ticket.priority !== "AUTHOR");
    hold.resolve("ok"); await held;
    await expect(myAuthor).rejects.toMatchObject({ code: CALL_LANE_HELD_BACK });
    await expect(theirAuthor).resolves.toBe("y");
    expect(started).toEqual(["mine:A", "theirs:author"]);
    expect(mine.stats()).toMatchObject({ running: 0, heldBack: 1 });
    expect(theirs.stats()).toMatchObject({ running: 0, heldBack: 0 });
  });
  it("names priorities from call-site keys", () => {
    expect(callPriorityOf("JUDGE")).toBe("AUTHOR");
    expect(callPriorityOf("JUDGE:root:2:seat:main")).toBe("AUTHOR");
    expect(callPriorityOf("JUDGE:cross-root:0->1")).toBe("AUTHOR");
    expect(callPriorityOf("PANEL:root:preview:fixture-a")).toBe("PANEL");
    expect(callPriorityOf("JUDGE:review:8f…")).toBe("REVIEW");
    expect(callPriorityOf("COMPOSER:SYNTHESIZER:INITIAL:1")).toBe("OTHER");
  });
});
