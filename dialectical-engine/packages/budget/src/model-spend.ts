/**
 * V-28 (DL4-F2) — THE PERSISTED SPEND, AND THE TWO GUARDS BUILT ON IT.
 *
 * The daily envelope is application-wide: it must survive a restart and it must
 * be the SAME number for the API and for the runner, which are separate
 * processes. So the running totals live in the database — `ledger.model_spend`,
 * migration 0066 — and everything above them is expressed against the
 * `ModelSpendStore` seam in this file, which is what makes every rule testable
 * without Docker.
 *
 * ONE LEDGER FOR THE WHOLE APPLICATION. `spendSource` distinguishes a debate
 * run's calls from the support chat's, and the DAILY total deliberately sums
 * both: V-28(2) rules an envelope "across all runs and vendors", and a daily
 * ceiling that ignored half the application's model spend would not be one. This
 * package writes the `RUN` rows only — task 12 owns the support chat's transport
 * and its own per-message accounting (`support.message.cost_usd`,
 * `SUPPORT_MODEL_COST_UNREPORTED`), and duplicating that accounting here is
 * exactly what this task was told not to do. The column and the sum are in
 * place, so wiring support in is one call at task 12's own seam and needs no
 * further migration.
 */
import { randomUUID } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";
import {
  COST_ENVELOPE_CHARGE_UNREPRESENTABLE,
  chargeMicrosForUsage,
  chargeableUsage,
  costEnvelopeDay,
  dailyCostEnvelopeReached,
  decideDailyCostEnvelope,
  decideRunCostEnvelope,
  projectedCallCeilingMicros,
  providerUsageUnreported,
  readReportedUsage,
  runCostEnvelopeReached,
  type ProviderTargetPrice
} from "./cost-envelope.js";

/** Where a charge came from. `RUN` is a debate; `SUPPORT` is the help chat. */
export type ModelSpendSource = "RUN" | "SUPPORT";

export interface ModelSpendEntry {
  readonly spendId: string;
  readonly spendSource: ModelSpendSource;
  /** The debate this charge belongs to; `null` for support-chat spend. */
  readonly runId: string | null;
  readonly providerRef: string;
  /** The UTC day, `YYYY-MM-DD`, as `costEnvelopeDay` names it. */
  readonly chargedOn: string;
  readonly chargeMicros: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * The two questions and the one write the envelopes need. A seam rather than a
 * pool so the rules above it are unit-testable, and so a future caller (task 12's
 * support transport, an offline reconciliation) can supply its own.
 */
export interface ModelSpendStore {
  recordSpend(entry: ModelSpendEntry): Promise<void>;
  /** Everything this ONE run has been charged, across every vendor it touched. */
  readRunSpentMicros(runId: string): Promise<number>;
  /** Everything the WHOLE application has been charged on that UTC day. */
  readDaySpentMicros(day: string): Promise<number>;
  /**
   * I1 — THE DAILY ADMISSION DECISION AND ITS RESERVATION, TAKEN TOGETHER.
   *
   * Reading the day's total and then deciding, with nothing in between, admits
   * every simultaneous ask: they all see the same low number, and each may then
   * spend a whole per-run ceiling. So the read, the decision and the reservation
   * happen as ONE serialised operation — in Postgres, inside a transaction
   * holding an advisory lock keyed on the day.
   *
   * `decide` is the pure rule (`decideDailyCostEnvelope`), passed in rather than
   * re-implemented in SQL, so there is exactly one definition of the ceiling.
   */
  admitNewRun(input: Readonly<{
    day: string;
    reservedMicros: number;
    now: Date;
    expiresAt: Date;
    decide: (committedMicros: number) => boolean;
  }>): Promise<Readonly<{ admitted: boolean; committedMicros: number }>>;
}

/** The shape `@debateai/providers` asks a gateway's cost seam for, structurally. */
export interface ProviderCostSeam {
  assertCallAllowed(projection: Readonly<{
    requestBytes: number;
    completionTokenCeiling: number;
  }>): Promise<void>;
  /**
   * I4: charges what the vendor billed, and never refuses. `projection` is the
   * call's own pre-send maximum, used for a count the vendor's block carries
   * but this cannot read (Important 1).
   */
  recordCall(observed: Readonly<{
    providerRef: string;
    usage: unknown;
    projection: Readonly<{ requestBytes: number; completionTokenCeiling: number }>;
  }>): Promise<void>;
  /** I4: the hosted requirement, asked only of a successful completion. */
  assertUsageReported(observed: Readonly<{ providerRef: string; usage: unknown }>): Promise<void>;
}

export interface CostEnvelopeGuardInput {
  readonly store: ModelSpendStore;
  readonly policy: Readonly<{ perRunCeilingMicros: number; dailyCeilingMicros: number }>;
  /** Seam for "now", so the day boundary is testable without waiting for midnight. */
  readonly clock?: () => Date;
  /**
   * I1 — how long an admission reservation stays live. It must cover admission
   * reaching its first CHARGED call, which is the window in which a newly
   * admitted run is invisible to the day's spend; it should not be longer,
   * because inside it a reservation and that run's early charges are both
   * counted.
   *
   * C-I2 — THIRTY MINUTES, AND THE ARITHMETIC THAT CHOSE IT. PROVISIONAL, in
   * the same sense and for the same reason as the money values on
   * `costEnvelopePolicy`: no paid run has been measured yet, so this is an
   * engineering bound the owner resets from the first measurement.
   *
   * Two minutes — the round-1 value — was chosen from the HAPPY path ("a full
   * debate's first model call happens in seconds"). The window that matters is
   * the UNhappy one, and the deployment's own sealed rows set it:
   *
   *   judge deadline x its attempts     3 x 180 s =  540 s  (`acceptanceOrganCostBounds`;
   *                                                          the kit's runner.env declares
   *                                                          120 s x 3, which is smaller)
   * + cooldown x holds allowed per run 2 x 600 s = 1 200 s  (`runDeathPolicy.cooldown_ms`
   *                                                          x `max_cooldown_holds_per_run`)
   *   ------------------------------------------------
   *   = 1 740 s = 29 minutes.
   *
   * So thirty minutes covers that worst case with a margin of SIXTY SECONDS,
   * and no more (fix round 1, Minor 2 — the round-1 comment counted one hold
   * and claimed 11 minutes). Queueing behind another run on a busy runner is
   * NOT inside the margin: a run that waits longer than a minute past both
   * cooldown holds for its first charge becomes invisible to the day again.
   * That residual is accepted rather than papered over, because the TTL is not
   * free in the other direction either — a reservation and that run's early
   * charges are both counted while it is live, and the refusal a live
   * reservation causes answers `Retry-After: next UTC midnight` although the
   * day reopens when it expires.
   *
   * Below this sum the daily ceiling degrades to the ask rate limit exactly
   * when it is most needed: during a vendor outage every ask sees committed = 0,
   * is admitted, and can later spend a whole per-run ceiling. Above it, the cost
   * is only the conservative direction — refusing a new run early, never
   * admitting one late.
   */
  readonly reservationTtlMs?: number;
}

export const DEFAULT_RESERVATION_TTL_MS = 1_800_000 as const;

export interface ProviderSeamInput {
  readonly runId: string;
  readonly price: ProviderTargetPrice;
  /**
   * HOSTED requires it: a vendor that reports no usage cannot be billed, so its
   * answer is refused rather than charged as zero. LOCAL does not — the relays
   * and loopback model servers report nothing and cost nothing.
   */
  readonly requireReportedUsage: boolean;
}

/**
 * The two V-28 guards, over one store and one sealed policy.
 *
 * Both read the persisted total at the moment they decide rather than caching
 * it: the API and the runner spend against the same day from different
 * processes, and a cached total would be a ceiling only one of them respected.
 */
export class CostEnvelopeGuard {
  readonly #store: ModelSpendStore;
  readonly #policy: Readonly<{ perRunCeilingMicros: number; dailyCeilingMicros: number }>;
  readonly #clock: () => Date;
  readonly #reservationTtlMs: number;

  constructor(input: CostEnvelopeGuardInput) {
    if (input?.store === undefined || input?.policy === undefined) {
      throw new TypeError("COST_ENVELOPE_GUARD_INPUT_INVALID");
    }
    this.#store = input.store;
    this.#policy = input.policy;
    this.#clock = input.clock ?? (() => new Date());
    const ttl = input.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS;
    if (!Number.isInteger(ttl) || ttl < 1) throw new TypeError("COST_ENVELOPE_RESERVATION_TTL_INVALID");
    this.#reservationTtlMs = ttl;
  }

  /**
   * THE PER-RUN GUARD, in the shape the provider gateway consumes.
   *
   * `assertCallAllowed` runs before the request is sent and refuses the call
   * whose configured maximum would take this run past its ceiling.
   * `recordCall` runs after a completed call and charges what the vendor
   * reported. Neither consults the DAILY ceiling: a run already under way
   * finishes, which is V-28(2) in as many words.
   */
  providerSeam(input: ProviderSeamInput): ProviderCostSeam {
    if (typeof input?.runId !== "string" || input.runId.trim() === "") {
      throw new TypeError("COST_ENVELOPE_RUN_REQUIRED");
    }
    /**
     * C2 (review round 2), the second layer. `assertPricedProviderTargets`
     * refuses a zero-priced target at boot; this refuses to BUILD a metered
     * seam over one, so a composition that reached here another way still
     * cannot run unbounded while reporting that it is metered. A control that
     * depends on another control having run is one edit from being no control.
     *
     * Only where usage is required — that is the hosted, metered path. Local
     * mode passes a zero price for a free local model, which is the point.
     */
    if (input.requireReportedUsage
      && (input.price?.inputMicrosPerMillionTokens < 1
        || input.price?.outputMicrosPerMillionTokens < 1)) {
      throw new TypedDomainError(
        "COST_ENVELOPE_PRICE_UNPRICED",
        "A metered provider seam needs a price of at least one micro-unit per million tokens"
      );
    }
    return {
      assertCallAllowed: async (projection) => {
        const decision = decideRunCostEnvelope({
          spentMicros: await this.#store.readRunSpentMicros(input.runId),
          projectedMicros: projectedCallCeilingMicros(input.price, projection),
          ceilingMicros: this.#policy.perRunCeilingMicros
        });
        if (decision.kind === "WOULD_CROSS") throw runCostEnvelopeReached(decision);
      },
      // I4: charging never refuses. Nothing is written for a call whose vendor
      // said nothing at all about usage — a zero row would read as "this call
      // was free", which is the falsehood the hosted refusal below exists to
      // prevent. Important 1: a block that IS there but carries a count this
      // cannot read is charged at the call's own projected maximum, because the
      // vendor billed for it either way.
      recordCall: async (observed) => {
        /**
         * Round 2, Critical B — THE CHARGE COMPUTATION MAY ONLY FAIL TYPED.
         *
         * This runs inside the gateway's attempt loop, which decides whether to
         * retry by asking `error instanceof TypedDomainError`. An untyped throw
         * from the arithmetic was therefore RETRIED — a second billed call for a
         * number that will be just as unrepresentable — and none of them was
         * recorded. Only the pure computation is wrapped: a failure of the STORE
         * is the ledger's own (the never-charge path) and must keep its name.
         */
        let usage: ReturnType<typeof chargeableUsage>;
        let chargeMicros: number;
        try {
          usage = chargeableUsage(observed.usage, observed.projection);
          if (usage === null) return;
          chargeMicros = chargeMicrosForUsage(input.price, usage);
        } catch (error) {
          if (error instanceof TypedDomainError) throw error;
          throw new TypedDomainError(
            COST_ENVELOPE_CHARGE_UNREPRESENTABLE,
            `The charge for ${observed.providerRef} could not be computed:`
              + ` ${error instanceof Error ? error.message : String(error)}`
          );
        }
        await this.#store.recordSpend(Object.freeze({
          spendId: randomUUID(),
          spendSource: "RUN",
          runId: input.runId,
          providerRef: observed.providerRef,
          chargedOn: costEnvelopeDay(this.#clock()),
          chargeMicros,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens
        }));
      },
      assertUsageReported: async (observed) => {
        if (!input.requireReportedUsage) return;
        if (readReportedUsage(observed.usage) === null) {
          throw providerUsageUnreported(observed.providerRef);
        }
      }
    };
  }

  /**
   * THE DAILY GUARD, asked when a NEW run is requested and at no other time.
   *
   * It is deliberately not consulted per call: V-28(2) stops the next run, not
   * the current one, and a mid-run daily refusal would throw away work the
   * application has already paid for.
   */
  async assertDailyEnvelopeAdmitsNewRun(): Promise<void> {
    const now = this.#clock();
    const outcome = await this.#store.admitNewRun({
      day: costEnvelopeDay(now),
      reservedMicros: this.#policy.perRunCeilingMicros,
      now,
      expiresAt: new Date(now.getTime() + this.#reservationTtlMs),
      // ONE definition of the ceiling, passed in rather than restated in SQL.
      decide: (committedMicros) => decideDailyCostEnvelope({
        spentMicrosToday: committedMicros,
        ceilingMicros: this.#policy.dailyCeilingMicros
      }).kind === "WITHIN"
    });
    if (outcome.admitted) return;
    throw dailyCostEnvelopeReached(Object.freeze({
      kind: "REACHED",
      spentMicrosToday: outcome.committedMicros,
      ceilingMicros: this.#policy.dailyCeilingMicros
    }));
  }
}

/**
 * `ledger.model_spend` (migration 0066), the shipped store.
 *
 * Both totals are SUMS OVER THE ROWS rather than a separate counter column. A
 * counter kept beside the rows is a second source of truth that can drift from
 * them — silently, and in the direction that matters — and the rows are the
 * record an operator reconciles a vendor invoice against. The two indexes the
 * migration creates are what make the sums cheap.
 */
export class PostgresModelSpendStore implements ModelSpendStore {
  constructor(private readonly pool: Pool) {}

  async recordSpend(entry: ModelSpendEntry): Promise<void> {
    if (entry.spendSource === "RUN" && entry.runId === null) {
      throw new TypedDomainError("MODEL_SPEND_RUN_REQUIRED", "A run charge must name its run");
    }
    await this.pool.query(
      `INSERT INTO ledger.model_spend (
         spend_id, spend_source, run_id, provider_ref,
         charged_on, charge_micros, input_tokens, output_tokens
       ) VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8)`,
      [
        entry.spendId, entry.spendSource, entry.runId, entry.providerRef,
        entry.chargedOn, entry.chargeMicros, entry.inputTokens, entry.outputTokens
      ]
    );
  }

  async readRunSpentMicros(runId: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      "SELECT coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend WHERE run_id = $1",
      [runId]
    );
    return this.#total(result.rows[0]?.total);
  }

  async readDaySpentMicros(day: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      "SELECT coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend WHERE charged_on = $1::date",
      [day]
    );
    return this.#total(result.rows[0]?.total);
  }

  /**
   * I1 — the read, the decision and the reservation as ONE serialised operation.
   *
   * `pg_advisory_xact_lock` keyed on the day makes concurrent admissions queue
   * instead of racing, and the lock is released by the commit or the rollback,
   * so a failure here cannot leave the day locked. Expired reservations are not
   * deleted — nothing in this schema deletes — they simply stop counting, which
   * is what makes a run that dies at birth unable to wedge the day shut.
   */
  async admitNewRun(input: Readonly<{
    day: string;
    reservedMicros: number;
    now: Date;
    expiresAt: Date;
    decide: (committedMicros: number) => boolean;
  }>): Promise<Readonly<{ admitted: boolean; committedMicros: number }>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      /**
       * A stable 64-bit key for this UTC day: two API processes admitting on the
       * same day take the same lock, and different days never contend.
       *
       * The SINGLE-key `bigint` form, over `hashtextextended(<text>, 0)` — the
       * shape `migrations/0040_account_erasure.sql` uses a dozen times.
       * PostgreSQL's two-key overload is `(integer, integer)` and `hashtext`
       * returns integer, so a two-key call built from bigints resolves to NO
       * function and raises 42883 on every ask. `tests/architecture/
       * v28-advisory-lock-shape.test.ts` pins this text, because the engine is
       * down here and nothing can execute it.
       */
      await client.query(
        "SELECT pg_advisory_xact_lock("
        + "pg_catalog.hashtextextended('debateai.cost_envelope.day:' || $1, 0))",
        [input.day]
      );
      const committed = await client.query<{ total: string }>(
        `SELECT (
           coalesce((SELECT sum(charge_micros) FROM ledger.model_spend WHERE charged_on = $1::date), 0)
           + coalesce((SELECT sum(reserved_micros) FROM ledger.model_spend_reservation
                        WHERE reserved_on = $1::date AND expires_at > $2), 0)
         )::text AS total`,
        [input.day, input.now]
      );
      const committedMicros = this.#total(committed.rows[0]?.total);
      const admitted = input.decide(committedMicros);
      if (admitted) {
        await client.query(
          `INSERT INTO ledger.model_spend_reservation
             (reservation_id, reserved_on, reserved_micros, opened_at, expires_at)
           VALUES (gen_random_uuid(), $1::date, $2, $3, $4)`,
          [input.day, input.reservedMicros, input.now, input.expiresAt]
        );
      }
      await client.query("COMMIT");
      return Object.freeze({ admitted, committedMicros });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * `sum(bigint)` comes back as `numeric`, read as TEXT and narrowed here so an
   * accumulated total that has outgrown a double refuses loudly instead of
   * quietly rounding a ceiling in the deployment's favour.
   */
  #total(text: string | undefined): number {
    const total = Number(text ?? "0");
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new TypedDomainError(
        "MODEL_SPEND_TOTAL_UNREPRESENTABLE",
        "The accumulated model spend cannot be represented exactly"
      );
    }
    return total;
  }
}
