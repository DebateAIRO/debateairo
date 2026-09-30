import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import type { PersonWindow } from "@debateai/budget";
import type { WaitingRun, WaitingRunRef } from "@debateai/db";
import {
  AskAlreadyWaitingError,
  AskRoom,
  nextUtcMidnight,
  nextWholeMinute,
  type AskRoomEntitlements,
  type AskRoomLine,
  type AskRoomSpend
} from "../../apps/api/src/ask-room.js";

const NOW = new Date("2026-09-30T18:00:20.000Z");
const MIDNIGHT = new Date("2026-10-01T00:00:00.000Z");
const NEXT_MINUTE = new Date("2026-09-30T18:01:00.000Z");
const OWNER = "44444444-4444-4444-8444-444444444444";
const CLASS = Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 });
const MINE = Object.freeze({ access: Object.freeze({ ownerRef: OWNER, legacyAskerId: null }), settingsClass: CLASS });
const DAY_RESET = new Date("2026-10-01T09:00:00.000Z");
const WEEK_RESET = new Date("2026-10-04T09:00:00.000Z");
const MONTH_RESET = new Date("2026-10-29T09:00:00.000Z");

type Ledger = {
  daySpent: number;
  siteHolds: number;
  ownerSpent: Readonly<Record<string, number>>;
  ownerHolds: Readonly<Record<string, number>>;
};

function lockPool() {
  const statements: string[] = [];
  const query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
    statements.push(text.includes("pg_advisory_xact_lock") ? `LOCK:${String(values[0])}` : text);
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  return { pool: { connect: vi.fn(async () => client) } as unknown as Pool, statements };
}

function window(scope: PersonWindow["scope"], limitMicros: number, resetsAt: Date): PersonWindow {
  return Object.freeze({
    scope, limitMicros, periodStart: new Date("2026-09-29T09:00:00.000Z"), resetsAt,
    finishBasisPoints: 11_000, closeBasisPoints: 9_500
  });
}

function waitingRun(input: Partial<WaitingRun> = {}): WaitingRun {
  return Object.freeze({
    runId: randomUUID(), waitingSince: new Date("2026-09-30T17:00:00.000Z"),
    ownerRef: null, legacyAskerId: `legacy:${randomUUID()}`,
    planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2,
    waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-09-30T17:00:00.000Z"),
    ...input
  });
}

function arrange(input: {
  readonly ledger?: Partial<Ledger>;
  readonly windows?: Readonly<Record<string, readonly PersonWindow[]>>;
  readonly line?: readonly WaitingRun[];
  /** What the line's one question answers: does any waiting run hold a new question back? */
  readonly blocking?: boolean;
  readonly mine?: readonly WaitingRunRef[];
  readonly estimate?: number;
  readonly entitlements?: AskRoomEntitlements | null;
  readonly clock?: () => Date;
} = {}) {
  const ledger: Ledger = { daySpent: 0, siteHolds: 0, ownerSpent: {}, ownerHolds: {}, ...input.ledger };
  const holds: Array<Readonly<{ runId: string; heldMicros: number }>> = [];
  const entered: string[] = [];
  const reasons: unknown[] = [];
  const daysRead: string[] = [];
  const questions = { line: 0 };
  const spend: AskRoomSpend = {
    readDaySpentMicros: async (day) => {
      daysRead.push(day);
      return ledger.daySpent;
    },
    readSiteCountedHoldsMicros: async () => ledger.siteHolds,
    readOwnerSpentMicros: async (ownerRef) => ledger.ownerSpent[ownerRef] ?? 0,
    readOwnerCountedHoldsMicros: async (ownerRef) => ledger.ownerHolds[ownerRef] ?? 0,
    openHold: async (_client, hold) => { holds.push(hold); }
  };
  const line: AskRoomLine = {
    siteLineBlocking: async () => {
      questions.line += 1;
      return input.blocking ?? false;
    },
    waitingForOwner: async () => input.mine ?? [],
    waitingForLegacyAsker: async () => input.mine ?? [],
    readWaiting: async (runId) => (input.line ?? []).find((run) => run.runId === runId) ?? null,
    isWaiting: async (_executor, runId) => (input.line ?? []).some((run) => run.runId === runId),
    enterWait: async (_client, runId) => { entered.push(runId); },
    recordReason: async (_client, runId, reason) => { reasons.push({ runId, ...reason }); },
    markStarted: async () => undefined
  };
  const lock = lockPool();
  const room = new AskRoom({
    lockPool: lock.pool,
    spend,
    line,
    estimator: { estimateMicros: async () => input.estimate ?? 1_000 },
    personAllowance: { read: async (ownerRef) => input.windows?.[ownerRef] ?? [] },
    entitlements: input.entitlements ?? null,
    dailyCeilingMicros: 100_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: input.clock ?? (() => NOW)
  });
  return { room, lock, holds, entered, reasons, daysRead, questions };
}

const decisionOf = (room: AskRoom) => room.decide(MINE, async ({ admission, estimateMicros, now }) => ({
  admission, estimateMicros, now
}));

/** Decides MINE, which must wait, and takes the place in line the way B6b does. */
const waitIn = (room: AskRoom) => room.decide(MINE, async ({ admission, now, tx }) => {
  if (admission.kind !== "WAIT") throw new Error("test: this question must wait");
  await room.enterWait(tx, "run:waiting", now);
  return admission;
});

describe("B6a the room decision: the site's day", () => {
  it("STARTs with the estimate to hold, under the day lock then the person lock, in one transaction", async () => {
    const { room, lock } = arrange();
    await expect(decisionOf(room)).resolves.toEqual({
      admission: { kind: "START", worst: "FITS", worstScope: null }, estimateMicros: 1_000, now: NOW
    });
    expect(lock.statements).toEqual(["BEGIN", "LOCK:2026-09-30", `LOCK:${OWNER}`, "COMMIT"]);
  });

  it("takes no person lock for a legacy asker", async () => {
    const { room, lock } = arrange();
    await room.decide({ access: { ownerRef: null, legacyAskerId: "legacy:a" }, settingsClass: CLASS }, async () => 1);
    expect(lock.statements).toEqual(["BEGIN", "LOCK:2026-09-30", "COMMIT"]);
  });

  it("WAITs until the next UTC midnight once the day's spend and its live holds reach the limit", async () => {
    const { room } = arrange({ ledger: { daySpent: 1_000, siteHolds: 99_000 } });
    await expect(decisionOf(room)).resolves.toMatchObject({
      admission: { kind: "WAIT", waitsUntil: MIDNIGHT, worstScope: "SITE_DAY" }
    });
  });

  it("rolls the transaction back and rethrows when the step inside fails", async () => {
    const { room, lock } = arrange();
    await expect(room.decide(MINE, async () => { throw new Error("test: startRun failed"); }))
      .rejects.toThrow("test: startRun failed");
    expect(lock.statements.at(-1)).toBe("ROLLBACK");
  });

  it("decides a question that waited for the lock across midnight on the NEW day, measured then", async () => {
    // The first read names the day to lock; the day has turned by the time the lock is held.
    const instants = [
      new Date("2026-09-30T23:59:59.900Z"),
      new Date("2026-10-01T00:00:00.100Z"),
      new Date("2026-10-01T00:00:00.200Z"),
      new Date("2026-10-01T00:00:00.300Z")
    ];
    let read = 0;
    const { room, lock, daysRead } = arrange({
      ledger: { daySpent: 100_000 },
      clock: () => instants[Math.min(read++, instants.length - 1)]!
    });
    await expect(decisionOf(room)).resolves.toMatchObject({
      admission: { kind: "WAIT", waitsUntil: new Date("2026-10-02T00:00:00.000Z"), worstScope: "SITE_DAY" },
      now: new Date("2026-10-01T00:00:00.300Z")
    });
    expect(lock.statements).toEqual([
      "BEGIN", "LOCK:2026-09-30", `LOCK:${OWNER}`, "ROLLBACK",
      "BEGIN", "LOCK:2026-10-01", `LOCK:${OWNER}`, "COMMIT"
    ]);
    // Nothing was measured under the old day's key.
    expect(daysRead).toEqual(["2026-10-01"]);
  });
});

describe("B6a one waiting question per person, and no line-jumping", () => {
  it("refuses a question that must wait while this person already has one waiting", async () => {
    const waiting = { runId: randomUUID(), waitingSince: new Date("2026-09-30T12:00:00.000Z") };
    const { room } = arrange({ ledger: { daySpent: 100_000 }, mine: [waiting] });
    const refusal = await room.precheck(MINE).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(AskAlreadyWaitingError);
    expect(refusal).toMatchObject({ code: "ASK_ALREADY_WAITING", runRef: waiting.runId, waitsUntil: MIDNIGHT });
  });

  it("lets a person with a waiting question START another that nothing makes wait", async () => {
    const { room } = arrange({ mine: [{ runId: randomUUID(), waitingSince: NOW }] });
    await expect(room.precheck(MINE)).resolves.toMatchObject({ admission: { kind: "START" } });
    await expect(decisionOf(room)).resolves.toMatchObject({ admission: { kind: "START" } });
  });

  it("hands back what the unlocked first look measured: the admission, the estimate, each window's use and the wait reason", async () => {
    const { room, lock } = arrange({
      windows: { [OWNER]: [window("PERSON_DAY", 1_000, DAY_RESET), window("PERSON_MONTH", 5_000, MONTH_RESET)] },
      ledger: { ownerSpent: { [OWNER]: 300 }, ownerHolds: { [OWNER]: 200 } },
      estimate: 100
    });
    await expect(room.precheck(MINE)).resolves.toEqual({
      admission: { kind: "START", worst: "FITS", worstScope: null },
      estimateMicros: 100,
      now: NOW,
      personUses: [
        { scope: "PERSON_DAY", limitMicros: 1_000, usedMicros: 500, resetsAt: DAY_RESET, closeBasisPoints: 9_500 },
        { scope: "PERSON_MONTH", limitMicros: 5_000, usedMicros: 500, resetsAt: MONTH_RESET, closeBasisPoints: 9_500 }
      ],
      // No person window is FULL, so a question so measured would wait only for the site.
      waitReason: { waitsFor: "SITE", personRecheckAt: null }
    });
    // Unlocked: the first look takes no lock and opens no transaction.
    expect(lock.statements).toEqual([]);
  });

  it("measures no person window for a legacy asker", async () => {
    const { room } = arrange();
    await expect(room.precheck({ access: { ownerRef: null, legacyAskerId: "legacy:a" }, settingsClass: CLASS }))
      .resolves.toMatchObject({ personUses: [] });
  });

  it("asks the line ONE question — never a walk of it — and none when a scope is already FULL", async () => {
    const open = arrange();
    await decisionOf(open.room);
    await open.room.precheck(MINE);
    expect(open.questions.line).toBe(2);
    const full = arrange({ ledger: { daySpent: 100_000 } });
    await decisionOf(full.room);
    expect(full.questions.line).toBe(0);
  });

  it("STARTs when the line holds only runs whose own persons are full (the line answers no)", async () => {
    const { room } = arrange({ blocking: false });
    await expect(decisionOf(room)).resolves.toMatchObject({ admission: { kind: "START" } });
  });

  it("makes a new question wait for the next tick behind a run that waits for the site", async () => {
    const { room } = arrange({ blocking: true });
    await expect(decisionOf(room)).resolves.toMatchObject({
      admission: { kind: "WAIT", waitsUntil: NEXT_MINUTE, worstScope: "SITE_DAY" }
    });
  });
});

describe("B6a the person's windows (paid-plans spec §2.4.1)", () => {
  it("waits until the latest reset among the FULL windows, which names the wait", async () => {
    const { room } = arrange({
      windows: { [OWNER]: [
        window("PERSON_DAY", 1_000, DAY_RESET),
        window("PERSON_WEEK", 2_500, WEEK_RESET),
        window("PERSON_MONTH", 5_000, MONTH_RESET)
      ] },
      ledger: { ownerSpent: { [OWNER]: 2_500 }, daySpent: 100_000 }
    });
    // Day and week are FULL (2 500 ≥ 1 000, ≥ 2 500); the month is not; the site's midnight is earlier.
    await expect(decisionOf(room)).resolves.toMatchObject({
      admission: { kind: "WAIT", waitsUntil: WEEK_RESET, worstScope: "PERSON_WEEK" }
    });
  });

  it("counts the person's live holds against every window", async () => {
    const { room } = arrange({
      windows: { [OWNER]: [window("PERSON_DAY", 1_000, DAY_RESET)] },
      ledger: { ownerHolds: { [OWNER]: 1_000 } }
    });
    await expect(decisionOf(room)).resolves.toMatchObject({
      admission: { kind: "WAIT", waitsUntil: DAY_RESET, worstScope: "PERSON_DAY" }
    });
  });

  it("A5: Free, whose cold-start estimate is above its whole month, still STARTS as CLOSE", async () => {
    const { room } = arrange({
      windows: { [OWNER]: [window("PERSON_MONTH", 200_000, MONTH_RESET)] },
      estimate: 360_000
    });
    await expect(decisionOf(room)).resolves.toMatchObject({
      admission: { kind: "START", worst: "CLOSE", worstScope: "PERSON_MONTH" }, estimateMicros: 360_000
    });
  });
});

describe("B6a why a WAIT waits, written with its place in line (budget spec §2.3 rule 1)", () => {
  it("records a question that waits for the site's day, or for the line, as SITE", async () => {
    for (const arranged of [arrange({ ledger: { daySpent: 100_000 } }), arrange({ blocking: true })]) {
      await waitIn(arranged.room);
      expect(arranged.entered).toEqual(["run:waiting"]);
      expect(arranged.reasons).toEqual([{ runId: "run:waiting", waitsFor: "SITE", personRecheckAt: null, at: NOW }]);
    }
  });

  it("records a person full on their own spend as PERSON, looked at again when the LATEST such window resets", async () => {
    const { room, reasons } = arrange({
      windows: { [OWNER]: [
        window("PERSON_DAY", 1_000, DAY_RESET),
        window("PERSON_WEEK", 2_500, WEEK_RESET),
        window("PERSON_MONTH", 5_000, MONTH_RESET)
      ] },
      // The site's day is full too: a full site makes every new question wait by itself, so the run is the person's.
      ledger: { ownerSpent: { [OWNER]: 2_500 }, daySpent: 100_000 }
    });
    await waitIn(room);
    expect(reasons).toEqual([{ runId: "run:waiting", waitsFor: "PERSON", personRecheckAt: WEEK_RESET, at: NOW }]);
  });

  it("records a person full only because of their own live holds as PERSON, looked at again at the next tick", async () => {
    const { room, reasons } = arrange({
      windows: { [OWNER]: [window("PERSON_DAY", 1_000, DAY_RESET), window("PERSON_MONTH", 5_000, MONTH_RESET)] },
      ledger: { ownerSpent: { [OWNER]: 400 }, ownerHolds: { [OWNER]: 600 } }
    });
    await waitIn(room);
    // The day is full only with the running debate's hold, which ends with that debate, not at a reset.
    expect(reasons).toEqual([{ runId: "run:waiting", waitsFor: "PERSON", personRecheckAt: NEXT_MINUTE, at: NOW }]);
  });

  it("hands the unlocked first look the same reason the decision records (S2 plans a wait for its recheck instant)", async () => {
    const onSpend = arrange({
      windows: { [OWNER]: [
        window("PERSON_DAY", 1_000, DAY_RESET),
        window("PERSON_WEEK", 2_500, WEEK_RESET),
        window("PERSON_MONTH", 5_000, MONTH_RESET)
      ] },
      ledger: { ownerSpent: { [OWNER]: 2_500 } }
    });
    await expect(onSpend.room.precheck(MINE)).resolves.toMatchObject({
      admission: { kind: "WAIT", waitsUntil: WEEK_RESET, worstScope: "PERSON_WEEK" },
      waitReason: { waitsFor: "PERSON", personRecheckAt: WEEK_RESET }
    });
    const onHolds = arrange({
      windows: { [OWNER]: [window("PERSON_DAY", 1_000, DAY_RESET), window("PERSON_MONTH", 5_000, MONTH_RESET)] },
      ledger: { ownerSpent: { [OWNER]: 400 }, ownerHolds: { [OWNER]: 600 } }
    });
    // Full only on the person's own live hold: the recheck is the next minute, long before the day's reset.
    await expect(onHolds.room.precheck(MINE)).resolves.toMatchObject({
      admission: { kind: "WAIT", waitsUntil: DAY_RESET, worstScope: "PERSON_DAY" },
      waitReason: { waitsFor: "PERSON", personRecheckAt: NEXT_MINUTE }
    });
    await waitIn(onHolds.room);
    expect(onHolds.reasons).toEqual([{ runId: "run:waiting", waitsFor: "PERSON", personRecheckAt: NEXT_MINUTE, at: NOW }]);
    // The first look wrote nothing: the reason is recorded only with a place in line.
    expect(onSpend.reasons).toEqual([]);
  });

  it("writes no place in line outside a decision", async () => {
    const { room } = arrange();
    await expect(room.enterWait({} as PoolClient, "run:stray", NOW)).rejects.toThrow("ASK_ROOM_WAIT_OUTSIDE_DECISION");
  });
});

describe("B6a what a START writes, and a waiting run's expected start", () => {
  it("writes the hold, and pins the run to the person's entitlement when billing is on", async () => {
    const scopes: unknown[] = [];
    const entitlements: AskRoomEntitlements = {
      current: async () => ({ planId: "PLUS", eventId: "66666666-6666-4666-8666-666666666666" }),
      recordRunChargeScope: async (_client, scope) => { scopes.push(scope); }
    };
    const { room, holds } = arrange({ entitlements });
    const tx = {} as PoolClient;
    await room.openStart(tx, { runId: "run:a", access: MINE.access, heldMicros: 1_000, now: NOW });
    expect(holds).toEqual([{ runId: "run:a", heldMicros: 1_000 }]);
    expect(scopes).toEqual([{
      runId: "run:a", ownerRef: OWNER, planId: "PLUS",
      entitlementEventId: "66666666-6666-4666-8666-666666666666", admittedAt: NOW
    }]);
  });

  it("writes only the hold when billing is off, or for a legacy asker", async () => {
    const { room, holds } = arrange();
    await room.openStart({} as PoolClient, { runId: "run:b", access: MINE.access, heldMicros: 7, now: NOW });
    expect(holds).toEqual([{ runId: "run:b", heldMicros: 7 }]);
  });

  it("recomputes a waiting run's expected start on every read, and has none for a run not waiting", async () => {
    const waiting = waitingRun();
    const { room } = arrange({ line: [waiting], ledger: { daySpent: 100_000 } });
    await expect(room.expectedStart(waiting.runId)).resolves.toEqual({ waitsUntil: MIDNIGHT, scope: "SITE_DAY" });
    await expect(room.expectedStart(randomUUID())).resolves.toBeNull();
  });
});

describe("B6a the helpers", () => {
  it("names the next whole minute and the next UTC midnight", () => {
    expect(nextWholeMinute(NOW)).toEqual(NEXT_MINUTE);
    expect(nextWholeMinute(new Date("2026-09-30T18:01:00.000Z"))).toEqual(new Date("2026-09-30T18:02:00.000Z"));
    expect(nextUtcMidnight(new Date("2026-09-30T23:59:59.999Z"))).toEqual(MIDNIGHT);
  });

  it("refuses options that are not whole positive numbers", () => {
    for (const broken of [{ dailyCeilingMicros: 0 }, { closeBasisPoints: 9_500.5 }, { waitingLinePerPerson: 0 }]) {
      expect(() => new AskRoom({
        lockPool: lockPool().pool,
        spend: {} as AskRoomSpend,
        line: {} as AskRoomLine,
        estimator: { estimateMicros: async () => 1 },
        personAllowance: { read: async () => [] },
        entitlements: null,
        dailyCeilingMicros: 100_000,
        closeBasisPoints: 9_500,
        waitingLinePerPerson: 1,
        ...broken
      })).toThrow("ASK_ROOM_OPTIONS_INVALID");
    }
  });
});
