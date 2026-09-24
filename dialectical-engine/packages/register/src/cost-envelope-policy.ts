import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";

/**
 * V-28 (finding DL4-F2) — THE SEALED COST ENVELOPES.
 *
 * Two ceilings, both in money, both integers in USD micro-units (1e-6 USD):
 *
 *  - `per_run_ceiling_micros` — what ONE debate may spend across every vendor
 *    it touches. The gateway sums vendor-reported usage times the price
 *    configured with each target and refuses the call that would cross it.
 *  - `daily_ceiling_micros` — what every DEBATE RUN together may spend in a UTC
 *    day, across every vendor they touch. When it is reached no new run starts
 *    until the next day; runs already under way finish.
 *
 * WHAT THE DAILY CEILING DOES NOT COUNT TODAY (C-I8, and say it here rather
 * than in a document the operator reads second). The ceiling is enforced over
 * `ledger.model_spend`, and the only shipped writer of that table is the debate
 * runs' provider seam, which writes `RUN` rows. Two paid surfaces are therefore
 * OUTSIDE it:
 *
 *  - the SUPPORT CHAT. In hosted mode it calls a paid vendor of its own and is
 *    bounded by a call cap (`support_daily_call_cap`) and its own per-message
 *    accounting, never in money against this row. The ledger already carries a
 *    `SUPPORT` spend source and the daily sum already includes it, so wiring it
 *    in is one call at that transport's own seam and needs no migration.
 *  - the DISCOVERY PROBES. Each ask-time and claim-time health probe is a real
 *    `max_tokens: 8` completion per vendor (`packages/providers/src/provider-probe.ts`)
 *    and is charged nowhere.
 *
 * Both are small beside a debate run and both are bounded in CALLS; neither is
 * bounded in MONEY by this row. An operator reading this ceiling as the day's
 * whole spend would be wrong by those two amounts.
 *
 * WHY ONE ROW AND NOT TWO. They are read together at exactly one moment — the
 * hosted boot's fail-closed check — and a deployment that sealed one and not the
 * other is precisely the half-control V-28(3) rules out. One row makes that
 * state unreachable instead of merely unlikely.
 */
export const COST_ENVELOPE_POLICY_ROW_KEY = "costEnvelopePolicy" as const;

/** Integers only: money never touches a float, on the wire or in memory. */
const microAmount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const costEnvelopePolicyValueSchema = z.object({
  kind: z.literal("COST_ENVELOPE_POLICY"),
  currency: z.literal("USD"),
  /** Named on the row so no reader has to remember which small unit was meant. */
  minor_units_per_unit: z.literal(1_000_000),
  per_run_ceiling_micros: microAmount,
  daily_ceiling_micros: microAmount,
  /**
   * TRUE while the numbers are the temporary development ones. V-28 rules the
   * MECHANISM and deliberately leaves the VALUES unruled until the owner's first
   * measured paid run, so the row says of itself which it is carrying, and the
   * operator note reads this field rather than a date in a document.
   */
  provisional: z.boolean(),
  provisional_reason: z.string().trim().min(1)
}).strict().superRefine((value, ctx) => {
  // A daily ceiling below the per-run one is not a policy, it is a deployment
  // in which no run can ever complete: the first run's own envelope would
  // outlast the day it is allowed to spend.
  if (value.daily_ceiling_micros < value.per_run_ceiling_micros) {
    ctx.addIssue({
      code: "custom",
      path: ["daily_ceiling_micros"],
      message: "the daily ceiling must be at least the per-run ceiling"
    });
  }
});

export type CostEnvelopePolicyValue = z.infer<typeof costEnvelopePolicyValueSchema>;

export type CostEnvelopePolicy = Readonly<{
  perRunCeilingMicros: number;
  dailyCeilingMicros: number;
  currency: "USD";
  minorUnitsPerUnit: 1_000_000;
  provisional: boolean;
  provisionalReason: string;
  sourceRef: string;
}>;

/**
 * THE TEMPORARY DEVELOPMENT VALUES, named as such in the row itself.
 *
 * V-28: "The numbers are NOT ruled yet, deliberately: money per run has never
 * been measured." The sequence the owner accepted is build the mechanism -> one
 * paid run under a deliberately low ceiling -> seal the real values from that
 * measurement, per-run at roughly 3x a measured normal run and daily at what the
 * owner is comfortable losing on a bad day.
 *
 * So these two numbers are chosen to be SMALL ENOUGH TO STOP THINGS, not to let
 * a debate through:
 *
 *  - per run, 250 000 micro-units = 0.25 USD. A normal full run measured 114
 *    model calls on 2026-09-17; at mid-range API prices that is dollars, not
 *    cents, so this ceiling stops the owner's first paid run partway through ON
 *    PURPOSE. That stop is the measurement: it produces a real spend figure
 *    against a real vendor for the price of a quarter.
 *  - per day, 2 000 000 micro-units = 2.00 USD, eight such runs. Low enough that
 *    a mistake in the first days of the hosted deployment costs the price of a
 *    coffee, and high enough that the per-run ceiling, not the daily one, is
 *    what the first measurement exercises.
 *
 * SEALING THE REAL VALUES IS A NEW VERSION OF THIS ROW, NEVER AN EDIT OF IT
 * (constraint 5): the deployment publishes a superseding `costEnvelopePolicy`
 * with `provisional: false`, and this row stays as the history of what the first
 * paid run was run under.
 */
export const COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: COST_ENVELOPE_POLICY_ROW_KEY,
  sourceRef: "V-28 (DL4-F2) cost envelopes — TEMPORARY DEVELOPMENT VALUES,"
    + " superseded by a new version once the owner's first measured paid run has run",
  value: Object.freeze({
    kind: "COST_ENVELOPE_POLICY" as const,
    currency: "USD" as const,
    minor_units_per_unit: 1_000_000 as const,
    per_run_ceiling_micros: 250_000,
    daily_ceiling_micros: 2_000_000,
    provisional: true,
    provisional_reason: "TEMPORARY development ceiling under V-28: the owner seals the real"
      + " values as a NEW version of this row after the first measured paid run"
  })
});

export function costEnvelopePolicyFromValue(value: unknown, sourceRef: string): CostEnvelopePolicy {
  const parsed = costEnvelopePolicyValueSchema.safeParse(value);
  if (!parsed.success || sourceRef.trim() === "") {
    throw new TypedDomainError(
      "COST_ENVELOPE_POLICY_INVALID",
      "The sealed cost-envelope policy is absent or malformed"
    );
  }
  return Object.freeze({
    perRunCeilingMicros: parsed.data.per_run_ceiling_micros,
    dailyCeilingMicros: parsed.data.daily_ceiling_micros,
    currency: parsed.data.currency,
    minorUnitsPerUnit: parsed.data.minor_units_per_unit,
    provisional: parsed.data.provisional,
    provisionalReason: parsed.data.provisional_reason,
    sourceRef
  });
}

/**
 * The row IN FORCE at a deployment's resolved register version. A version that
 * never sealed the envelopes refuses here, by name, rather than running
 * unbounded — the same shape every other policy family in this package uses.
 */
export async function readCostEnvelopePolicy(
  pool: Pool,
  registerVersion: number
): Promise<CostEnvelopePolicy> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, COST_ENVELOPE_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "COST_ENVELOPE_POLICY_UNRESOLVED",
      `No ${COST_ENVELOPE_POLICY_ROW_KEY}@${registerVersion} exists`
    );
  }
  return costEnvelopePolicyFromValue(row.value_json, row.source_ref);
}
