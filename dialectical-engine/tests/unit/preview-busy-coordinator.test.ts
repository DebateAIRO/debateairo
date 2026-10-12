// Parallel calls (spec docs/superpowers/specs/2026-10-12-parallel-calls-design.md §3.3, owner ruling O4): when one
// model turns busy while several of its calls are in flight, exactly ONE resend probes it for everyone. The first
// busy refusal is the probe; every other refusal, and every call not yet sent, waits for the probe's outcome.
import { describe, expect, it } from "vitest";
import { createPreviewBusyCoordinator, NO_BUSY_COORDINATION } from "@debateai/providers";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("preview busy coordinator", () => {
  it("first busy refusal is the probe; others wait; probe answered → they resend", async () => {
    const c = createPreviewBusyCoordinator();
    await expect(c.refusedBusy("m", undefined)).resolves.toBe("PROBE");
    const second = c.refusedBusy("m", undefined); const fresh = c.admit("m"); let freshDone = false; void fresh.then(() => { freshDone = true; });
    await flush(); expect(freshDone).toBe(false);
    c.probeOutcome("m", "ANSWERED");
    await expect(second).resolves.toBe("RESEND"); await fresh; expect(freshDone).toBe(true);
  });

  it("probe busy → waiting refusals give up, new calls are released, later refusals give up until expiry", async () => {
    let clock = 0; const c = createPreviewBusyCoordinator({ now: () => clock });
    await c.refusedBusy("m", undefined); const waiting = c.refusedBusy("m", undefined); const fresh = c.admit("m");
    c.probeOutcome("m", "BUSY", 120);
    await expect(waiting).resolves.toBe("GIVE_UP"); await fresh;
    await expect(c.refusedBusy("m", undefined)).resolves.toBe("GIVE_UP");
    clock = 121_000; await expect(c.refusedBusy("m", undefined)).resolves.toBe("PROBE");
  });

  it("models are independent", async () => {
    const c = createPreviewBusyCoordinator();
    await c.refusedBusy("a", undefined); await expect(c.admit("b")).resolves.toBeUndefined();
  });

  it("the no-op coordinator is today's behaviour", async () => {
    await expect(NO_BUSY_COORDINATION.refusedBusy("m", undefined)).resolves.toBe("PROBE");
    await expect(NO_BUSY_COORDINATION.refusedBusy("m", undefined)).resolves.toBe("PROBE");
    await expect(NO_BUSY_COORDINATION.admit("m")).resolves.toBeUndefined();
    NO_BUSY_COORDINATION.probeOutcome("m", "BUSY", 600);
    await expect(NO_BUSY_COORDINATION.admit("m")).resolves.toBeUndefined();
    await expect(NO_BUSY_COORDINATION.refusedBusy("m", undefined)).resolves.toBe("PROBE");
  });

  it("a probe that ends any other way closes the model: waiters resend, new calls go out", async () => {
    const c = createPreviewBusyCoordinator();
    await expect(c.refusedBusy("m", undefined)).resolves.toBe("PROBE");
    const waiting = c.refusedBusy("m", undefined); const fresh = c.admit("m");
    c.probeOutcome("m", "OTHER");
    await expect(waiting).resolves.toBe("RESEND"); await expect(fresh).resolves.toBeUndefined();
    // CLOSED again: the next busy refusal is a new probe.
    await expect(c.refusedBusy("m", undefined)).resolves.toBe("PROBE");
  });

  it("confirmed busy lasts at least 60 s even when the gate names a shorter wait", async () => {
    let clock = 0; const c = createPreviewBusyCoordinator({ now: () => clock });
    await c.refusedBusy("m", 5); c.probeOutcome("m", "BUSY", 5);
    clock = 59_999; await expect(c.refusedBusy("m", undefined)).resolves.toBe("GIVE_UP");
    clock = 60_000; await expect(c.refusedBusy("m", undefined)).resolves.toBe("PROBE");
  });

  it("while confirmed busy, new calls are let through at once; any answer closes the model early", async () => {
    let clock = 0; const c = createPreviewBusyCoordinator({ now: () => clock });
    await c.refusedBusy("m", undefined); c.probeOutcome("m", "BUSY", undefined);
    await expect(c.admit("m")).resolves.toBeUndefined();
    c.answered("m");
    await expect(c.refusedBusy("m", undefined)).resolves.toBe("PROBE");
  });

  it("an answer from another call while the probe is in flight keeps the waiters for the probe", async () => {
    const c = createPreviewBusyCoordinator();
    await c.refusedBusy("m", undefined);
    const waiting = c.refusedBusy("m", undefined); let turn: string | undefined; void waiting.then((t) => { turn = t; });
    c.answered("m");
    await flush(); expect(turn).toBeUndefined();
    c.probeOutcome("m", "ANSWERED");
    await expect(waiting).resolves.toBe("RESEND");
  });

  it("every waiter is released by the probe's outcome, however many there are", async () => {
    const c = createPreviewBusyCoordinator();
    await c.refusedBusy("m", undefined);
    const refusals = Array.from({ length: 20 }, () => c.refusedBusy("m", undefined));
    const admits = Array.from({ length: 20 }, () => c.admit("m"));
    c.probeOutcome("m", "BUSY", 60);
    await expect(Promise.all(refusals)).resolves.toEqual(Array.from({ length: 20 }, () => "GIVE_UP"));
    await expect(Promise.all(admits)).resolves.toHaveLength(20);
  });
});
