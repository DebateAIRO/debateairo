import { describe, expect, it } from "vitest";
import { createCallScheduler, callPriorityOf, CALL_LANE_STOPPED } from "../../apps/runner/src/call-scheduler.js";

const deferred = () => { let resolve!: (v: string) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const flush = () => new Promise((r) => setTimeout(r, 0));
const policy = { perDebate: 3, perModelPerDebate: 2, perModelPerRunner: { default: 4, deepinfra: 3 } };
const t = (model: string, priority: "AUTHOR" | "PANEL" | "REVIEW" | "OTHER" = "AUTHOR", gate: string | null = null, vendor = "deepinfra") =>
  ({ model, vendor, gate, priority });

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
  it("names priorities from call-site keys", () => {
    expect(callPriorityOf("JUDGE")).toBe("AUTHOR");
    expect(callPriorityOf("JUDGE:root:2:seat:main")).toBe("AUTHOR");
    expect(callPriorityOf("JUDGE:cross-root:0->1")).toBe("AUTHOR");
    expect(callPriorityOf("PANEL:root:preview:fixture-a")).toBe("PANEL");
    expect(callPriorityOf("JUDGE:review:8f…")).toBe("REVIEW");
    expect(callPriorityOf("COMPOSER:SYNTHESIZER:INITIAL:1")).toBe("OTHER");
  });
});
