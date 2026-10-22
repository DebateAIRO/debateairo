import { validatePreviewProviderTestConfig, previewPlanTierRosters, type PreviewProviderTestConfig } from "@debateai/providers";
import type { Pool, PoolClient } from "pg";
import { PLAN_TIER_ROSTERS, type AskRequest } from "@debateai/contract";
import { exhaustive, TypedDomainError, type FundingBasis, type InternalGrant, type InternalRunFundingState } from "@debateai/kernel";
import {
  costEnvelopeDay,
  decideAdmission,
  decideRoom,
  waitingUntil,
  withSpendDecisionLock,
  type Admission,
  type AdmissionHold,
  type CostEstimator,
  type PersonAllowanceSource,
  type PersonWindow,
  type RunSettingsClass,
  type ScopeRoom,
  type SpendScope,
  type WaitsFor,
  waitingShapeClassOf
} from "@debateai/budget";
import { recordRunSupersession, settingsRefusalCode, type RunOwnershipAccess, type WaitReason, type WaitingRun, type WaitingRunCursor, type WaitingRunRef } from "@debateai/db";
import { debateShapePlanKeyOf, planById, type BillingPlans, type DebateShapePlanKey, type PlanId } from "@debateai/register";
import { runShapeClassOf } from "./debate-shape-ask.js";
import type { ReadmissionPlan } from "./readmission.js";

/**
 * Budget spec 2026-09-28 §2.4–§2.7, amended by the paid-plans spec 2026-09-29
 * §2.4 and AMENDMENTS-R1 (A5, A16) — THE ROOM FOR A NEW QUESTION.
 *
 * One service decides, for the site's day and for each of the asker's own
 * windows, whether a question STARTs (with a hold of its estimate), WAITs in
 * line, or is refused because the person already has their waiting questions.
 * Hosted only, and only with the costEnvelopePolicy band published; without it
 * the API keeps today's 429 path and never builds this. Whether billing may be
 * on at all is B4a's `assertBillingReady`, asked at boot (main.ts), not here.
 *
 * `decide` runs the authoritative decision inside the site's day lock and the
 * person's lock (`withSpendDecisionLock`), at an instant read under those locks,
 * and hands the caller the SAME transaction, so the run's hold or its place in
 * line (with why it waits) is committed together with the decision that allowed
 * it. `precheck` asks the same question without the locks, first, so a question
 * that may not even wait is refused before any vendor is probed, and hands back
 * what it measured (`RoomPreview`) for the model picker to plan with. The line
 * is asked ONE question (`siteLineBlocking`), never walked: a run waiting only
 * for its own person holds nobody back (budget spec §2.3 rule 1). Figures never
 * reach a client: the answers on the wire are words.
 * Final review Part 1b, Important 1: a person window FULL only because of the
 * person's own running debates' counted holds is marked (`fullOnOwnHolds`), so
 * a question it alone makes wait is expected at the next tick and every answer
 * says why (`waitsFor: "OWN_DEBATES"`) instead of naming the window's reset.
 */
export class AskAlreadyWaitingError extends TypedDomainError {
  constructor(readonly runRef: string, readonly waitsUntil: Date, readonly waitsFor: WaitsFor | null = null) {
    super("ASK_ALREADY_WAITING", "One question can wait at a time; the waiting one starts first");
  }
}

/**
 * A question the room is asked. `registerVersion` (side-by-side spec §13, S10): the settings version the ask is admitted
 * on; the room estimates it with that version's estimator (`AskRoomOptions.estimatorFor`), and the locked decision asks
 * the gate whether this release has passed it (S11). Absent (a composition before S10): the room's own estimator, and
 * the release alone. `settingsUnavailable` (S11, ruling R47): this API could not load the active version, so the ask is
 * evaluated on the site version and the locked decision holds it (SWITCHING): it waits in line, nothing charged.
 */
export type RoomQuestion = Readonly<{
  access: RunOwnershipAccess; settingsClass: RunSettingsClass; fundingBasis?: FundingBasis; registerVersion?: number;
  settingsUnavailable?: true;
}>;
export type RoomDecision = Extract<Admission, { kind: "START" | "WAIT" }>;
export type RoomDecisionContext = Readonly<{
  admission: RoomDecision;
  estimateMicros: number;
  /** The instant the decision was measured at, read under its locks. */
  now: Date;
  /** The decision's own transaction: write the hold or the wait row on it. */
  tx: PoolClient;
}>;

/** One of the person's windows as the room measured it: used = spent in the window + the person's counted holds. */
export type RoomWindowUse = Readonly<{
  scope: PersonWindow["scope"];
  limitMicros: number;
  usedMicros: number;
  resetsAt: Date;
  closeBasisPoints: number;
}>;

/**
 * What the unlocked first look found (never sent to a client): the admission it
 * would make, the estimate it was made with, the instant, the person's windows
 * as measured — empty for a legacy asker, billing off or local mode — and why a
 * question so measured would wait: the same classification `enterWait` records
 * (SITE, or PERSON with the instant the person's own block can first lift: the
 * latest reset among the windows full on spend alone, or the next whole minute
 * when only the person's own live holds fill them). S2's picker plans a waiting
 * question for that instant; it is computed for every answer, START included.
 */
export type RoomPreview = Readonly<{
  admission: RoomDecision;
  estimateMicros: number;
  now: Date;
  personUses: ReadonlyArray<RoomWindowUse>;
  waitReason: WaitReason;
}>;

export interface AskRoomSpend {
  readDaySpentMicros(day: string): Promise<number>;
  readSiteCountedHoldsMicros(day: string): Promise<number>;
  readOwnerSpentMicros(ownerRef: string, from: Date, to: Date, funding?: FundingBasis, scope?: SpendScope): Promise<number>;
  readOwnerCountedHoldsMicros(ownerRef: string, funding?: FundingBasis): Promise<number>;
  openHold(client: PoolClient, input: Readonly<{ runId: string; heldMicros: number }>): Promise<void>;
}

/** B3's `RunWaitRepository`, as the room reads and writes the line. */
export interface AskRoomLine {
  /** Budget spec §2.3 rule 1: does any waiting run hold a new question back? One statement. */
  siteLineBlocking(now: Date): Promise<boolean>;
  /** B7b: one page of the runs worth trying this tick, oldest first, after the cursor. */
  wakeCandidates(input: Readonly<{
    now: Date;
    after: WaitingRunCursor | null;
    limit: number;
    everyPerson: boolean;
  }>): Promise<ReadonlyArray<WaitingRun>>;
  waitingForOwner(ownerRef: string): Promise<ReadonlyArray<WaitingRunRef>>;
  waitingForLegacyAsker(legacyAskerId: string): Promise<ReadonlyArray<WaitingRunRef>>;
  readWaiting(runId: string): Promise<WaitingRun | null>;
  isWaiting(executor: Pick<PoolClient, "query">, runId: string): Promise<boolean>;
  enterWait(client: PoolClient, runId: string, at: Date): Promise<void>;
  recordReason(client: PoolClient, runId: string, reason: WaitReason & Readonly<{ at: Date }>): Promise<void>;
  markStarted(client: PoolClient, runId: string, at: Date): Promise<void>;
}

/** B5's `EntitlementRepository`, the two methods the room needs. Null while billing is off. */
export interface AskRoomEntitlements {
  current(ownerRef: string, now: Date): Promise<Readonly<{ planId: PlanId; eventId: string }>>;
  readRunFundingBasis?(runId: string): Promise<FundingBasis | null>;
  recordRunChargeScope(client: PoolClient, input: Readonly<{runId: string; ownerRef: string; admittedAt: Date}> &
    (Readonly<{planId: PlanId; entitlementEventId: string}> | Readonly<{basis: FundingBasis}>)): Promise<void>;
}

/**
 * Side-by-side C8 review — the one lock that serializes the site's debate count, in every decision and every waker's
 * start, across days. A leaf: always taken after the day and person locks (`#locked`), and nothing taken after it is
 * taken before it by any other path (the decision's reads and writes on its own transaction, the first job's sequence
 * row last). The single-key `bigint` form over `hashtextextended(<text>, 0)`, as tests/architecture/v28-advisory-lock-shape.test.ts explains.
 */
const SITE_CONCURRENT_DEBATES_LOCK = "SELECT pg_advisory_xact_lock(hashtextextended('debateai.site_concurrent_debates', 0))";

/**
 * Side-by-side uploads spec 2026-10-21 §9, §13 (plan C task C8) — WHAT HOLDS EVERY NEW DEBATE BACK, read inside the
 * spend-decision lock on the decision's own transaction (`PostgresAskAdmissionGate`, ./release-state.ts):
 *
 * - `ownReleaseIsCurrent` — the release watcher's rule, read now and not from the watcher's last poll: this release is
 *   the one `core.read_current_release()` names, or none is named and the deployment is not hosted. An ask the API
 *   admits while a switch moves the traffic away waits in line (SWITCHING) instead of starting on the old release.
 *   Side-by-side spec §13 (Task S11): given the version the decision would start on, this release must also have
 *   passed it (0124's `register.settings_version_passed`), else SWITCHING too.
 * - `activeDebates` — the runs with a READY or CLAIMED job, across every release; at `siteConcurrentDebates` (8, the
 *   runners' own capacity) the question waits in line (SITE_BUSY). The day lock does NOT serialize it: two decisions on
 *   either side of midnight UTC hold different day keys. So the room counts under one constant site-wide transaction
 *   lock (`SITE_CONCURRENT_DEBATES_LOCK`) on the same transaction, taken after the day and person locks, held to the
 *   COMMIT: the count and the start are one step, and two asks never both take the eighth place.
 *
 * A room without a gate (every room before C8, and every test that builds none) decides exactly as before.
 */
export interface AskAdmissionGate {
  readonly releaseKey: string;
  readonly siteConcurrentDebates: number;
  /**
   * Side-by-side spec §13 "The API re-checks at admission" (Task S11): with `registerVersion`, the version the decision
   * would start on, current also needs (this release, that version) passed — one query more, after the release read,
   * on the same transaction; false either way is SWITCHING.
   */
  ownReleaseIsCurrent(tx: Pick<PoolClient, "query">, registerVersion?: number): Promise<boolean>;
  activeDebates(tx: Pick<PoolClient, "query">): Promise<number>;
  /**
   * Side-by-side spec §13 (C14, Task S13): the active settings version (the activation pointer, or the site version
   * while it is empty), read on the decision's own transaction. Asked by `startWaiting` only, first: a waiting run whose
   * version is not this one is re-admitted onto it (the two-phase rule), and the re-check above asks about the version
   * the start will actually run on. Absent (a gate built without the site version, every test that builds none): no
   * version is compared, Phase 1's start.
   */
  readonly activeSettingsVersion?: (tx: Pick<PoolClient, "query">) => Promise<number>;
}

export type AskRoomOptions = Readonly<{
  /** A pool of its own: see `withSpendDecisionLock`. */
  lockPool: Pool;
  spend: AskRoomSpend;
  line: AskRoomLine;
  estimator: CostEstimator;
  /**
   * Side-by-side spec §13 (S9 composes it; S10 reads it): the estimator of a settings version (its own per-run cap). A
   * question that names its version (`RoomQuestion.registerVersion`) and a waiting run stamped with one
   * (`WaitingRun.registerVersion`) are estimated with it; absent, or for a question or run without a version, the
   * estimate is `estimator`'s. A version whose estimator cannot be had is estimated with `estimator` (one
   * ADMISSION_ESTIMATOR_FALLBACK line per version): an estimate never refuses an ask or strands a waiting run.
   */
  estimatorFor?: (registerVersion: number) => Promise<CostEstimator>;
  personAllowance: PersonAllowanceSource;
  entitlements: AskRoomEntitlements | null;
  /**
   * B4a's plans while billing is on (absent or null while it is off). The waker
   * checks a waking run's tier against its owner's plan NOW (B7b): a premium run
   * is never started for a person whose plan has dropped to Free.
   */
  billingPlans?: BillingPlans | null;
  funding?: Readonly<{
    resolveAskFunding(ownerRef: string, now: Date): Promise<FundingBasis>;
    readGrant(ownerRef: string, now: Date, context?: Readonly<{runId: string}>): Promise<InternalGrant | null>;
    assertProviderFundingAdmission(runId: string, now: Date): Promise<void>;
    readRunFundingState(runId:string):Promise<InternalRunFundingState>;
    readSubscriptionWindows(ownerRef: string, now: Date): Promise<readonly PersonWindow[]>;
  }>;
  dailyCeilingMicros: number;
  closeBasisPoints: number;
  waitingLinePerPerson: number;
  clock?: () => Date;
  /** Side-by-side C8: the site's cap and the release re-check, asked by `decide` and `startWaiting` only. */
  gate?: AskAdmissionGate;
}>;

/** What `PostgresAskApplication` asks of the room (B6a/B6b). */
export interface AskRoomPort {
  precheck(question: RoomQuestion): Promise<RoomPreview>;
  decide<T>(question: RoomQuestion, apply: (context: RoomDecisionContext) => Promise<T>): Promise<T>;
  /** The place in line and why it waits, on the transaction `decide` handed over (only there). */
  enterWait(tx: PoolClient, runId: string, at: Date): Promise<void>;
  openStart(tx: PoolClient, input: Readonly<{
    runId: string;
    access: RunOwnershipAccess;
    heldMicros: number;
    now: Date;
  }>): Promise<void>;
  expectedStart(runId: string): Promise<ExpectedStart | null>;
}

/** A waiting run's expected start and the limit it waits for; `waitsFor` only when no reset is what it waits for. */
export type ExpectedStart = Readonly<{ waitsUntil: Date; scope: SpendScope; waitsFor?: WaitsFor }>;

/**
 * Budget spec §2.7 (B7a): what GET /v1/asks/room answers, before the wire's snake
 * case. `waitsFor` (Important 1) only on FULL or ALREADY_WAITING, and only when
 * the person's own running debates are all that fill their windows.
 */
export type AskRoomAnswer = Readonly<{
  room: "FITS" | "CLOSE" | "FULL" | "ALREADY_WAITING";
  scope: SpendScope | null;
  resetsAt: Date | null;
  waitingRunRef: string | null;
  planId: PlanId | null;
  funding?: Readonly<{kind:"INTERNAL"; expiresAt:Date}>;
  waitsFor?: WaitsFor;
}>;

export interface AskRoomReader {
  readRoom(question: RoomQuestion): Promise<AskRoomAnswer>;
}

/**
 * B7b: what trying to start one waiting run came to. Side-by-side C8: SITE_BUSY, the site runs its cap of debates;
 * SWITCHING, this release is not the current one. Either ends the waker's pass, as SITE_FULL does.
 * Side-by-side C11 (spec §4, O3): STARTED names the run that started — the waiting run itself, or the NEW run that
 * re-admits it. NEEDS_READMISSION: another release admitted the run (or the plan was made for another billing plan),
 * nothing was written, and the waker plans its re-admission for `planId`, the billing plan read under the lock (null
 * without billing, for a legacy asker or for internal funding). C11 review: phase one's answer also carries `preview`,
 * the room as it measured this run under the lock (its START, the instant, and the owner's windows), so the waker plans
 * the new run inside the person's room exactly as `#submitWithRoom` does (`personRoomOf(preview)`); a second
 * NEEDS_READMISSION (the plan moved) carries none. ASK_AGAIN: the room would start it, but the new version no longer
 * offers one of its choices; nothing was written, and the waker closes it ("please ask again").
 */
export type WaitingStart<T> =
  | Readonly<{ kind: "STARTED"; runId: string; value: T }>
  | Readonly<{ kind: "SITE_FULL" | "PERSON_FULL" | "GONE" | "PLAN_CHANGED" | "FUNDING_FAILED" | "ACCOUNT_HELD" }>
  | Readonly<{ kind: "SITE_BUSY" | "SWITCHING" | "ASK_AGAIN" }>
  | Readonly<{ kind: "NEEDS_READMISSION"; planId: PlanId | null; preview?: RoomPreview }>;

/**
 * Side-by-side C11: what the waker hands `startWaiting` the second time, once it has planned a re-admission outside
 * every lock (apps/api/src/readmission.ts). `createRun` writes the NEW run (its row, pins and memory question, the way
 * `#submitWithRoom` writes a new run) and returns its id, committed; the room calls it only after START is decided,
 * under the spend lock, and at most once.
 */
export type Readmission = Readonly<{
  plan: Extract<ReadmissionPlan, { kind: "READMIT" | "ASK_AGAIN" }>;
  createRun(): Promise<string>;
  /**
   * Side-by-side spec §13 (Task S11): the settings version the new run is admitted on (the one `createRun` stamps); the
   * START re-checks that this release has passed it. Absent: the release alone.
   */
  registerVersion?: number;
}>;

/** What the waker asks of the room (B7b). */
export interface AskWaitingLinePort {
  wakeCandidates(input: Readonly<{ after: WaitingRunCursor | null; everyPerson: boolean }>): Promise<ReadonlyArray<WaitingRun>>;
  /**
   * `enqueue` queues the started run's first job on the transaction it is given (the start's own, as its last
   * statement); side-by-side C11: `runId` is the run that starts, the new run of a re-admission included.
   */
  startWaiting<T>(
    run: WaitingRun, enqueue: (tx: PoolClient, runId: string) => Promise<T>, readmission?: Readmission
  ): Promise<WaitingStart<T>>;
}

/**
 * B7b — THE WAKER'S CLOCK: `tick` on every whole minute, the very instants
 * `nextWholeMinute` announces to a question that waits for the waker (budget
 * spec §2.7: "the next tick, the next whole minute"). Each tick schedules the
 * next from the clock, so the ticks never drift off the minute. Unref'd: it never
 * keeps a process alive; `stop` clears the pending tick.
 */
export function everyWholeMinute(tick: () => unknown, clock: () => Date = () => new Date()): Readonly<{ stop(): void }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const schedule = (): void => {
    if (stopped) return;
    const now = clock();
    timer = setTimeout(() => {
      schedule();
      tick();
    }, nextWholeMinute(now).getTime() - now.getTime());
    timer.unref();
  };
  schedule();
  return Object.freeze({
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    }
  });
}

/** Every scope's room, the person's windows as measured for them, and why a question so measured would wait. */
type RoomMeasure = Readonly<{
  rooms: ReadonlyArray<ScopeRoom>;
  personUses: ReadonlyArray<RoomWindowUse>;
  waitReason: WaitReason;
}>;

type RoomEvaluation = Readonly<{
  admission: Admission;
  rooms: ReadonlyArray<ScopeRoom>;
  personUses: ReadonlyArray<RoomWindowUse>;
  waitReason: WaitReason;
  estimateMicros: number;
  waiting: ReadonlyArray<WaitingRunRef>;
  expected: Readonly<{ waitsUntil: Date; worstScope: SpendScope; waitsFor?: WaitsFor }>;
}>;

/** `waitsFor` as an optional member: present only when there is one. */
function waitsForOf(expected: Readonly<{ waitsFor?: WaitsFor }>): Readonly<{ waitsFor?: WaitsFor }> {
  return expected.waitsFor === undefined ? {} : { waitsFor: expected.waitsFor };
}

/** The entitlement a START pins its run to (billing on), read once. */
type PinnedEntitlement = Readonly<{ planId: PlanId; eventId: string }>;

/** Thrown inside a decision whose day turned while it waited for the lock; it never leaves this module. */
class DecisionDayTurned extends Error {}

/** The next whole minute: when a question that only waits for the waker starts (budget spec §2.7). */
export function nextWholeMinute(now: Date): Date {
  const minute = 60_000;
  return new Date(Math.floor(now.getTime() / minute) * minute + minute);
}

/** When the site's day resets: the next UTC midnight (V-28's day is a UTC day). */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/**
 * The settings class of a new ask (budget spec §2.5): its plan tier, composition
 * tier, the number of MODELS on the plan's roster (the panel it will be probed
 * for; a stored run counts its panel's models the same way, B2) and its depth.
 */
export function runSettingsClassOfAsk(
  ask: Pick<AskRequest, "plan_tier" | "composition_budget_tier" | "depth_params">,
  previewConfig?: PreviewProviderTestConfig,
  shapePlan?: DebateShapePlanKey
): RunSettingsClass {
  const shape = runShapeClassOf(ask.depth_params, shapePlan ?? debateShapePlanKeyOf(null, ask.plan_tier));
  // Debate shape: the optional member is built before the class so no conditional sits beside the roster pick.
  const shapeMember = shape === null ? {} : { shape };
  return Object.freeze({
    planTier: ask.plan_tier,
    compositionBudgetTier: ask.composition_budget_tier,
    makerCount: previewPlanTierRosters(validatePreviewProviderTestConfig(previewConfig),PLAN_TIER_ROSTERS)[ask.plan_tier].length,
    depth: ask.depth_params.depth,
    ...shapeMember
  });
}

/** A waiting run's class, from the columns it was asked with; a run with no plan tier is estimated as premium, the careful side. */
export function settingsClassOfWaitingRun(run: WaitingRun): RunSettingsClass {
  const planTier = run.planTier ?? "premium";
  const shape = waitingShapeClassOf(run.shapeSettings ?? null, debateShapePlanKeyOf(null, planTier));
  return Object.freeze({
    planTier,
    compositionBudgetTier: run.compositionBudgetTier,
    makerCount: run.makerCount,
    depth: run.depth,
    ...(shape === null ? {} : { shape })
  });
}

/**
 * Side-by-side spec §4 (0123 §4): a run superseded by its re-admission never starts. 0123's trigger on
 * core.run_wait_start refuses the start (23514, MESSAGE RUN_SUPERSEDED) when another release's waker wrote the edge
 * while this start waited for its lock; the waker reads it as the typed RUN_SUPERSEDED (the run is not its to start).
 */
async function markStartedUnlessSuperseded(line: AskRoomLine, tx: PoolClient, runId: string, at: Date): Promise<void> {
  try {
    await line.markStarted(tx, runId, at);
  } catch (error) {
    if (error instanceof Error && error.message === "RUN_SUPERSEDED" && (error as { code?: unknown }).code === "23514") {
      throw new TypedDomainError("RUN_SUPERSEDED", "A superseded run never starts: its re-admission runs instead");
    }
    throw error;
  }
}

export function accessOfWaitingRun(run: WaitingRun): RunOwnershipAccess {
  return run.ownerRef !== null
    ? Object.freeze({ ownerRef: run.ownerRef, legacyAskerId: null })
    : Object.freeze({ ownerRef: null, legacyAskerId: run.legacyAskerId });
}

function alreadyWaiting(evaluation: RoomEvaluation): AskAlreadyWaitingError {
  const oldest = evaluation.waiting[0];
  if (oldest === undefined) throw new TypeError("ASK_ROOM_WAITING_LINE_INCONSISTENT");
  return new AskAlreadyWaitingError(oldest.runId, evaluation.expected.waitsUntil, evaluation.expected.waitsFor ?? null);
}

/**
 * Paid plans P4-G (go-live row 31): how long one WAITING run's expected start is kept, at most. It is
 * never kept past the waker's next tick either (`nextWholeMinute`), when the run may start or its room
 * change. A debate page polls GET /v1/runs/{id}; without this every poll ran the estimator and the
 * room's reads again. A server-side window protects against any client, which a slower poll would not.
 */
const EXPECTED_START_KEEP_MS = 30_000;
/** The most runs whose expected start one process keeps; beyond it the oldest is dropped first. */
const EXPECTED_START_KEEP_RUNS = 4_096;

type KeptExpectedStart = Readonly<{ until: number; value: Promise<ExpectedStart | null> }>;

export class AskRoom implements AskRoomPort, AskRoomReader, AskWaitingLinePort {
  readonly #options: AskRoomOptions;
  readonly #clock: () => Date;
  /** P4-G: each WAITING run's expected start, per run, until its short window ends. */
  readonly #expectedStarts = new Map<string, KeptExpectedStart>();
  /** Why the decision on each open transaction would make its question wait; set and cleared by `decide`. */
  readonly #waitReasons = new WeakMap<PoolClient, WaitReason>();
  readonly #fundingDecisions = new WeakMap<PoolClient, Readonly<{ownerRef: string; basis: FundingBasis}>>();
  /** Side-by-side spec §13 (S10): the versions whose estimator fell back, each said once (content-free). */
  readonly #estimatorFallbacksSaid = new Set<number>();

  constructor(options: AskRoomOptions) {
    for (const value of [options.dailyCeilingMicros, options.closeBasisPoints, options.waitingLinePerPerson]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("ASK_ROOM_OPTIONS_INVALID");
    }
    const cap = options.gate?.siteConcurrentDebates;
    if (cap !== undefined && (!Number.isSafeInteger(cap) || cap < 1)) throw new TypeError("ASK_ROOM_OPTIONS_INVALID");
    this.#options = options;
    this.#clock = options.clock ?? (() => new Date());
  }

  /**
   * Unlocked, first, before any vendor is probed: refuses only a question that
   * may not even wait, and otherwise hands back what it measured. The locked
   * `decide` measures again; this answer only informs, it never admits.
   */
  async precheck(question: RoomQuestion): Promise<RoomPreview> {
    const now = this.#clock();
    const evaluation = await this.#evaluate(question, now, null);
    const admission = evaluation.admission;
    if (admission.kind === "REFUSE_ALREADY_WAITING") throw alreadyWaiting(evaluation);
    return Object.freeze({
      admission,
      estimateMicros: evaluation.estimateMicros,
      now,
      personUses: evaluation.personUses,
      waitReason: evaluation.waitReason
    });
  }

  async decide<T>(question: RoomQuestion, apply: (context: RoomDecisionContext) => Promise<T>): Promise<T> {
    return this.#locked(question.access.ownerRef, async (tx, now) => {
      // Side-by-side C8: the site's cap and the release re-check, in the lock, on the decision's own transaction.
      const evaluation = await this.#evaluate(question, now, await this.#holdOf(tx, question));
      const admission = evaluation.admission;
      if (admission.kind === "REFUSE_ALREADY_WAITING") throw alreadyWaiting(evaluation);
      // A wait the hold alone decides is recorded as the hold (SITE_BUSY or SWITCHING); any other as measured.
      this.#waitReasons.set(tx, admission.kind === "WAIT" && admission.cause !== undefined
        ? Object.freeze({ waitsFor: admission.cause, personRecheckAt: null })
        : evaluation.waitReason);
      const ownerRef = question.access.ownerRef;
      if (ownerRef !== null && this.#options.entitlements !== null) {
        const basis = this.#options.funding === undefined ? this.#subscriptionBasis(await this.#options.entitlements.current(ownerRef, now))
          : await this.#options.funding.resolveAskFunding(ownerRef, now);
        if (question.fundingBasis !== undefined && !this.#sameFunding(question.fundingBasis, basis)) throw new TypedDomainError("RUN_FUNDING_BASIS_CONFLICT", "Funding changed before admission");
        this.#fundingDecisions.set(tx, {ownerRef, basis});
      }
      try {
        return await apply(Object.freeze({ admission, estimateMicros: evaluation.estimateMicros, now, tx }));
      } finally {
        this.#waitReasons.delete(tx);
        this.#fundingDecisions.delete(tx);
      }
    });
  }

  /**
   * The run's place in line AND why it waits (budget spec §2.3 rule 1), on the
   * decision's transaction. The reason is the one `decide` evaluated for this
   * very transaction, so it can never be another decision's; outside `decide`
   * there is none, and nothing is written.
   */
  async enterWait(tx: PoolClient, runId: string, at: Date): Promise<void> {
    const reason = this.#waitReasons.get(tx);
    if (reason === undefined) throw new TypeError("ASK_ROOM_WAIT_OUTSIDE_DECISION");
    const funding = this.#fundingDecisions.get(tx);
    if (funding !== undefined) await this.#pin(tx, runId, funding.ownerRef, funding.basis, at);
    await this.#options.line.enterWait(tx, runId, at);
    await this.#options.line.recordReason(tx, runId, Object.freeze({ ...reason, at }));
  }

  /**
   * A START's writes before its first job, on the decision's transaction: the
   * hold, and (billing on) the run's charge scope. The caller queues the first
   * job on the same transaction AFTER this, as its last statement.
   */
  async openStart(tx: PoolClient, input: Readonly<{
    runId: string;
    access: RunOwnershipAccess;
    heldMicros: number;
    now: Date;
  }>): Promise<void> {
    const entitlements = this.#options.entitlements;
    const ownerRef = input.access.ownerRef;
    const entitlement = entitlements === null || ownerRef === null ? null : await entitlements.current(ownerRef, input.now);
    const decided = this.#fundingDecisions.get(tx);
    const basis = decided?.basis ?? (this.#options.funding !== undefined && ownerRef !== null
      ? await this.#options.funding.resolveAskFunding(ownerRef,input.now) : null);
    await this.#openStartWith(tx, input, entitlement, basis);
  }

  /**
   * A waiting run's expected start (budget spec §2.7), and why when no reset is what it waits for.
   * P4-G: computed at most once per run per short window (`EXPECTED_START_KEEP_MS`, and never past the
   * waker's next tick); reads inside the window, concurrent ones included, share that one computation.
   * A computation that fails is not kept.
   */
  expectedStart(runId: string): Promise<ExpectedStart | null> {
    const now = this.#clock();
    const instant = now.getTime();
    const kept = this.#expectedStarts.get(runId);
    if (kept !== undefined && instant < kept.until) return kept.value;
    this.#expectedStarts.delete(runId);
    if (this.#expectedStarts.size >= EXPECTED_START_KEEP_RUNS) {
      for (const [key, entry] of this.#expectedStarts) {
        if (entry.until <= instant) this.#expectedStarts.delete(key);
      }
      // Map iteration is insertion order: the oldest is dropped first.
      for (const key of this.#expectedStarts.keys()) {
        if (this.#expectedStarts.size < EXPECTED_START_KEEP_RUNS) break;
        this.#expectedStarts.delete(key);
      }
    }
    const entry: KeptExpectedStart = Object.freeze({
      until: Math.min(instant + EXPECTED_START_KEEP_MS, nextWholeMinute(now).getTime()),
      value: this.#computeExpectedStart(runId, now)
    });
    this.#expectedStarts.set(runId, entry);
    entry.value.catch(() => {
      if (this.#expectedStarts.get(runId) === entry) this.#expectedStarts.delete(runId);
    });
    return entry.value;
  }

  async #computeExpectedStart(runId: string, now: Date): Promise<ExpectedStart | null> {
    const run = await this.#options.line.readWaiting(runId);
    if (run === null) return null;
    // Side-by-side spec §13 (S10): at the version the run was stamped with.
    const estimateMicros = await (await this.#estimatorFor(run.registerVersion)).estimateMicros(settingsClassOfWaitingRun(run));
    const { rooms } = await this.#measure(accessOfWaitingRun(run), estimateMicros, now, run.runId);
    const until = waitingUntil({ rooms, nextTickAt: nextWholeMinute(now) });
    return Object.freeze({ waitsUntil: until.waitsUntil, scope: until.worstScope, ...waitsForOf(until) });
  }

  /** GET /v1/asks/room: the admission's shape, deciding nothing and writing nothing. */
  async readRoom(question: RoomQuestion): Promise<AskRoomAnswer> {
    const now = this.#clock();
    // Side-by-side C8: no hold here, so a busy site or a switch never reads as a full room ("today's limit").
    const evaluation = await this.#evaluate(question, now, null);
    const ownerRef = question.access.ownerRef;
    const grant = this.#options.funding === undefined || ownerRef === null ? null : await this.#options.funding.readGrant(ownerRef,now);
    const planId = grant !== null || this.#options.entitlements === null || ownerRef === null ? null
      : (await this.#options.entitlements.current(ownerRef, now)).planId;
    const funding = grant === null ? {} : {funding: Object.freeze({kind:"INTERNAL" as const, expiresAt:grant.expiresAt})};
    const admission = evaluation.admission;
    switch (admission.kind) {
      case "REFUSE_ALREADY_WAITING":
        return Object.freeze({
          room: "ALREADY_WAITING" as const,
          scope: evaluation.expected.worstScope,
          resetsAt: evaluation.expected.waitsUntil,
          waitingRunRef: evaluation.waiting[0]?.runId ?? null,
          planId, ...funding,
          ...waitsForOf(evaluation.expected)
        });
      case "WAIT":
        return Object.freeze({
          room: "FULL" as const, scope: admission.worstScope, resetsAt: admission.waitsUntil, waitingRunRef: null, planId, ...funding,
          ...waitsForOf(admission)
        });
      case "START": {
        const scope = admission.worstScope;
        if (admission.worst === "FITS" || scope === null) {
          return Object.freeze({ room: "FITS" as const, scope: null, resetsAt: null, waitingRunRef: null, planId, ...funding });
        }
        return Object.freeze({
          room: "CLOSE" as const,
          scope,
          resetsAt: evaluation.rooms.find((entry) => entry.scope === scope)?.resetsAt ?? null,
          waitingRunRef: null,
          planId, ...funding
        });
      }
      default:
        return exhaustive(admission);
    }
  }

  /** B7b: one page (a hundred at most) of the runs worth trying this tick, oldest first, after the cursor. */
  wakeCandidates(input: Readonly<{ after: WaitingRunCursor | null; everyPerson: boolean }>): Promise<ReadonlyArray<WaitingRun>> {
    const pageSize = 100;
    return this.#options.line.wakeCandidates({
      now: this.#clock(), after: input.after, limit: pageSize, everyPerson: input.everyPerson
    });
  }

  /**
   * B7b — START ONE WAITING RUN if the room now holds it: under the same two
   * locks an ask takes, at an instant read under them, re-checked as still
   * waiting, evaluated as an admission over the site's day and its owner's
   * windows (it IS the line, so the line cannot hold it back). With billing on,
   * the owner's plan NOW is read once: a premium run is never started for a
   * person now on Free (PLAN_CHANGED, nothing written); otherwise that same
   * entitlement is the one the run is pinned to. A start writes its hold, its
   * charge scope and its start mark, then queues its first job on the same
   * transaction, LAST (see `withSpendDecisionLock`): all of it commits, or none.
   * A run that does not fit gets a fresh reason when it changed or is a person's.
   * Side-by-side C8 (with a gate): a release that is not current starts nothing and writes nothing (SWITCHING), asked
   * before anything else; a run the room would START while the site runs its cap of debates is held back (SITE_BUSY,
   * its reason appended only when it was not already SITE_BUSY).
   * Side-by-side spec §13 "The API re-checks at admission" (Task S11): the same first question also needs this release
   * to have passed the version the start would run on (`startVersion`); not passed is SWITCHING too, and the waker's
   * tick stops there (ruling R11).
   * Side-by-side spec §13 (C14, Task S13; rulings R48, R49): with a gate that reads the activation pointer, the active
   * version is read FIRST, on this START transaction (`gate.activeSettingsVersion`), never at a tick and never cached. A
   * run whose version is not the active one is re-admitted exactly as a run another release admitted (below): it never
   * starts on its own stamp, whatever its release. So `startVersion` is the active version for a run that starts on its
   * own row, the planned version for a READMIT (whose plan must name the active version, else NEEDS_READMISSION again),
   * and nothing (the release alone) for phase one and ASK_AGAIN — a FAIL verdict on a version that is no longer active
   * stops no tick, and a run stamped with the site version while the active version cannot be loaded is not started on
   * the site version (its re-admission keeps its place: `#startReadmitted`).
   *
   * Side-by-side spec §4, O3 (Q1 → a); INTERFACE run_supersession — THE TWO-PHASE RULE (with a gate). A run another
   * release admitted (`run.releaseKey` is not this release's), or (S13) one stamped with a version that is not the
   * active one, never starts on its own row: no code, setting or prompt of another release may touch it (O1), and a
   * debate started after an activation runs on the active version (C14). Each step below writes nothing unless it says
   * so.
   *   1. SWITCHING, then still waiting, its funding and PLAN_CHANGED: as for any run.
   *   2. Phase one (no `readmission`): it is measured with its old settings-class estimate; a START the cap allows
   *      answers NEEDS_READMISSION, with that measure (`preview`: the person's room for the plan's picker), and
   *      anything else answers as for any run. The waker then plans the re-admission outside every lock (the only
   *      place a probe may run) and comes back with the plan, under the owner's lease.
   *   3. ASK_AGAIN: a START answers ASK_AGAIN (the waker closes the old run); anything else as for any run.
   *   4. READMIT: measured with the plan's hold (the picker's figure, else the estimate of the plan's settings class at
   *      the plan's version, `Readmission.registerVersion`: S13). A plan made for another billing plan than the one read
   *      under this lock, or (S13) on a version that is not the active one read under it, is NEEDS_READMISSION again. On a START
   *      the cap allows: `createRun()` (the new run's row, committed), then on this transaction the supersession edge
   *      (old → new, READMITTED), the new run's hold and charge scope (pinned to the old run's funding), and the new
   *      run's first job LAST. All of it commits, or none of it: a failure leaves the new row with no edge, no hold
   *      and no job, which the waker records FAILED (RUN_SETUP_FAILED:READMISSION); the old run keeps its place.
   * Without a gate (every room before C8, and every test that builds none) no release is compared: today's start.
   */
  async startWaiting<T>(
    run: WaitingRun, enqueue: (tx: PoolClient, runId: string) => Promise<T>, readmission?: Readmission
  ): Promise<WaitingStart<T>> {
    const access = accessOfWaitingRun(run);
    const gate = this.#options.gate;
    const readmit = readmission?.plan.kind === "READMIT" ? readmission.plan : null;
    return this.#locked(run.ownerRef, async (tx, now): Promise<WaitingStart<T>> => {
      // Side-by-side spec §13 (C14, Task S13): the active version, read on THIS transaction before anything else, so the
      // version compare and the re-check below see the same pointer as the start they decide.
      const active = gate?.activeSettingsVersion === undefined ? undefined : await gate.activeSettingsVersion(tx);
      // Re-admitted, never started on its own row: another release admitted it, or (S13) its version is not the active one.
      const stale = gate !== undefined && (run.releaseKey !== gate.releaseKey || (active !== undefined && run.registerVersion !== active));
      // S13: a READMIT planned on a version that is no longer the active one plans again (step 4).
      const planMoved = readmit !== null && active !== undefined && readmission?.registerVersion !== active;
      // Side-by-side spec §13 (Task S11, S13): the version this start would run on — the run's own stamp (the active
      // version, when the pointer is read), or a re-admission's new one. Phase one of a stale run starts nothing (its old
      // version is not this start's to pass), and neither does an ASK_AGAIN plan or a moved plan: the release alone.
      const startVersion = readmit !== null ? (planMoved ? undefined : readmission?.registerVersion)
        : readmission === undefined && !stale ? run.registerVersion : undefined;
      if (gate !== undefined && !(await gate.ownReleaseIsCurrent(tx, startVersion))) return Object.freeze({ kind: "SWITCHING" as const });
      if (!(await this.#options.line.isWaiting(tx, run.runId))) return Object.freeze({ kind: "GONE" as const });
      const basis = await this.#options.entitlements?.readRunFundingBasis?.(run.runId) ?? null;
      if (basis?.kind === "INTERNAL") {
        if (this.#options.funding === undefined) throw new TypedDomainError("INTERNAL_FUNDING_UNAVAILABLE", "The pinned internal funding consumer is unavailable");
        try { await this.#options.funding.assertProviderFundingAdmission(run.runId,now); }
        catch(error){
          let state:InternalRunFundingState;
          try{state=await this.#options.funding.readRunFundingState(run.runId);}catch{throw error;}
          if(["EXPIRED","REVOKED","REPLACED","ERASED"].includes(state))return Object.freeze({kind:"FUNDING_FAILED" as const});
          if(state==="HELD"){
            await this.#options.line.recordReason(tx,run.runId,{waitsFor:"PERSON",personRecheckAt:nextWholeMinute(now),at:now});
            return Object.freeze({kind:"ACCOUNT_HELD" as const});
          }
          throw error;
        }
      }
      const entitlement = basis?.kind === "INTERNAL" ? null : await this.#entitlementOf(run.ownerRef, now);
      if (entitlement !== null && this.#tierOf(entitlement.planId) === "free" && (run.planTier ?? "premium") === "premium") {
        return Object.freeze({ kind: "PLAN_CHANGED" as const });
      }
      const planId = entitlement?.planId ?? null;
      // Side-by-side C11, step 4: the plan was made for the billing plan read in phase one; another one now plans again.
      // S13: so does a plan made on a version that is no longer the active one (an activation between plan and START).
      if (readmit !== null && (planId !== readmit.planId || planMoved)) return Object.freeze({ kind: "NEEDS_READMISSION" as const, planId });
      // RULINGS-R2 Q-11: the hold is B2's estimate for the run's settings class; the
      // waker never re-picks the run's models (a known limit, bounded by B9's wall).
      // Side-by-side spec §13 (S10): at the version the run was stamped with (its own per-run cap).
      // Side-by-side C11: a re-admission is a new admission, measured with its plan's own hold (step 4). S13: else with
      // the estimator of the version the new run is admitted on (the active one), as an ask on it is estimated.
      const estimateMicros = readmit === null
        ? await (await this.#estimatorFor(run.registerVersion)).estimateMicros(settingsClassOfWaitingRun(run))
        : readmit.holdMicros ?? await (await this.#estimatorFor(readmission?.registerVersion)).estimateMicros(readmit.settingsClass);
      const { rooms, personUses, waitReason } = await this.#measure(access, estimateMicros, now, run.runId);
      const admission = decideAdmission({
        rooms,
        siteLineBlocking: false,
        personWaitingCount: 0,
        waitingLinePerPerson: this.#options.waitingLinePerPerson,
        nextTickAt: nextWholeMinute(now)
      });
      if (admission.kind !== "START") {
        // A still-SITE run writes nothing; any change, or a person's run measured again, is appended.
        if (waitReason.waitsFor === "PERSON" || run.waitsFor !== "SITE") {
          await this.#options.line.recordReason(tx, run.runId, Object.freeze({ ...waitReason, at: now }));
        }
        const siteFull = rooms.some((entry) => entry.scope === "SITE_DAY" && entry.room === "FULL");
        return Object.freeze({ kind: siteFull ? "SITE_FULL" as const : "PERSON_FULL" as const });
      }
      if (gate !== undefined && await this.#siteIsBusy(tx, gate)) {
        if (run.waitsFor !== "SITE_BUSY") {
          await this.#options.line.recordReason(tx, run.runId, Object.freeze({ waitsFor: "SITE_BUSY" as const, personRecheckAt: null, at: now }));
        }
        return Object.freeze({ kind: "SITE_BUSY" as const });
      }
      // Side-by-side C11, steps 2-4: a START the cap allows, for a run another release admitted. C11 review: with the
      // room as measured here, so the plan's picker can step down to fit the person's windows.
      if (readmission === undefined && stale) {
        const preview: RoomPreview = Object.freeze({ admission, estimateMicros, now, personUses, waitReason });
        return Object.freeze({ kind: "NEEDS_READMISSION" as const, planId, preview });
      }
      if (readmission?.plan.kind === "ASK_AGAIN") return Object.freeze({ kind: "ASK_AGAIN" as const });
      if (readmission !== undefined && readmit !== null) {
        const newRunId = await readmission.createRun();
        await recordRunSupersession(tx, { oldRunId: run.runId, newRunId });
        await this.#openStartWith(tx, { runId: newRunId, access, heldMicros: estimateMicros, now }, entitlement, basis);
        const value = await enqueue(tx, newRunId);
        return Object.freeze({ kind: "STARTED" as const, runId: newRunId, value });
      }
      await this.#openStartWith(tx, { runId: run.runId, access, heldMicros: estimateMicros, now }, entitlement, basis);
      await markStartedUnlessSuperseded(this.#options.line, tx, run.runId, now);
      const value = await enqueue(tx, run.runId);
      return Object.freeze({ kind: "STARTED" as const, runId: run.runId, value });
    });
  }

  /** Billing on and an owner's run: the entitlement in force at `now`, read once; null otherwise. */
  async #entitlementOf(ownerRef: string | null, now: Date): Promise<PinnedEntitlement | null> {
    const entitlements = this.#options.entitlements;
    if (entitlements === null || ownerRef === null) return null;
    return entitlements.current(ownerRef, now);
  }

  /** The plan's tier (B4a's billingPlans row), or null while billing is off. */
  #tierOf(planId: PlanId): "free" | "premium" | null {
    const plans = this.#options.billingPlans ?? null;
    return plans === null ? null : planById(plans, planId).tier;
  }

  /**
   * The two locks for the day of a FRESH clock read, and the decision's instant
   * read again UNDER them. A decision that queued for the lock across midnight
   * would otherwise measure and write the old day while another holds the new
   * day's key; when the day turned while it waited, its transaction (which wrote
   * nothing yet) rolls back and the locks are taken for the new day.
   */
  async #locked<T>(ownerRef: string | null, use: (tx: PoolClient, now: Date) => Promise<T>): Promise<T> {
    // A day turns at most once while one decision waits; a third try never comes in practice.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const day = costEnvelopeDay(this.#clock());
      try {
        return await withSpendDecisionLock(this.#options.lockPool, { day, ownerRef }, async (tx) => {
          const now = this.#clock();
          if (costEnvelopeDay(now) !== day) throw new DecisionDayTurned();
          return use(tx, now);
        });
      } catch (error) {
        if (!(error instanceof DecisionDayTurned)) throw error;
      }
    }
    throw new TypedDomainError("ASK_ROOM_DAY_UNSETTLED", "The site's day kept turning while a decision waited");
  }

  /** The hold, then (billing on, an owner's run) the charge scope, pinned to the ONE entitlement it was given. */
  async #openStartWith(tx: PoolClient, input: Readonly<{
    runId: string;
    access: RunOwnershipAccess;
    heldMicros: number;
    now: Date;
  }>, entitlement: PinnedEntitlement | null, basis: FundingBasis | null = null): Promise<void> {
    await this.#options.spend.openHold(tx, { runId: input.runId, heldMicros: input.heldMicros });
    const entitlements = this.#options.entitlements;
    const ownerRef = input.access.ownerRef;
    if (entitlements === null || ownerRef === null) return;
    if (await entitlements.readRunFundingBasis?.(input.runId) !== null && entitlements.readRunFundingBasis !== undefined) return;
    if (basis !== null) { await this.#pin(tx,input.runId,ownerRef,basis,input.now); return; }
    if (entitlement === null) return;
    await entitlements.recordRunChargeScope(tx, {
      runId: input.runId,
      ownerRef,
      planId: entitlement.planId,
      entitlementEventId: entitlement.eventId,
      admittedAt: input.now
    });
  }

  #subscriptionBasis(entitlement: PinnedEntitlement): FundingBasis { return {kind:"SUBSCRIPTION",planId:entitlement.planId,entitlementEventId:entitlement.eventId}; }
  #sameFunding(left: FundingBasis, right: FundingBasis): boolean {
    return left.kind === right.kind && (left.kind === "SUBSCRIPTION" || (right.kind === "INTERNAL" && left.grantId === right.grantId && left.grantEventId === right.grantEventId));
  }
  async #pin(tx: PoolClient, runId: string, ownerRef: string, basis: FundingBasis, admittedAt: Date): Promise<void> {
    if (this.#options.entitlements === null) throw new TypedDomainError("RUN_FUNDING_BASIS_INVALID", "Funding pin persistence is unavailable");
    await this.#options.entitlements.recordRunChargeScope(tx,{runId,ownerRef,basis,admittedAt});
  }

  /**
   * Side-by-side C8: what holds every new question back right now, read on the decision's transaction: SWITCHING when
   * this release is not current (the count is then not needed), SITE_BUSY at the site's cap, null otherwise or with no
   * gate.
   * Side-by-side spec §13 "The API re-checks at admission" (Task S11): covers an ask in flight across an activation or a
   * switch and the 1 s pointer cache; the current release's waker starts it within a tick, re-admitted under O3 (S13).
   * The release check also asks, once and on this transaction, whether this release has passed the question's version
   * (`registerVersion`); not passed is SWITCHING: the ask waits in line, no charge, no hold, no error to the person. A
   * question whose version this API could not load (`settingsUnavailable`, ruling R47) is SWITCHING without a query.
   */
  async #holdOf(tx: PoolClient, question: RoomQuestion): Promise<AdmissionHold | null> {
    if (question.settingsUnavailable === true) return "SWITCHING";
    const gate = this.#options.gate;
    if (gate === undefined) return null;
    if (!(await gate.ownReleaseIsCurrent(tx, question.registerVersion))) return "SWITCHING";
    return await this.#siteIsBusy(tx, gate) ? "SITE_BUSY" : null;
  }

  /** The site's live debates at its cap, counted under `SITE_CONCURRENT_DEBATES_LOCK` on the decision's own transaction. */
  async #siteIsBusy(tx: PoolClient, gate: AskAdmissionGate): Promise<boolean> {
    await tx.query(SITE_CONCURRENT_DEBATES_LOCK);
    return await gate.activeDebates(tx) >= gate.siteConcurrentDebates;
  }

  /**
   * Side-by-side spec §13 (S10): the estimator of a settings version — `estimatorFor`'s, or the room's own without a
   * version or without `estimatorFor`. A version whose estimator cannot be had (a version this release cannot load:
   * another release's waiting run) is estimated with the room's own, said once per version (the loader's settings code,
   * or UNTYPED for a database or untyped failure; ruling R31's rule): an estimate never refuses an ask or strands a run.
   */
  async #estimatorFor(version: number | undefined): Promise<CostEstimator> {
    const estimatorFor = this.#options.estimatorFor;
    if (version === undefined || estimatorFor === undefined) return this.#options.estimator;
    try {
      return await estimatorFor(version);
    } catch (error) {
      if (!this.#estimatorFallbacksSaid.has(version)) {
        this.#estimatorFallbacksSaid.add(version);
        console.error(JSON.stringify({
          kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_ESTIMATOR_FALLBACK", version, cause: settingsRefusalCode(error) ?? "UNTYPED"
        }));
      }
      return this.#options.estimator;
    }
  }

  async #evaluate(question: RoomQuestion, now: Date, hold: AdmissionHold | null): Promise<RoomEvaluation> {
    // Side-by-side spec §13 (S10): the question's own version's estimate (precheck, the locked decision, the room read).
    const estimateMicros = await (await this.#estimatorFor(question.registerVersion)).estimateMicros(question.settingsClass);
    const { rooms, personUses, waitReason } = await this.#measure(question.access, estimateMicros, now);
    const waiting = await this.#waitingOf(question.access);
    const nextTickAt = nextWholeMinute(now);
    // A FULL scope already makes this question wait; the line cannot change that.
    // Otherwise the line is asked one question, whatever its length (§2.3 rule 1).
    const siteLineBlocking = rooms.some((entry) => entry.room === "FULL")
      ? false
      : await this.#options.line.siteLineBlocking(now);
    const admission = decideAdmission({
      rooms,
      siteLineBlocking,
      personWaitingCount: waiting.length,
      waitingLinePerPerson: this.#options.waitingLinePerPerson,
      nextTickAt,
      hold
    });
    return Object.freeze({
      admission, rooms, personUses, waitReason, estimateMicros, waiting, expected: waitingUntil({ rooms, nextTickAt })
    });
  }

  /**
   * The site's day, then each of the person's windows: used = spend in the
   * window + the person's counted holds (the same holds against every window).
   * And why a question so measured would wait: PERSON whenever a person window
   * is FULL (a full site makes every new question wait by itself, so the run is
   * the person's), looked at again when the latest window full on SPEND alone
   * resets — or at the next tick when only the person's own live holds fill
   * them, since those end with the person's running debate, not at a reset;
   * SITE otherwise. A window FULL with the holds but not on spend alone is
   * marked `fullOnOwnHolds` (Important 1): the expected start is then the next
   * tick, by the same rule, and the answers say the person's own debates are
   * what the question waits for.
   */
  async #measure(access: RunOwnershipAccess, estimateMicros: number, now: Date, runId?: string): Promise<RoomMeasure> {
    const day = costEnvelopeDay(now);
    const [daySpent, siteHolds] = await Promise.all([
      this.#options.spend.readDaySpentMicros(day),
      this.#options.spend.readSiteCountedHoldsMicros(day)
    ]);
    const rooms: ScopeRoom[] = [Object.freeze({
      scope: "SITE_DAY" as const,
      room: decideRoom({
        usedMicros: daySpent + siteHolds,
        estimateMicros,
        limitMicros: this.#options.dailyCeilingMicros,
        closeBasisPoints: this.#options.closeBasisPoints
      }),
      resetsAt: nextUtcMidnight(now)
    })];
    const personUses: RoomWindowUse[] = [];
    let personFull = false;
    let fullOnSpendUntil: Date | null = null;
    const ownerRef = access.ownerRef;
    const pinned = runId === undefined ? null : await this.#options.entitlements?.readRunFundingBasis?.(runId) ?? null;
    const windows = ownerRef === null ? [] : runId !== undefined && pinned === null && this.#options.funding !== undefined
      ? await this.#options.funding.readSubscriptionWindows(ownerRef,now)
      : await this.#options.personAllowance.read(ownerRef, now, runId === undefined ? undefined : {runId});
    if (ownerRef !== null && windows.length > 0) {
      const holds = await this.#options.spend.readOwnerCountedHoldsMicros(ownerRef, windows[0]?.funding);
      for (const window of windows) {
        const spent = await this.#options.spend.readOwnerSpentMicros(ownerRef, window.periodStart, window.resetsAt, window.funding, window.scope);
        const usedMicros = spent + holds;
        const room = decideRoom({
          usedMicros,
          estimateMicros,
          limitMicros: window.limitMicros,
          closeBasisPoints: window.closeBasisPoints
        });
        const fullOnSpend = spent >= window.limitMicros;
        if (room === "FULL") {
          personFull = true;
          if (fullOnSpend && (fullOnSpendUntil === null || window.resetsAt.getTime() > fullOnSpendUntil.getTime())) {
            fullOnSpendUntil = window.resetsAt;
          }
        }
        personUses.push(Object.freeze({
          scope: window.scope,
          limitMicros: window.limitMicros,
          usedMicros,
          resetsAt: window.resetsAt,
          closeBasisPoints: window.closeBasisPoints
        }));
        rooms.push(Object.freeze({
          scope: window.scope,
          room,
          resetsAt: window.resetsAt,
          ...(room === "FULL" && !fullOnSpend ? { fullOnOwnHolds: true } : {})
        }));
      }
    }
    const waitReason: WaitReason = personFull
      ? Object.freeze({ waitsFor: "PERSON" as const, personRecheckAt: fullOnSpendUntil ?? nextWholeMinute(now) })
      : Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null });
    return Object.freeze({ rooms: Object.freeze(rooms), personUses: Object.freeze(personUses), waitReason });
  }

  #waitingOf(access: RunOwnershipAccess): Promise<ReadonlyArray<WaitingRunRef>> {
    if (access.ownerRef !== null) return this.#options.line.waitingForOwner(access.ownerRef);
    if (access.legacyAskerId === null) throw new TypeError("ASK_ROOM_ACCESS_INVALID");
    return this.#options.line.waitingForLegacyAsker(access.legacyAskerId);
  }
}
