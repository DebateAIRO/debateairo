import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { everyWholeMinute } from "../../apps/api/src/ask-room.js";

describe("B7b the waker's clock falls on the whole minutes it announces (budget spec §2.7)", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("ticks on each whole minute — not a minute after boot — and stops when told", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-01T18:00:20.000Z") });
    const ticks: string[] = [];
    const waker = everyWholeMinute(() => { ticks.push(new Date().toISOString()); });
    await vi.advanceTimersByTimeAsync(39_999);
    expect(ticks).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(ticks).toEqual(["2026-10-01T18:01:00.000Z"]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ticks).toEqual(["2026-10-01T18:01:00.000Z", "2026-10-01T18:02:00.000Z", "2026-10-01T18:03:00.000Z"]);
    waker.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(ticks).toHaveLength(3);
  });
});

/** Budget spec §2.7 "Waking": the timer pattern of apps/api/src/main.ts:485-556, :766-770, :835-836. */
describe("B7b the API root wakes the line", () => {
  it("runs a single-flight tick right after listen, then on every whole minute, stopped on close", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toContain("const triggerAskWake = createSingleFlightErasureReconciler(");
    expect(main).toContain("async () => { await application.wakeWaitingRuns(); }");
    expect(main).toContain("let askWaker: Readonly<{ stop(): void }> | undefined;");
    expect(main).toContain('api.addHook("onClose",async () => askWaker?.stop());');
    const listen = main.indexOf('await startup.run("listen"');
    const start = main.indexOf("if (askRoom !== undefined) {\n  triggerAskWake();\n  askWaker = everyWholeMinute(triggerAskWake);\n}");
    expect(listen).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(listen);
    // No free-running interval: a tick a minute after boot would start a question later than it was told.
    expect(main).not.toContain("setInterval(triggerAskWake");
  });

  it("hands the room to the application as both the decision and the line, with the plans a waking run is checked against", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toContain("? { room: askRoom, waitingLine: askRoom }");
    expect(main).toContain("        entitlements,\n        billingPlans,\n        dailyCeilingMicros: costEnvelopeRows.runPolicy.dailyCeilingMicros,");
  });
});
