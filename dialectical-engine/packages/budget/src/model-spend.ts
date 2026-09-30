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
import { TypedDomainError, exhaustive } from "@debateai/kernel";
import {
  costEnvelopeCeilings,
  storyEnvelopeCeilings,
  type CostEnvelopeCeilings,
  type CostEnvelopePolicy,
  type StoryPolicy
} from "@debateai/register";
import type { Pool, PoolClient } from "pg";
import {
  COST_ENVELOPE_CHARGE_UNREPRESENTABLE,
  chargeMicrosForUsage,
  chargeableUsage,
  costEnvelopeDay,
  dailyCostEnvelopeReached,
  decideDailyCostEnvelope,
  decideRunCostEnvelope,
  isCostEnvelopePhase,
  projectedCallCeilingMicros,
  providerUsageUnreported,
  readReportedUsage,
  runCostEnvelopeReached,
  storyCostEnvelopeReached,
  type CostEnvelopePhase,
  type ProviderTargetPrice,
  type RunCostEnvelopeDecision
} from "./cost-envelope.js";

/**
 * Where a charge came from. `RUN` is a debate; `SUPPORT` is the help chat;
 * `STORY` is the verdict story written after a debate settled (migration 0074).
 * A STORY charge names its run and counts toward the DAY, but never toward the
 * run's own envelope: the story can never cost the verdict (spec §8).
 */
export type ModelSpendSource = "RUN" | "SUPPORT" | "STORY";

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
  /**
   * Engine money rule, Task M1 (risk R12, migration 0075): which part of the
   * run spent a RUN charge — while the debate was argued, or writing the
   * answer — so the first paid runs show the two apart. Absent on SUPPORT and
   * STORY charges, and on every row written before the migration.
   */
  readonly spendPhase?: CostEnvelopePhase;
}

/**
 * The two questions and the one write the envelopes need. A seam rather than a
 * pool so the rules above it are unit-testable, and so a future caller (task 12's
 * support transport, an offline reconciliation) can supply its own.
 */
export interface ModelSpendStore {
  recordSpend(entry: ModelSpendEntry): Promise<void>;
  /**
   * Everything this ONE run's DEBATE has been charged, across every vendor it
   * touched. STORY charges are excluded: the story has its own envelope.
   */
  readRunSpentMicros(runId: string): Promise<number>;
  /** Everything this run's verdict STORY has been charged (spend source STORY only). */
  readRunStorySpentMicros(runId: string): Promise<number>;
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
  readonly policy: Readonly<{
    perRunCeilingMicros: number;
    dailyCeilingMicros: number;
    /**
     * Verdict story: the story's OWN money ceiling, from the optional
     * `storyCostEnvelopePolicy` row. Absent means no story seam can be built,
     * and the daily admission reserves the run's ceiling alone, as before.
     */
    perStoryCeilingMicros?: number;
    /**
     * Engine money rule, Task M7: the story row's `per_story_overrun_basis_points`,
     * how far a story may go over `perStoryCeilingMicros`. Absent means 0:
     * today's cap. Meaningless, and ignored, without a story ceiling.
     */
    perStoryOverrunBasisPoints?: number;
    /**
     * Engine money rule, Task M1: the `costEnvelopePolicy` row's reserve and
     * overrun (`serve_reserve_basis_points`, `serve_overrun_basis_points`).
     * Absent means 0: one ceiling for every call, exactly as before.
     */
    serveReserveBasisPoints?: number;
    serveOverrunBasisPoints?: number;
  }>;
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

/**
 * THE MOST ONE RUN MAY SPEND — what the day reserves when it admits a new run,
 * computed here and nowhere else.
 *
 *  - The DEBATE: its per-run ceiling plus the answer's overrun, rounded up
 *    (`costEnvelopeCeilings(...).runMaximumMicros`). The reserve moves money
 *    inside that ceiling and changes nothing here.
 *  - The STORY written after it settles: its own ceiling plus the story's
 *    overrun, rounded up (`storyEnvelopeCeilings(...).storyMaximumMicros`,
 *    Task M7). No story ceiling, no story, nothing reserved for one.
 *
 * Without an overrun and without a story row this is `perRunCeilingMicros`,
 * exactly what the day reserved before either existed.
 */
export function mostOneRunMaySpendMicros(policy: Readonly<{
  perRunCeilingMicros: number;
  perStoryCeilingMicros?: number;
  perStoryOverrunBasisPoints?: number;
  serveReserveBasisPoints?: number;
  serveOverrunBasisPoints?: number;
}>): number {
  const story = policy.perStoryCeilingMicros === undefined
    ? 0
    : storyEnvelopeCeilings({
        perStoryCeilingMicros: policy.perStoryCeilingMicros,
        ...(policy.perStoryOverrunBasisPoints === undefined
          ? {} : { perStoryOverrunBasisPoints: policy.perStoryOverrunBasisPoints })
      }).storyMaximumMicros;
  return costEnvelopeCeilings(policy).runMaximumMicros + story;
}

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.1), TASK M7 — THE ONE CHECK OVER
 * BOTH MONEY ROWS, and the guard policy both boots build from them.
 *
 * The `costEnvelopePolicy` row's own refinement holds its day to ONE run (the
 * per-run ceiling plus the answer's overrun). It cannot see the story, whose
 * cap and overrun live in another row (`storyCostEnvelopePolicy`), so a day
 * that holds one run and not its story passes it. This reads BOTH, and refuses
 * a day below the most one run may spend with its story
 * (`mostOneRunMaySpendMicros`) — STORY_DAILY_CEILING_INSUFFICIENT, with no
 * figure in the message. The operator sees that code on stderr (the publish
 * command prints it; a refused boot prints the error), and the runbook's row
 * for it (deploy/vps/README.md) gives the figures and the fix: raise
 * `daily_ceiling_micros` in a new register version.
 *
 * Called where both rows are already read: the hosted publication's plan
 * (`planHostedRegisterPublication`, before anything is sealed) and the hosted
 * boots of the runner and the API (the policy their `CostEnvelopeGuard` is
 * built from). `story` is the story family as `readStoryPolicy` returns it, or
 * null when the version sealed none (or it could not be read): a story with no
 * money ceiling cannot be written in hosted mode, so the day holds only the run.
 */
export function costEnvelopeGuardPolicy(
  run: Pick<CostEnvelopePolicy,
    "perRunCeilingMicros" | "dailyCeilingMicros" | "serveReserveBasisPoints" | "serveOverrunBasisPoints">,
  story: Pick<StoryPolicy, "perStoryCeilingMicros" | "perStoryOverrunBasisPoints"> | null
): CostEnvelopeGuardInput["policy"] {
  const policy: CostEnvelopeGuardInput["policy"] = Object.freeze({
    perRunCeilingMicros: run.perRunCeilingMicros,
    dailyCeilingMicros: run.dailyCeilingMicros,
    serveReserveBasisPoints: run.serveReserveBasisPoints,
    serveOverrunBasisPoints: run.serveOverrunBasisPoints,
    ...(story === null || story.perStoryCeilingMicros === null ? {} : {
      perStoryCeilingMicros: story.perStoryCeilingMicros,
      perStoryOverrunBasisPoints: story.perStoryOverrunBasisPoints
    })
  });
  if (policy.dailyCeilingMicros < mostOneRunMaySpendMicros(policy)) {
    throw new TypedDomainError(
      "STORY_DAILY_CEILING_INSUFFICIENT",
      "The daily ceiling cannot hold one full run plus its story: the answer's overrun and the story's own"
        + " ceiling and overrun must fit in one day"
    );
  }
  return policy;
}

/** The two spend sources a gateway money seam charges (the support chat keeps its own accounting). */
type MeteredSpendSource = Extract<ModelSpendSource, "RUN" | "STORY">;

/** What a metered seam spends against: see `CostEnvelopeGuard.#envelopeFor`. */
interface MeteredEnvelope {
  readonly spendSource: MeteredSpendSource;
  readonly ceilingMicros: number;
  readSpentMicros(runId: string): Promise<number>;
  refusal(decision: Extract<RunCostEnvelopeDecision, { kind: "WOULD_CROSS" }>): TypedDomainError;
}

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
 * The RUN seam also needs the call's phase (Task M1): an answer-writing call
 * and a call made while the debate is argued are compared with different
 * ceilings, and the charge records which one it was. The story seam has no
 * phase: it is its own envelope.
 */
export interface RunProviderSeamInput extends ProviderSeamInput {
  readonly phase: CostEnvelopePhase;
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
  readonly #policy: CostEnvelopeGuardInput["policy"];
  /** Task M1: the body's and the answer's ceilings, computed once from the policy. */
  readonly #ceilings: CostEnvelopeCeilings;
  /** Task M7: the story's ceiling with its overrun; null without a story ceiling (no story seam). */
  readonly #storyCeilingMicros: number | null;
  readonly #clock: () => Date;
  readonly #reservationTtlMs: number;

  constructor(input: CostEnvelopeGuardInput) {
    if (input?.store === undefined || input?.policy === undefined) {
      throw new TypeError("COST_ENVELOPE_GUARD_INPUT_INVALID");
    }
    this.#store = input.store;
    this.#policy = input.policy;
    const storyCeiling = input.policy.perStoryCeilingMicros;
    if (storyCeiling !== undefined && (!Number.isSafeInteger(storyCeiling) || storyCeiling < 1)) {
      throw new TypeError("STORY_ENVELOPE_POLICY_INVALID");
    }
    // A reserve or an overrun the policy row would refuse is refused here too,
    // at construction, so a guard can never run on shares nobody could seal.
    this.#ceilings = costEnvelopeCeilings(input.policy);
    // Task M7: the story's overrun likewise (STORY_ENVELOPE_POLICY_INVALID).
    this.#storyCeilingMicros = storyCeiling === undefined ? null : storyEnvelopeCeilings({
      perStoryCeilingMicros: storyCeiling,
      ...(input.policy.perStoryOverrunBasisPoints === undefined
        ? {} : { perStoryOverrunBasisPoints: input.policy.perStoryOverrunBasisPoints })
    }).storyMicros;
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
   *
   * Task M1: the ceiling is the PHASE's. A call made while the debate is argued
   * (BODY) is compared with the per-run ceiling less the answer's reserve; an
   * answer-writing call (SERVE) with the per-run ceiling plus its overrun. Both
   * compare the run's WHOLE debate spend, so the body simply stops sooner and
   * leaves the answer its money. The refusal code is the same for both.
   */
  providerSeam(input: RunProviderSeamInput): ProviderCostSeam {
    if (!isCostEnvelopePhase(input?.phase)) throw new TypeError("MODEL_SPEND_PHASE_INVALID");
    return this.#meteredSeam(input, "RUN", input.phase);
  }

  /**
   * VERDICT STORY — THE STORY'S OWN MONEY SEAM (spec §8), in the shape the
   * gateway consumes. The per-run seam's rules, built by the same body, with
   * the four differences `#envelopeFor` names and no others: it sums STORY
   * charges only, compares them with `perStoryCeilingMicros` plus the story's
   * overrun (Task M7), refuses with
   * STORY_COST_ENVELOPE_REACHED, and charges STORY rows. So a debate that has
   * spent its whole envelope does not stop its story, and a story can never
   * spend the debate's envelope. With no sealed story ceiling there is no
   * story seam at all (STORY_ENVELOPE_MISSING).
   */
  storySeam(input: ProviderSeamInput): ProviderCostSeam {
    return this.#meteredSeam(input, "STORY", null);
  }

  /**
   * THE ONE BODY OF BOTH MONEY SEAMS. The run-id guard, the price guard, the
   * charge and the hosted usage requirement are the same rules for a debate
   * call and a story call, so they are written once; only the envelope
   * (`#envelopeFor`) differs. `phase` is the RUN seam's (Task M1) and null for
   * the story.
   */
  #meteredSeam(
    input: ProviderSeamInput,
    spendSource: MeteredSpendSource,
    phase: CostEnvelopePhase | null
  ): ProviderCostSeam {
    if (typeof input?.runId !== "string" || input.runId.trim() === "") {
      throw new TypeError("COST_ENVELOPE_RUN_REQUIRED");
    }
    const envelope = this.#envelopeFor(spendSource, phase);
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
          spentMicros: await envelope.readSpentMicros(input.runId),
          projectedMicros: projectedCallCeilingMicros(input.price, projection),
          ceilingMicros: envelope.ceilingMicros
        });
        if (decision.kind === "WOULD_CROSS") throw envelope.refusal(decision);
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
          spendSource: envelope.spendSource,
          runId: input.runId,
          providerRef: observed.providerRef,
          chargedOn: costEnvelopeDay(this.#clock()),
          chargeMicros,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          // Task M1 (R12): a RUN charge says which part of the run spent it.
          ...(phase === null ? {} : { spendPhase: phase })
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
   * Which envelope a metered seam spends — the ONLY four things the run's seam
   * and the story's seam do differently: the spent total they read, the
   * ceiling they compare it with, the refusal they raise, and the spend source
   * they charge.
   *
   * Task M1: within the RUN envelope the ceiling is the phase's — the body's
   * (per-run less the answer's reserve) or the answer's (per-run plus its
   * overrun) — over the same run total, with the same refusal. With neither
   * policy member both are the per-run ceiling, as before.
   *
   * Task M7 (spec §14.4.6): the STORY envelope's ceiling is the story's cap
   * plus its own overrun, `perStory x (10000 + overrun) / 10000` rounded down
   * (`storyEnvelopeCeilings`, computed once at construction). Without the
   * member it is the cap, as before.
   */
  #envelopeFor(spendSource: MeteredSpendSource, phase: CostEnvelopePhase | null): MeteredEnvelope {
    switch (spendSource) {
      case "RUN":
        return Object.freeze({
          spendSource: "RUN",
          ceilingMicros: phase === "SERVE" ? this.#ceilings.serveMicros : this.#ceilings.bodyMicros,
          readSpentMicros: (runId: string) => this.#store.readRunSpentMicros(runId),
          refusal: runCostEnvelopeReached
        });
      case "STORY": {
        const ceilingMicros = this.#storyCeilingMicros;
        if (ceilingMicros === null) {
          throw new TypedDomainError(
            "STORY_ENVELOPE_MISSING",
            "A metered story seam needs the sealed storyCostEnvelopePolicy row"
          );
        }
        return Object.freeze({
          spendSource: "STORY",
          ceilingMicros,
          readSpentMicros: (runId: string) => this.#store.readRunStorySpentMicros(runId),
          refusal: storyCostEnvelopeReached
        });
      }
      default:
        return exhaustive(spendSource);
    }
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
      // Verdict story: an admitted run may also write its story, whose spend
      // counts toward the day, so the day reserves both ceilings at once.
      // Task M1: and the answer may go over the per-run ceiling by its
      // overrun, so the day reserves that too (`mostOneRunMaySpendMicros`).
      // Task M7: and the story over its own cap by its overrun.
      reservedMicros: mostOneRunMaySpendMicros(this.#policy),
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
    if ((entry.spendSource === "RUN" || entry.spendSource === "STORY") && entry.runId === null) {
      throw new TypedDomainError("MODEL_SPEND_RUN_REQUIRED", "A run or story charge must name its run");
    }
    // Task M1 (migration 0075): only a RUN charge has a phase. The CHECK
    // `model_spend_phase_is_a_run_charge` says the same one layer lower.
    if (entry.spendPhase !== undefined && entry.spendSource !== "RUN") {
      throw new TypedDomainError(
        "MODEL_SPEND_PHASE_NOT_A_RUN_CHARGE",
        "Only a debate run's charge records the phase that spent it"
      );
    }
    await this.pool.query(
      `INSERT INTO ledger.model_spend (
         spend_id, spend_source, run_id, provider_ref,
         charged_on, charge_micros, input_tokens, output_tokens, spend_phase
       ) VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9)`,
      [
        entry.spendId, entry.spendSource, entry.runId, entry.providerRef,
        entry.chargedOn, entry.chargeMicros, entry.inputTokens, entry.outputTokens,
        entry.spendPhase ?? null
      ]
    );
  }

  async readRunSpentMicros(runId: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend
       WHERE run_id = $1 AND spend_source <> 'STORY'`,
      [runId]
    );
    return this.#total(result.rows[0]?.total);
  }

  async readRunStorySpentMicros(runId: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend
       WHERE run_id = $1 AND spend_source = 'STORY'`,
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
   * Budget spec §2.6 — THE HOLD a started run carries: the estimate, written once
   * in the locked transaction that started it (the ask's START or the waker's).
   * The caller then queues the run's first job on the SAME transaction
   * (`WorkItemRepository.enqueueOn`), so the hold and its job commit together:
   * a committed hold always has its job, and a READY job always has its hold.
   * Nothing ever releases it.
   */
  async openHold(
    client: Pick<PoolClient, "query">,
    input: Readonly<{ runId: string; heldMicros: number }>
  ): Promise<void> {
    if (typeof input?.runId !== "string" || input.runId.trim() === "") {
      throw new TypeError("MODEL_SPEND_HOLD_RUN_REQUIRED");
    }
    if (!Number.isSafeInteger(input.heldMicros) || input.heldMicros < 1) {
      throw new TypeError("MODEL_SPEND_HOLD_INVALID");
    }
    await client.query(
      `INSERT INTO ledger.model_spend_hold (hold_id, run_id, held_micros, opened_at)
       VALUES (gen_random_uuid(), $1, $2, clock_timestamp())`,
      [input.runId, input.heldMicros]
    );
  }

  /**
   * Budget spec §2.2/§2.6 — THE COUNTED HOLDS ON THE SITE'S DAY: for every run that
   * still has a READY or CLAIMED job and whose hold was opened no later than that
   * UTC day, the part of its hold it has not yet spent (RUN + STORY), never less
   * than zero. Read from the live jobs outward (`work_item_live_run_idx`).
   */
  async readSiteCountedHoldsMicros(day: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT coalesce(sum(greatest(0, hold.held_micros - coalesce(spent.total, 0))), 0)::text AS total
       FROM (
         SELECT DISTINCT work.run_id FROM core.work_item AS work
         WHERE work.run_id IS NOT NULL AND work.state IN ('READY','CLAIMED')
       ) AS live
       JOIN ledger.model_spend_hold AS hold ON hold.run_id = live.run_id
       LEFT JOIN LATERAL (
         SELECT sum(spend.charge_micros) AS total FROM ledger.model_spend AS spend
         WHERE spend.run_id = hold.run_id AND spend.spend_source IN ('RUN','STORY')
       ) AS spent ON true
       WHERE hold.opened_at < (($1::date + 1)::timestamp AT TIME ZONE 'UTC')`,
      [day]
    );
    return this.#total(result.rows[0]?.total);
  }

  /**
   * Paid-plans spec §2.4.2 (B6) — WHAT ONE PERSON HAS SPENT IN A WINDOW: the RUN
   * and STORY charges of the runs `billing.run_charge_scope` pins to them whose
   * `recorded_at` falls in `[from, to)`. One indexed query per window.
   */
  async readOwnerSpentMicros(ownerRef: string, from: Date, to: Date): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT coalesce(sum(spend.charge_micros),0)::text AS total
       FROM billing.run_charge_scope AS scope
       JOIN ledger.model_spend AS spend ON spend.run_id = scope.run_id
       WHERE scope.owner_ref = $1::uuid
         AND scope.admitted_at < $3
         AND spend.spend_source IN ('RUN','STORY')
         AND spend.recorded_at >= $2 AND spend.recorded_at < $3`,
      [ownerRef, from, to]
    );
    return this.#total(result.rows[0]?.total);
  }

  /**
   * Paid-plans spec §2.4.2 (B6) — ONE PERSON'S COUNTED HOLDS: the unspent part
   * of each hold whose run is pinned to them and still has a READY or CLAIMED job.
   */
  async readOwnerCountedHoldsMicros(ownerRef: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT coalesce(sum(greatest(0, hold.held_micros - coalesce(spent.total, 0))), 0)::text AS total
       FROM billing.run_charge_scope AS scope
       JOIN ledger.model_spend_hold AS hold ON hold.run_id = scope.run_id
       LEFT JOIN LATERAL (
         SELECT sum(spend.charge_micros) AS total FROM ledger.model_spend AS spend
         WHERE spend.run_id = hold.run_id AND spend.spend_source IN ('RUN','STORY')
       ) AS spent ON true
       WHERE scope.owner_ref = $1::uuid
         AND EXISTS (
           SELECT 1 FROM core.work_item AS work
           WHERE work.run_id = hold.run_id AND work.state IN ('READY','CLAIMED')
         )`,
      [ownerRef]
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
