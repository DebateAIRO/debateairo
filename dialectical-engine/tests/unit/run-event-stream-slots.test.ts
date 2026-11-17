/**
 * Security fixes run 3 (NV-20): the in-process slot counter that caps live run-event streams at
 * `RUN_EVENT_STREAM_LIMITS.perSession` (4) per sign-in session and `perOwner` (8) per account across its sessions.
 * Before the fix nothing in apps/api/src counted open streams, so one session could hold hundreds, each running a
 * session check every 250 ms on the authorization pool.
 */
import { describe, expect, it } from "vitest";
import {
  RUN_EVENT_STREAM_LIMITS,
  RUN_EVENT_STREAM_REFUSAL,
  RunEventStreamSlots
} from "../../apps/api/src/run-event-streams.js";

type Slot = Readonly<{ release(): void }>;

function slot(opened: ReturnType<RunEventStreamSlots["open"]>): Slot {
  if (typeof opened === "string") throw new Error(`expected a slot, got ${opened}`);
  return opened;
}

describe("run-event stream slots (NV-20)", () => {
  it("caps a session at 4 and an account at 8, reached from a third session; a release frees a slot", () => {
    expect(RUN_EVENT_STREAM_LIMITS).toEqual({ perSession: 4, perOwner: 8 });
    expect(RUN_EVENT_STREAM_REFUSAL).toEqual({ retryAfterSeconds: 30 });
    const slots = new RunEventStreamSlots();
    const a = { sessionId: "session:a", ownerRef: "owner:1" };
    const b = { sessionId: "session:b", ownerRef: "owner:1" };
    const c = { sessionId: "session:c", ownerRef: "owner:1" };
    const onA = [0, 1, 2, 3].map(() => slot(slots.open(a)));
    expect(slots.open(a)).toBe("SESSION_STREAMS");
    const onB = [0, 1, 2, 3].map(() => slot(slots.open(b)));
    expect(slots.open(b)).toBe("SESSION_STREAMS");
    // Two full sessions hold the owner's 8: the first open on a third session meets the owner cap.
    expect(slots.open(c)).toBe("OWNER_STREAMS");
    expect(slots.held()).toEqual({ sessions: 2, owners: 1 });

    // Another owner is unaffected.
    const other = slot(slots.open({ sessionId: "session:other", ownerRef: "owner:2" }));
    expect(slots.held()).toEqual({ sessions: 3, owners: 2 });

    onA[0]!.release();
    const onC = slot(slots.open(c));
    expect(slots.open(c)).toBe("OWNER_STREAMS");

    for (const held of [...onA.slice(1), ...onB, onC, other]) held.release();
    expect(slots.held()).toEqual({ sessions: 0, owners: 0 });
  });

  it("a refused open changes no count", () => {
    const slots = new RunEventStreamSlots({ perSession: 1, perOwner: 1 });
    const first = slot(slots.open({ sessionId: "s1", ownerRef: "o1" }));
    expect(slots.open({ sessionId: "s1", ownerRef: "o1" })).toBe("SESSION_STREAMS");
    expect(slots.open({ sessionId: "s2", ownerRef: "o1" })).toBe("OWNER_STREAMS");
    // The refused opens did not count s2: once the owner's slot is free, s2 opens.
    expect(slots.held()).toEqual({ sessions: 1, owners: 1 });
    first.release();
    slot(slots.open({ sessionId: "s2", ownerRef: "o1" })).release();
    expect(slots.held()).toEqual({ sessions: 0, owners: 0 });
  });

  it("release() twice frees one slot only", () => {
    const slots = new RunEventStreamSlots({ perSession: 2, perOwner: 8 });
    const key = { sessionId: "session:twice", ownerRef: "owner:twice" };
    const first = slot(slots.open(key));
    const second = slot(slots.open(key));
    expect(slots.open(key)).toBe("SESSION_STREAMS");
    first.release();
    first.release();
    // Only one slot came free: one more open fits, a second does not.
    const third = slot(slots.open(key));
    expect(slots.open(key)).toBe("SESSION_STREAMS");
    second.release();
    third.release();
    third.release();
    expect(slots.held()).toEqual({ sessions: 0, owners: 0 });
  });

  it("refuses limits that are not positive safe integers", () => {
    for (const limits of [
      { perSession: 0, perOwner: 8 },
      { perSession: 4, perOwner: 0 },
      { perSession: -1, perOwner: 8 },
      { perSession: 1.5, perOwner: 8 },
      { perSession: 4, perOwner: Number.NaN },
      { perSession: Number.POSITIVE_INFINITY, perOwner: 8 },
      { perSession: 4, perOwner: Number.MAX_SAFE_INTEGER + 1 }
    ]) {
      expect(() => new RunEventStreamSlots(limits), JSON.stringify(limits)).toThrow(
        new TypeError("RUN_EVENT_STREAM_LIMITS_INVALID")
      );
    }
  });
});
