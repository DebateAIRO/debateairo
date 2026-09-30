import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Pool, PoolClient, QueryResult } from "pg";
import { OpenRunSummarySchema, RunProjectionSchema, SpendScopeSchema, type Session } from "@debateai/contract";
import type { SpendScope } from "@debateai/budget";
import { RunRepository } from "@debateai/db";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import type { AskRoomPort } from "../../apps/api/src/ask-room.js";

const RUN = Object.freeze({
  run_ref: "run:waiting", question_line: "Messi or Ronaldo?", terminal_reason: null, hold_until: null
});

describe("B6a the contract carries WAITING with its expected start (budget spec §2.7)", () => {
  it("requires waits_until on a WAITING run and forbids it on every other state", () => {
    expect(RunProjectionSchema.parse({ ...RUN, state: "WAITING", waits_until: "2026-10-01T00:00:00.000Z" }).state)
      .toBe("WAITING");
    expect(RunProjectionSchema.safeParse({ ...RUN, state: "WAITING" }).success).toBe(false);
    expect(RunProjectionSchema.safeParse({ ...RUN, state: "WAITING", waits_until: null }).success).toBe(false);
    expect(RunProjectionSchema.safeParse({ ...RUN, state: "QUEUED", waits_until: "2026-10-01T00:00:00.000Z" }).success)
      .toBe(false);
    // A reader built before the field still parses every other state.
    expect(RunProjectionSchema.parse({ ...RUN, state: "QUEUED" }).state).toBe("QUEUED");
  });

  it("lets the owner's list show a waiting run", () => {
    expect(OpenRunSummarySchema.parse({
      run_ref: "run:waiting", question_line: "Messi or Ronaldo?", state: "WAITING",
      terminal_reason: null, created_at_sequence: 7
    }).state).toBe("WAITING");
  });

  it("names the same four scopes as SpendScope in @debateai/budget", () => {
    const budgetScopes = {
      SITE_DAY: true, PERSON_DAY: true, PERSON_WEEK: true, PERSON_MONTH: true
    } satisfies Record<SpendScope, true>;
    expect([...SpendScopeSchema.options].sort()).toEqual(Object.keys(budgetScopes).sort());
  });
});

describe("B6a the run projection derives WAITING from the line", () => {
  function projectionPool(waitingLineApplied: boolean) {
    const calls: string[] = [];
    const query = async (text: string) => {
      calls.push(text);
      if (text.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
      if (text.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
      if (text.includes("run_private_content_is_live")) return { rows: [{ run_id: "run:waiting", live: true }] };
      if (text.includes("'run_wait','run_wait_start'")) return { rows: [{ applied: waitingLineApplied }] };
      if (text.includes("information_schema.columns")) return { rows: [{ applied: false }] };
      if (text.includes("core.run_is_owned_by")) {
        return { rows: [{
          run_id: "run:waiting", question_line: "Messi or Ronaldo?", content_ciphertext: null,
          state: waitingLineApplied ? "WAITING" : "QUEUED", terminal_reason: null, hold_until: null
        }] };
      }
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    };
    return { calls, pool: { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Pool };
  }

  it("asks for WAITING when a wait row exists, no start row exists and there is no job", async () => {
    const { calls, pool } = projectionPool(true);
    const projection = await new RunRepository(pool).readLoadingProjection("run:waiting", "asker:owner");
    expect(projection?.state).toBe("WAITING");
    const read = calls.find((text) => text.includes("core.run_is_owned_by")) ?? "";
    expect(read).toContain("THEN 'WAITING'");
    expect(read).toContain("core.run_wait_start");
  });

  it("reads exactly today's states on a database without the line", async () => {
    const { calls, pool } = projectionPool(false);
    await new RunRepository(pool).readLoadingProjection("run:waiting", "asker:owner");
    expect(calls.find((text) => text.includes("core.run_is_owned_by"))).not.toContain("run_wait");
  });
});

describe("B6a readRun answers a waiting run's expected start", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  function stubPool(): Pool {
    const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
    const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
    return { connect: vi.fn(async () => client), query } as unknown as Pool;
  }
  const settings = (room?: AskRoomPort): RunCreationSettings => ({
    strangerSampleRate: 0, registerVersion: 1, batteryVersion: "b6a", settlementWatchHandle: "b6a",
    resolveDiscoveredPanel: async () => [], resolveEnvelopeBasis: async () => ({}),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    ...(room === undefined ? {} : { room })
  });
  const session = { session_id: "33333333-3333-4333-8333-333333333333" } as Session;
  const application = (room?: AskRoomPort) => new PostgresAskApplication(
    stubPool(), { dispatch: vi.fn() }, settings(room), { read: async () => [] }, stubPool(),
    { server: stubPool(), legacy: stubPool() }
  );

  function waitingProjection(): void {
    vi.spyOn(RunRepository.prototype, "readLoadingProjection").mockResolvedValue({
      runRef: "run:waiting", questionLine: "Messi or Ronaldo?", state: "WAITING",
      terminalReason: null, holdUntil: null, argumentLanguage: null
    });
  }

  it("asks the room for the expected start", async () => {
    waitingProjection();
    const room = {
      expectedStart: vi.fn(async () => ({ waitsUntil: new Date("2026-10-01T00:00:00.000Z"), scope: "SITE_DAY" as const }))
    } as unknown as AskRoomPort;
    await expect(application(room).readRun("run:waiting", session, { ownerRef: null, legacyAskerId: "asker:a" }))
      .resolves.toMatchObject({ state: "WAITING", waits_until: "2026-10-01T00:00:00.000Z" });
  });

  it("never invents a start time when no room is composed: a waiting run with no waker is refused by name", async () => {
    // B6b's boot refuses a hosted register without the band while any run waits, so this is unreachable in a
    // correct deployment; if it is reached anyway, the read says so instead of promising "the next minute".
    waitingProjection();
    await expect(application().readRun("run:waiting", session, { ownerRef: null, legacyAskerId: "asker:a" }))
      .rejects.toMatchObject({ code: "WAITING_LINE_REQUIRES_BAND" });
  });
});
