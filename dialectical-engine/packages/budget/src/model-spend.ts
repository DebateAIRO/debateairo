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
  sharedWallReached,
  storyCostEnvelopeReached,
  type CostEnvelopePhase,
  type ProviderTargetPrice,
  type RunCostEnvelopeDecision
} from "./cost-envelope.js";
import type { FundingBasis, ProviderCallAdmission } from "@debateai/kernel";
import type { SpendScope } from "./person-allowance.js";
import type { PersonAllowanceSource } from "./person-allowance.js";
import { decideSharedWall } from "./room.js";

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
  /**
   * Model scorecard §2.3 (migration 0090): the gateway attempt this charge paid
   * for. `null` or absent for a charge recorded outside the gateway.
   */
  readonly attemptId?: string | null;
}

/**
 * The two questions and the one write the envelopes need. A seam rather than a
 * pool so the rules above it are unit-testable, and so a future caller (task 12's
 * support transport, an offline reconciliation) can supply its own.
 */
export interface ModelSpendStore {
  recordSpend(entry: ModelSpendEntry): Promise<void>;
  reserveInternalCall?(input: Readonly<{ callId: string; runId: string; projectedMicros: number; spendSource: "RUN" | "STORY"; spendPhase: CostEnvelopePhase | null }>): Promise<boolean>;
  settleInternalCall?(callId: string, entry: ModelSpendEntry): Promise<void>;
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
  }>): Promise<void | ProviderCallAdmission>;
  /**
   * I4: charges what the vendor billed, and never refuses. `projection` is the
   * call's own pre-send maximum, used for a count the vendor's block carries
   * but this cannot read (Important 1).
   */
  recordCall(observed: Readonly<{
    providerRef: string;
    usage: unknown;
    admission?: ProviderCallAdmission;
    projection: Readonly<{ requestBytes: number; completionTokenCeiling: number }>;
    /** Model scorecard §2.3: the gateway attempt this charge pays for. */
    attemptId?: string;
  }>): Promise<void>;
  /** I4: the hosted requirement, asked only of a successful completion. */
  assertUsageReported(observed: Readonly<{ providerRef: string; usage: unknown }>): Promise<void>;
}

/**
 * B9 (budget spec §2.9, paid-plans spec §2.4.2) — WHERE THE WALL READS A RUN'S
 * OWNER AND WHAT THAT OWNER HAS SPENT. `PostgresModelSpendStore` is the shipped
 * reader: the owner billing pinned on the run at admission
 * (`billing.run_charge_scope`, migration 0084) and the owner's RUN + STORY spend
 * recorded inside a window (`readOwnerSpentMicros`, task B6a). A run with no
 * pinned owner — billing off (B6 writes the row only when hosted billing is on,
 * ruling R-19), local mode, a legacy asker, a run admitted before billing — has
 * no person scope.
 */
export interface RunOwnerSpendReader {
  readRunChargeOwnerRef(runId: string): Promise<string | null>;
  readOwnerSpentMicros(ownerRef: string, from: Date, to: Date, funding?: FundingBasis, scope?: SpendScope): Promise<number>;
}

/**
 * B9 — the shared wall's terms: the site day's finish edge (or none), and
 * where the owner's windows come from. The two halves are independent: the
 * person half applies to every run billing pinned an owner on (ruling R-19),
 * whether or not the register sealed the band.
 */
export interface SharedWallInput {
  /**
   * `costEnvelopePolicy.finishBasisPoints` (11 500; 10 000-20 000, as B1's
   * `decideSharedWall` requires): the site day's finish edge. Null when the
   * register version sealed no band: then there is no site-day wall and the day
   * is never read, and the person half still applies.
   */
  readonly finishBasisPoints: number | null;
  /** The run owner's windows, each carrying its own finish edge (11 000); `NO_PERSON_ALLOWANCE` supplies none. */
  readonly persons: PersonAllowanceSource;
  readonly owners: RunOwnerSpendReader;
}

/**
 * B9 — whether ONE call is measured against the shared wall. "EXEMPT" is the
 * first position's own call: a started debate always gets its first position.
 * Answer-writing (SERVE) calls and story calls are never walled, whatever this says.
 */
export type SharedWallApplication = "APPLY" | "EXEMPT";

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
  /**
   * B9 (budget spec §2.9): the shared wall. Present whenever hosted (the
   * shipped runner, B9b); its site-day half only with the `costEnvelopePolicy`
   * row's three band members (`finishBasisPoints` non-null), its person half
   * always. Absent (local mode) means no wall, exactly as before: a run under
   * way is held to its own ceiling alone.
   */
  readonly sharedWall?: SharedWallInput;
  readonly fundingAdmission?: Readonly<{ assertProviderFundingAdmission(runId: string, now: Date): Promise<void> }>;
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

/**
 * B9 (budget spec §2.10) — A LIMIT BELOW ONE CALL REFUSES THE BOOT, not a
 * person's debate. Beside `costEnvelopeGuardPolicy`, where both inputs are
 * known: the arguing ceiling (`costEnvelopeCeilings(...).bodyMicros`) must hold
 * the first position's own call at the cheapest price among each plan's models
 * — every plan's cheapest must fit — because a run's makers are its plan's
 * roster and its first call can move only among them. The caller hands one
 * group of first calls per plan (`firstCallsByPlanRoster`); this function knows
 * no plan. It refuses when the ceiling is below the LARGEST of the per-group
 * minima; equality fits, as it does in the seam; no group (or only empty ones)
 * means nothing to refuse. The prices live in the environment, not the
 * register, so both boots ask it; the hosted publish command asks it too, of
 * the operator file's priced targets (which must equal the environment's) and
 * the JUDGE bound it is about to seal, so a dry run refuses by the same code
 * (final review Part 1b, Important 3). No figure in the message; the runbook
 * gives the fix.
 */
export function assertRunCeilingCoversOneCall(input: Readonly<{
  bodyCeilingMicros: number;
  firstCallsByRoster: ReadonlyArray<ReadonlyArray<Readonly<{
    price: ProviderTargetPrice;
    requestBytes: number;
    completionTokenCeiling: number;
  }>>>;
}>): void {
  const cheapestPerPlan = input.firstCallsByRoster
    .filter((group) => group.length > 0)
    .map((group) => Math.min(...group.map((call) => projectedCallCeilingMicros(call.price, call))));
  if (cheapestPerPlan.length === 0) return;
  if (input.bodyCeilingMicros < Math.max(...cheapestPerPlan)) {
    throw new TypedDomainError(
      "RUN_CEILING_BELOW_ONE_CALL",
      "The run's ceiling for arguing is below the projected cost of the first position's own call at the cheapest"
        + " price among each plan's models (every plan's cheapest must fit): raise per_run_ceiling_micros, or lower"
        + " serve_reserve_basis_points, in a new register version"
    );
  }
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
  /** B9: absent means "APPLY"; the runner's gateway passes "EXEMPT" for the first position's own call. */
  readonly sharedWall?: SharedWallApplication;
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
  readonly #sharedWall: SharedWallInput | null;
  readonly #fundingAdmission: CostEnvelopeGuardInput["fundingAdmission"];

  constructor(input: CostEnvelopeGuardInput) {
    if (input?.store === undefined || input?.policy === undefined) {
      throw new TypeError("COST_ENVELOPE_GUARD_INPUT_INVALID");
    }
    this.#store = input.store;
    this.#fundingAdmission = input.fundingAdmission;
    if ((input.fundingAdmission !== undefined || input.store.reserveInternalCall !== undefined || input.store.settleInternalCall !== undefined)
      && (typeof input.store.reserveInternalCall !== "function" || typeof input.store.settleInternalCall !== "function"))
      throw new TypedDomainError("INTERNAL_FUNDING_UNAVAILABLE","Finite provider funding requires both atomic accounting adapters");
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
    // B9: a wall that could not be asked is refused here, at construction, the
    // way a reserve or an overrun the policy row would refuse is. The site's
    // finish edge is null (no band: no site-day wall) or held to the range
    // `decideSharedWall` (B1) answers for — 10 000-20 000 basis points, the
    // same range the costEnvelopePolicy row's `finish_up_to_basis_points` is
    // sealed in — so no walled call can meet B1's TypeError mid-run.
    const wall = input.sharedWall;
    if (wall !== undefined && (
      (wall.finishBasisPoints !== null && (
        !Number.isSafeInteger(wall.finishBasisPoints)
        || wall.finishBasisPoints < 10_000 || wall.finishBasisPoints > 20_000
      ))
      || typeof wall.persons?.read !== "function"
      || typeof wall.owners?.readRunChargeOwnerRef !== "function"
      || typeof wall.owners?.readOwnerSpentMicros !== "function"
    )) {
      throw new TypeError("COST_ENVELOPE_GUARD_INPUT_INVALID");
    }
    this.#sharedWall = wall ?? null;
  }

  /**
   * THE PER-RUN GUARD, in the shape the provider gateway consumes.
   *
   * `assertCallAllowed` runs before the request is sent and refuses the call
   * whose configured maximum would take this run past its ceiling.
   * `recordCall` runs after a completed call and charges what the vendor
   * reported.
   *
   * Task M1: the ceiling is the PHASE's. A call made while the debate is argued
   * (BODY) is compared with the per-run ceiling less the answer's reserve; an
   * answer-writing call (SERVE) with the per-run ceiling plus its overrun. Both
   * compare the run's WHOLE debate spend, so the body simply stops sooner and
   * leaves the answer its money. The refusal code is the same for both.
   *
   * B9 (budget spec §2.9): on a guard with a shared wall (hosted) a BODY call
   * is ALSO measured against it — the site's day (only with the band's finish
   * edge) and the run owner's windows, each at its finish edge — unless it is
   * the first position's own call. A SERVE call never is: a started debate
   * always gets its answer.
   */
  providerSeam(input: RunProviderSeamInput): ProviderCostSeam {
    if (!isCostEnvelopePhase(input?.phase)) throw new TypeError("MODEL_SPEND_PHASE_INVALID");
    const application = input.sharedWall ?? "APPLY";
    if (application !== "APPLY" && application !== "EXEMPT") {
      throw new TypeError("COST_ENVELOPE_GUARD_INPUT_INVALID");
    }
    return this.#meteredSeam(input, "RUN", input.phase, input.phase === "BODY" && application === "APPLY");
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
    return this.#meteredSeam(input, "STORY", null, false);
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
    phase: CostEnvelopePhase | null,
    walled: boolean
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
    const admissions = new WeakSet<ProviderCallAdmission>();
    return {
      assertCallAllowed: async (projection) => {
        const projectedMicros = projectedCallCeilingMicros(input.price, projection);
        const decision = decideRunCostEnvelope({
          spentMicros: await envelope.readSpentMicros(input.runId),
          projectedMicros,
          ceilingMicros: envelope.ceilingMicros
        });
        if (decision.kind === "WOULD_CROSS") throw envelope.refusal(decision);
        // B9: then the shared wall, for a walled BODY call on a guard that has one.
        if (walled && this.#sharedWall !== null) {
          await this.#assertSharedWall(this.#sharedWall, input.runId, projectedMicros);
        }
        await this.#fundingAdmission?.assertProviderFundingAdmission(input.runId, this.#clock());
        const callId = randomUUID();
        if (this.#store.reserveInternalCall === undefined) return;
        const internal = await this.#store.reserveInternalCall({ callId, runId: input.runId, projectedMicros, spendSource, spendPhase: phase });
        if (typeof internal !== "boolean") throw new TypedDomainError("INTERNAL_FUNDING_UNAVAILABLE","Provider funding admission returned no decision");
        const admission: ProviderCallAdmission = Object.freeze({kind:internal ? "INTERNAL" : "ORDINARY",callId});
        admissions.add(admission);
        return admission;
      },
      // I4: charging never refuses. Nothing is written for a call whose vendor
      // said nothing at all about usage — a zero row would read as "this call
      // was free", which is the falsehood the hosted refusal below exists to
      // prevent. Important 1: a block that IS there but carries a count this
      // cannot read is charged at the call's own projected maximum, because the
      // vendor billed for it either way.
      recordCall: async (observed) => {
        const admission = observed.admission;
        if (this.#store.reserveInternalCall !== undefined && (admission === undefined || !admissions.has(admission)))
          throw new TypedDomainError("INTERNAL_PROVIDER_FRAME_INVALID","Settlement requires this seam's immutable admitted frame");
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
        const entry = Object.freeze({
          spendId: admission?.kind === "INTERNAL" ? admission.callId : randomUUID(),
          spendSource: envelope.spendSource,
          runId: input.runId,
          providerRef: observed.providerRef,
          chargedOn: costEnvelopeDay(this.#clock()),
          chargeMicros,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          // Task M1 (R12): a RUN charge says which part of the run spent it.
          ...(phase === null ? {} : { spendPhase: phase }),
          attemptId: observed.attemptId ?? null
        });
        if (admission?.kind === "INTERNAL") {
          try { await this.#store.settleInternalCall!(admission.callId, entry); }
          catch {
            // The provider already ran. Unknown commit outcome can only replay
            // this same immutable settlement; retrying provider bytes would pay twice.
            throw new TypedDomainError("INTERNAL_PROVIDER_SETTLEMENT_UNCERTAIN","The admitted internal provider settlement needs reconciliation");
          }
        } else await this.#store.recordSpend(entry);
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
   * B9 (budget spec §2.3 "the running wall", paid-plans spec §2.4.1) — THE
   * SHARED WALL, asked after the run's own ceiling admitted the call.
   *
   *  · SITE_DAY: the day's whole spend, every source (`readDaySpentMicros`),
   *    plus this call's projected maximum, against the daily ceiling's finish
   *    edge (115%) — only when the wall carries that edge (the band); with
   *    `finishBasisPoints: null` there is no site-day wall and the day is not
   *    read.
   *  · each of the run owner's windows: the owner's RUN + STORY spend inside the
   *    window plus this call, against that window's own finish edge (110%),
   *    with or without the band (ruling R-19: the person wall applies iff the
   *    run has a charge scope).
   *
   * Real spend only: holds are not counted (budget spec §2.3). The day is read
   * at most once per call and each window once; a run with no pinned owner has
   * no person scope, and its windows are never asked for.
   */
  async #assertSharedWall(wall: SharedWallInput, runId: string, projectedMicros: number): Promise<void> {
    const now = this.#clock();
    if (wall.finishBasisPoints !== null && decideSharedWall({
      spentMicros: await this.#store.readDaySpentMicros(costEnvelopeDay(now)),
      projectedMicros,
      limitMicros: this.#policy.dailyCeilingMicros,
      finishBasisPoints: wall.finishBasisPoints
    }) === "WOULD_CROSS") {
      throw sharedWallReached("SITE_DAY");
    }
    const ownerRef = await wall.owners.readRunChargeOwnerRef(runId);
    if (ownerRef === null) return;
    for (const window of await wall.persons.read(ownerRef, now, { runId })) {
      if (decideSharedWall({
        spentMicros: await wall.owners.readOwnerSpentMicros(ownerRef, window.periodStart, window.resetsAt, window.funding, window.scope),
        projectedMicros,
        limitMicros: window.limitMicros,
        finishBasisPoints: window.finishBasisPoints
      }) === "WOULD_CROSS") {
        throw sharedWallReached(window.scope);
      }
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

  async reserveInternalCall(input: Readonly<{ callId: string; runId: string; projectedMicros: number; spendSource: "RUN" | "STORY"; spendPhase: CostEnvelopePhase | null }>): Promise<boolean> {
    const result = await this.pool.query<{ internal: unknown }>("SELECT billing.reserve_internal_provider_call($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text) AS internal",
      [input.callId,input.runId,input.projectedMicros,input.spendSource,input.spendPhase]);
    if (typeof result.rows[0]?.internal !== "boolean") throw new TypedDomainError("INTERNAL_FUNDING_UNAVAILABLE", "Provider funding admission returned no decision");
    return result.rows[0].internal;
  }
  async settleInternalCall(callId: string, entry: ModelSpendEntry): Promise<void> {
    await this.pool.query("SELECT billing.settle_internal_provider_call($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::bigint,$7::bigint,$8::bigint,$9::uuid)",
      [callId,entry.runId,entry.spendSource,entry.spendPhase ?? null,entry.providerRef,entry.chargeMicros,entry.inputTokens,entry.outputTokens,entry.attemptId ?? null]);
  }

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
         charged_on, charge_micros, input_tokens, output_tokens, spend_phase, attempt_id
       ) VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10)`,
      [
        entry.spendId, entry.spendSource, entry.runId, entry.providerRef,
        entry.chargedOn, entry.chargeMicros, entry.inputTokens, entry.outputTokens,
        entry.spendPhase ?? null, entry.attemptId ?? null
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
  async readOwnerSpentMicros(ownerRef: string, from: Date, to: Date, funding?: FundingBasis, scope?: SpendScope): Promise<number> {
    if (funding?.kind === "INTERNAL") {
      const result = await this.pool.query<{ total: string }>(
        "SELECT billing.read_internal_grant_spent($1::uuid,$4::uuid,$5::uuid,$2::timestamptz,$3::timestamptz,$6::boolean)::text AS total",
        [ownerRef,from,to,funding.grantId,funding.grantEventId,scope === "PERSON_GRANT"]);
      return this.#total(result.rows[0]?.total);
    }
    const result = await this.pool.query<{ total: string }>(
      `SELECT coalesce(sum(spend.charge_micros),0)::text AS total
       FROM billing.run_charge_scope AS scope
       JOIN ledger.model_spend AS spend ON spend.run_id = scope.run_id
       WHERE scope.owner_ref = $1::uuid AND scope.funding_kind='SUBSCRIPTION'
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
  async readOwnerCountedHoldsMicros(ownerRef: string, funding?: FundingBasis): Promise<number> {
    if (funding?.kind === "INTERNAL") {
      const result = await this.pool.query<{total:string}>("SELECT billing.read_internal_grant_commitments($1::uuid,$2::uuid,$3::uuid,NULL::uuid)::text AS total",
        [ownerRef,funding.grantId,funding.grantEventId]);
      return this.#total(result.rows[0]?.total);
    }
    const result = await this.pool.query<{ total: string }>(
      `SELECT coalesce(sum(greatest(0, hold.held_micros - coalesce(spent.total, 0))), 0)::text AS total
       FROM billing.run_charge_scope AS scope
       JOIN ledger.model_spend_hold AS hold ON hold.run_id = scope.run_id
       LEFT JOIN LATERAL (
         SELECT sum(spend.charge_micros) AS total FROM ledger.model_spend AS spend
         WHERE spend.run_id = hold.run_id AND spend.spend_source IN ('RUN','STORY')
       ) AS spent ON true
       WHERE scope.owner_ref = $1::uuid AND scope.funding_kind='SUBSCRIPTION'
         AND EXISTS (
           SELECT 1 FROM core.work_item AS work
           WHERE work.run_id = hold.run_id AND work.state IN ('READY','CLAIMED')
         )`,
      [ownerRef]
    );
    return this.#total(result.rows[0]?.total);
  }

  /**
   * B9 — the run's owner as billing pinned it at admission
   * (`billing.run_charge_scope`, migration 0084, task B5), or null. With
   * `billing.person_windows_v` (read through `EntitlementRepository.readOnlyPort()`
   * by `BillingPersonAllowanceSource`) this is everything the runner reads of
   * billing's schema (amendment A20); 0084 grants the runner's role SELECT on
   * both (ruling R-12). `run_id` is the table's primary key: one index probe
   * per call.
   */
  async readRunChargeOwnerRef(runId: string): Promise<string | null> {
    const result = await this.pool.query<{ owner_ref: string }>(
      "SELECT owner_ref::text AS owner_ref FROM billing.run_charge_scope WHERE run_id = $1::uuid",
      [runId]
    );
    return result.rows[0]?.owner_ref ?? null;
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
