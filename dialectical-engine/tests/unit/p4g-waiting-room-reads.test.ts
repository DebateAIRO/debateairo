/**
 * Paid plans P4-G (go-live row 31; Part 1b's final review, Minor 5 and deferred line 38): the waiting room's two reads.
 *
 *  1. A debate page polls GET /v1/runs/{id} while its run is WAITING. The expected start (the estimator plus about
 *     eight reads) is kept per run, in process, for a short window — thirty seconds, or until the waker's next tick,
 *     whichever comes first — so a page polling every few seconds no longer recomputes it on every poll.
 *  2. The room read GET /v1/asks/room charges its own owner-keyed admission scope, `askRoomReads`, when the register
 *     version in force seals it (429 ADMISSION_RATE_LIMITED, which the page already treats as "no word").
 *  3. Ruling C7: a version that seals the budget band without that scope is refused at publish and at the API boot
 *     (ASK_ROOM_ADMISSION_UNSEALED), the way BILLING_ADMISSION_UNSEALED refuses; the publish rows are in
 *     tests/unit/hosted-register-publish.test.ts and tests/integration/hosted-register-publish.test.ts.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { WaitingRun } from "@debateai/db";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue,
  assertAskRoomAdmissionSealed,
  costEnvelopePolicyFromValue,
  type AdmissionPolicy
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { AskRoom, type AskRoomLine, type AskRoomReader, type AskRoomSpend } from "../../apps/api/src/ask-room.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const ROOM_READS = Object.freeze({ key: "owner" as const, limit: 2, window_ms: 60_000, capacity: 1_024 });

function waitingRun(): WaitingRun {
  return Object.freeze({
    runId: randomUUID(), waitingSince: new Date("2026-09-30T17:00:00.000Z"),
    ownerRef: null, legacyAskerId: `legacy:${randomUUID()}`,
    planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2,
    waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-09-30T17:00:00.000Z")
  } as const);
}

/** A room whose site day is full, so a waiting run waits for midnight; counts what each expected start reads. */
function roomAt(start: Date, runs: readonly WaitingRun[]) {
  let now = start;
  const byRunId = new Map(runs.map((run) => [run.runId, run] as const));
  const counts = { readWaiting: 0, estimate: 0, daySpent: 0 };
  const spend = {
    readDaySpentMicros: async () => { counts.daySpent += 1; return 100_000; },
    readSiteCountedHoldsMicros: async () => 0,
    readOwnerSpentMicros: async () => 0,
    readOwnerCountedHoldsMicros: async () => 0,
    openHold: async () => undefined
  } as unknown as AskRoomSpend;
  const line = {
    readWaiting: async (runId: string) => {
      counts.readWaiting += 1;
      return byRunId.get(runId) ?? null;
    },
    siteLineBlocking: async () => false,
    waitingForOwner: async () => [],
    waitingForLegacyAsker: async () => []
  } as unknown as AskRoomLine;
  const room = new AskRoom({
    lockPool: {} as Pool,
    spend,
    line,
    estimator: { estimateMicros: async () => { counts.estimate += 1; return 1_000; } },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: 100_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => now
  });
  return { room, counts, at: (instant: string) => { now = new Date(instant); } };
}

describe("P4-G a WAITING run's expected start is computed once per short window, per run", () => {
  it("answers two reads inside the window from one computation, and computes again after it", async () => {
    const run = waitingRun();
    const { room, counts, at } = roomAt(new Date("2026-09-30T18:00:05.000Z"), [run]);
    const first = await room.expectedStart(run.runId);
    expect(first).toEqual({ waitsUntil: new Date("2026-10-01T00:00:00.000Z"), scope: "SITE_DAY" });
    at("2026-09-30T18:00:30.000Z");
    await expect(room.expectedStart(run.runId)).resolves.toEqual(first);
    expect(counts).toEqual({ readWaiting: 1, estimate: 1, daySpent: 1 });
    // Thirty seconds after the computation, it is computed again.
    at("2026-09-30T18:00:35.000Z");
    await expect(room.expectedStart(run.runId)).resolves.toEqual(first);
    expect(counts).toEqual({ readWaiting: 2, estimate: 2, daySpent: 2 });
  });

  it("never serves an answer across the waker's next tick, even inside thirty seconds", async () => {
    const run = waitingRun();
    const { room, counts, at } = roomAt(new Date("2026-09-30T18:00:50.000Z"), [run]);
    await room.expectedStart(run.runId);
    at("2026-09-30T18:00:59.999Z");
    await room.expectedStart(run.runId);
    expect(counts.estimate).toBe(1);
    // 18:01:00 is the waker's tick: the run may have started or its room changed.
    at("2026-09-30T18:01:00.000Z");
    await room.expectedStart(run.runId);
    expect(counts.estimate).toBe(2);
  });

  it("keeps each run's answer apart, and shares one computation between concurrent reads", async () => {
    const one = waitingRun();
    const two = waitingRun();
    const { room, counts } = roomAt(new Date("2026-09-30T18:00:05.000Z"), [one, two]);
    await Promise.all([room.expectedStart(one.runId), room.expectedStart(one.runId), room.expectedStart(two.runId)]);
    expect(counts.estimate).toBe(2);
    expect(counts.readWaiting).toBe(2);
  });

  it("keeps at most 4,096 runs: the oldest is dropped first, and the newest is still answered from the table", async () => {
    const first = waitingRun();
    const others = Array.from({ length: 4_096 }, () => waitingRun());
    const { room, counts } = roomAt(new Date("2026-09-30T18:00:05.000Z"), [first, ...others]);
    // One instant throughout, so no entry's window has ended: only the bound can drop one.
    await room.expectedStart(first.runId);
    for (const other of others) await room.expectedStart(other.runId);
    expect(counts.estimate).toBe(4_097);
    // The 4,097th run pushed the oldest (the first) out, so it is computed again inside its window.
    await room.expectedStart(first.runId);
    expect(counts.estimate).toBe(4_098);
    // The run read last is still in the table: no new computation.
    const last = others.at(-1);
    if (last === undefined) throw new TypeError("test: no runs");
    await room.expectedStart(last.runId);
    expect(counts.estimate).toBe(4_098);
  });

  it("does not keep a failed computation: the next read tries again", async () => {
    const run = waitingRun();
    let fail = true;
    let estimates = 0;
    const throwing = new AskRoom({
      lockPool: {} as Pool,
      spend: {
        readDaySpentMicros: async () => {
          if (fail) throw new Error("test: the database is away");
          return 100_000;
        },
        readSiteCountedHoldsMicros: async () => 0,
        readOwnerSpentMicros: async () => 0,
        readOwnerCountedHoldsMicros: async () => 0,
        openHold: async () => undefined
      } as unknown as AskRoomSpend,
      line: {
        readWaiting: async () => run,
        siteLineBlocking: async () => false,
        waitingForOwner: async () => [],
        waitingForLegacyAsker: async () => []
      } as unknown as AskRoomLine,
      estimator: { estimateMicros: async () => { estimates += 1; return 1_000; } },
      personAllowance: { read: async () => [] },
      entitlements: null,
      dailyCeilingMicros: 100_000,
      closeBasisPoints: 9_500,
      waitingLinePerPerson: 1,
      clock: () => new Date("2026-09-30T18:00:05.000Z")
    });
    // A read whose computation throws is not remembered: the next read, same instant, computes again.
    await expect(throwing.expectedStart(run.runId)).rejects.toThrow("test: the database is away");
    fail = false;
    await expect(throwing.expectedStart(run.runId)).resolves.toMatchObject({ scope: "SITE_DAY" });
    expect(estimates).toBe(2);
  });
});

describe("P4-G the register's admission policy holds the room-read scope, and the limiter knows it", () => {
  it("parses ask_room_reads as an optional owner-keyed member, null when the row has none", () => {
    const sealed = admissionPolicyFromValue(
      { ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, ask_room_reads: ROOM_READS }, "p4g fixture"
    );
    expect(sealed.askRoomReads).toEqual({ key: "owner", limit: 2, windowMs: 60_000, capacity: 1_024 });
    expect(Object.isFrozen(sealed.askRoomReads)).toBe(true);
    expect(admissionPolicyFromValue(
      ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    ).askRoomReads).toBeNull();
    // The code-owned rows carry no room-read budget: the owner seals its value in the operator's file.
    expect(Object.hasOwn(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, "ask_room_reads")).toBe(false);
    expect(Object.hasOwn(ADMISSION_POLICY_REGISTER_ROW.value, "ask_room_reads")).toBe(false);
  });

  it("refuses a source-keyed or malformed room-read budget by the register's own code", () => {
    for (const broken of [{ ...ROOM_READS, key: "source" }, { ...ROOM_READS, limit: 0 }, { ...ROOM_READS, extra: 1 }]) {
      expect(() => admissionPolicyFromValue(
        { ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, ask_room_reads: broken }, "p4g fixture"
      )).toThrow(expect.objectContaining({ code: "ADMISSION_POLICY_INVALID" }));
    }
  });

  it("builds the scope's bucket only when the version seals it", () => {
    const value = ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value;
    const sealed = new AdmissionLimiter(admissionPolicyFromValue({ ...value, ask_room_reads: ROOM_READS }, "p4g fixture"));
    expect(sealed.configured("askRoomReads")).toBe(true);
    const at = new Date("2026-09-30T18:00:00.000Z");
    expect(sealed.decide("askRoomReads", "owner:a", at).allowed).toBe(true);
    expect(sealed.decide("askRoomReads", "owner:a", at).allowed).toBe(true);
    expect(sealed.decide("askRoomReads", "owner:a", at)).toMatchObject({ allowed: false, reason: "LIMIT" });
    expect(new AdmissionLimiter(admissionPolicyFromValue(value, "p4g fixture")).configured("askRoomReads")).toBe(false);
  });
});

describe("P4-G GET /v1/asks/room charges the askRoomReads scope when it is sealed", () => {
  const OWNER_A = testHttpIdentity("p4g-room-owner-a");
  const OWNER_B = testHttpIdentity("p4g-room-owner-b");

  function harness(policy: AdmissionPolicy) {
    const readRoom = vi.fn(async () => Object.freeze({
      room: "FITS" as const, scope: null, resetsAt: null, waitingRunRef: null, planId: null
    }));
    let now = new Date("2026-09-30T18:00:00.000Z");
    const api = buildApi({
      application: {} as AskApplication,
      sessions: testSessionApplication([OWNER_A, OWNER_B]),
      allowedOrigin: TEST_APP_ORIGIN,
      admission: new AdmissionLimiter(policy),
      admissionClock: () => now,
      askRoom: { readRoom } satisfies AskRoomReader
    });
    const refusalLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    return {
      readRoom,
      advance: (ms: number) => { now = new Date(now.getTime() + ms); },
      read: (owner: typeof OWNER_A) => api.inject({
        method: "GET",
        url: "/v1/asks/room?plan_tier=free&composition_budget_tier=low&depth=1",
        headers: testSessionHeaders(owner, false)
      }),
      close: async () => { refusalLog.mockRestore(); await api.close(); }
    };
  }

  it("answers 429 ADMISSION_RATE_LIMITED after the sealed budget, per owner, and reads no room for the refused read", async () => {
    const h = harness(admissionPolicyFromValue(
      { ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, ask_room_reads: ROOM_READS }, "p4g fixture"
    ));
    try {
      expect((await h.read(OWNER_A)).statusCode).toBe(200);
      expect((await h.read(OWNER_A)).statusCode).toBe(200);
      const refused = await h.read(OWNER_A);
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
      expect(refused.headers["retry-after"]).toBe("60");
      expect(h.readRoom).toHaveBeenCalledTimes(2);
      // Another owner keeps their own budget; the window's end gives the first one theirs back.
      expect((await h.read(OWNER_B)).statusCode).toBe(200);
      h.advance(60_000);
      expect((await h.read(OWNER_A)).statusCode).toBe(200);
    } finally {
      await h.close();
    }
  });

  it("changes nothing while the version in force seals no room-read budget", async () => {
    const h = harness(admissionPolicyFromValue(
      ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    ));
    try {
      for (let index = 0; index < 5; index += 1) expect((await h.read(OWNER_A)).statusCode).toBe(200);
      expect(h.readRoom).toHaveBeenCalledTimes(5);
    } finally {
      await h.close();
    }
  });
});

describe("P4-G ruling C7: a version that seals the band must seal the room-read scope", () => {
  const ENVELOPE = Object.freeze({
    kind: "COST_ENVELOPE_POLICY", currency: "USD", minor_units_per_unit: 1_000_000,
    per_run_ceiling_micros: 250_000, daily_ceiling_micros: 2_000_000, provisional: true,
    provisional_reason: "p4g fixture"
  });
  const BAND = Object.freeze({
    admission_close_basis_points: 9_500, finish_up_to_basis_points: 11_500, waiting_line_per_person: 1
  });
  it("refuses the band without the scope, and accepts it with the scope or without the band", () => {
    const unsealed = admissionPolicyFromValue(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, "p4g fixture");
    const sealed = admissionPolicyFromValue(
      { ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, ask_room_reads: ROOM_READS }, "p4g fixture"
    );
    const banded = costEnvelopePolicyFromValue({ ...ENVELOPE, ...BAND }, "p4g fixture");
    const unbanded = costEnvelopePolicyFromValue(ENVELOPE, "p4g fixture");
    expect(() => assertAskRoomAdmissionSealed({ envelope: banded, admission: unsealed }))
      .toThrow(expect.objectContaining({ code: "ASK_ROOM_ADMISSION_UNSEALED" }));
    expect(() => assertAskRoomAdmissionSealed({ envelope: banded, admission: sealed })).not.toThrow();
    expect(() => assertAskRoomAdmissionSealed({ envelope: unbanded, admission: unsealed })).not.toThrow();
  });

  it("is asked by the API's boot in the ask-room stage, of the admission row in force, once the band is read", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const stage = main.slice(main.indexOf("await boot.run(\"ask-room\""), main.indexOf("const askRoom = askRoomComposition?.room;"));
    expect(stage).toMatch(
      /assertAskRoomAdmissionSealed\(\{\s*envelope: costEnvelopeRows\.runPolicy,\s*admission: admissionPolicy\s*\}\);/u
    );
    // After the band's null exit, so a version without the band boots exactly as before.
    expect(stage.indexOf("assertAskRoomAdmissionSealed(")).toBeGreaterThan(stage.indexOf("if (band === null) {"));
    expect(stage.indexOf("assertAskRoomAdmissionSealed(")).toBeLessThan(stage.indexOf("const room = new AskRoom({"));
  });

  it("is asked by the publish command's plan and its boot-readiness check", async () => {
    const publish = await readFile("apps/runner/src/hosted-register-publish.ts", "utf8");
    expect(publish.match(/assertAskRoomAdmissionSealed\(\{/gu)?.length).toBe(2);
  });
});
