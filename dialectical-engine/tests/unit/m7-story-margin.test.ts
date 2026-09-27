import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CostEnvelopeGuard,
  costEnvelopeDay,
  costEnvelopeGuardPolicy,
  mostOneRunMaySpendMicros,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import {
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW,
  buildStoryRegisterRows,
  costEnvelopePolicyFromValue,
  readStoryPolicy,
  storyEnvelopeCeilings,
  type StoryRegisterRow
} from "@debateai/register";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.6 and §14.4.1), TASK M7 — THE
 * STORY'S MONEY MARGIN, AND ONE CHECK OVER BOTH MONEY ROWS.
 *
 *  · The code-owned story row gains `per_story_overrun_basis_points: 2000`: a
 *    story may go 20% over its cap, 50 000 x 1.2 = 60 000 micro-units. A row
 *    without the member means 0, exactly today's cap.
 *  · The story's ceiling is `perStory x (10000 + overrun) / 10000`, rounded
 *    DOWN; what the day reserves for it is the same share rounded UP.
 *  · The day reserves `perRun x (1 + overrun) + perStory x (1 + storyOverrun)`
 *    for each new run (`mostOneRunMaySpendMicros`).
 *  · The cost-envelope row's own schema cannot see the story row, so ONE check
 *    reads both (`costEnvelopeGuardPolicy`): at hosted publication and at both
 *    boots, a day that cannot hold one full run plus its story is refused by
 *    name (STORY_DAILY_CEILING_INSUFFICIENT).
 */

const HOSTED = Object.freeze({
  synthesizerRoleRef: "provider:synthesizer",
  evaluatorRoleRef: "provider:evaluator",
  sourceRef: "test-layer:m7",
  hosted: true
});

const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
/** At one micro-unit per token: ceil(800 / 2) = 400 input + 64 output = 464 micro-units. */
const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });
const PROJECTED = 464;
const NOW = new Date("2026-09-27T11:00:00.000Z");

/** The shipped cost-envelope row, as a hosted boot would read it. */
const RUN_POLICY = costEnvelopePolicyFromValue(
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value,
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
);

function codeOf(action: () => unknown): string | null {
  try {
    action();
    return null;
  } catch (error) {
    const code = (error as { readonly code?: unknown }).code;
    return typeof code === "string" ? code : `UNTYPED:${String(error)}`;
  }
}

function storyMoneyRow(rows: readonly StoryRegisterRow[]): Record<string, unknown> {
  const row = rows.find((candidate) => candidate.rowKey === "storyCostEnvelopePolicy");
  if (row === undefined) throw new Error("TEST_STORY_MONEY_ROW_MISSING");
  return { ...(row.value as Record<string, unknown>) };
}

function withStoryMoney(value: Record<string, unknown>): StoryRegisterRow[] {
  return buildStoryRegisterRows(HOSTED).map((row) => (row.rowKey === "storyCostEnvelopePolicy" ? { ...row, value } : row));
}

function spendStore(storySpentMicros = 0) {
  const rows: ModelSpendEntry[] = [];
  const reservations: number[] = [];
  const store: ModelSpendStore = {
    recordSpend: async (entry) => { rows.push(entry); },
    readRunSpentMicros: async () => 0,
    readRunStorySpentMicros: async () => storySpentMicros,
    readDaySpentMicros: async () => 0,
    admitNewRun: async (input) => {
      reservations.push(input.reservedMicros);
      return Object.freeze({ admitted: true, committedMicros: 0 });
    }
  };
  return { store, rows, reservations };
}

describe("M7 · the story row carries its overrun (a NEW version of the code-owned row)", () => {
  it("seals per_story_overrun_basis_points 2000 beside the 50 000 cap, hosted only", () => {
    expect(storyMoneyRow(buildStoryRegisterRows(HOSTED))).toMatchObject({
      per_story_ceiling_micros: 50_000,
      per_story_overrun_basis_points: 2_000
    });
    const policy = readStoryPolicy(buildStoryRegisterRows(HOSTED), 9);
    expect(policy?.perStoryCeilingMicros).toBe(50_000);
    expect(policy?.perStoryOverrunBasisPoints).toBe(2_000);
    // Local seals no money row, so there is nothing to go over.
    expect(readStoryPolicy(buildStoryRegisterRows({ ...HOSTED, hosted: false }), 9)?.perStoryOverrunBasisPoints).toBe(0);
  });

  it("reads a money row sealed before the member existed as 0: no margin, today's cap", () => {
    const value = storyMoneyRow(buildStoryRegisterRows(HOSTED));
    delete value.per_story_overrun_basis_points;
    const policy = readStoryPolicy(withStoryMoney(value), 9);
    expect(policy?.perStoryCeilingMicros).toBe(50_000);
    expect(policy?.perStoryOverrunBasisPoints).toBe(0);
  });

  it("refuses an overrun outside 0..10000 whole basis points, by the story's own code", () => {
    for (const overrun of [-1, 10_001, 1.5, "2000", null]) {
      const value = { ...storyMoneyRow(buildStoryRegisterRows(HOSTED)), per_story_overrun_basis_points: overrun };
      expect(codeOf(() => readStoryPolicy(withStoryMoney(value), 9)), JSON.stringify(overrun)).toBe("STORY_POLICY_INVALID");
    }
    for (const overrun of [0, 10_000]) {
      const value = { ...storyMoneyRow(buildStoryRegisterRows(HOSTED)), per_story_overrun_basis_points: overrun };
      expect(readStoryPolicy(withStoryMoney(value), 9)?.perStoryOverrunBasisPoints).toBe(overrun);
    }
  });
});

describe("M7 · the story's ceiling with its margin", () => {
  it("is perStory x (10000 + overrun) / 10000: 60 000 with today's values, 50 000 without the member", () => {
    expect(storyEnvelopeCeilings({ perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: 2_000 }))
      .toEqual({ storyMicros: 60_000, storyMaximumMicros: 60_000 });
    expect(storyEnvelopeCeilings({ perStoryCeilingMicros: 50_000 }))
      .toEqual({ storyMicros: 50_000, storyMaximumMicros: 50_000 });
  });

  it("rounds the ceiling DOWN and what the day holds for it UP", () => {
    // 7 x 1.2 = 8.4: the story stops at 8, the day holds 9.
    expect(storyEnvelopeCeilings({ perStoryCeilingMicros: 7, perStoryOverrunBasisPoints: 2_000 }))
      .toEqual({ storyMicros: 8, storyMaximumMicros: 9 });
  });

  it("refuses terms no story row could seal", () => {
    for (const terms of [
      { perStoryCeilingMicros: 0 },
      { perStoryCeilingMicros: 1.5 },
      { perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: -1 },
      { perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: 10_001 }
    ]) {
      expect(codeOf(() => storyEnvelopeCeilings(terms)), JSON.stringify(terms)).toBe("STORY_ENVELOPE_POLICY_INVALID");
    }
  });

  it("lets the story seam admit a call landing exactly on 60 000 and refuse the one that would cross it", async () => {
    const policy = { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000,
      perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: 2_000 };
    const at = (spent: number) => new CostEnvelopeGuard({ store: spendStore(spent).store, policy, clock: () => NOW })
      .storySeam({ runId: "run-1", price: PRICE, requireReportedUsage: true })
      .assertCallAllowed(PROJECTION);
    await expect(at(60_000 - PROJECTED)).resolves.toBeUndefined();
    await expect(at(60_000 - PROJECTED + 1))
      .rejects.toThrowError(expect.objectContaining({ code: "STORY_COST_ENVELOPE_REACHED" }));
    // Past the old cap of 50 000 and inside the margin: admitted now, refused before.
    await expect(at(55_000)).resolves.toBeUndefined();
  });

  it("keeps today's 50 000 ceiling when the policy carries no story overrun", async () => {
    const policy = { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000, perStoryCeilingMicros: 50_000 };
    const at = (spent: number) => new CostEnvelopeGuard({ store: spendStore(spent).store, policy, clock: () => NOW })
      .storySeam({ runId: "run-1", price: PRICE, requireReportedUsage: true })
      .assertCallAllowed(PROJECTION);
    await expect(at(50_000 - PROJECTED)).resolves.toBeUndefined();
    await expect(at(50_000 - PROJECTED + 1))
      .rejects.toThrowError(expect.objectContaining({ code: "STORY_COST_ENVELOPE_REACHED" }));
  });

  it("refuses to build a guard over a story overrun no row could seal", () => {
    expect(codeOf(() => new CostEnvelopeGuard({
      store: spendStore().store,
      policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000,
        perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: 10_001 }
    }))).toBe("STORY_ENVELOPE_POLICY_INVALID");
  });
});

describe("M7 · the day reserves the story's raised ceiling (the second term)", () => {
  it("adds the story's margin to the most one run may spend", () => {
    expect(mostOneRunMaySpendMicros({
      perRunCeilingMicros: 250_000, serveOverrunBasisPoints: 2_000,
      perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: 2_000
    })).toBe(360_000);
    // Without the story's member the second term is the bare cap, as before.
    expect(mostOneRunMaySpendMicros({
      perRunCeilingMicros: 250_000, serveOverrunBasisPoints: 2_000, perStoryCeilingMicros: 50_000
    })).toBe(350_000);
    // An overrun with no story ceiling reserves nothing for a story that cannot be written.
    expect(mostOneRunMaySpendMicros({ perRunCeilingMicros: 250_000, perStoryOverrunBasisPoints: 2_000 })).toBe(250_000);
    // Rounded UP, like the run's own maximum.
    expect(mostOneRunMaySpendMicros({ perRunCeilingMicros: 10, perStoryCeilingMicros: 7, perStoryOverrunBasisPoints: 2_000 }))
      .toBe(19);
  });

  it("is what the guard reserves when it admits a new run, with the shipped rows", async () => {
    const story = readStoryPolicy(buildStoryRegisterRows(HOSTED), 9);
    const { store, reservations } = spendStore();
    await new CostEnvelopeGuard({ store, policy: costEnvelopeGuardPolicy(RUN_POLICY, story), clock: () => NOW })
      .assertDailyEnvelopeAdmitsNewRun();
    // 250 000 x 1.2 for the debate, 50 000 x 1.2 for its story.
    expect(reservations).toEqual([360_000]);
    expect(costEnvelopeDay(NOW)).toBe("2026-09-27");
  });
});

describe("M7 · ONE check over both money rows: the day must hold one full run plus its story", () => {
  const story = { perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: 2_000 };
  const run = (dailyCeilingMicros: number) => ({ ...RUN_POLICY, dailyCeilingMicros });

  it("passes a day that holds exactly 360 000, and hands the guard both rows' members", () => {
    expect(costEnvelopeGuardPolicy(run(360_000), story)).toEqual({
      perRunCeilingMicros: 250_000,
      dailyCeilingMicros: 360_000,
      serveReserveBasisPoints: 3_000,
      serveOverrunBasisPoints: 2_000,
      perStoryCeilingMicros: 50_000,
      perStoryOverrunBasisPoints: 2_000
    });
  });

  it("refuses a day one micro-unit short of one run plus its story, by name", () => {
    // 359 999 passes the cost row's own refinement (it holds the run's 300 000),
    // which is exactly why the story needs this second check.
    expect(codeOf(() => costEnvelopePolicyFromValue({
      ...COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value, daily_ceiling_micros: 359_999
    }, "test"))).toBeNull();
    expect(codeOf(() => costEnvelopeGuardPolicy(run(359_999), story))).toBe("STORY_DAILY_CEILING_INSUFFICIENT");
  });

  it("counts the story at its bare cap when its row predates the overrun", () => {
    expect(codeOf(() => costEnvelopeGuardPolicy(run(350_000), { ...story, perStoryOverrunBasisPoints: 0 }))).toBeNull();
    expect(codeOf(() => costEnvelopeGuardPolicy(run(349_999), { ...story, perStoryOverrunBasisPoints: 0 })))
      .toBe("STORY_DAILY_CEILING_INSUFFICIENT");
  });

  it("asks only for the run when there is no story money row (no story rows, or local rows)", () => {
    for (const none of [null, { perStoryCeilingMicros: null, perStoryOverrunBasisPoints: 0 }]) {
      const policy = costEnvelopeGuardPolicy(run(300_000), none);
      expect(policy).not.toHaveProperty("perStoryCeilingMicros");
      expect(policy).not.toHaveProperty("perStoryOverrunBasisPoints");
    }
  });

  it("names no money figure in its refusal", () => {
    try {
      costEnvelopeGuardPolicy(run(359_999), story);
    } catch (error) {
      expect(String((error as Error).message)).not.toMatch(/\d/u);
      return;
    }
    throw new Error("TEST_EXPECTED_REFUSAL");
  });
});

describe("M7 · both boots run the one check, on the rows they already read", () => {
  it("the runner builds its guard from costEnvelopeGuardPolicy over both rows", async () => {
    const main = await readFile("apps/runner/src/main.ts", "utf8");
    expect(main).toContain("policy: costEnvelopeGuardPolicy(");
    expect(main).toContain("await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)");
    expect(main.split("new CostEnvelopeGuard(")).toHaveLength(2);
    const guard = main.slice(main.indexOf("new CostEnvelopeGuard("), main.indexOf("const providerTopology"));
    expect(guard).toContain("costEnvelopeGuardPolicy(");
    expect(guard).toContain("storyPolicy");
  });

  it("the API builds its guard from costEnvelopeGuardPolicy over both rows, inside the boot step", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main.split("new CostEnvelopeGuard(")).toHaveLength(2);
    const step = main.slice(main.indexOf('boot.run("cost-envelope-policy"'), main.indexOf('boot.run("product-role-policy"'));
    expect(step).toContain("readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)");
    expect(step).toContain("readStoryPolicyFromRegister(pool, environment.REGISTER_VERSION)");
    expect(step).toContain("costEnvelopeGuardPolicy(runPolicy, storyPolicy)");
  });
});
