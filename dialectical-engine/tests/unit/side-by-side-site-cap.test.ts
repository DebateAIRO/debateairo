import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { decideAdmission, type ScopeRoom } from "@debateai/budget";
import { RUNNER_CAPACITY, SITE_CONCURRENT_DEBATES, type WaitingRun } from "@debateai/db";
import { readFileSync } from "node:fs";
import { AskRoom, type AskAdmissionGate, type AskRoomLine, type AskRoomSpend } from "../../apps/api/src/ask-room.js";
import { siteCapBootLine } from "../../apps/api/src/release-state.js";

/**
 * Side-by-side uploads spec 2026-10-21 §9, §13 (plan C task C8) — AT MOST 8 DEBATES ACROSS RELEASES, AND AN ASK CAUGHT
 * MID-SWITCH WAITS. The pure rule first: `decideAdmission`'s `hold` makes a question wait for the next tick, and the WAIT
 * names the hold as its `cause` only when the hold is the one reason to wait (no FULL scope, no blocking line). Then the
 * room's use of its `AskAdmissionGate`, over fakes: the decision asks the gate on its own transaction; the unlocked first
 * look and the room read never do; the waker's start refuses a release that is not current before anything else, and
 * holds back a START while the site runs its cap of debates. Embedded-Postgres proof: tests/integration/side-by-side-site-cap.test.ts.
 */
const NEXT_TICK = new Date("2026-10-22T10:01:00.000Z");
const MIDNIGHT = new Date("2026-10-23T00:00:00.000Z");
const DAY_END = new Date("2026-10-23T09:30:00.000Z");
const WEEK_END = new Date("2026-10-26T09:30:00.000Z");
const MONTH_END = new Date("2026-11-19T09:30:00.000Z");
const site = (value: ScopeRoom["room"]): ScopeRoom => ({ scope: "SITE_DAY", room: value, resetsAt: MIDNIGHT });
const day = (value: ScopeRoom["room"], fullOnOwnHolds?: boolean): ScopeRoom =>
  ({ scope: "PERSON_DAY", room: value, resetsAt: DAY_END, ...(fullOnOwnHolds === undefined ? {} : { fullOnOwnHolds }) });
const week = (value: ScopeRoom["room"]): ScopeRoom => ({ scope: "PERSON_WEEK", room: value, resetsAt: WEEK_END });
const month = (value: ScopeRoom["room"]): ScopeRoom => ({ scope: "PERSON_MONTH", room: value, resetsAt: MONTH_END });

type Extra = Partial<{ siteLineBlocking: boolean; personWaitingCount: number; hold: "SITE_BUSY" | "SWITCHING" | null }>;
const admit = (rooms: readonly ScopeRoom[], extra: Extra = {}) => decideAdmission({
  rooms, siteLineBlocking: false, personWaitingCount: 0, waitingLinePerPerson: 1, nextTickAt: NEXT_TICK, ...extra
});

describe("side-by-side C8 decideAdmission's hold", () => {
  it("the site's cap is the runners' own capacity: 8 debates", () => {
    expect(SITE_CONCURRENT_DEBATES).toBe(RUNNER_CAPACITY.concurrentRuns);
    expect(SITE_CONCURRENT_DEBATES).toBe(8);
  });

  it("SITE_BUSY with every room FITS: WAIT for the next tick on the site's day, the hold named as the cause", () => {
    expect(admit([site("FITS"), day("FITS")], { hold: "SITE_BUSY" }))
      .toEqual({ kind: "WAIT", waitsUntil: NEXT_TICK, worstScope: "SITE_DAY", cause: "SITE_BUSY" });
    expect(admit([site("CLOSE")], { hold: "SWITCHING" }))
      .toEqual({ kind: "WAIT", waitsUntil: NEXT_TICK, worstScope: "SITE_DAY", cause: "SWITCHING" });
  });

  it("a person who already has their waiting questions is refused, as for any wait", () => {
    expect(admit([site("FITS"), day("FITS")], { hold: "SITE_BUSY", personWaitingCount: 1 }))
      .toEqual({ kind: "REFUSE_ALREADY_WAITING" });
  });

  it("SWITCHING with the site's day FULL: the day's own wait, until the next UTC midnight, and no cause", () => {
    expect(admit([site("FULL")], { hold: "SWITCHING" }))
      .toEqual({ kind: "WAIT", waitsUntil: MIDNIGHT, worstScope: "SITE_DAY" });
  });

  it("names no cause when the line or a person's own debates would make it wait anyway", () => {
    expect(admit([site("FITS")], { hold: "SITE_BUSY", siteLineBlocking: true }))
      .toEqual({ kind: "WAIT", waitsUntil: NEXT_TICK, worstScope: "SITE_DAY" });
    expect(admit([site("FITS"), day("FULL", true)], { hold: "SITE_BUSY" }))
      .toEqual({ kind: "WAIT", waitsUntil: NEXT_TICK, worstScope: "PERSON_DAY", waitsFor: "OWN_DEBATES" });
  });

  it("absent and null agree, and carry no cause", () => {
    const table: ReadonlyArray<readonly [readonly ScopeRoom[], Extra]> = [
      [[site("FITS")], {}],
      [[site("CLOSE"), day("FITS")], {}],
      [[site("CLOSE"), day("CLOSE"), month("CLOSE")], {}],
      [[site("FULL"), week("FULL"), month("FITS")], {}],
      [[site("FULL"), week("FITS")], {}],
      [[site("FITS"), day("FULL"), month("FULL")], {}],
      [[site("FITS")], { siteLineBlocking: true }],
      [[site("FULL")], { personWaitingCount: 1 }],
      [[site("FITS")], { personWaitingCount: 1, siteLineBlocking: true }],
      [[site("CLOSE")], { personWaitingCount: 1 }],
      [[site("FITS"), day("FULL", true)], {}],
      [[site("FULL"), day("FULL", true)], {}]
    ];
    for (const [rooms, extra] of table) {
      const before = admit(rooms, extra);
      expect(admit(rooms, { ...extra, hold: null })).toEqual(before);
      expect(Object.hasOwn(admit(rooms, { ...extra, hold: null }), "cause")).toBe(false);
    }
  });

  it("refuses a hold it does not know", () => {
    expect(() => admit([site("FITS")], { hold: "SITE" as unknown as "SITE_BUSY" }))
      .toThrowError("BUDGET_ADMISSION_HOLD_INVALID");
  });
});

const NOW = new Date("2026-10-22T10:00:20.000Z");
/**
 * C8 review: the day lock does not serialize two decisions on either side of midnight UTC, so the count is taken under
 * one constant site-wide transaction lock, the statement recorded here as it reached the decision's own client.
 */
const SITE_LOCK = "site-lock:SELECT pg_advisory_xact_lock(hashtextextended('debateai.site_concurrent_debates', 0))";
const OWNER = "44444444-4444-4444-8444-444444444444";
/** The gate's own release; every waiting run here was admitted by it (side-by-side C10: `WaitingRun.releaseKey`). */
const RELEASE = ["r17", "0123456789ab"].join("-");
const CLASS = Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 });
const MINE = Object.freeze({ access: Object.freeze({ ownerRef: OWNER, legacyAskerId: null }), settingsClass: CLASS });

function waitingRun(input: Partial<WaitingRun> = {}): WaitingRun {
  return Object.freeze({
    runId: randomUUID(), waitingSince: new Date("2026-10-22T09:00:00.000Z"), releaseKey: RELEASE,
    ownerRef: null, legacyAskerId: `legacy:${randomUUID()}`,
    planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2,
    waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-10-22T09:00:00.000Z"),
    ...input
  });
}

function arrange(input: { current?: boolean; active?: number; line?: readonly WaitingRun[]; gate?: false } = {}) {
  const asked: string[] = [];
  // The site-wide count lock goes through the decision's own client, so it is recorded in order with the gate's reads.
  const tx = {
    query: vi.fn(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("debateai.site_concurrent_debates")) asked.push(`site-lock:${sql}`);
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn()
  };
  const gate: AskAdmissionGate = {
    releaseKey: RELEASE,
    siteConcurrentDebates: 8,
    ownReleaseIsCurrent: async (executor) => {
      asked.push(executor === (tx as unknown) ? "current:tx" : "current:other");
      return input.current ?? true;
    },
    activeDebates: async (executor) => {
      asked.push(executor === (tx as unknown) ? "active:tx" : "active:other");
      return input.active ?? 0;
    }
  };
  const holds: string[] = [];
  const reasons: unknown[] = [];
  const entered: string[] = [];
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
    waitingForOwner: async () => [],
    waitingForLegacyAsker: async () => [],
    readWaiting: async (runId) => (input.line ?? []).find((run) => run.runId === runId) ?? null,
    isWaiting: async (_executor, runId) => {
      asked.push("isWaiting");
      return (input.line ?? []).some((run) => run.runId === runId);
    },
    enterWait: async (_client, runId) => { entered.push(runId); },
    recordReason: async (_client, runId, reason) => { reasons.push({ runId, ...reason }); },
    markStarted: async (_client, runId) => { started.push(runId); }
  };
  const room = new AskRoom({
    lockPool: { connect: vi.fn(async () => tx) } as unknown as Pool,
    spend,
    line,
    estimator: { estimateMicros: async () => 1_000 },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: 100_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => NOW,
    ...(input.gate === false ? {} : { gate })
  });
  return { room, asked, holds, reasons, entered, started };
}

describe("side-by-side C8 the room asks its gate inside the decision", () => {
  it("a full site: the decision WAITs for the next minute on the site's day, and records SITE_BUSY", async () => {
    const { room, asked, reasons } = arrange({ active: 8 });
    const admission = await room.decide(MINE, async ({ admission, now, tx }) => {
      if (admission.kind === "WAIT") await room.enterWait(tx, "run:busy", now);
      return admission;
    });
    expect(admission).toEqual({
      kind: "WAIT", waitsUntil: new Date("2026-10-22T10:01:00.000Z"), worstScope: "SITE_DAY", cause: "SITE_BUSY"
    });
    expect(asked).toEqual(["current:tx", SITE_LOCK, "active:tx"]);
    expect(reasons).toEqual([{ runId: "run:busy", waitsFor: "SITE_BUSY", personRecheckAt: null, at: NOW }]);
  });

  it("a release that is not current: the decision WAITs and records SWITCHING, without counting debates", async () => {
    const { room, asked, reasons } = arrange({ current: false, active: 8 });
    const admission = await room.decide(MINE, async ({ admission, now, tx }) => {
      if (admission.kind === "WAIT") await room.enterWait(tx, "run:switching", now);
      return admission;
    });
    expect(admission).toEqual(expect.objectContaining({ kind: "WAIT", worstScope: "SITE_DAY", cause: "SWITCHING" }));
    expect(asked).toEqual(["current:tx"]);
    expect(reasons).toEqual([{ runId: "run:switching", waitsFor: "SWITCHING", personRecheckAt: null, at: NOW }]);
  });

  it("seven live debates: the decision STARTs, counted under the site-wide lock on its own client", async () => {
    const { room, asked } = arrange({ active: 7 });
    expect(await room.decide(MINE, async ({ admission }) => admission)).toEqual(expect.objectContaining({ kind: "START" }));
    expect(asked).toEqual(["current:tx", SITE_LOCK, "active:tx"]);
  });

  it("the unlocked first look and the room read never ask the gate: a busy site never reads as today's limit", async () => {
    const { room, asked } = arrange({ current: false, active: 8 });
    expect((await room.precheck(MINE)).admission.kind).toBe("START");
    expect((await room.readRoom(MINE)).room).toBe("FITS");
    expect(asked).toEqual([]);
  });

  it("a room without a gate decides as before", async () => {
    const { room, asked } = arrange({ gate: false, active: 8, current: false });
    expect(await room.decide(MINE, async ({ admission }) => admission)).toEqual(expect.objectContaining({ kind: "START" }));
    expect(asked).toEqual([]);
  });
});

describe("side-by-side C8 the waker's start asks the gate too", () => {
  const enqueue = async () => "work-item";

  it("a release that is not current starts nothing and writes nothing, asked first", async () => {
    const run = waitingRun();
    const { room, asked, holds, reasons, started } = arrange({ current: false, line: [run] });
    expect(await room.startWaiting(run, enqueue)).toEqual({ kind: "SWITCHING" });
    expect(asked).toEqual(["current:tx"]);
    expect([holds, reasons, started]).toEqual([[], [], []]);
  });

  it("a full site holds back a run the room would START, recording SITE_BUSY once", async () => {
    const run = waitingRun();
    const { room, asked, reasons, holds, started } = arrange({ active: 8, line: [run] });
    expect(await room.startWaiting(run, enqueue)).toEqual({ kind: "SITE_BUSY" });
    expect(asked).toEqual(["current:tx", "isWaiting", SITE_LOCK, "active:tx"]);
    expect(reasons).toEqual([{ runId: run.runId, waitsFor: "SITE_BUSY", personRecheckAt: null, at: NOW }]);
    expect([holds, started]).toEqual([[], []]);

    const already = waitingRun({ waitsFor: "SITE_BUSY" });
    const again = arrange({ active: 8, line: [already] });
    expect(await again.room.startWaiting(already, enqueue)).toEqual({ kind: "SITE_BUSY" });
    expect(again.reasons).toEqual([]);
  });

  it("room on the site: the run starts", async () => {
    const run = waitingRun({ waitsFor: "SITE_BUSY" });
    const { room, asked, holds, started } = arrange({ active: 7, line: [run] });
    expect(await room.startWaiting(run, enqueue)).toEqual({ kind: "STARTED", runId: run.runId, value: "work-item" });
    expect(asked).toEqual(["current:tx", "isWaiting", SITE_LOCK, "active:tx"]);
    expect([holds, started]).toEqual([[run.runId], [run.runId]]);
  });
});

describe("side-by-side final fix wave P7: a hosted API without the room says it has no site cap, once at boot", () => {
  it("hosted without the room: one content-free line, api.release.no_site_cap (the cap of 8 and SWITCHING need the room)", () => {
    expect(siteCapBootLine({ hosted: true, roomComposed: false })).toBe(JSON.stringify({ event: "api.release.no_site_cap" }));
  });

  it("no line with the room, and none in local mode (one release, no cap to lose)", () => {
    expect(siteCapBootLine({ hosted: true, roomComposed: true })).toBeNull();
    expect(siteCapBootLine({ hosted: false, roomComposed: false })).toBeNull();
    expect(siteCapBootLine({ hosted: false, roomComposed: true })).toBeNull();
  });

  it("main.ts prints it right after the room is composed, on stderr, and the boot goes on (no refusal)", () => {
    const source = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    const call = [
      "const noSiteCapLine = siteCapBootLine({",
      "  hosted: environment.DEPLOYMENT_MODE === \"hosted\", roomComposed: askRoom !== undefined",
      "});",
      "if (noSiteCapLine !== null) console.warn(noSiteCapLine);"
    ].join("\n");
    expect(source).toContain(call);
    expect(source.indexOf(call)).toBeGreaterThan(source.indexOf("const askRoom = askRoomComposition?.room;"));
    expect(source.indexOf(call)).toBeLessThan(source.indexOf("const billingEnabled ="));
  });
});
