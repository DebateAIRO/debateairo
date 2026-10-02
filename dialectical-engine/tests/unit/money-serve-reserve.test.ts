import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  BudgetRepository,
  CostEnvelopeGuard,
  attemptCeilingForPhase,
  costEnvelopeDay,
  mostOneRunMaySpendMicros,
  parseCostEnvelopeBasis,
  type CostEnvelopePhase,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import type { ProviderCallRequest, ProviderCostEnvelopeSeam } from "@debateai/providers";
import {
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW,
  computeStructuralCeilingBasis,
  costEnvelopeCeilings,
  costEnvelopePolicyFromValue
} from "@debateai/register";
import { TypedDomainError } from "@debateai/kernel";
import {
  createPostgresProviderGateway,
  createPostgresReviewCatchUpDependencies,
  providerCallCostEnvelopePhase
} from "@debateai/runner";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * Engine money rule, Task M1 (spec 2026-09-26 §14.4.1): part of every debate's
 * money is SET ASIDE for writing the answer, and the answer may go a little
 * OVER the per-run ceiling. Two ceilings over the ONE run total:
 *
 *   a call while the debate is argued (BODY)  sees perRun x (10000 - reserve) / 10000
 *   an answer-writing call (SERVE)            sees perRun x (10000 + overrun) / 10000
 *
 * both in whole micro-units, rounded DOWN. The attempt ceiling gets the same
 * reserve in calls, and the day reserves what one run may now spend at most.
 * This task changes no outcome after a refusal: that is M2's and M3's.
 */

const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
/** At one micro-unit per token: ceil(800 / 2) = 400 input + 64 output = 464 micro-units. */
const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });
const PROJECTED = 464;
const NOW = new Date("2026-09-27T11:00:00.000Z");

/** The code-owned row's value as it stood before this task: no reserve and no overrun members. */
function rowWithoutTheMembers(): Record<string, unknown> {
  const value: Record<string, unknown> = { ...COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value };
  delete value.serve_reserve_basis_points;
  delete value.serve_overrun_basis_points;
  return value;
}

function policyCode(value: unknown): string {
  try {
    costEnvelopePolicyFromValue(value, "test");
  } catch (error) {
    return error instanceof TypedDomainError ? error.code : "UNTYPED";
  }
  return "PARSED";
}

describe("M1 the cost-envelope policy carries a reserve and an overrun", () => {
  it("parses an OLD row without the two members, and both then mean 0", () => {
    const policy = costEnvelopePolicyFromValue(rowWithoutTheMembers(), "old row");
    expect(policy.serveReserveBasisPoints).toBe(0);
    expect(policy.serveOverrunBasisPoints).toBe(0);
    expect(policy.perRunCeilingMicros).toBe(250_000);
  });

  it("parses a row that carries them", () => {
    const policy = costEnvelopePolicyFromValue({
      ...rowWithoutTheMembers(), serve_reserve_basis_points: 3_000, serve_overrun_basis_points: 2_000
    }, "new row");
    expect(policy.serveReserveBasisPoints).toBe(3_000);
    expect(policy.serveOverrunBasisPoints).toBe(2_000);
  });

  it("ships the code-owned row with a 3000 reserve and a 2000 overrun (a NEW version of the row)", () => {
    expect(COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value).toMatchObject({
      serve_reserve_basis_points: 3_000,
      serve_overrun_basis_points: 2_000
    });
    const policy = costEnvelopePolicyFromValue(
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value,
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    );
    expect(policy).toMatchObject({ serveReserveBasisPoints: 3_000, serveOverrunBasisPoints: 2_000 });
  });

  it("refuses a reserve outside 0..9999 and an overrun outside 0..10000, and any non-integer", () => {
    const base = rowWithoutTheMembers();
    for (const [name, broken] of [
      ["reserve of the whole ceiling", { serve_reserve_basis_points: 10_000 }],
      ["negative reserve", { serve_reserve_basis_points: -1 }],
      ["fractional reserve", { serve_reserve_basis_points: 1.5 }],
      ["reserve as text", { serve_reserve_basis_points: "3000" }],
      ["overrun above the whole ceiling", { serve_overrun_basis_points: 10_001 }],
      ["negative overrun", { serve_overrun_basis_points: -1 }],
      ["fractional overrun", { serve_overrun_basis_points: 2.5 }],
      ["null overrun", { serve_overrun_basis_points: null }]
    ] as const) {
      expect(policyCode({ ...base, ...broken }), name).toBe("COST_ENVELOPE_POLICY_INVALID");
    }
    // The edges themselves are lawful.
    expect(policyCode({ ...base, serve_reserve_basis_points: 9_999 })).toBe("PARSED");
    expect(policyCode({ ...base, serve_reserve_basis_points: 0, serve_overrun_basis_points: 0 })).toBe("PARSED");
    expect(policyCode({ ...base, serve_overrun_basis_points: 10_000, daily_ceiling_micros: 500_000 })).toBe("PARSED");
  });

  it("refuses a daily ceiling below what one run may now spend: per-run x (1 + overrun), rounded up", () => {
    const base = { ...rowWithoutTheMembers(), per_run_ceiling_micros: 250_000, serve_overrun_basis_points: 2_000 };
    expect(policyCode({ ...base, daily_ceiling_micros: 299_999 })).toBe("COST_ENVELOPE_POLICY_INVALID");
    expect(policyCode({ ...base, daily_ceiling_micros: 300_000 })).toBe("PARSED");
    // Rounded UP: 3 x 1.0001 = 3.0003 needs a daily ceiling of 4, not 3.
    const odd = { ...rowWithoutTheMembers(), per_run_ceiling_micros: 3, serve_overrun_basis_points: 1 };
    expect(policyCode({ ...odd, daily_ceiling_micros: 3 })).toBe("COST_ENVELOPE_POLICY_INVALID");
    expect(policyCode({ ...odd, daily_ceiling_micros: 4 })).toBe("PARSED");
    // Without an overrun the old rule stands exactly: daily >= per-run.
    const plain = { ...rowWithoutTheMembers(), per_run_ceiling_micros: 250_000 };
    expect(policyCode({ ...plain, daily_ceiling_micros: 249_999 })).toBe("COST_ENVELOPE_POLICY_INVALID");
    expect(policyCode({ ...plain, daily_ceiling_micros: 250_000 })).toBe("PARSED");
  });
});

describe("M1 the two ceilings, in whole micro-units", () => {
  it("gives the body the reduced ceiling and the answer the raised one", () => {
    expect(costEnvelopeCeilings({
      perRunCeilingMicros: 250_000, serveReserveBasisPoints: 3_000, serveOverrunBasisPoints: 2_000
    })).toEqual({ bodyMicros: 175_000, serveMicros: 300_000, runMaximumMicros: 300_000 });
  });

  it("rounds both ceilings DOWN and the run's maximum UP", () => {
    // 7 x 0.7 = 4.9 -> 4; 7 x 1.2 = 8.4 -> 8 (a ceiling); 8.4 -> 9 (a reservation).
    expect(costEnvelopeCeilings({
      perRunCeilingMicros: 7, serveReserveBasisPoints: 3_000, serveOverrunBasisPoints: 2_000
    })).toEqual({ bodyMicros: 4, serveMicros: 8, runMaximumMicros: 9 });
  });

  it("is today's single ceiling exactly when the members are missing", () => {
    expect(costEnvelopeCeilings({ perRunCeilingMicros: 250_000 }))
      .toEqual({ bodyMicros: 250_000, serveMicros: 250_000, runMaximumMicros: 250_000 });
  });

  it("refuses terms the policy schema would refuse", () => {
    for (const terms of [
      { perRunCeilingMicros: 250_000, serveReserveBasisPoints: 10_000 },
      { perRunCeilingMicros: 250_000, serveOverrunBasisPoints: 10_001 },
      { perRunCeilingMicros: 250_000, serveReserveBasisPoints: 0.5 },
      { perRunCeilingMicros: 0 }
    ]) {
      expect(() => costEnvelopeCeilings(terms), JSON.stringify(terms))
        .toThrowError(expect.objectContaining({ code: "COST_ENVELOPE_POLICY_INVALID" }));
    }
  });
});

/** A spend store whose run total is fixed, and which keeps every row and reservation it is given. */
function spendStore(runSpentMicros = 0) {
  const rows: ModelSpendEntry[] = [];
  const reservations: number[] = [];
  const store: ModelSpendStore = {
    recordSpend: async (entry) => { rows.push(entry); },
    readRunSpentMicros: async () => runSpentMicros,
    readRunStorySpentMicros: async () => 0,
    readDaySpentMicros: async () => 0,
    admitNewRun: async (input) => {
      reservations.push(input.reservedMicros);
      return Object.freeze({ admitted: true, committedMicros: 0 });
    }
  };
  return { store, rows, reservations };
}

type GuardPolicy = ConstructorParameters<typeof CostEnvelopeGuard>[0]["policy"];

function seamAt(policy: GuardPolicy, phase: CostEnvelopePhase, runSpentMicros: number) {
  return new CostEnvelopeGuard({ store: spendStore(runSpentMicros).store, policy, clock: () => NOW })
    .providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: true, phase });
}

async function decisionAt(policy: GuardPolicy, phase: CostEnvelopePhase, runSpentMicros: number): Promise<string> {
  return seamAt(policy, phase, runSpentMicros).assertCallAllowed(PROJECTION).then(
    () => "ADMITTED",
    (error: unknown) => (error instanceof TypedDomainError ? error.code : "UNTYPED")
  );
}

describe("M1 the guard's run seam compares the run's TOTAL with its phase's ceiling", () => {
  const POLICY = Object.freeze({
    perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000,
    serveReserveBasisPoints: 3_000, serveOverrunBasisPoints: 2_000
  });

  it("refuses a BODY call past 70% that a SERVE call on the same run may still make", async () => {
    // 175 000 spent: the body has nothing left; the answer has 125 000 left.
    expect(await decisionAt(POLICY, "BODY", 175_000)).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(await decisionAt(POLICY, "SERVE", 175_000)).toBe("ADMITTED");
    // Past the per-run ceiling itself, the answer still has its 20% margin.
    expect(await decisionAt(POLICY, "SERVE", 250_000)).toBe("ADMITTED");
    expect(await decisionAt(POLICY, "SERVE", 300_000 - PROJECTED + 1)).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
  });

  it("admits exact equality and refuses one micro-unit over, on ceilings rounded down", async () => {
    // body = floor(1 007 x 0.7) = floor(704.9) = 704; serve = floor(1 007 x 1.2) = floor(1 208.4) = 1 208.
    const odd = { perRunCeilingMicros: 1_007, dailyCeilingMicros: 2_000,
      serveReserveBasisPoints: 3_000, serveOverrunBasisPoints: 2_000 };
    expect(await decisionAt(odd, "BODY", 704 - PROJECTED)).toBe("ADMITTED");
    expect(await decisionAt(odd, "BODY", 704 - PROJECTED + 1)).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(await decisionAt(odd, "SERVE", 1_208 - PROJECTED)).toBe("ADMITTED");
    expect(await decisionAt(odd, "SERVE", 1_208 - PROJECTED + 1)).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
  });

  it("behaves exactly as today when the policy has neither member", async () => {
    const today = { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000 };
    for (const phase of ["BODY", "SERVE"] as const) {
      expect(await decisionAt(today, phase, 250_000 - PROJECTED), phase).toBe("ADMITTED");
      expect(await decisionAt(today, phase, 250_000 - PROJECTED + 1), phase).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    }
  });

  it("names the phase ceiling it refused against", async () => {
    await expect(seamAt(POLICY, "BODY", 175_000).assertCallAllowed(PROJECTION))
      .rejects.toThrowError(/of 175000 USD micro-units/u);
    await expect(seamAt(POLICY, "SERVE", 300_000).assertCallAllowed(PROJECTION))
      .rejects.toThrowError(/of 300000 USD micro-units/u);
  });

  it("refuses to build a run seam without a known phase", () => {
    const guard = new CostEnvelopeGuard({ store: spendStore().store, policy: POLICY, clock: () => NOW });
    expect(() => guard.providerSeam({
      runId: "run-1", price: PRICE, requireReportedUsage: true, phase: "PREPARE" as CostEnvelopePhase
    })).toThrowError("MODEL_SPEND_PHASE_INVALID");
  });

  it("refuses to be built over reserve or overrun terms the policy would refuse", () => {
    for (const policy of [
      { ...POLICY, serveReserveBasisPoints: 10_000 },
      { ...POLICY, serveOverrunBasisPoints: -1 }
    ]) {
      expect(() => new CostEnvelopeGuard({ store: spendStore().store, policy }))
        .toThrowError(expect.objectContaining({ code: "COST_ENVELOPE_POLICY_INVALID" }));
    }
  });
});

describe("M1 each RUN charge records the phase that spent it (R12, migration 0075)", () => {
  it("leaves one BODY row and one SERVE row, and a STORY row with no phase", async () => {
    const { store, rows } = spendStore();
    const guard = new CostEnvelopeGuard({
      store,
      policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000, perStoryCeilingMicros: 50_000 },
      clock: () => NOW
    });
    const usage = { prompt_tokens: 10, completion_tokens: 5 };
    for (const phase of ["BODY", "SERVE"] as const) {
      await guard.providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: true, phase })
        .recordCall({ providerRef: "provider-1", usage, projection: PROJECTION });
    }
    await guard.storySeam({ runId: "run-1", price: PRICE, requireReportedUsage: true })
      .recordCall({ providerRef: "provider-1", usage, projection: PROJECTION });

    expect(rows.map((row) => [row.spendSource, row.spendPhase ?? null])).toEqual([
      ["RUN", "BODY"], ["RUN", "SERVE"], ["STORY", null]
    ]);
    expect(rows.every((row) => row.chargedOn === costEnvelopeDay(NOW) && row.chargeMicros === 15)).toBe(true);
  });
});

describe("M1 the day reserves the most one run may now spend", () => {
  it("is per-run plus the story's ceiling without an overrun, as before", () => {
    expect(mostOneRunMaySpendMicros({ perRunCeilingMicros: 250_000, perStoryCeilingMicros: 50_000 })).toBe(300_000);
    expect(mostOneRunMaySpendMicros({ perRunCeilingMicros: 250_000 })).toBe(250_000);
  });

  it("adds the answer's overrun, rounded up", () => {
    expect(mostOneRunMaySpendMicros({
      perRunCeilingMicros: 250_000, serveOverrunBasisPoints: 2_000, perStoryCeilingMicros: 50_000
    })).toBe(350_000);
    expect(mostOneRunMaySpendMicros({ perRunCeilingMicros: 7, serveOverrunBasisPoints: 2_000 })).toBe(9);
    // The reserve moves money INSIDE the run's ceiling; it does not change the run's maximum.
    expect(mostOneRunMaySpendMicros({ perRunCeilingMicros: 250_000, serveReserveBasisPoints: 3_000 })).toBe(250_000);
  });

  it("is the amount the guard reserves when it admits a new run", async () => {
    const withOverrun = spendStore();
    await new CostEnvelopeGuard({
      store: withOverrun.store,
      policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000,
        serveReserveBasisPoints: 3_000, serveOverrunBasisPoints: 2_000, perStoryCeilingMicros: 50_000 },
      clock: () => NOW
    }).assertDailyEnvelopeAdmitsNewRun();
    const without = spendStore();
    await new CostEnvelopeGuard({
      store: without.store,
      policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000, perStoryCeilingMicros: 50_000 },
      clock: () => NOW
    }).assertDailyEnvelopeAdmitsNewRun();

    expect(withOverrun.reservations).toEqual([350_000]);
    expect(without.reservations).toEqual([300_000]);
  });
});

describe("M1 a call's phase is decided from its role AND its lane", () => {
  const phaseOf = (role: ProviderCallRequest["role"], lane: ProviderCallRequest["lane"]) =>
    providerCallCostEnvelopePhase({ role, lane });

  it("is SERVE only for the answer-writing pair on the served lane", () => {
    expect(phaseOf("SYNTHESIZER", "served")).toBe("SERVE");
    expect(phaseOf("EVALUATOR", "served")).toBe("SERVE");
  });

  it("is BODY for a JUDGE call on the served lane: the judges use that lane too", () => {
    expect(phaseOf("JUDGE", "served")).toBe("BODY");
  });

  it("is BODY for every other pairing", () => {
    expect(phaseOf("SYNTHESIZER", "uniform-panel")).toBe("BODY");
    expect(phaseOf("EVALUATOR", "evaluator")).toBe("BODY");
    expect(phaseOf("JUDGE", "uniform-panel")).toBe("BODY");
    expect(phaseOf("COMPOSER", "served")).toBe("BODY");
    expect(phaseOf("CLASSIFIER", "critic-exempt")).toBe("BODY");
  });
});

/**
 * The runner's gateway over a pool double. The pinned basis and the run's
 * attempt count are the double's; the money seam records the phase it was
 * built for and then refuses before anything is sent, so nothing is written
 * and the call never leaves the process.
 */
const SENT_NOTHING = "M1_TEST_SEAM_REFUSED_BEFORE_SENDING";

function gatewayOver(input: {
  readonly basis: unknown;
  readonly runAttempts: number;
  readonly phases: CostEnvelopePhase[];
}) {
  const pool = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT envelope_basis")) return { rows: [{ envelope_basis: input.basis }] };
      if (sql.includes("SELECT count(*)::text") && sql.includes("NOT LIKE 'STORY:%'")) {
        return { rows: [{ count: String(input.runAttempts) }] };
      }
      if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: "0" }] };
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
  const refusing: ProviderCostEnvelopeSeam = {
    assertCallAllowed: () => { throw new TypedDomainError(SENT_NOTHING, "refused before sending"); },
    recordCall: () => undefined,
    assertUsageReported: () => undefined
  };
  return createPostgresProviderGateway(pool, {
    endpoint: "http://127.0.0.1:1",
    model: "test/model",
    maker: "test-maker",
    buildCostEnvelopeSeam: (_runId: string, phase: CostEnvelopePhase) => {
      input.phases.push(phase);
      return refusing;
    }
  });
}

function debateCall(overrides: Partial<ProviderCallRequest>): ProviderCallRequest {
  return {
    runId: "run:m1-phase",
    subjectItemId: "work:m1-phase",
    callSiteKey: "JUDGE:node:1",
    role: "JUDGE",
    lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 1_000 },
    contractHash: "a".repeat(64),
    providerRef: "provider:test",
    packet: framedFixturePacket("m1 phase"),
    ...overrides
  };
}

async function outcomeOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "SENT",
    (error: unknown) => (error instanceof TypedDomainError ? error.code : String(error))
  );
}

/** A basis minted by the shipped formula: panel 2, one level of expansion, the sealed serve leg. */
function mintedBasis() {
  return computeStructuralCeilingBasis({
    panelSize: 2, depth: 1, maxDepth: 5,
    judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1,
    maxRecompose: 1, maxCooldownHoldsPerRun: 2, branchingFactor: 2,
    compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
    reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3
  });
}

describe("M1 the runner's gateway hands the money seam the call's phase", () => {
  it("builds a BODY seam for a judge call and a SERVE seam for each answer-writing call", async () => {
    const phases: CostEnvelopePhase[] = [];
    const basis = fixtureStructuralCeiling(1_000);
    const gateway = gatewayOver({ basis, runAttempts: 0, phases });
    for (const call of [
      debateCall({}),
      debateCall({ role: "SYNTHESIZER", callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1" }),
      debateCall({ role: "EVALUATOR", callSiteKey: "POST_COMPOSE_R9:EVALUATOR:1" })
    ]) {
      expect(await outcomeOf(gateway.call(call))).toBe(SENT_NOTHING);
    }
    expect(phases).toEqual(["BODY", "SERVE", "SERVE"]);
  });
});

describe("M1 the attempt ceiling holds the answer's calls back from the body", () => {
  it("mints the serve leg's attempts on the basis: serve sites x organ attempts", () => {
    const basis = mintedBasis();
    expect(basis.call_sites).toMatchObject({ serve: 6 });
    expect(basis.per_site_attempts).toMatchObject({ organ: 3 });
    expect(basis.serve_reserve_attempts).toBe(18);
    expect(parseCostEnvelopeBasis(basis).serveReserveAttempts).toBe(18);
  });

  it("reads an OLD basis without the member as a reserve of 0 (today's ceiling for every call)", () => {
    const old = parseCostEnvelopeBasis(fixtureStructuralCeiling(20));
    expect(old.serveReserveAttempts).toBe(0);
    expect(attemptCeilingForPhase(old, "BODY")).toBe(20);
    expect(attemptCeilingForPhase(old, "SERVE")).toBe(20);
  });

  it("gives the body the ceiling less the serve leg, and the answer the whole ceiling", () => {
    const basis = parseCostEnvelopeBasis(mintedBasis());
    expect(attemptCeilingForPhase(basis, "BODY")).toBe(basis.maxModelAttempts - 18);
    expect(attemptCeilingForPhase(basis, "SERVE")).toBe(basis.maxModelAttempts);
  });

  it("refuses a basis whose reserve disagrees with the serve leg it discloses, or exceeds its ceiling", () => {
    const basis = mintedBasis();
    for (const broken of [
      { ...basis, serve_reserve_attempts: 17 },
      { ...basis, serve_reserve_attempts: -1 },
      { ...basis, serve_reserve_attempts: 1.5 },
      { ...fixtureStructuralCeiling(5), serve_reserve_attempts: 6 }
    ]) {
      expect(() => parseCostEnvelopeBasis(broken))
        .toThrowError(expect.objectContaining({ code: "RUN_COST_ENVELOPE_UNRESOLVED" }));
    }
  });

  it("refuses a BODY attempt at ceiling - serve leg while a SERVE attempt still passes", async () => {
    // The fixture discloses 6 serve sites x 1 organ attempt: a reserve of 6.
    const basis = { ...fixtureStructuralCeiling(20), serve_reserve_attempts: 6 };
    const at = (runAttempts: number) => {
      const pool = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("SELECT envelope_basis")) return { rows: [{ envelope_basis: basis }] };
          if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: String(runAttempts) }] };
          throw new Error(`UNEXPECTED_QUERY:${sql}`);
        })
      } as unknown as Pool;
      return new BudgetRepository(pool);
    };
    const code = (promise: Promise<void>) => outcomeOf(promise);
    expect(await code(at(13).assertModelAttemptAllowed("run-1", "BODY"))).toBe("SENT");
    expect(await code(at(14).assertModelAttemptAllowed("run-1", "BODY"))).toBe("RUN_COST_ENVELOPE_EXHAUSTED");
    expect(await code(at(14).assertModelAttemptAllowed("run-1", "SERVE"))).toBe("SENT");
    expect(await code(at(19).assertModelAttemptAllowed("run-1", "SERVE"))).toBe("SENT");
    expect(await code(at(20).assertModelAttemptAllowed("run-1", "SERVE"))).toBe("RUN_COST_ENVELOPE_EXHAUSTED");
  });

  /**
   * M2 review polish — THE ATTEMPT REFUSAL CARRIES ITS COUNTS. The first-call
   * failure (`RUN_CEILING_BELOW_FIRST_CALL`) keeps the refusal's message as its
   * evidence; for money that evidence was always "spent X of Y", but for the
   * attempt ceiling it named no number, so a ceiling set too low could not be
   * told from a re-claim that inherited the earlier claim's attempts. Here a
   * re-claim-like run already holds 14 attempts against a BODY share of 14.
   */
  it("names the attempt it refused, the phase's ceiling and the whole ceiling", async () => {
    const basis = { ...fixtureStructuralCeiling(20), serve_reserve_attempts: 6 };
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT envelope_basis")) return { rows: [{ envelope_basis: basis }] };
        if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: "14" }] };
        throw new Error(`UNEXPECTED_QUERY:${sql}`);
      })
    } as unknown as Pool;
    const refusal = await new BudgetRepository(pool).assertModelAttemptAllowed("run-1", "BODY")
      .then(() => null, (error: unknown) => error);

    expect(refusal).toMatchObject({ code: "RUN_COST_ENVELOPE_EXHAUSTED" });
    expect((refusal as Error).message).toContain("attempt 15 of a BODY ceiling of 14");
    expect((refusal as Error).message).toContain("the whole ceiling is 20");
  });

  it("does the same through the runner's gateway: the judge is refused, the answer-writer reaches the money seam", async () => {
    const basis = { ...fixtureStructuralCeiling(20), serve_reserve_attempts: 6 };
    const phases: CostEnvelopePhase[] = [];
    const gateway = gatewayOver({ basis, runAttempts: 14, phases });

    expect(await outcomeOf(gateway.call(debateCall({})))).toBe("RUN_COST_ENVELOPE_EXHAUSTED");
    expect(await outcomeOf(gateway.call(debateCall({
      role: "SYNTHESIZER", callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1"
    })))).toBe(SENT_NOTHING);
    // The judge was refused before any seam was built; the answer-writer got a SERVE seam.
    expect(phases).toEqual(["SERVE"]);
  });
});

/**
 * M1 review, item 1: the review catch-up's calls are JUDGE calls on the served
 * lane, so they are BODY calls and are refused at the ceiling less the
 * answer's reserve. The catch-up's report (`envelopeRemaining`) must be taken
 * against that same ceiling, or it overstates what is left by the reserve.
 */
describe("M1 the review catch-up measures what is left against the BODY ceiling", () => {
  function catchUpOver(basis: unknown) {
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT envelope_basis")) return { rows: [{ envelope_basis: basis }] };
        throw new Error(`UNEXPECTED_QUERY:${sql}`);
      })
    } as unknown as Pool;
    // Only the pinned-ceiling read is exercised; nothing else is touched.
    return createPostgresReviewCatchUpDependencies({ pool, reviewers: [] } as unknown as
      Parameters<typeof createPostgresReviewCatchUpDependencies>[0]);
  }

  it("reads the pinned ceiling less the answer's reserve", async () => {
    const basis = { ...fixtureStructuralCeiling(20), serve_reserve_attempts: 6 };
    await expect(catchUpOver(basis).readPinnedMaximumAttempts("run-1")).resolves.toBe(14);
    expect(attemptCeilingForPhase(parseCostEnvelopeBasis(basis), "BODY")).toBe(14);
  });

  it("reads the whole ceiling for a receipt minted before the reserve existed", async () => {
    await expect(catchUpOver(fixtureStructuralCeiling(20)).readPinnedMaximumAttempts("run-1")).resolves.toBe(20);
  });
});

describe("M1 the runner's hosted composition passes the phase to the guard", () => {
  it("builds the per-call run seam from the run id, the phase and the wall (B9)", async () => {
    const source = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    expect(source).toContain("buildCostEnvelopeSeam: (runId: string, phase: CostEnvelopePhase, sharedWall: SharedWallApplication) =>");
    expect(source).toMatch(/providerSeam\(\{\s*runId, price, requireReportedUsage: true, phase, sharedWall\s*\}\)/u);
  });
});
