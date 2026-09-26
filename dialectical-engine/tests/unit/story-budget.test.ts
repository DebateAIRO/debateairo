import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  CostEnvelopeGuard,
  PostgresModelSpendStore,
  costEnvelopeDay,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderCallRequest, ProviderCostEnvelopeSeam } from "@debateai/providers";
import { createPostgresProviderGateway } from "@debateai/runner";
import { runStoryLoop } from "@debateai/story";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * Verdict story, Task 7 — the story's allowance is its own (spec §8). Its money
 * is summed over STORY charges only, the run's envelope never sees them, the
 * DAY sees both, and the gateway keeps the two call namespaces apart.
 */

const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
/** At one micro-unit per token: ceil(800 / 2) = 400 input + 64 output = 464 micro-units. */
const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });
const CLOCK = () => new Date("2026-09-26T11:00:00.000Z");
const TODAY = costEnvelopeDay(CLOCK());

function store(spent: { readonly run: number; readonly story: number }) {
  const rows: ModelSpendEntry[] = [];
  const reservations: number[] = [];
  const spendStore: ModelSpendStore = {
    recordSpend: async (entry) => { rows.push(entry); },
    readRunSpentMicros: async () => spent.run,
    readRunStorySpentMicros: async () => spent.story,
    readDaySpentMicros: async () => 0,
    admitNewRun: async (input) => {
      reservations.push(input.reservedMicros);
      return Object.freeze({ admitted: true, committedMicros: 0 });
    }
  };
  return { spendStore, rows, reservations };
}

function guard(spendStore: ModelSpendStore, perStoryCeilingMicros?: number) {
  return new CostEnvelopeGuard({
    store: spendStore,
    policy: {
      perRunCeilingMicros: 250_000,
      dailyCeilingMicros: 2_000_000,
      ...(perStoryCeilingMicros === undefined ? {} : { perStoryCeilingMicros })
    },
    clock: CLOCK
  });
}

describe("the story's money seam counts STORY spend only", () => {
  it("admits a story call that lands exactly on the 50 000 micro-unit ceiling", async () => {
    const { spendStore } = store({ run: 0, story: 50_000 - 464 });
    const seam = guard(spendStore, 50_000).storySeam({ runId: "run-1", price: PRICE, requireReportedUsage: true });
    await expect(seam.assertCallAllowed(PROJECTION)).resolves.toBeUndefined();
  });

  it("refuses the story call that would cross it, under the story's own code", async () => {
    const { spendStore } = store({ run: 0, story: 50_000 - 463 });
    const seam = guard(spendStore, 50_000).storySeam({ runId: "run-1", price: PRICE, requireReportedUsage: true });
    await expect(seam.assertCallAllowed(PROJECTION))
      .rejects.toThrowError(expect.objectContaining({ code: "STORY_COST_ENVELOPE_REACHED" }));
  });

  it("is not stopped by a debate that has spent its whole envelope", async () => {
    const { spendStore } = store({ run: 10_000_000, story: 0 });
    const seam = guard(spendStore, 50_000).storySeam({ runId: "run-1", price: PRICE, requireReportedUsage: true });
    await expect(seam.assertCallAllowed(PROJECTION)).resolves.toBeUndefined();
  });

  it("charges a STORY row that names its run", async () => {
    const { spendStore, rows } = store({ run: 0, story: 0 });
    const seam = guard(spendStore, 50_000).storySeam({ runId: "run-1", price: PRICE, requireReportedUsage: true });
    await seam.recordCall({
      providerRef: "provider-1",
      usage: { prompt_tokens: 300, completion_tokens: 40 },
      projection: PROJECTION
    });
    expect(rows).toEqual([expect.objectContaining({
      spendSource: "STORY", runId: "run-1", providerRef: "provider-1", chargedOn: TODAY,
      chargeMicros: 340, inputTokens: 300, outputTokens: 40
    })]);
  });

  it("cannot be built without the story's ceiling", () => {
    const { spendStore } = store({ run: 0, story: 0 });
    expect(() => guard(spendStore).storySeam({ runId: "run-1", price: PRICE, requireReportedUsage: true }))
      .toThrowError(expect.objectContaining({ code: "STORY_ENVELOPE_MISSING" }));
  });

  it("refuses a story ceiling that is not a positive whole number of micro-units", () => {
    const { spendStore } = store({ run: 0, story: 0 });
    for (const ceiling of [0, -1, 1.5]) {
      expect(() => guard(spendStore, ceiling)).toThrowError("STORY_ENVELOPE_POLICY_INVALID");
    }
  });
});

describe("the run's money seam never sees STORY spend", () => {
  it("admits a debate call whatever the story has spent", async () => {
    const { spendStore } = store({ run: 0, story: 10_000_000 });
    const seam = guard(spendStore, 50_000).providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: true });
    await expect(seam.assertCallAllowed(PROJECTION)).resolves.toBeUndefined();
  });
});

describe("the daily admission reserves the story beside the run", () => {
  it("reserves run + story when the story has a ceiling, and the run alone when it has none", async () => {
    const withStory = store({ run: 0, story: 0 });
    await guard(withStory.spendStore, 50_000).assertDailyEnvelopeAdmitsNewRun();
    expect(withStory.reservations).toEqual([300_000]);
    const withoutStory = store({ run: 0, story: 0 });
    await guard(withoutStory.spendStore).assertDailyEnvelopeAdmitsNewRun();
    expect(withoutStory.reservations).toEqual([250_000]);
  });

  it("refuses a STORY charge with no run before it reaches the database", async () => {
    const query = vi.fn();
    const spendStore = new PostgresModelSpendStore({ query } as unknown as Pool);
    await expect(spendStore.recordSpend({
      spendId: "spend-1", spendSource: "STORY", runId: null, providerRef: "provider-1",
      chargedOn: TODAY, chargeMicros: 1, inputTokens: 1, outputTokens: 1
    })).rejects.toThrowError(expect.objectContaining({ code: "MODEL_SPEND_RUN_REQUIRED" }));
    expect(query).not.toHaveBeenCalled();
  });
});

/**
 * The runner's gateway over a pool double. The pinned basis allows ONE attempt
 * and the ledger already holds one, so the RUN is out of attempts: a story call
 * that still reaches the wire proves it was not asked the run's question.
 * The one story call that gets that far carries an unframed packet, built inside
 * the assertion of the door's refusal (the single allowance
 * tests/architecture/packet-read-through-the-frame.test.ts grants a hand-built
 * packet), so it stops at the gateway's door (PROMPT_FRAME_ABSENT) before any
 * ledger write, which is what keeps this a unit test. Every other case is
 * refused before the door and carries a framed packet.
 */
function gatewayOver(queries: string[], seams: {
  readonly run?: (runId: string) => ProviderCostEnvelopeSeam;
  readonly story?: (runId: string) => ProviderCostEnvelopeSeam;
} = {}) {
  const pool = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("SELECT envelope_basis")) return { rows: [{ envelope_basis: fixtureStructuralCeiling(1) }] };
      if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: "1" }] };
      throw new Error(`UNEXPECTED_QUERY:${sql}`);
    }),
    connect: vi.fn(async () => ({
      query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
        if (sql.includes("run_private_content_is_live")) return {
          rows: [{ run_id: String((values?.[0] as readonly string[])[0]), live: true }]
        };
        if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
        throw new Error(`UNEXPECTED_CLIENT_QUERY:${sql}`);
      }),
      release: vi.fn()
    }))
  } as unknown as Pool;
  return createPostgresProviderGateway(pool, {
    endpoint: "http://127.0.0.1:1",
    model: "test/model",
    maker: "test-maker",
    ...(seams.run === undefined ? {} : { buildCostEnvelopeSeam: seams.run }),
    ...(seams.story === undefined ? {} : { buildStoryCostEnvelopeSeam: seams.story })
  });
}

function request(overrides: Partial<ProviderCallRequest>): ProviderCallRequest {
  return {
    runId: "run:story-scope",
    subjectItemId: "work:story-scope",
    callSiteKey: "STORY:STORYTELLER:1",
    role: "SYNTHESIZER",
    lane: "story",
    bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 1_000 },
    contractHash: "a".repeat(64),
    providerRef: "provider:test",
    packet: framedFixturePacket("story scope"),
    ...overrides
  };
}

const NOOP_SEAM: ProviderCostEnvelopeSeam = {
  assertCallAllowed: () => undefined,
  recordCall: () => undefined,
  assertUsageReported: () => undefined
};

describe("the runner's gateway keeps the story lane and the STORY: namespace together", () => {
  it("refuses a story lane without a STORY: call site, before anything is read", async () => {
    const queries: string[] = [];
    await expect(gatewayOver(queries).call(request({ callSiteKey: "JUDGE" })))
      .rejects.toMatchObject({ code: "STORY_PROVIDER_SCOPE_UNAUTHORIZED" });
    expect(queries).toEqual([]);
  });

  it("refuses a STORY: call site on a debate lane", async () => {
    const queries: string[] = [];
    await expect(gatewayOver(queries).call(request({ lane: "served", role: "JUDGE" })))
      .rejects.toMatchObject({ code: "STORY_PROVIDER_SCOPE_UNAUTHORIZED" });
    expect(queries).toEqual([]);
  });

  it("never asks the run's attempt ceiling about a story call, and hands it the STORY seam", async () => {
    const queries: string[] = [];
    const runSeam = vi.fn(() => NOOP_SEAM);
    const storySeam = vi.fn(() => NOOP_SEAM);
    await expect(gatewayOver(queries, { run: runSeam, story: storySeam }).call(request({
      packet: { messages: [{ role: "user", content: "unframed on purpose" }] }
    }))).rejects.toMatchObject({ code: "PROMPT_FRAME_ABSENT" });
    expect(queries.some((sql) => sql.includes("SELECT envelope_basis"))).toBe(false);
    expect(storySeam).toHaveBeenCalledWith("run:story-scope");
    expect(runSeam).not.toHaveBeenCalled();
  });

  it("still stops a DEBATE call on the same spent run (the control above is not vacuous)", async () => {
    const queries: string[] = [];
    await expect(gatewayOver(queries).call(request({
      lane: "served", role: "JUDGE", callSiteKey: "JUDGE:review:after-story"
    }))).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_EXHAUSTED" });
    expect(queries.some((sql) => sql.includes("SELECT envelope_basis"))).toBe(true);
  });

  it("refuses a story call on a metered gateway that was given no story seam", async () => {
    const queries: string[] = [];
    await expect(gatewayOver(queries, { run: () => NOOP_SEAM }).call(request({})))
      .rejects.toMatchObject({ code: "STORY_ENVELOPE_MISSING" });
    expect(queries).toEqual([]);
  });
});

describe("the story loop reads the story seam's refusal by the code this task raises", () => {
  // The mapping is Task 4's; this row pins that the
  // code the SEAM raises and the code the LOOP maps are the same string, and
  // that the FAILED outcome's `cause` (Task 4 review) names that code.
  it("maps the story seam's refusal to STORY_ENVELOPE_EXHAUSTED", async () => {
    const { spendStore } = store({ run: 0, story: 50_000 });
    const seam = guard(spendStore, 50_000).storySeam({ runId: "run-1", price: PRICE, requireReportedUsage: true });
    const refusal = await seam.assertCallAllowed(PROJECTION).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(TypedDomainError);
    await expect(runStoryLoop({ maxRounds: 2 }, {
      writeStory: async () => { throw refusal; },
      checkStory: async () => { throw new Error("unreachable"); }
    })).resolves.toEqual({
      outcome: "FAILED",
      failureCode: "STORY_ENVELOPE_EXHAUSTED",
      cause: "STORY_COST_ENVELOPE_REACHED",
      rounds: []
    });
  });
});
