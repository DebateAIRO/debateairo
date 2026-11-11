// tests/unit/web-plan-store.test.ts
// W3-6 (Perplexity plan 2026-10-30): the planner's per-path decision kept in 0134's store. Each NO_SEARCH_PLANNED reason
// (model text) is sealed under the run's key (carrier WEB_PLAN_CARRIER, the path_ref as its key) under the step's own
// lease, never in the clear; a run claimed again writes the same decision again and the store's ALREADY is success;
// NOT_LIVE is logged with the step's own code and the paths go on. Scripted vendors and Perplexity, a stand-in pool.
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { WEB_PLAN_CARRIER, type CryptoEnvelope, type WebSealed } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  postgresWebPlanStatusRecorder, runWebStep, webPlanPathRecords, type RecordPlanPathStatuses, type WebStepCipher
} from "../../apps/runner/src/web-step.js";
import type { WebPlanPathStatus } from "../../apps/runner/src/web-planner.js";
import {
  CIPHER, PLAN_BOTH, RUN_ID, membersOf, memoryStore, noWeb, perplexity, planReply, stepInput, team
} from "../support/web-step-world.js";

const REASON = "It turns on what the town values.";
const STATUSES: readonly WebPlanPathStatus[] = Object.freeze([
  { pathId: "a1", status: "PLANNED", reason: null, searchesToSend: 2 },
  { pathId: "a2", status: "NO_SEARCH_PLANNED", reason: REASON, searchesToSend: 0 }
]);
const PLANS_NONE = planReply([noWeb("a1", REASON), noWeb("a2", "Values only.")]);

/** A key whose envelopes carry nothing of the value: an opaque reference, the value kept beside it. */
function opaqueCipher() {
  const kept = new Map<string, Readonly<{ carrier: string; primaryKey: string; value: unknown }>>();
  const cipher: Pick<WebStepCipher, "seal"> = {
    seal: (carrier, primaryKey, value): WebSealed => {
      const ref = `sealed-${String(kept.size + 1)}`;
      kept.set(ref, { carrier, primaryKey, value });
      return { envelope: { ref } as unknown as CryptoEnvelope, attestation: Buffer.alloc(32, 2) };
    }
  };
  return { cipher, kept };
}

/** 0134's writer as a pool sees it: every call kept, each path answered by `answer` (its path and how often it came). */
function planPool(answer: (pathRef: string, seen: number) => "RECORDED" | "ALREADY" | "NOT_LIVE") {
  const calls: unknown[][] = [];
  const seenOf = new Map<string, number>();
  const pool = {
    query: async (sql: string, values: readonly unknown[]) => {
      calls.push([sql, ...values]);
      const pathRef = values[1] as string;
      const seen = seenOf.get(pathRef) ?? 0;
      seenOf.set(pathRef, seen + 1);
      return { rows: [{ outcome: answer(pathRef, seen) }] };
    }
  };
  return { pool: pool as unknown as Pick<Pool, "query">, calls };
}

const codeOf = async (promise: Promise<unknown>): Promise<string | null> => {
  try { await promise; return null; } catch (error) { return error instanceof TypedDomainError ? error.code : "UNTYPED"; }
};

describe("W3-6 the planner's decision, sealed", () => {
  it("seals each NO_SEARCH_PLANNED reason under the run's key, bound to its path_ref; every other status keeps none", () => {
    const records = webPlanPathRecords(STATUSES, CIPHER as unknown as WebStepCipher);
    expect(records.map((record) => [record.pathRef, record.status, record.searchesToSend, record.reason === null]))
      .toEqual([["a1", "PLANNED", 2, true], ["a2", "NO_SEARCH_PLANNED", 0, false]]);
    expect(CIPHER.open(WEB_PLAN_CARRIER, "a2", records[1]!.reason!.envelope)).toEqual({ reason: REASON });
    // Bound to its own path and carrier: opened under another, it does not open.
    expect(() => CIPHER.open(WEB_PLAN_CARRIER, "a1", records[1]!.reason!.envelope)).toThrow("FIXTURE_ENVELOPE_MISBOUND");
    expect(() => CIPHER.open("identity.web_pack", "a2", records[1]!.reason!.envelope)).toThrow("FIXTURE_ENVELOPE_MISBOUND");
  });

  it("never keeps a reason in the clear: the writer gets its envelope only, and with no key nothing is written", async () => {
    const { cipher, kept } = opaqueCipher();
    const { pool, calls } = planPool(() => "RECORDED");
    await postgresWebPlanStatusRecorder(pool)(RUN_ID, STATUSES, cipher);
    expect(calls.map((call) => [String(call[0]).includes("identity.record_web_plan_path"), call[2], call[3]]))
      .toEqual([[true, "a1", "PLANNED"], [true, "a2", "NO_SEARCH_PLANNED"]]);
    expect(JSON.stringify(calls)).not.toContain(REASON);
    expect([...kept.values()]).toEqual([{ carrier: WEB_PLAN_CARRIER, primaryKey: "a2", value: { reason: REASON } }]);
    expect(calls[0]![5]).toBeNull();
    expect(calls[1]![5]).toBe(JSON.stringify({ ref: "sealed-1" }));

    const none = planPool(() => "RECORDED");
    expect(await codeOf(postgresWebPlanStatusRecorder(none.pool)(RUN_ID, STATUSES, null))).toBe("WEB_PLAN_REASON_UNSEALED");
    expect(none.calls).toEqual([]);
    // A decision with no reason needs no key.
    const off = STATUSES.map((entry) => ({ ...entry, status: "SWITCHED_OFF" as const, reason: null, searchesToSend: 0 }));
    expect(webPlanPathRecords(off, null).map((record) => record.reason)).toEqual([null, null]);
  });
});

describe("W3-6 the store's answers", () => {
  it("ALREADY is success: a run claimed again writes the same decision again, logs nothing and goes on", async () => {
    const { pool, calls } = planPool((_pathRef, seen) => seen === 0 ? "RECORDED" : "ALREADY");
    const store = memoryStore();
    const logged: string[] = [];
    for (let copy = 0; copy < 2; copy += 1) {
      const result = await runWebStep(stepInput({ members: membersOf(team({ haiku: { planner: PLANS_NONE } }).all),
        search: perplexity().port, prepare: store.prepare, recordPlanPathStatuses: postgresWebPlanStatusRecorder(pool),
        log: (event) => { logged.push(event); } }));
      expect(result.paths.map((path) => path.status)).toEqual(["NO_SEARCH_PLANNED", "NO_SEARCH_PLANNED"]);
    }
    expect(calls).toHaveLength(4);
    expect(logged).not.toContain("WEB_PLAN_STATUS_NOT_RECORDED");
    expect(await codeOf(postgresWebPlanStatusRecorder(pool)(RUN_ID, STATUSES, CIPHER as unknown as WebStepCipher))).toBeNull();
  });

  it("NOT_LIVE is the step's WEB_EVIDENCE_NOT_LIVE: one operator line, and the paths go on searching", async () => {
    const { pool } = planPool(() => "NOT_LIVE");
    expect(await codeOf(postgresWebPlanStatusRecorder(pool)(RUN_ID, STATUSES, CIPHER as unknown as WebStepCipher)))
      .toBe("WEB_EVIDENCE_NOT_LIVE");
    const lines: Record<string, unknown>[] = [];
    const result = await runWebStep(stepInput({ members: membersOf(team({ haiku: { planner: PLAN_BOTH } }).all),
      search: perplexity().port, prepare: memoryStore().prepare, recordPlanPathStatuses: postgresWebPlanStatusRecorder(pool),
      log: (event, detail) => { lines.push({ event, ...detail }); } }));
    expect(result.paths.map((path) => path.status)).toEqual(["SEARCHED", "SEARCHED"]);
    expect(lines.filter((line) => line.event === "WEB_PLAN_STATUS_NOT_RECORDED"))
      .toEqual([{ event: "WEB_PLAN_STATUS_NOT_RECORDED", runId: RUN_ID, code: "WEB_EVIDENCE_NOT_LIVE" }]);
  });
});

describe("W3-6 which key the decision is sealed under", () => {
  const spy = () => {
    const ciphers: unknown[] = [];
    const record: RecordPlanPathStatuses = async (_runId, _statuses, cipher) => { ciphers.push(cipher); };
    return { record, ciphers };
  };

  it("Free and the setting off open no key: the decision goes with none", async () => {
    for (const overrides of [{ planId: "FREE" as const }, { webSwitchedOn: false }]) {
      const { record, ciphers } = spy();
      const store = memoryStore();
      await runWebStep(stepInput({ members: membersOf(team().all), search: perplexity().port, prepare: store.prepare,
        recordPlanPathStatuses: record, ...overrides }));
      expect({ ciphers, prepared: store.prepared() }).toEqual({ ciphers: [null], prepared: 0 });
    }
  });

  it("a planned map seals under the step's one lease, the same key its searches use", async () => {
    const { record, ciphers } = spy();
    const store = memoryStore();
    await runWebStep(stepInput({ members: membersOf(team({ haiku: { planner: PLAN_BOTH } }).all), search: perplexity().port,
      prepare: store.prepare, recordPlanPathStatuses: record }));
    expect(ciphers).toEqual([CIPHER]);
    expect(store.prepared()).toBe(1);
  });

  it("the key cannot be opened: a map with a reason keeps no decision (one line), and its paths go on without the web", async () => {
    const { pool, calls } = planPool(() => "RECORDED");
    const lines: Record<string, unknown>[] = [];
    const result = await runWebStep(stepInput({ members: membersOf(team({ haiku: { planner: PLANS_NONE } }).all),
      search: perplexity().port, prepare: async () => { throw new TypedDomainError("WEB_EVIDENCE_ENCRYPTION_REQUIRED", "no key"); },
      recordPlanPathStatuses: postgresWebPlanStatusRecorder(pool), log: (event, detail) => { lines.push({ event, ...detail }); } }));
    expect(result.paths.map((path) => path.status)).toEqual(["NO_SEARCH_PLANNED", "NO_SEARCH_PLANNED"]);
    expect(calls).toEqual([]);
    expect(lines.map((line) => [line.event, line.code])).toEqual([
      ["WEB_STEP_UNAVAILABLE", "WEB_EVIDENCE_ENCRYPTION_REQUIRED"], ["WEB_PLAN_STATUS_NOT_RECORDED", "WEB_PLAN_REASON_UNSEALED"]]);
  });
});
