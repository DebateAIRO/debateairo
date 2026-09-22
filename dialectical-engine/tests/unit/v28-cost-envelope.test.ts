import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  COST_ENVELOPE_CURRENCY,
  COST_MICROS_PER_USD,
  DAILY_COST_ENVELOPE_REACHED,
  PROJECTED_INPUT_BYTES_PER_TOKEN,
  PROVIDER_USAGE_UNREPORTED,
  RUN_COST_ENVELOPE_MONEY_REACHED,
  chargeMicrosForUsage,
  decideDailyCostEnvelope,
  decideRunCostEnvelope,
  projectedCallCeilingMicros,
  readReportedUsage
} from "@debateai/budget";
import {
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW,
  COST_ENVELOPE_POLICY_ROW_KEY,
  assertHostedCostEnvelopesSealed,
  assertHostedSupportAdmissionSealed,
  costEnvelopePolicyFromValue,
  readCostEnvelopePolicy
} from "@debateai/register";

/**
 * V-28 (finding DL4-F2) — A SPENDING CEILING IN MONEY, PER RUN AND PER DAY.
 *
 * Until this package the run-wide bound counted ATTEMPTS only, so the ceiling
 * bounded the NUMBER of calls and never the money: a truncated answer retried at
 * up to 3x its token bound, and a worst-case p3d5 topology billing 2 748
 * attempts, cost whatever the vendor charged for those attempts.
 *
 * THE UNIT IS AN INTEGER. Money never touches a float here: every amount is a
 * whole number of USD micro-units (1e-6 USD), every price is an integer number
 * of micro-units per million tokens, and every division rounds UP through
 * BigInt, so an accumulated sum is exact at any length and a rounding error can
 * only ever refuse EARLY. `x_cost_usd`, the vendor's own dollar figure, is a
 * float and is deliberately NOT the charge — it stays on the artifact metadata
 * for reconciliation and never enters this arithmetic.
 */
describe("V-28 money is integers in a fixed small unit", () => {
  const price = Object.freeze({
    inputMicrosPerMillionTokens: 3_000_000,
    outputMicrosPerMillionTokens: 15_000_000
  });

  it("charges vendor-reported tokens at the target's configured price, exactly", () => {
    // 1 000 000 input tokens at $3/M = $3.00 = 3 000 000 micro-units.
    expect(chargeMicrosForUsage(price, { promptTokens: 1_000_000, completionTokens: 0 }))
      .toBe(3_000_000);
    expect(chargeMicrosForUsage(price, { promptTokens: 0, completionTokens: 1_000_000 }))
      .toBe(15_000_000);
    expect(chargeMicrosForUsage(price, { promptTokens: 1_500, completionTokens: 700 }))
      // ceil(1500*3e6/1e6) + ceil(700*15e6/1e6) = 4 500 + 10 500
      .toBe(15_000);
  });

  it("rounds a part-token charge UP, so a sum can only refuse early", () => {
    const cheap = Object.freeze({
      inputMicrosPerMillionTokens: 1, outputMicrosPerMillionTokens: 1
    });
    expect(chargeMicrosForUsage(cheap, { promptTokens: 1, completionTokens: 0 })).toBe(1);
    expect(chargeMicrosForUsage(cheap, { promptTokens: 999_999, completionTokens: 0 })).toBe(1);
    expect(chargeMicrosForUsage(cheap, { promptTokens: 1_000_001, completionTokens: 0 })).toBe(2);
  });

  it("stays exact where a float would not", () => {
    // 2^31-1 tokens (the bounded usage counter's maximum) at a high price is
    // past 2^53 as a plain product; the BigInt path keeps the digits.
    const dear = Object.freeze({
      inputMicrosPerMillionTokens: 1_000_000_000, outputMicrosPerMillionTokens: 0
    });
    expect(chargeMicrosForUsage(dear, { promptTokens: 2_147_483_647, completionTokens: 0 }))
      .toBe(2_147_483_647_000);
  });

  it("refuses a non-integer price or a non-integer usage count", () => {
    expect(() => chargeMicrosForUsage(
      { inputMicrosPerMillionTokens: 1.5, outputMicrosPerMillionTokens: 0 },
      { promptTokens: 1, completionTokens: 0 }
    )).toThrowError(TypeError);
    expect(() => chargeMicrosForUsage(price, { promptTokens: 0.5, completionTokens: 0 }))
      .toThrowError(TypeError);
    expect(() => chargeMicrosForUsage(price, { promptTokens: -1, completionTokens: 0 }))
      .toThrowError(TypeError);
  });

  it("names the unit once, so no caller invents a second one", () => {
    expect(COST_MICROS_PER_USD).toBe(1_000_000);
    expect(COST_ENVELOPE_CURRENCY).toBe("USD");
  });
});

/**
 * THE REFUSAL HAPPENS BEFORE THE CALL, and the brief's fallback rule is the one
 * that applies: vendor usage is only known AFTER the response, so "refuse the
 * call that WOULD cross" is decided on the sum so far PLUS the configured
 * per-call maximum — the bytes actually about to be sent, converted to tokens at
 * a deliberately conservative floor, plus the attempt's own `max_tokens` bound.
 */
describe("V-28 the per-run envelope refuses the call that WOULD cross", () => {
  const price = Object.freeze({
    inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000
  });

  it("projects a call's maximum from the bytes it will send and its token ceiling", () => {
    // The byte floor is a deliberate over-estimate: real tokenizers average
    // 3.5-4 bytes per token for English and about 2.5 for Romanian with
    // diacritics, so halving that can only project HIGH.
    expect(PROJECTED_INPUT_BYTES_PER_TOKEN).toBeLessThanOrEqual(2);
    expect(projectedCallCeilingMicros(price, { requestBytes: 2_000, completionTokenCeiling: 500 }))
      .toBe(Math.ceil(2_000 / PROJECTED_INPUT_BYTES_PER_TOKEN) + 500);
  });

  it("admits a call whose projected maximum still fits under the ceiling", () => {
    expect(decideRunCostEnvelope({ spentMicros: 400, projectedMicros: 600, ceilingMicros: 1_000 }))
      .toEqual({ kind: "WITHIN", spentMicros: 400, projectedMicros: 600, ceilingMicros: 1_000 });
  });

  it("refuses the call whose projected maximum would cross the ceiling", () => {
    expect(decideRunCostEnvelope({ spentMicros: 400, projectedMicros: 601, ceilingMicros: 1_000 }))
      .toEqual({
        kind: "WOULD_CROSS", spentMicros: 400, projectedMicros: 601, ceilingMicros: 1_000
      });
  });

  it("refuses when the run has already reached the ceiling and asks for anything", () => {
    expect(decideRunCostEnvelope({ spentMicros: 1_000, projectedMicros: 1, ceilingMicros: 1_000 }).kind)
      .toBe("WOULD_CROSS");
  });

  it("carries one typed code for the refusal, never a bare crash", () => {
    expect(RUN_COST_ENVELOPE_MONEY_REACHED).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
  });
});

/**
 * The DAILY envelope is the owner's addition to V-28 (part 2): every debate run
 * together, across every vendor they touch. When it is reached no NEW run starts
 * until the next day; a run already under way finishes, because stopping it
 * would throw away work already paid for. What it does NOT count today — the
 * support chat and the discovery probes — is pinned at the end of this file
 * (C-I8).
 */
describe("V-28 the daily envelope stops new runs, not running ones", () => {
  it("admits a new run while the day's spend is under the ceiling", () => {
    expect(decideDailyCostEnvelope({ spentMicrosToday: 999, ceilingMicros: 1_000 }))
      .toEqual({ kind: "WITHIN", spentMicrosToday: 999, ceilingMicros: 1_000 });
  });

  it("refuses a new run the moment the day's spend REACHES the ceiling", () => {
    expect(decideDailyCostEnvelope({ spentMicrosToday: 1_000, ceilingMicros: 1_000 }).kind)
      .toBe("REACHED");
    expect(decideDailyCostEnvelope({ spentMicrosToday: 1_001, ceilingMicros: 1_000 }).kind)
      .toBe("REACHED");
  });

  it("carries its own typed code, distinct from the per-run one", () => {
    expect(DAILY_COST_ENVELOPE_REACHED).toBe("DAILY_COST_ENVELOPE_REACHED");
    expect(DAILY_COST_ENVELOPE_REACHED).not.toBe(RUN_COST_ENVELOPE_MONEY_REACHED);
  });
});

/**
 * A vendor that reports no usage figures cannot be billed against an envelope at
 * all, so in HOSTED mode its answer is refused with a typed code rather than
 * silently charged as zero. The code is this package's own and is NOT task 12's
 * `SUPPORT_MODEL_COST_UNREPORTED`: the two surfaces refuse separately.
 */
describe("V-28 a vendor that reports no usage cannot be bounded", () => {
  it("reads a usage block that carries token counts", () => {
    expect(readReportedUsage({ prompt_tokens: 12, completion_tokens: 7 }))
      .toEqual({ promptTokens: 12, completionTokens: 7 });
    expect(readReportedUsage({ prompt_tokens: 12 }))
      .toEqual({ promptTokens: 12, completionTokens: 0 });
  });

  it("reports NOTHING for an absent, null or empty usage block", () => {
    expect(readReportedUsage(null)).toBeNull();
    expect(readReportedUsage(undefined)).toBeNull();
    expect(readReportedUsage({})).toBeNull();
    // `total_tokens` alone cannot be split into input and output, and the two
    // sides are priced differently, so it is not a usage figure this can bill.
    expect(readReportedUsage({ total_tokens: 40 })).toBeNull();
  });

  it("names the refusal with its own code", () => {
    expect(PROVIDER_USAGE_UNREPORTED).toBe("PROVIDER_USAGE_UNREPORTED");
  });
});

/**
 * THE VALUES ARE NOT RULED. V-28 says so in as many words: money per run has
 * never been measured, so this package ships the MECHANISM with a deliberately
 * low development ceiling, named as temporary in the row itself, and the owner
 * seals the real values after the first measured paid run (rule of thumb the
 * owner accepted: per-run about 3x a measured normal run; daily = what the owner
 * is comfortable losing on a bad day). It is a DEPLOYMENT row, never an edit of
 * anything sealed (constraint 5).
 */
describe("V-28 the envelopes ship as a versioned register row with a temporary value", () => {
  it("publishes one row key for both envelopes", () => {
    expect(COST_ENVELOPE_POLICY_ROW_KEY).toBe("costEnvelopePolicy");
    expect(COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.rowKey).toBe(COST_ENVELOPE_POLICY_ROW_KEY);
  });

  it("carries integer ceilings in the fixed small unit and no float anywhere", () => {
    const policy = costEnvelopePolicyFromValue(
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value,
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    );
    expect(Number.isInteger(policy.perRunCeilingMicros)).toBe(true);
    expect(Number.isInteger(policy.dailyCeilingMicros)).toBe(true);
    expect(policy.perRunCeilingMicros).toBeGreaterThan(0);
    expect(policy.dailyCeilingMicros).toBeGreaterThan(0);
    expect(policy.currency).toBe("USD");
  });

  it("is a DELIBERATELY LOW development value that says so about itself", () => {
    const policy = costEnvelopePolicyFromValue(
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value,
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    );
    expect(policy.provisional).toBe(true);
    // Under one US dollar a run and under ten a day: low enough that the
    // owner's first paid run stops long before it can cost anything.
    expect(policy.perRunCeilingMicros).toBeLessThan(COST_MICROS_PER_USD);
    expect(policy.dailyCeilingMicros).toBeLessThan(10 * COST_MICROS_PER_USD);
    expect(policy.dailyCeilingMicros).toBeGreaterThanOrEqual(policy.perRunCeilingMicros);
    expect(COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef).toContain("V-28");
    expect(COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef).toContain("TEMPORARY");
  });

  it("refuses a malformed, floating-point or negative envelope value", () => {
    const sound = COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value as Readonly<Record<string, unknown>>;
    for (const broken of [
      { ...sound, per_run_ceiling_micros: 0.5 },
      { ...sound, per_run_ceiling_micros: -1 },
      { ...sound, daily_ceiling_micros: 0 },
      { ...sound, currency: "EUR" },
      {}
    ]) {
      expect(() => costEnvelopePolicyFromValue(broken, "test"))
        .toThrowError(expect.objectContaining({ code: "COST_ENVELOPE_POLICY_INVALID" }));
    }
  });
});

/**
 * FAIL CLOSED — AND WHICH CHECK ACTUALLY DOES IT (I3, review round 2).
 *
 * Task 10's seam runs before a pool exists, so the only thing it can read is the
 * row this BUILD ships — a frozen in-source constant, which always parses. Round
 * 1 presented it as the live fail-closed gate and wrote two tests that could not
 * fail; both are gone, and the seam is documented for what it is: a check that
 * this build still carries an envelope row at all.
 *
 * The LIVE gate is `readCostEnvelopePolicy`, which reads the row IN FORCE at the
 * deployment's own register version — the state that actually varies between
 * hosts, and the one a host pinned to an older `REGISTER_VERSION` fails. It is
 * exercised below against a fake pool, so the refusal is proven without Docker.
 */
describe("V-28 hosted start-up fails closed on the envelopes", () => {
  it("refuses hosted whenever the build-integrity seam does not say SEALED", () => {
    expect(() => assertHostedCostEnvelopesSealed("hosted", () => "NOT_SEALED"))
      .toThrowError(expect.objectContaining({ code: "COST_ENVELOPES_NOT_SEALED" }));
  });

  it("leaves local mode alone — envelopes are a hosted-spend control", () => {
    expect(() => assertHostedCostEnvelopesSealed("local", () => "NOT_SEALED")).not.toThrow();
  });

  it("refuses a register version that never sealed the row", async () => {
    const emptyPool = { query: async () => ({ rows: [] }) } as never;
    await expect(readCostEnvelopePolicy(emptyPool, 7))
      .rejects.toThrowError(expect.objectContaining({ code: "COST_ENVELOPE_POLICY_UNRESOLVED" }));
  });

  it("refuses a register version that sealed something malformed", async () => {
    const brokenPool = {
      query: async () => ({ rows: [{ value_json: { kind: "COST_ENVELOPE_POLICY" }, source_ref: "x" }] })
    } as never;
    await expect(readCostEnvelopePolicy(brokenPool, 7))
      .rejects.toThrowError(expect.objectContaining({ code: "COST_ENVELOPE_POLICY_INVALID" }));
  });

  it("reads the row in force when the version has one", async () => {
    const sealedPool = {
      query: async () => ({
        rows: [{
          value_json: COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value,
          source_ref: COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
        }]
      })
    } as never;
    await expect(readCostEnvelopePolicy(sealedPool, 7))
      .resolves.toMatchObject({ provisional: true });
  });
});

/**
 * TASK 11 AMENDMENT (from task 8's review). The support chat's three admission
 * budgets are OPTIONAL members of `admissionPolicy`, so a host pinned to an
 * older `REGISTER_VERSION` runs unmetered support reads and an unshared model
 * cap and says nothing. In hosted mode that is a spend hole of the same family
 * as an unsealed envelope, so start-up refuses; local mode keeps today's
 * fail-open behaviour, where the budgets simply do not exist.
 */
describe("V-28 amendment: hosted start-up refuses an admission row without the support scopes", () => {
  const scoped = Object.freeze({
    supportReads: { key: "source", limit: 240, windowMs: 900_000, capacity: 65_536 },
    supportSessions: { key: "owner", limit: 10, windowMs: 3_600_000, capacity: 8_192 },
    supportModelCalls: { key: "source", limit: 40, windowMs: 86_400_000, capacity: 65_536 }
  });

  it("admits hosted when the admission row in force carries all three scopes", () => {
    expect(() => assertHostedSupportAdmissionSealed("hosted", scoped)).not.toThrow();
  });

  it("refuses hosted with a typed code when any one scope is absent", () => {
    for (const absent of ["supportReads", "supportSessions", "supportModelCalls"] as const) {
      expect(() => assertHostedSupportAdmissionSealed("hosted", { ...scoped, [absent]: null }))
        .toThrowError(expect.objectContaining({ code: "SUPPORT_ADMISSION_SCOPES_NOT_SEALED" }));
    }
  });

  it("leaves local mode fail-open, exactly as it is today", () => {
    expect(() => assertHostedSupportAdmissionSealed("local", {
      supportReads: null, supportSessions: null, supportModelCalls: null
    })).not.toThrow();
  });
});

/**
 * C-I8 (final review, area C) — THE COMMENT AN OPERATOR MEETS FIRST MUST BE TRUE.
 *
 * The sealed row's own header claimed the daily ceiling was "what the WHOLE
 * application may spend in a UTC day, across every run and every vendor". Two
 * paid surfaces are outside it today: the support chat, which is bounded by a
 * call cap and never in money, and the per-vendor discovery probe, which is a
 * real `max_tokens: 8` completion charged nowhere. The deferral is recorded
 * honestly in the mission record; it was not in the code.
 *
 * These cases pin the CLAIM against the CODE, in both directions, so the
 * comment cannot drift back into an overclaim and cannot stay wrong once the
 * two surfaces are wired in.
 */
describe("C-I8 the daily ceiling claims only what it counts", () => {
  const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

  it("names the debate runs it covers and the two surfaces it does not", async () => {
    const policy = await source("../../packages/register/src/cost-envelope-policy.ts");
    const header = policy.slice(0, policy.indexOf("export const COST_ENVELOPE_POLICY_ROW_KEY"));
    expect(header).not.toMatch(/across every run and every vendor/u);
    expect(header).toMatch(/debate/iu);
    expect(header).toMatch(/support chat/iu);
    expect(header).toMatch(/probe/iu);
  });

  it("agrees with the ledger's only shipped writer, which writes RUN rows", async () => {
    const spend = await source("../../packages/budget/src/model-spend.ts");
    expect(spend).toContain("spendSource: \"RUN\"");
    expect(spend).not.toContain("spendSource: \"SUPPORT\"");
  });

  it("agrees with the probe, which makes a real completion and charges nothing", async () => {
    const probe = await source("../../packages/providers/src/provider-probe.ts");
    expect(probe).toContain("max_tokens: 8");
    expect(probe).not.toMatch(/costEnvelope|recordCall|chargeMicrosForUsage/u);
  });
});
