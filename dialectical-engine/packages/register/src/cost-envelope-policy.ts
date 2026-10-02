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
 *  - `daily_ceiling_micros` — what every DEBATE RUN, and the VERDICT STORY
 *    written after each one settles, may spend together in a UTC day, across
 *    every vendor they touch. When it is reached no new run starts until the
 *    next day; runs already under way finish.
 *
 * THE VERDICT STORY IS THE SECOND COUNTED SURFACE (spec 2026-09-26 §8). Each
 * story is capped on its own by the optional `storyCostEnvelopePolicy` row
 * (`perStoryCeilingMicros`, packages/register/src/story-policy.ts), never by
 * the run's ceiling, and its charges are `STORY` rows that name their run. The
 * day's total counts them, and a new run's admission reserves the story's
 * ceiling together with the run's.
 *
 * WHAT THE DAILY CEILING DOES NOT COUNT TODAY (C-I8, and say it here rather
 * than in a document the operator reads second). The ceiling is enforced over
 * `ledger.model_spend`, and the only shipped writer of that table is the
 * provider gateway's money seam (packages/budget/src/model-spend.ts), which
 * writes `RUN` rows for debate calls and `STORY` rows for story calls. Two
 * paid surfaces are therefore OUTSIDE it:
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

/**
 * BASIS POINTS: hundredths of a percent, so 10 000 is the whole per-run ceiling.
 * Module-private on purpose: every share of a ceiling in money is computed in
 * THIS file (`costEnvelopeCeilings`), so there is one denominator and nobody
 * restates it.
 */
const BASIS_POINTS = Object.freeze({ whole: 10_000 });

/** A reserve is a share of the ceiling held back, so it can never be all of it. */
const reserveBasisPoints = z.number().int().nonnegative().lt(BASIS_POINTS.whole);
/** An overrun may double the ceiling for the answer, and no more. */
const overrunBasisPoints = z.number().int().nonnegative().max(BASIS_POINTS.whole);
/**
 * Task M7: the story's own overrun has the same range — it may double the
 * story's cap, and no more. The story row's schema (story-policy.ts) takes it
 * from here, so the range is written once, beside the one denominator.
 */
export const storyOverrunBasisPointsSchema = overrunBasisPoints;

/**
 * Budget spec 2026-09-28 §2.4 — THE BAND'S RANGES, beside the one denominator.
 * The close edge runs from half the limit to the whole of it; the finish edge
 * from the limit itself to twice it; one to ten waiting questions per person.
 */
const closeEdgeBasisPoints = z.number().int().min(BASIS_POINTS.whole / 2).max(BASIS_POINTS.whole);
const finishEdgeBasisPoints = z.number().int().min(BASIS_POINTS.whole).max(2 * BASIS_POINTS.whole);
const waitingLinePerPerson = z.number().int().min(1).max(10);

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
  provisional_reason: z.string().trim().min(1),
  /**
   * Engine money rule (spec 2026-09-26 §14.4.1): the share of the per-run
   * ceiling HELD BACK for writing the answer. Every call made while the debate
   * is argued sees `per_run x (10000 - reserve) / 10000`; the answer's calls
   * see the rest. OPTIONAL: a row sealed before this member existed still
   * parses, and a missing member means 0 — no reserve, today's single ceiling.
   */
  serve_reserve_basis_points: reserveBasisPoints.optional(),
  /**
   * How far the answer's calls may go OVER the per-run ceiling:
   * `per_run x (10000 + overrun) / 10000`. OPTIONAL, missing means 0 — no
   * margin. The day must be able to hold it (the refinement below).
   */
  serve_overrun_basis_points: overrunBasisPoints.optional(),
  /**
   * Budget spec 2026-09-28 §2.4 — THE BAND. Three OPTIONAL members, all present
   * or all absent (the refinement below). All absent is today's behaviour
   * exactly: the 429 refusal, the 30-minute reservation, no waiting line and no
   * shared wall. All present switches every new behaviour on together.
   *  - `admission_close_basis_points`: the close edge of every limit (9500 = 95%).
   *  - `finish_up_to_basis_points`: how far a RUNNING debate may take the SITE's
   *    day to finish (11500 = 115%). Person windows carry their own (billingPlans).
   *  - `waiting_line_per_person`: waiting questions one person may have (1).
   */
  admission_close_basis_points: closeEdgeBasisPoints.optional(),
  finish_up_to_basis_points: finishEdgeBasisPoints.optional(),
  waiting_line_per_person: waitingLinePerPerson.optional()
}).strict().superRefine((value, ctx) => {
  // A daily ceiling below what ONE run may spend is not a policy, it is a
  // deployment in which no run can ever complete: the first run's own envelope
  // would outlast the day it is allowed to spend. With an overrun, one run may
  // spend its per-run ceiling AND the answer's margin, so that sum is the floor.
  // Without one, this is exactly the old rule: daily >= per-run.
  const runMaximum = shareOfCeiling(
    value.per_run_ceiling_micros,
    BASIS_POINTS.whole + (value.serve_overrun_basis_points ?? 0),
    "UP"
  );
  if (BigInt(value.daily_ceiling_micros) < runMaximum) {
    ctx.addIssue({
      code: "custom",
      path: ["daily_ceiling_micros"],
      message: "the daily ceiling must be at least the per-run ceiling plus the answer's overrun"
    });
  }
  // Budget spec §2.4: the band switches on together or not at all, so a
  // version can never carry a close edge with no waiting line behind it.
  const band = [
    value.admission_close_basis_points,
    value.finish_up_to_basis_points,
    value.waiting_line_per_person
  ];
  const present = band.filter((member) => member !== undefined).length;
  if (present !== 0 && present !== band.length) {
    ctx.addIssue({
      code: "custom",
      path: ["admission_close_basis_points"],
      message: "the close edge, the finish edge and the waiting line are all present or all absent"
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
  /** The row's `serve_reserve_basis_points`; 0 when the row predates the member. */
  serveReserveBasisPoints: number;
  /** The row's `serve_overrun_basis_points`; 0 when the row predates the member. */
  serveOverrunBasisPoints: number;
  /** Budget spec §2.4: the close edge in basis points; null when the row predates the band. */
  closeBasisPoints: number | null;
  /** Budget spec §2.4: the SITE day's finish edge in basis points; null when the row predates the band. */
  finishBasisPoints: number | null;
  /** Budget spec §2.4: waiting questions per person; null when the row predates the band. */
  waitingLinePerPerson: number | null;
  sourceRef: string;
}>;

/** Budget spec §2.4: the three band members, read together. */
export type CostEnvelopeBand = Readonly<{
  closeBasisPoints: number;
  finishBasisPoints: number;
  waitingLinePerPerson: number;
}>;

/**
 * The band when the row carries it, or null — today's behaviour. The row's
 * refinement makes "some but not all" unreachable; this is the one place the
 * three are read back together, so no caller re-derives the rule.
 */
export function costEnvelopeBand(
  policy: Pick<CostEnvelopePolicy, "closeBasisPoints" | "finishBasisPoints" | "waitingLinePerPerson">
): CostEnvelopeBand | null {
  if (policy.closeBasisPoints === null || policy.finishBasisPoints === null
    || policy.waitingLinePerPerson === null) {
    return null;
  }
  return Object.freeze({
    closeBasisPoints: policy.closeBasisPoints,
    finishBasisPoints: policy.finishBasisPoints,
    waitingLinePerPerson: policy.waitingLinePerPerson
  });
}

/**
 * `amount x basisPoints / 10000`, in BigInt so no product of a safe micro-unit
 * amount and a share can lose a digit, rounded in the direction the caller
 * names: DOWN for a ceiling (a run stops earlier, never later) and UP for what
 * the day must hold for a run (it reserves more, never less).
 */
function shareOfCeiling(amount: number, basisPoints: number, rounding: "DOWN" | "UP"): bigint {
  const product = BigInt(amount) * BigInt(basisPoints);
  const whole = BigInt(BASIS_POINTS.whole);
  return rounding === "DOWN" ? product / whole : (product + whole - 1n) / whole;
}

/** The terms a ceiling is computed from: the camelCase policy, or any object carrying its members. */
export type CostEnvelopeCeilingTerms = Readonly<{
  perRunCeilingMicros: number;
  serveReserveBasisPoints?: number;
  serveOverrunBasisPoints?: number;
}>;

/**
 * Engine money rule, Task M1 — THE TWO CEILINGS OVER THE ONE RUN TOTAL, and
 * what the day must hold for one run. The only place these shares are
 * computed; the guard in `@debateai/budget` reads them from here.
 *
 *  - `bodyMicros`: a call made while the debate is argued (every call that is
 *    not an answer-writing call) — `perRun x (10000 - reserve) / 10000`,
 *    rounded DOWN.
 *  - `serveMicros`: an answer-writing call — `perRun x (10000 + overrun) /
 *    10000`, rounded DOWN.
 *  - `runMaximumMicros`: the most one run's debate may spend, which is what the
 *    day must be able to hold for it — the serve ceiling rounded UP.
 *
 * Both ceilings compare the SAME total, the run's whole debate spend, so the
 * reserve needs no second counter: the body simply stops sooner. With neither
 * member all three are `perRun` exactly, which is today's single ceiling.
 */
export type CostEnvelopeCeilings = Readonly<{
  bodyMicros: number;
  serveMicros: number;
  runMaximumMicros: number;
}>;

export function costEnvelopeCeilings(terms: CostEnvelopeCeilingTerms): CostEnvelopeCeilings {
  const perRun = microAmount.safeParse(terms?.perRunCeilingMicros);
  const reserve = reserveBasisPoints.safeParse(terms?.serveReserveBasisPoints ?? 0);
  const overrun = overrunBasisPoints.safeParse(terms?.serveOverrunBasisPoints ?? 0);
  if (!perRun.success || !reserve.success || !overrun.success) {
    throw new TypedDomainError(
      "COST_ENVELOPE_POLICY_INVALID",
      "The per-run ceiling, the answer's reserve or its overrun is out of range"
    );
  }
  const narrowed = (share: bigint): number => {
    const value = Number(share);
    if (!Number.isSafeInteger(value)) {
      throw new TypedDomainError(
        "COST_ENVELOPE_POLICY_INVALID",
        "A share of the per-run ceiling cannot be represented exactly in micro-units"
      );
    }
    return value;
  };
  return Object.freeze({
    bodyMicros: narrowed(shareOfCeiling(perRun.data, BASIS_POINTS.whole - reserve.data, "DOWN")),
    serveMicros: narrowed(shareOfCeiling(perRun.data, BASIS_POINTS.whole + overrun.data, "DOWN")),
    runMaximumMicros: narrowed(shareOfCeiling(perRun.data, BASIS_POINTS.whole + overrun.data, "UP"))
  });
}

/** The terms the story's ceiling is computed from: the story row's members, camelCase. */
export type StoryEnvelopeCeilingTerms = Readonly<{
  perStoryCeilingMicros: number;
  perStoryOverrunBasisPoints?: number;
}>;

/**
 * Engine money rule, Task M7 (spec 2026-09-26 §14.4.6) — THE STORY'S CEILING
 * WITH ITS MARGIN, in this file for the reason `costEnvelopeCeilings` is: one
 * denominator, and nobody restates it.
 *
 *  - `storyMicros`: what one story may spend — `perStory x (10000 + overrun) /
 *    10000`, rounded DOWN (a story stops earlier, never later).
 *  - `storyMaximumMicros`: what the day must hold for it — the same share
 *    rounded UP (the day reserves more, never less).
 *
 * With no overrun both are `perStory` exactly: a story row sealed before the
 * member existed keeps today's cap.
 */
export type StoryEnvelopeCeilings = Readonly<{
  storyMicros: number;
  storyMaximumMicros: number;
}>;

export function storyEnvelopeCeilings(terms: StoryEnvelopeCeilingTerms): StoryEnvelopeCeilings {
  const perStory = microAmount.safeParse(terms?.perStoryCeilingMicros);
  const overrun = overrunBasisPoints.safeParse(terms?.perStoryOverrunBasisPoints ?? 0);
  if (!perStory.success || !overrun.success) {
    throw new TypedDomainError(
      "STORY_ENVELOPE_POLICY_INVALID",
      "The story's ceiling or its overrun is out of range"
    );
  }
  const narrowed = (share: bigint): number => {
    const value = Number(share);
    if (!Number.isSafeInteger(value)) {
      throw new TypedDomainError(
        "STORY_ENVELOPE_POLICY_INVALID",
        "The story's ceiling with its overrun cannot be represented exactly in micro-units"
      );
    }
    return value;
  };
  return Object.freeze({
    storyMicros: narrowed(shareOfCeiling(perStory.data, BASIS_POINTS.whole + overrun.data, "DOWN")),
    storyMaximumMicros: narrowed(shareOfCeiling(perStory.data, BASIS_POINTS.whole + overrun.data, "UP"))
  });
}

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
 *
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.1, Task M1). This constant now also
 * carries the answer's reserve (3000 basis points: 30% of the per-run ceiling
 * held back for writing the answer) and its overrun (2000: the answer may go
 * 20% over). Changing this constant is itself a NEW version: the development
 * seeder publishes it as a new register version, and every version already
 * sealed keeps the row it sealed — those rows carry neither member and read as
 * 0. The daily ceiling is unchanged, so it now holds six runs at their new
 * maximum of 300 000 each where it held eight at 250 000: the day is a money
 * ceiling, not a count of runs. HOSTED is different: there the operator
 * supplies `costEnvelopePolicy` (`deploy/vps/register/hosted-register.example.json`),
 * and until the operator publishes a version carrying these members they are 0
 * and the margin is off.
 *
 * Budget spec 2026-09-28 §2.4: this constant also carries the band — close at
 * 9500, the site's day may finish up to 11500, one waiting question per person.
 * Changing it is a NEW version; hosted operators publish the band in their own
 * next version.
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
      + " values as a NEW version of this row after the first measured paid run",
    serve_reserve_basis_points: 3_000,
    serve_overrun_basis_points: 2_000,
    admission_close_basis_points: 9_500,
    finish_up_to_basis_points: 11_500,
    waiting_line_per_person: 1
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
    // A row sealed before these members existed means "no reserve, no margin".
    serveReserveBasisPoints: parsed.data.serve_reserve_basis_points ?? 0,
    serveOverrunBasisPoints: parsed.data.serve_overrun_basis_points ?? 0,
    // Budget spec §2.4: a row sealed before the band means "no band": null.
    closeBasisPoints: parsed.data.admission_close_basis_points ?? null,
    finishBasisPoints: parsed.data.finish_up_to_basis_points ?? null,
    waitingLinePerPerson: parsed.data.waiting_line_per_person ?? null,
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
