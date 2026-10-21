/**
 * Live run events (2026-10-11): the tail behind `GET /v1/runs/:id/events`
 * replays the stored events, then follows the run on the same stream — one
 * change-mark read per poll, a snapshot read only when the mark moved, a
 * heartbeat while idle — and stops on terminal, settled, gone, abort, drain or
 * its life cap. The clock here is a fake: time moves only when the tail sleeps.
 */
import { describe, expect, it } from "vitest";
import {
  RUN_EVENT_TAIL_TIMING,
  tailRunEvents,
  type RunEventMark,
  type RunEventTailClock,
  type RunEventTailItem
} from "../../apps/api/src/run-event-tail.js";

type Stored = Readonly<{ event_id: string; event_type: string; at_sequence: number }>;

function event(sequence: number, eventType = "node.complete"): Stored {
  return Object.freeze({ event_id: `event:${sequence}`, event_type: eventType, at_sequence: sequence });
}

function fakeRun(initial: readonly Stored[] = []) {
  const stored: Stored[] = [...initial];
  let settled = false;
  let owned = true;
  const calls = { mark: 0, snapshot: 0 };
  return {
    stored, calls,
    append(...events: Stored[]) { stored.push(...events); },
    settle() { settled = true; },
    disown() { owned = false; },
    snapshot: async function* (_signal: AbortSignal) {
      calls.snapshot += 1;
      for (const candidate of [...stored].sort((a, b) => a.at_sequence - b.at_sequence)) yield candidate;
    },
    mark: async (_signal: AbortSignal): Promise<RunEventMark | null> => {
      calls.mark += 1;
      return owned ? { mark: `${stored.length}:${Math.max(0, ...stored.map((e) => e.at_sequence))}`, settled } : null;
    }
  };
}

function fakeClock(onSleep: (now: number) => void = () => {}): RunEventTailClock & { readonly sleeps: number[] } {
  let now = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => now,
    sleep: async (ms: number, signal: AbortSignal) => {
      if (signal.aborted) return;
      sleeps.push(ms);
      now += ms;
      onSleep(now);
    }
  };
}

async function collect(stream: AsyncIterable<RunEventTailItem>, limit = 1_000): Promise<RunEventTailItem[]> {
  const items: RunEventTailItem[] = [];
  for await (const item of stream) {
    items.push(item);
    if (items.length >= limit) break;
  }
  return items;
}

const ids = (items: readonly RunEventTailItem[]) => items.flatMap((item) =>
  item.kind === "event" ? [(item.event as Stored).event_id] : ["heartbeat"]);

describe("run event tail (live stream behind GET /v1/runs/:id/events)", () => {
  it("defaults: a poll every 1.5 s, a heartbeat by 15 s, a 30-minute life", () => {
    expect(RUN_EVENT_TAIL_TIMING).toEqual({ pollMs: 1_500, heartbeatMs: 15_000, maxLifeMs: 1_800_000, settledGraceMs: 60_000 });
  });

  it("replays the stored events, then sends events appended later, in order, once each", async () => {
    const run = fakeRun([event(1, "run.running"), event(2)]);
    const clock = fakeClock((now) => {
      if (now === 100) run.append(event(4), event(3));
      if (now === 300) run.append(event(5, "run.terminal"));
    });
    const items = await collect(tailRunEvents({
      snapshot: run.snapshot, mark: run.mark, signal: new AbortController().signal,
      timing: { pollMs: 100, heartbeatMs: 10_000 }, clock
    }));
    expect(ids(items)).toEqual(["event:1", "event:2", "event:3", "event:4", "event:5"]);
    // One snapshot for the replay, one per moved mark; idle polls read the mark only.
    expect(run.calls.snapshot).toBe(3);
    expect(run.calls.mark).toBe(4);
  });

  it("sends a heartbeat while idle, never later than heartbeatMs after the last write", async () => {
    const run = fakeRun([event(1, "run.running")]);
    const controller = new AbortController();
    const clock = fakeClock((now) => { if (now >= 1_000) controller.abort(); });
    const items = await collect(tailRunEvents({
      snapshot: run.snapshot, mark: run.mark, signal: controller.signal,
      timing: { pollMs: 70, heartbeatMs: 250 }, clock
    }));
    expect(ids(items).filter((id) => id === "heartbeat").length).toBeGreaterThanOrEqual(3);
    let elapsed = 0;
    for (const ms of clock.sleeps) {
      elapsed += ms;
      expect(ms).toBeLessThanOrEqual(250);
    }
    expect(elapsed).toBeGreaterThanOrEqual(1_000);
  });

  it("ends on the terminal event without another poll", async () => {
    const run = fakeRun([event(1, "run.running"), event(2, "run.terminal")]);
    const items = await collect(tailRunEvents({
      snapshot: run.snapshot, mark: run.mark, signal: new AbortController().signal,
      timing: { pollMs: 100 }, clock: fakeClock()
    }));
    expect(ids(items)).toEqual(["event:1", "event:2"]);
    expect(run.calls.mark).toBe(1);
  });

  it("ends right after the replay when the run is already settled (the settled page's one-shot read)", async () => {
    const run = fakeRun([event(1, "run.running"), event(2)]);
    run.settle();
    const clock = fakeClock();
    const items = await collect(tailRunEvents({
      snapshot: run.snapshot, mark: run.mark, signal: new AbortController().signal, clock
    }));
    expect(ids(items)).toEqual(["event:1", "event:2"]);
    expect(clock.sleeps).toEqual([]);
  });

  it("follows a run that settles while watched for the grace period, then ends", async () => {
    const run = fakeRun([event(1, "run.running")]);
    const clock = fakeClock((now) => {
      if (now === 100) { run.append(event(2)); run.settle(); }
    });
    const items = await collect(tailRunEvents({
      snapshot: run.snapshot, mark: run.mark, signal: new AbortController().signal,
      timing: { pollMs: 100, heartbeatMs: 10_000, settledGraceMs: 500 }, clock
    }));
    expect(ids(items)).toEqual(["event:1", "event:2"]);
    expect(clock.now()).toBe(600);
  });

  it("stops polling the moment the client aborts", async () => {
    const run = fakeRun([event(1, "run.running")]);
    const controller = new AbortController();
    const clock = fakeClock((now) => { if (now === 300) controller.abort(); });
    await collect(tailRunEvents({
      snapshot: run.snapshot, mark: run.mark, signal: controller.signal,
      timing: { pollMs: 100, heartbeatMs: 10_000 }, clock
    }));
    const after = { ...run.calls };
    expect(after.mark).toBe(3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(run.calls).toEqual(after);
  });

  it("ends when the run is no longer the caller's", async () => {
    const run = fakeRun([event(1, "run.running")]);
    const clock = fakeClock((now) => { if (now === 200) { run.disown(); run.append(event(2)); } });
    const items = await collect(tailRunEvents({
      snapshot: run.snapshot, mark: run.mark, signal: new AbortController().signal,
      timing: { pollMs: 100, heartbeatMs: 10_000 }, clock
    }));
    expect(ids(items)).toEqual(["event:1"]);
  });

  it("ends at its life cap (the page reconnects)", async () => {
    const run = fakeRun([event(1, "run.running")]);
    const clock = fakeClock();
    const items = await collect(tailRunEvents({
      snapshot: run.snapshot, mark: run.mark, signal: new AbortController().signal,
      timing: { pollMs: 100, heartbeatMs: 400, maxLifeMs: 1_000 }, clock
    }));
    expect(clock.now()).toBe(1_000);
    expect(ids(items)).toEqual(["event:1", "heartbeat", "heartbeat"]);
  });

  it("never loses an event written between the mark read and the snapshot read", async () => {
    const run = fakeRun([event(1, "run.running")]);
    let marks = 0;
    const racingMark = async (signal: AbortSignal) => {
      const read = await run.mark(signal);
      marks += 1;
      // The writer commits right after this poll's mark was read.
      if (marks === 2) run.append(event(2));
      if (marks === 4) run.append(event(3, "run.terminal"));
      return read;
    };
    const items = await collect(tailRunEvents({
      snapshot: run.snapshot, mark: racingMark, signal: new AbortController().signal,
      timing: { pollMs: 100, heartbeatMs: 10_000 }, clock: fakeClock()
    }));
    expect(ids(items)).toEqual(["event:1", "event:2", "event:3"]);
  });

  // Side-by-side spec §6 (plan C6): a draining process ends every live stream with a clean close; the page reconnects
  // after 5 s and replays (apps/ui/lib/v3/liveEvents.ts), landing on the release that now takes the traffic.
  it("a process already draining sends the replay, then closes without a poll or a heartbeat", async () => {
    const run = fakeRun([event(1, "run.running"), event(2)]);
    const clock = fakeClock();
    const items = await collect(tailRunEvents({
      snapshot: run.snapshot, mark: run.mark, signal: new AbortController().signal,
      timing: { pollMs: 100, heartbeatMs: 10_000 }, clock, draining: () => true
    }));
    expect(ids(items)).toEqual(["event:1", "event:2"]);
    expect(run.calls.mark).toBe(1);
    expect(run.calls.snapshot).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });

  it("a drain that begins after a poll closes the stream at the next poll, before its mark or snapshot read", async () => {
    const run = fakeRun([event(1, "run.running")]);
    let draining = false;
    const mark = async (signal: AbortSignal) => {
      const read = await run.mark(signal);
      if (run.calls.mark === 2) {
        // The first poll has read its mark: SIGTERM arrives, and an event lands that a following tail would send.
        draining = true;
        run.append(event(2));
      }
      return read;
    };
    const clock = fakeClock();
    const items = await collect(tailRunEvents({
      snapshot: run.snapshot, mark, signal: new AbortController().signal,
      timing: { pollMs: 100, heartbeatMs: 10_000 }, clock, draining: () => draining
    }));
    expect(ids(items)).toEqual(["event:1"]);
    expect(clock.sleeps).toEqual([100, 100]);
    expect(run.calls.mark).toBe(2);
    expect(run.calls.snapshot).toBe(1);
  });
});
