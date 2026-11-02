import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { decideAdmission, type AdmissionHold, type ScopeRoom } from "@debateai/budget";
import { OWNER_CONCURRENT_DEBATES, SITE_CONCURRENT_DEBATES, type WaitingRun, type WaitingRunRef } from "@debateai/db";
import {
  AskAlreadyWaitingError,
  AskRoom,
  type AskAdmissionGate,
  type AskRoomLine,
  type AskRoomOptions,
  type AskRoomSpend,
  type RoomQuestion
} from "../../apps/api/src/ask-room.js";
import { PostgresAskAdmissionGate } from "../../apps/api/src/release-state.js";

/**
 * NV-48 (security audit run 3) — ONE ACCOUNT HOLDS AT MOST TWO OF THE SITE'S EIGHT PLACES. With the room composed, the
 * locked decision and the waker's start count the asker's own live debates (a READY or CLAIMED job) on the decision's
 * own transaction, after the release check and before the site count. At the person's share (OWNER_CONCURRENT_DEBATES,
 * a quarter of SITE_CONCURRENT_DEBATES) a further question waits in line as the person's own wait (PERSON_BUSY, recorded
 * PERSON with its recheck at the next whole minute), never as a site-like SITE_BUSY that would hold everyone back; the
 * waker leaves it in line (PERSON_FULL) and records every one of the person's waiting runs again. Over fakes shaped like
 * tests/unit/side-by-side-site-cap.test.ts. Embedded-Postgres proof: tests/integration/owner-concurrent-debates.test.ts.
 */
const NOW = new Date("2026-10-22T10:00:20.000Z");
const NEXT_TICK = new Date("2026-10-22T10:01:00.000Z");
const MIDNIGHT = new Date("2026-10-23T00:00:00.000Z");
const site = (value: ScopeRoom["room"]): ScopeRoom => ({ scope: "SITE_DAY", room: value, resetsAt: MIDNIGHT });

type Extra = Partial<{ siteLineBlocking: boolean; personWaitingCount: number; hold: AdmissionHold | null }>;
const admit = (rooms: readonly ScopeRoom[], extra: Extra = {}) => decideAdmission({
  rooms, siteLineBlocking: false, personWaitingCount: 0, waitingLinePerPerson: 1, nextTickAt: NEXT_TICK, ...extra
});

describe("NV-48 decideAdmission's PERSON_BUSY hold", () => {
  it("with every room FITS: WAIT for the next tick on the site's day, the hold named as the cause", () => {
    expect(admit([site("FITS")], { hold: "PERSON_BUSY" }))
      .toEqual({ kind: "WAIT", waitsUntil: NEXT_TICK, worstScope: "SITE_DAY", cause: "PERSON_BUSY" });
  });

  it("a person who already has their waiting question is refused, as for any wait", () => {
    expect(admit([site("FITS")], { hold: "PERSON_BUSY", personWaitingCount: 1 })).toEqual({ kind: "REFUSE_ALREADY_WAITING" });
  });

  it("with the site's day FULL: the day's own wait, and no cause", () => {
    expect(admit([site("FULL")], { hold: "PERSON_BUSY" })).toEqual({ kind: "WAIT", waitsUntil: MIDNIGHT, worstScope: "SITE_DAY" });
  });
});

const SITE_LOCK = "site-lock:SELECT pg_advisory_xact_lock(hashtextextended('debateai.site_concurrent_debates', 0))";
const RELEASE = ["r17", "0123456789ab"].join("-");
const CLASS = Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 });
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const question = (ownerRef: string): RoomQuestion =>
  Object.freeze({ access: Object.freeze({ ownerRef, legacyAskerId: null }), settingsClass: CLASS });
const LEGACY: RoomQuestion = Object.freeze({
  access: Object.freeze({ ownerRef: null, legacyAskerId: `legacy:${randomUUID()}` }), settingsClass: CLASS
});

function waitingRun(input: Partial<WaitingRun> = {}): WaitingRun {
  return Object.freeze({
    runId: randomUUID(), waitingSince: new Date("2026-10-22T09:00:00.000Z"), releaseKey: RELEASE,
    ownerRef: null, legacyAskerId: `legacy:${randomUUID()}`,
    planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2,
    waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-10-22T09:00:00.000Z"),
    ...input
  });
}

type Arrange = {
  current?: boolean;
  /** Each owner's live debates (a READY or CLAIMED job); a START adds one for its asker. */
  live?: Readonly<Record<string, number>>;
  /** Live debates of people this case never asks for. */
  otherLive?: number;
  /** The waiting runs of each owner already in line, oldest first. */
  waiting?: Readonly<Record<string, readonly WaitingRun[]>>;
  /** Other runs in line (a legacy asker's). */
  line?: readonly WaitingRun[];
  waitingLinePerPerson?: number;
  /** false: a gate without the person's share (every gate before NV-48). */
  ownerMembers?: false;
};

function arrange(input: Arrange = {}) {
  const asked: string[] = [];
  const tx = {
    query: vi.fn(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("debateai.site_concurrent_debates")) asked.push(`site-lock:${sql}`);
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn()
  };
  const live = new Map<string, number>(Object.entries(input.live ?? {}));
  const otherLive = input.otherLive ?? 0;
  const runs = new Map<string, WaitingRun>();
  const waiting = new Map<string, WaitingRunRef[]>();
  for (const [ownerRef, list] of Object.entries(input.waiting ?? {})) {
    waiting.set(ownerRef, list.map((run) => Object.freeze({ runId: run.runId, waitingSince: run.waitingSince })));
    for (const run of list) runs.set(run.runId, run);
  }
  for (const run of input.line ?? []) runs.set(run.runId, run);
  const ownerCounts: string[] = [];
  const ownerLineReads: string[] = [];
  const base: AskAdmissionGate = {
    releaseKey: RELEASE,
    siteConcurrentDebates: 8,
    ownReleaseIsCurrent: async (executor) => {
      asked.push(executor === (tx as unknown) ? "current:tx" : "current:other");
      return input.current ?? true;
    },
    activeDebates: async (executor) => {
      asked.push(executor === (tx as unknown) ? "active:tx" : "active:other");
      return [...live.values()].reduce((sum, count) => sum + count, otherLive);
    }
  };
  const gate: AskAdmissionGate = input.ownerMembers === false ? base : {
    ...base,
    ownerConcurrentDebates: 2,
    ownerActiveDebates: async (executor, ownerRef) => {
      asked.push(executor === (tx as unknown) ? "owner:tx" : "owner:other");
      ownerCounts.push(ownerRef);
      return live.get(ownerRef) ?? 0;
    }
  };
  const holds: string[] = [];
  const reasons: unknown[] = [];
  const started: string[] = [];
  const spend: AskRoomSpend = {
    readDaySpentMicros: async () => 0,
    readSiteCountedHoldsMicros: async () => 0,
    readOwnerSpentMicros: async () => 0,
    readOwnerCountedHoldsMicros: async () => 0,
    openHold: async (_client, hold) => { holds.push(hold.runId); }
  };
  const line: AskRoomLine = {
    siteLineBlocking: async () => false,
    wakeCandidates: async () => [],
    waitingForOwner: async (ownerRef) => {
      ownerLineReads.push(ownerRef);
      return Object.freeze([...(waiting.get(ownerRef) ?? [])]);
    },
    waitingForLegacyAsker: async () => [],
    readWaiting: async (runId) => runs.get(runId) ?? null,
    isWaiting: async (_executor, runId) => {
      asked.push("isWaiting");
      return runs.has(runId) || [...waiting.values()].some((list) => list.some((ref) => ref.runId === runId));
    },
    enterWait: async () => {},
    recordReason: async (_client, runId, reason) => { reasons.push({ runId, ...reason }); },
    markStarted: async (_client, runId) => { started.push(runId); }
  };
  const options: AskRoomOptions = {
    lockPool: { connect: vi.fn(async () => tx) } as unknown as Pool,
    spend,
    line,
    estimator: { estimateMicros: async () => 1_000 },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: 100_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: input.waitingLinePerPerson ?? 1,
    clock: () => NOW,
    gate
  };
  const room = new AskRoom(options);
  /**
   * One locked decision for `ownerRef`. A START stands in for `enqueueOn` of a READY first job (one more live debate
   * for the asker); a WAIT enters `runId` in line through the room, as `#submitWithRoom` does.
   */
  const decideAs = async (who: RoomQuestion, runId: string = randomUUID()) => {
    asked.length = 0;
    return room.decide(who, async ({ admission, now, tx: decisionTx }) => {
      const ownerRef = who.access.ownerRef;
      if (admission.kind === "START" && ownerRef !== null) live.set(ownerRef, (live.get(ownerRef) ?? 0) + 1);
      if (admission.kind === "WAIT") {
        await room.enterWait(decisionTx, runId, now);
        if (ownerRef !== null) waiting.set(ownerRef, [...(waiting.get(ownerRef) ?? []), Object.freeze({ runId, waitingSince: now })]);
      }
      return admission;
    });
  };
  return { room, options, asked, holds, reasons, started, live, ownerCounts, ownerLineReads, decideAs };
}

const personWait = (runId: string) => ({ runId, waitsFor: "PERSON", personRecheckAt: NEXT_TICK, at: NOW });
const enqueue = async () => "work-item";

describe("NV-48 the locked decision counts the asker's own live debates", () => {
  it("one account holds at most two of the eight places; the others share the rest; the ninth asker waits on the site", async () => {
    const { decideAs, reasons, live } = arrange();
    expect(await decideAs(question(A))).toEqual(expect.objectContaining({ kind: "START" }));
    expect(await decideAs(question(A))).toEqual(expect.objectContaining({ kind: "START" }));
    const third = randomUUID();
    expect(await decideAs(question(A), third))
      .toEqual({ kind: "WAIT", waitsUntil: NEXT_TICK, worstScope: "SITE_DAY", cause: "PERSON_BUSY" });
    expect(reasons).toEqual([personWait(third)]);
    await expect(decideAs(question(A))).rejects.toBeInstanceOf(AskAlreadyWaitingError);
    expect(live.get(A)).toBe(2);

    for (const owner of [B, C, D]) {
      expect(await decideAs(question(owner))).toEqual(expect.objectContaining({ kind: "START" }));
      expect(await decideAs(question(owner))).toEqual(expect.objectContaining({ kind: "START" }));
    }
    expect([...live.values()].reduce((sum, count) => sum + count, 0)).toBe(8);
    const ninth = randomUUID();
    expect(await decideAs(question(E), ninth))
      .toEqual({ kind: "WAIT", waitsUntil: NEXT_TICK, worstScope: "SITE_DAY", cause: "SITE_BUSY" });
    expect(reasons).toEqual([personWait(third), { runId: ninth, waitsFor: "SITE_BUSY", personRecheckAt: null, at: NOW }]);
  });

  it("asks the person's count after the release check and before the site's lock and count, on its own client", async () => {
    const { decideAs, asked } = arrange();
    await decideAs(question(A));
    expect(asked).toEqual(["current:tx", "owner:tx", SITE_LOCK, "active:tx"]);
    await decideAs(question(A));
    await decideAs(question(A));
    expect(asked).toEqual(["current:tx", "owner:tx"]);

    const switching = arrange({ current: false, live: { [A]: 2 } });
    await switching.decideAs(question(A));
    expect(switching.asked).toEqual(["current:tx"]);
    expect(switching.ownerCounts).toEqual([]);
  });

  it("a person at their share on a full site is the person's own wait, never SITE_BUSY", async () => {
    const { decideAs, reasons, asked } = arrange({ live: { [A]: 2 }, otherLive: 6 });
    const runId = randomUUID();
    expect(await decideAs(question(A), runId))
      .toEqual({ kind: "WAIT", waitsUntil: NEXT_TICK, worstScope: "SITE_DAY", cause: "PERSON_BUSY" });
    expect(reasons).toEqual([personWait(runId)]);
    expect(asked).toEqual(["current:tx", "owner:tx"]);
  });

  it("a legacy asker (no owner ref) is never counted", async () => {
    const { decideAs, asked, ownerCounts } = arrange({ otherLive: 7 });
    expect(await decideAs(LEGACY)).toEqual(expect.objectContaining({ kind: "START" }));
    expect(asked).toEqual(["current:tx", SITE_LOCK, "active:tx"]);
    expect(ownerCounts).toEqual([]);
  });

  it("with two waiting questions allowed: both wait as the person's own, and the next is refused", async () => {
    const { decideAs, reasons } = arrange({ live: { [A]: 2 }, waitingLinePerPerson: 2 });
    const w1 = randomUUID();
    const w2 = randomUUID();
    expect(await decideAs(question(A), w1)).toEqual(expect.objectContaining({ kind: "WAIT", cause: "PERSON_BUSY" }));
    expect(await decideAs(question(A), w2)).toEqual(expect.objectContaining({ kind: "WAIT", cause: "PERSON_BUSY" }));
    await expect(decideAs(question(A))).rejects.toBeInstanceOf(AskAlreadyWaitingError);
    expect(reasons).toEqual([personWait(w1), personWait(w2)]);
  });
});

describe("NV-48 the waker's start counts the owner's live debates too", () => {
  it("an owner at their share: PERSON_FULL, recorded PERSON for the next tick, no hold and no start", async () => {
    const run = waitingRun({ ownerRef: A, legacyAskerId: null });
    const { room, asked, reasons, holds, started } = arrange({ live: { [A]: 2 }, waiting: { [A]: [run] } });
    expect(await room.startWaiting(run, enqueue)).toEqual({ kind: "PERSON_FULL" });
    expect(reasons).toEqual([personWait(run.runId)]);
    expect([holds, started]).toEqual([[], []]);
    expect(asked).toEqual(["current:tx", "isWaiting", "owner:tx"]);
  });

  it("one place of theirs free: the run starts, the site counted after the person", async () => {
    const run = waitingRun({ ownerRef: A, legacyAskerId: null, waitsFor: "PERSON", personRecheckAt: NOW });
    const { room, asked, holds, started } = arrange({ live: { [A]: 1 }, waiting: { [A]: [run] } });
    expect(await room.startWaiting(run, enqueue)).toEqual({ kind: "STARTED", runId: run.runId, value: "work-item" });
    expect(asked.slice(-3)).toEqual(["owner:tx", SITE_LOCK, "active:tx"]);
    expect([holds, started]).toEqual([[run.runId], [run.runId]]);
  });

  it("two waiting runs at the share: the start of one records PERSON afresh for both (the waker skips the other)", async () => {
    const w1 = waitingRun({ ownerRef: A, legacyAskerId: null, waitsFor: "PERSON", personRecheckAt: NOW });
    const w2 = waitingRun({
      ownerRef: A, legacyAskerId: null, waitsFor: "PERSON", personRecheckAt: NOW,
      waitingSince: new Date("2026-10-22T09:30:00.000Z")
    });
    const { room, reasons, holds, started } = arrange({ live: { [A]: 2 }, waiting: { [A]: [w1, w2] }, waitingLinePerPerson: 2 });
    expect(await room.startWaiting(w1, enqueue)).toEqual({ kind: "PERSON_FULL" });
    expect(reasons).toEqual([personWait(w1.runId), personWait(w2.runId)]);
    expect([holds, started]).toEqual([[], []]);
  });

  it("a legacy asker's waiting run never asks the person's count or the owner's line", async () => {
    const run = waitingRun();
    const { room, ownerCounts, ownerLineReads } = arrange({ otherLive: 2, line: [run] });
    expect(await room.startWaiting(run, enqueue)).toEqual(expect.objectContaining({ kind: "STARTED" }));
    expect(ownerCounts).toEqual([]);
    expect(ownerLineReads).toEqual([]);
  });
});

describe("NV-48 the room's options", () => {
  const gateOf = (extra: Partial<AskAdmissionGate>): AskAdmissionGate => ({
    releaseKey: RELEASE,
    siteConcurrentDebates: 8,
    ownReleaseIsCurrent: async () => true,
    activeDebates: async () => 0,
    ...extra
  });
  const count = async () => 0;

  it("refuses a share without its count, a count without its share, and a share outside 1..the site's cap", () => {
    const { options } = arrange();
    for (const gate of [
      gateOf({ ownerConcurrentDebates: 2 }),
      gateOf({ ownerActiveDebates: count }),
      gateOf({ ownerConcurrentDebates: 0, ownerActiveDebates: count }),
      gateOf({ ownerConcurrentDebates: 9, ownerActiveDebates: count }),
      gateOf({ ownerConcurrentDebates: 1.5, ownerActiveDebates: count })
    ]) {
      expect(() => new AskRoom({ ...options, gate })).toThrowError("ASK_ROOM_OPTIONS_INVALID");
    }
    expect(() => new AskRoom({ ...options, gate: gateOf({ ownerConcurrentDebates: 8, ownerActiveDebates: count }) })).not.toThrow();
  });

  it("a gate with neither decides as before: no person's share", async () => {
    const { decideAs, asked } = arrange({ ownerMembers: false });
    for (let index = 0; index < 3; index += 1) {
      expect(await decideAs(question(A))).toEqual(expect.objectContaining({ kind: "START" }));
      expect(asked).toEqual(["current:tx", SITE_LOCK, "active:tx"]);
    }
  });
});

describe("NV-48 the constant and the production gate", () => {
  it("the share is a quarter of the site's places: 2 of 8", () => {
    expect(OWNER_CONCURRENT_DEBATES).toBe(2);
    expect(OWNER_CONCURRENT_DEBATES).toBe(Math.floor(SITE_CONCURRENT_DEBATES / 4));
  });

  it("PostgresAskAdmissionGate carries the share by default, at most the site's cap, and refuses one outside 1..cap", () => {
    const gate = new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false });
    expect(gate.ownerConcurrentDebates).toBe(OWNER_CONCURRENT_DEBATES);
    expect(typeof gate.ownerActiveDebates).toBe("function");
    expect(new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false, siteConcurrentDebates: 1 }).ownerConcurrentDebates).toBe(1);
    for (const ownerConcurrentDebates of [0, 9]) {
      expect(() => new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false, ownerConcurrentDebates }))
        .toThrowError("ASK_ADMISSION_GATE_INVALID");
    }
  });

  it("the count is one statement with the owner as its only parameter, and refuses an answer that is not a count", async () => {
    const gate = new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false });
    const calls: unknown[][] = [];
    const executor = (active: number) => ({
      query: async (sql: string, values: unknown[]) => {
        calls.push([sql, values]);
        return { rows: [{ active }] };
      }
    });
    expect(await gate.ownerActiveDebates(executor(2) as never, A)).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual([A]);
    expect(String(calls[0]?.[0])).toContain("work.state IN ('READY','CLAIMED')");
    await expect(gate.ownerActiveDebates(executor(-1) as never, A)).rejects.toThrowError("ASK_ADMISSION_GATE_COUNT_INVALID");
  });
});
