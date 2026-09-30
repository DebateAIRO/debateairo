import type { Pool, PoolClient } from "pg";
import { PLAN_TIER_ROSTERS, type AskRequest } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import {
  costEnvelopeDay,
  decideAdmission,
  decideRoom,
  waitingUntil,
  withSpendDecisionLock,
  type Admission,
  type CostEstimator,
  type PersonAllowanceSource,
  type PersonWindow,
  type RunSettingsClass,
  type ScopeRoom,
  type SpendScope
} from "@debateai/budget";
import type { RunOwnershipAccess, WaitReason, WaitingRun, WaitingRunRef } from "@debateai/db";
import type { PlanId } from "@debateai/register";

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
 */
export class AskAlreadyWaitingError extends TypedDomainError {
  constructor(readonly runRef: string, readonly waitsUntil: Date) {
    super("ASK_ALREADY_WAITING", "One question can wait at a time; the waiting one starts first");
  }
}

export type RoomQuestion = Readonly<{ access: RunOwnershipAccess; settingsClass: RunSettingsClass }>;
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
  readOwnerSpentMicros(ownerRef: string, from: Date, to: Date): Promise<number>;
  readOwnerCountedHoldsMicros(ownerRef: string): Promise<number>;
  openHold(client: PoolClient, input: Readonly<{ runId: string; heldMicros: number }>): Promise<void>;
}

/** B3's `RunWaitRepository`, as the room reads and writes the line. */
export interface AskRoomLine {
  /** Budget spec §2.3 rule 1: does any waiting run hold a new question back? One statement. */
  siteLineBlocking(now: Date): Promise<boolean>;
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
  recordRunChargeScope(client: PoolClient, input: Readonly<{
    runId: string;
    ownerRef: string;
    planId: PlanId;
    entitlementEventId: string;
    admittedAt: Date;
  }>): Promise<void>;
}

export type AskRoomOptions = Readonly<{
  /** A pool of its own: see `withSpendDecisionLock`. */
  lockPool: Pool;
  spend: AskRoomSpend;
  line: AskRoomLine;
  estimator: CostEstimator;
  personAllowance: PersonAllowanceSource;
  entitlements: AskRoomEntitlements | null;
  dailyCeilingMicros: number;
  closeBasisPoints: number;
  waitingLinePerPerson: number;
  clock?: () => Date;
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
  expectedStart(runId: string): Promise<Readonly<{ waitsUntil: Date; scope: SpendScope }> | null>;
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
  expected: Readonly<{ waitsUntil: Date; worstScope: SpendScope }>;
}>;

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
  ask: Pick<AskRequest, "plan_tier" | "composition_budget_tier" | "depth_params">
): RunSettingsClass {
  return Object.freeze({
    planTier: ask.plan_tier,
    compositionBudgetTier: ask.composition_budget_tier,
    makerCount: PLAN_TIER_ROSTERS[ask.plan_tier].length,
    depth: ask.depth_params.depth
  });
}

/** A waiting run's class, from the columns it was asked with; a run with no plan tier is estimated as premium, the careful side. */
export function settingsClassOfWaitingRun(run: WaitingRun): RunSettingsClass {
  return Object.freeze({
    planTier: run.planTier ?? "premium",
    compositionBudgetTier: run.compositionBudgetTier,
    makerCount: run.makerCount,
    depth: run.depth
  });
}

export function accessOfWaitingRun(run: WaitingRun): RunOwnershipAccess {
  return run.ownerRef !== null
    ? Object.freeze({ ownerRef: run.ownerRef, legacyAskerId: null })
    : Object.freeze({ ownerRef: null, legacyAskerId: run.legacyAskerId });
}

function alreadyWaiting(evaluation: RoomEvaluation): AskAlreadyWaitingError {
  const oldest = evaluation.waiting[0];
  if (oldest === undefined) throw new TypeError("ASK_ROOM_WAITING_LINE_INCONSISTENT");
  return new AskAlreadyWaitingError(oldest.runId, evaluation.expected.waitsUntil);
}

export class AskRoom implements AskRoomPort {
  readonly #options: AskRoomOptions;
  readonly #clock: () => Date;
  /** Why the decision on each open transaction would make its question wait; set and cleared by `decide`. */
  readonly #waitReasons = new WeakMap<PoolClient, WaitReason>();

  constructor(options: AskRoomOptions) {
    for (const value of [options.dailyCeilingMicros, options.closeBasisPoints, options.waitingLinePerPerson]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("ASK_ROOM_OPTIONS_INVALID");
    }
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
    const evaluation = await this.#evaluate(question, now);
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
      const evaluation = await this.#evaluate(question, now);
      const admission = evaluation.admission;
      if (admission.kind === "REFUSE_ALREADY_WAITING") throw alreadyWaiting(evaluation);
      this.#waitReasons.set(tx, evaluation.waitReason);
      try {
        return await apply(Object.freeze({ admission, estimateMicros: evaluation.estimateMicros, now, tx }));
      } finally {
        this.#waitReasons.delete(tx);
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
    await this.#openStartWith(tx, input, entitlement);
  }

  /** A waiting run's expected start, recomputed on every read (budget spec §2.7). */
  async expectedStart(runId: string): Promise<Readonly<{ waitsUntil: Date; scope: SpendScope }> | null> {
    const run = await this.#options.line.readWaiting(runId);
    if (run === null) return null;
    const now = this.#clock();
    const estimateMicros = await this.#options.estimator.estimateMicros(settingsClassOfWaitingRun(run));
    const { rooms } = await this.#measure(accessOfWaitingRun(run), estimateMicros, now);
    const until = waitingUntil({ rooms, nextTickAt: nextWholeMinute(now) });
    return Object.freeze({ waitsUntil: until.waitsUntil, scope: until.worstScope });
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
  }>, entitlement: PinnedEntitlement | null): Promise<void> {
    await this.#options.spend.openHold(tx, { runId: input.runId, heldMicros: input.heldMicros });
    const entitlements = this.#options.entitlements;
    const ownerRef = input.access.ownerRef;
    if (entitlements === null || ownerRef === null || entitlement === null) return;
    await entitlements.recordRunChargeScope(tx, {
      runId: input.runId,
      ownerRef,
      planId: entitlement.planId,
      entitlementEventId: entitlement.eventId,
      admittedAt: input.now
    });
  }

  async #evaluate(question: RoomQuestion, now: Date): Promise<RoomEvaluation> {
    const estimateMicros = await this.#options.estimator.estimateMicros(question.settingsClass);
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
      nextTickAt
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
   * SITE otherwise.
   */
  async #measure(access: RunOwnershipAccess, estimateMicros: number, now: Date): Promise<RoomMeasure> {
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
    const windows = ownerRef === null ? [] : await this.#options.personAllowance.read(ownerRef, now);
    if (ownerRef !== null && windows.length > 0) {
      const holds = await this.#options.spend.readOwnerCountedHoldsMicros(ownerRef);
      for (const window of windows) {
        const spent = await this.#options.spend.readOwnerSpentMicros(ownerRef, window.periodStart, window.resetsAt);
        const usedMicros = spent + holds;
        const room = decideRoom({
          usedMicros,
          estimateMicros,
          limitMicros: window.limitMicros,
          closeBasisPoints: window.closeBasisPoints
        });
        if (room === "FULL") {
          personFull = true;
          if (spent >= window.limitMicros
            && (fullOnSpendUntil === null || window.resetsAt.getTime() > fullOnSpendUntil.getTime())) {
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
        rooms.push(Object.freeze({ scope: window.scope, room, resetsAt: window.resetsAt }));
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
