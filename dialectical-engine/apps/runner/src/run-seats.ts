import { createHash } from "node:crypto";
import { Judge, PanelMemberFailure } from "@debateai/judgement";
import { TypedDomainError, isRunLevelSpendStop, type DebateRole } from "@debateai/kernel";
import {
  PROVIDER_USAGE_CAP,
  ProviderCallFailedError,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import type { RunBackupSwitchLifecycleValue, RunRoleFallbackLifecycleValue } from "@debateai/db";
import { selectSeatCandidate, type RoleAssignment, type RoleSeat, type SeatCandidate } from "@debateai/scorecard";
import {
  BACKUP_MODEL_USED_MARK,
  DEGRADED_DIVERSITY_MARK,
  SYNTHESIS_ROLE_NAMES,
  seatBaseCallSiteKey,
  seatCallSiteKey,
  type ConditionMarkRecord,
  type ServeGateResult
} from "@debateai/serve";

/**
 * Model scorecard A15 (spec §2.7; owner rulings R3-R5 of 2026-09-26) — WHO SITS
 * IN EACH SEAT OF ONE RUN, AND THE ONE DOOR EVERY SEAT CALL GOES THROUGH.
 *
 * A run either pins a role assignment (the picker's, made at ask admission) or
 * it does not. Without one, the LEGACY BOOK reproduces today's rule exactly:
 * every claim-eligible debater, in pinned panel order, sits in every multi-seat
 * role, the synthesis roles stay with their sealed register refs, and every
 * call-site key is the bare key it has always been. With one, each role's seats
 * come from the assignment, each member is stamped with its candidate (model
 * version + thinking level, R1), and every key carries `:seat:<main|runnerUp>`
 * so a main and its runner-up never share the gateway's per-key allowance.
 */

export type SeatSlot = "MAIN" | "RUNNER_UP";

/** The shape `WalkingSkeletonRunner`'s configured makers already have. */
export interface ConfiguredSeatMaker {
  readonly judge: Judge;
  readonly provider: ProviderGateway;
  readonly providerRef: string;
  readonly maker: string;
}

/** One callable member of a seat. */
export interface SeatMember extends ConfiguredSeatMaker {
  /** The pinned candidate this member answers as; null on the legacy book. */
  readonly candidate: SeatCandidate | null;
  /** The pinned slot the member came from — the seat marker in its keys. */
  readonly pinnedAs: SeatSlot;
}

export interface RunSeat {
  readonly role: DebateRole;
  /** Index in the run's compacted list: a POSITION seat's index IS its root index. */
  readonly seatIndex: number;
  /** The index the assignment pinned; stable across claim-time compaction. */
  readonly pinnedSeatIndex: number;
  readonly main: SeatMember;
  readonly runnerUp: SeatMember | null;
  readonly diversityShare: number;
  /** The pinned seat the 80-20 selection reads (A16); null on the legacy book. */
  readonly pinned: RoleSeat | null;
}

export interface RunSeatBook {
  /** False on the legacy book: bare keys, no runner-up, no backup. */
  readonly assigned: boolean;
  readonly scorecardVersion: number | null;
  readonly position: readonly RunSeat[];
  readonly supportAttack: readonly RunSeat[];
  readonly crossExchange: readonly RunSeat[];
  readonly judge: readonly RunSeat[];
  readonly reviewer: readonly RunSeat[];
  /**
   * Null on the legacy book, and on an assigned book whose synthesis seat is a
   * FALLBACK one (pre-flight ruling F18): the sealed register role ref decides,
   * as today (J8).
   */
  readonly answerWriter: RunSeat | null;
  readonly answerChecker: RunSeat | null;
}

export type RouteHealth =
  | { readonly state: "HEALTHY" }
  | { readonly state: "ABSENT"; readonly failureCode: string };

/**
 * Why a seat moved to its other member: during a call (R4 — a transport failure
 * after the normal retries, or a usage cap at once), at claim (the main was not
 * claim-eligible), or on a RESUMED pass whose ledger holds the planned member's
 * key at this site already at its allowance (A16c, controller carry 8c).
 */
export type BackupSwitchCause = "TRANSPORT_FAILURE" | "USAGE_CAP" | "ABSENT_AT_CLAIM" | "SPENT_ON_EARLIER_PASS";

/**
 * One seat moving to its other member — main to runner-up, or back from a
 * runner-up the split picked to its main (carry 12). Told on the run's progress
 * stream where it may carry one (A16c, `backupSwitchEventValue`); the ANSWER
 * discloses who actually answered in place of the planned member
 * (`BackupAnswer`), in plain words.
 */
export interface BackupSwitchRecord {
  readonly role: DebateRole;
  /** The PINNED seat index, so a record names the seat the assignment names. */
  readonly seatIndex: number;
  readonly fromProviderRef: string;
  readonly fromCandidateId: string | null;
  readonly toProviderRef: string;
  readonly toCandidateId: string | null;
  readonly cause: BackupSwitchCause;
  /** The key the failed call was recorded under; null for a switch made at claim. */
  readonly callSiteKey: string | null;
}

/** What a fairness rule reads of a member — so a pinned candidate that never sat (absent at claim) can be judged by it too. */
export type SeatIdentity = Pick<SeatCandidate, "maker" | "providerRef">;

/**
 * A16c (controller carries 8c and 13) — a switch a RESUMED pass makes through
 * the ledger rather than inside a call: the member R3 planned for the site
 * (`from`) holds a key the ledger shows already at its allowance there, and the
 * other member never ran at the site on an earlier pass, so this pass hands the
 * site over NOW. The runner computes it from the ledger; the seat caller records
 * and announces it before the other member is called — only when that member
 * really is the one called. A site an earlier pass already switched carries no
 * move: its switch was announced then, and the answer discloses the stand-in
 * from who answered (`BackupAnswer`), never as a second switch.
 */
export interface LedgerSeatMove {
  readonly from: SeatSlot;
  /** The planned member's key at the site — where the ledger rows that spent it are. */
  readonly callSiteKey: string;
}

/**
 * A16c — one call a member answered IN PLACE of the member the assignment
 * planned for its site (the pinned seat's own 80-20 choice), for a reason that
 * is not a fairness rule: a switch during the call, a main absent at claim, a
 * runner-up absent at claim, or a resumed pass's ledger. The answer's
 * BACKUP-MODEL-USED disclosure is built from these, so it counts what the
 * answer's content actually came from — a switch whose planned member answered
 * after all discloses nothing, and a site an earlier pass switched is counted
 * from this pass's answer (carries 9 and 13).
 */
export interface BackupAnswer {
  readonly role: DebateRole;
  /** The PINNED seat index. */
  readonly seatIndex: number;
  /** The key the answer was recorded under, seat marker included. */
  readonly callSiteKey: string;
  readonly plannedSlot: SeatSlot;
  readonly answeredSlot: SeatSlot;
  /** The route that answered. */
  readonly providerRef: string;
}

/**
 * A15 (R1, spec §2.3): every request a member sends carries the candidate it
 * answers as — the thinking level goes on the wire (the gateway refuses a level
 * the route did not declare), the candidate id and scorecard version go on the
 * ledger row.
 */
export function stampCandidateGateway(
  provider: ProviderGateway,
  candidate: SeatCandidate,
  scorecardVersion: number | null
): ProviderGateway {
  return Object.freeze({
    call: (request: ProviderCallRequest) => provider.call({
      ...request,
      thinkingLevel: candidate.thinkingLevel,
      candidateId: candidate.candidateId,
      scorecardVersion
    })
  });
}

function legacySeat(role: DebateRole, index: number, maker: ConfiguredSeatMaker): RunSeat {
  return Object.freeze({
    role,
    seatIndex: index,
    pinnedSeatIndex: index,
    main: Object.freeze({ ...maker, candidate: null, pinnedAs: "MAIN" as const }),
    runnerUp: null,
    diversityShare: 0,
    pinned: null
  });
}

/** Today's rule: every claim-eligible debater, in pinned order, in every multi-seat role. */
export function buildLegacyRunSeatBook(debaters: readonly ConfiguredSeatMaker[]): RunSeatBook {
  const seatsFor = (role: DebateRole): readonly RunSeat[] =>
    Object.freeze(debaters.map((maker, index) => legacySeat(role, index, maker)));
  return Object.freeze({
    assigned: false,
    scorecardVersion: null,
    position: seatsFor("POSITION"),
    supportAttack: seatsFor("SUPPORT_ATTACK"),
    crossExchange: seatsFor("CROSS_EXCHANGE"),
    judge: seatsFor("JUDGE"),
    reviewer: seatsFor("REVIEWER"),
    answerWriter: null,
    answerChecker: null
  });
}

/** A legacy run's synthesis seat: the sealed role ref's configured maker, no runner-up. */
export function legacySynthesisSeat(role: "ANSWER_WRITER" | "ANSWER_CHECKER", maker: ConfiguredSeatMaker): RunSeat {
  return legacySeat(role, 0, maker);
}

function seatsOf(assignment: RoleAssignment, role: DebateRole): readonly RoleSeat[] {
  return assignment.roles[role] ?? [];
}

/**
 * Why a pinned assignment cannot seat a debate, or null when it can. It counts
 * seats only: it assumes `RoleAssignmentSchema` already ran on the assignment
 * (a runner-up on its main's route, a shared POSITION maker, a CROSS_EXCHANGE
 * that is not POSITION's are the schema's checks, not this one's).
 */
export function roleAssignmentSeatProblem(assignment: RoleAssignment): string | null {
  if (seatsOf(assignment, "POSITION").length === 0) return "POSITION has no seat";
  for (const role of ["ANSWER_WRITER", "ANSWER_CHECKER"] as const) {
    const count = seatsOf(assignment, role).length;
    if (count !== 1) return `${role} needs exactly one seat, not ${String(count)}`;
  }
  return null;
}

export interface AssignedRunSeatBook {
  readonly book: RunSeatBook;
  readonly claimSwitches: readonly BackupSwitchRecord[];
  /**
   * A15d (controller carry 12): the multi-seat roles left with no claim-eligible
   * pinned seat, now sat by the DEBATERS — POSITION runner-ups and shares
   * included. No such role changes who answers until A16 lets a runner-up
   * answer; from then on A16's disclosure (BACKUP-MODEL-USED / degraded
   * diversity) owes the reader these roles, so the book names them.
   */
  readonly fallbackRoles: readonly ("SUPPORT_ATTACK" | "JUDGE" | "REVIEWER")[];
  readonly droppedPositionSeats: readonly { readonly candidate: SeatCandidate; readonly failureCode: string }[];
  readonly unavailableSynthesis: readonly {
    readonly role: "ANSWER_WRITER" | "ANSWER_CHECKER";
    readonly candidate: SeatCandidate;
    readonly failureCode: string;
  }[];
}

/**
 * A15: the seats of an assigned run, resolved against the routes that are
 * claim-eligible NOW. A main that is absent while its runner-up is healthy is
 * replaced at claim (a switch, cause `ABSENT_AT_CLAIM`); a seat with neither is
 * dropped — for POSITION exactly as today's absent debater is — and a
 * synthesis seat with neither is reported for the J24 refusal. A POSITION
 * runner-up is promoted only when no other debater already has its maker (R5).
 */
export function buildAssignedRunSeatBook(input: {
  readonly assignment: RoleAssignment;
  readonly configured: ReadonlyMap<string, ConfiguredSeatMaker>;
  readonly routeHealth: ReadonlyMap<string, RouteHealth>;
  /**
   * Paid plans S1a × B9c (budget spec §2.9): the gateway an assigned member's
   * JUDGE calls go through, built over its STAMPED provider — the runner's
   * cheaper-model-while-arguing gateway when `bodyCostFallback` is on. Absent:
   * the stamped provider, exactly as before. `provider` stays the stamped one
   * either way, so the seat caller's switches and the ledger's candidate record
   * are unchanged; a moved call goes to another maker's own (unstamped) route.
   */
  readonly judgeGatewayFor?: (planned: ConfiguredSeatMaker, stamped: ProviderGateway) => ProviderGateway;
}): AssignedRunSeatBook {
  const { assignment } = input;
  const claimSwitches: BackupSwitchRecord[] = [];
  const routeOf = (candidate: SeatCandidate):
    | { readonly kind: "HEALTHY"; readonly maker: ConfiguredSeatMaker }
    | { readonly kind: "ABSENT"; readonly failureCode: string } => {
    const maker = input.configured.get(candidate.providerRef);
    if (maker === undefined) return { kind: "ABSENT", failureCode: "CLAIM_GATEWAY_UNRESOLVED" };
    const verdict = input.routeHealth.get(candidate.providerRef);
    if (verdict === undefined) return { kind: "ABSENT", failureCode: "CLAIM_PROVIDER_ABSENT" };
    return verdict.state === "HEALTHY" ? { kind: "HEALTHY", maker } : { kind: "ABSENT", failureCode: verdict.failureCode };
  };
  const memberOf = (maker: ConfiguredSeatMaker, candidate: SeatCandidate, pinnedAs: SeatSlot): SeatMember => {
    const provider = stampCandidateGateway(maker.provider, candidate, assignment.scorecardVersion);
    const judgeGateway = input.judgeGatewayFor === undefined ? provider : input.judgeGatewayFor(maker, provider);
    return Object.freeze({
      judge: new Judge(judgeGateway), provider, providerRef: maker.providerRef, maker: maker.maker, candidate, pinnedAs
    });
  };
  // A15b fix round 1 (M2): "no runner-up, no share" (RoleAssignmentSchema) holds
  // for the CLAIMED seat too — a runner-up promoted at claim, or absent at claim,
  // leaves the seat one member and no share. `pinned` still records the assignment.
  const seated = (role: DebateRole, pinned: RoleSeat, seatIndex: number, main: SeatMember, runnerUp: SeatMember | null): RunSeat =>
    Object.freeze({
      role,
      seatIndex,
      pinnedSeatIndex: pinned.seatIndex,
      main,
      runnerUp,
      diversityShare: runnerUp === null ? 0 : pinned.diversityShare,
      pinned
    });
  const resolve = (
    role: DebateRole,
    pinned: RoleSeat,
    seatIndex: number,
    promotable: (maker: ConfiguredSeatMaker) => boolean
  ): { readonly kind: "SEATED"; readonly seat: RunSeat } | { readonly kind: "ABSENT"; readonly failureCode: string } => {
    const main = routeOf(pinned.main);
    const runnerUpCandidate = pinned.runnerUp;
    const runnerUp = runnerUpCandidate === null ? null : routeOf(runnerUpCandidate);
    if (main.kind === "HEALTHY") {
      return {
        kind: "SEATED",
        seat: seated(role, pinned, seatIndex, memberOf(main.maker, pinned.main, "MAIN"),
          runnerUpCandidate !== null && runnerUp !== null && runnerUp.kind === "HEALTHY"
            ? memberOf(runnerUp.maker, runnerUpCandidate, "RUNNER_UP")
            : null)
      };
    }
    if (runnerUpCandidate !== null && runnerUp !== null && runnerUp.kind === "HEALTHY" && promotable(runnerUp.maker)) {
      claimSwitches.push(Object.freeze({
        role,
        seatIndex: pinned.seatIndex,
        fromProviderRef: pinned.main.providerRef,
        fromCandidateId: pinned.main.candidateId,
        toProviderRef: runnerUpCandidate.providerRef,
        toCandidateId: runnerUpCandidate.candidateId,
        cause: "ABSENT_AT_CLAIM" as const,
        callSiteKey: null
      }));
      return {
        kind: "SEATED",
        seat: seated(role, pinned, seatIndex, memberOf(runnerUp.maker, runnerUpCandidate, "RUNNER_UP"), null)
      };
    }
    return { kind: "ABSENT", failureCode: main.failureCode };
  };

  // POSITION first: every other role's fallback is the debaters.
  const positionPinned = seatsOf(assignment, "POSITION");
  const seatedMakers = new Set(positionPinned.flatMap((pinned) => {
    const route = routeOf(pinned.main);
    return route.kind === "HEALTHY" ? [route.maker.maker] : [];
  }));
  const position: RunSeat[] = [];
  const droppedPositionSeats: { readonly candidate: SeatCandidate; readonly failureCode: string }[] = [];
  for (const pinned of positionPinned) {
    const resolved = resolve("POSITION", pinned, position.length, (maker) => !seatedMakers.has(maker.maker));
    if (resolved.kind === "SEATED") {
      position.push(resolved.seat);
      seatedMakers.add(resolved.seat.main.maker);
    } else {
      droppedPositionSeats.push(Object.freeze({ candidate: pinned.main, failureCode: resolved.failureCode }));
    }
  }
  const fallbackRoles: ("SUPPORT_ATTACK" | "JUDGE" | "REVIEWER")[] = [];
  const multiSeat = (role: "SUPPORT_ATTACK" | "JUDGE" | "REVIEWER"): readonly RunSeat[] => {
    const seats: RunSeat[] = [];
    for (const pinned of seatsOf(assignment, role)) {
      const resolved = resolve(role, pinned, seats.length, () => true);
      if (resolved.kind === "SEATED") seats.push(resolved.seat);
    }
    // A role left without a seat keeps TODAY's rule for that role: the
    // debaters sit in it (spec §2.4, "a role the scorecard does not cover
    // falls back to today's").
    if (seats.length > 0) return Object.freeze(seats);
    fallbackRoles.push(role);
    return Object.freeze(position.map((debater) => Object.freeze({ ...debater, role })));
  };
  // A15b fix round 1 (M3): a cross-exchange defends a root, so it is written by
  // the member that wrote that root (R5). Its seats therefore MIRROR the
  // CLAIMED POSITION seats and are never resolved again: a claim switch is
  // recorded once, and crossExchange[i] stays root i's writer even where R5
  // refused a POSITION promotion. A mirrored seat has no runner-up and no share
  // (a cross-exchange site has no backup, DR-184-v5), and its member keeps its
  // pinned slot, so the site's one key carries the root writer's marker (A15a).
  // RoleAssignmentSchema pins CROSS_EXCHANGE equal to POSITION, so no
  // candidate is lost; an assignment with no CROSS_EXCHANGE seat keeps an
  // empty list, which is lawful.
  const crossExchange: readonly RunSeat[] = seatsOf(assignment, "CROSS_EXCHANGE").length === 0
    ? Object.freeze([])
    : Object.freeze(position.map((debater) => Object.freeze({
      ...debater, role: "CROSS_EXCHANGE" as const, runnerUp: null, diversityShare: 0
    })));
  const unavailableSynthesis: {
    readonly role: "ANSWER_WRITER" | "ANSWER_CHECKER";
    readonly candidate: SeatCandidate;
    readonly failureCode: string;
  }[] = [];
  const single = (role: "ANSWER_WRITER" | "ANSWER_CHECKER"): RunSeat | null => {
    const pinned = seatsOf(assignment, role)[0];
    // Pre-flight ruling F18: a FALLBACK synthesis seat means the scorecard does
    // not cover the role, so the sealed register refs decide, exactly as today
    // (J8) — null, like the legacy book — never the picker's first-reachable guess.
    if (pinned === undefined || pinned.source === "FALLBACK") return null;
    const resolved = resolve(role, pinned, 0, () => true);
    if (resolved.kind === "SEATED") return resolved.seat;
    unavailableSynthesis.push(Object.freeze({ role, candidate: pinned.main, failureCode: resolved.failureCode }));
    return null;
  };
  const book: RunSeatBook = Object.freeze({
    assigned: true,
    scorecardVersion: assignment.scorecardVersion,
    position: Object.freeze(position),
    supportAttack: multiSeat("SUPPORT_ATTACK"),
    crossExchange,
    judge: multiSeat("JUDGE"),
    reviewer: multiSeat("REVIEWER"),
    answerWriter: single("ANSWER_WRITER"),
    answerChecker: single("ANSWER_CHECKER")
  });
  return Object.freeze({
    book,
    claimSwitches: Object.freeze(claimSwitches),
    fallbackRoles: Object.freeze(fallbackRoles),
    droppedPositionSeats: Object.freeze(droppedPositionSeats),
    unavailableSynthesis: Object.freeze(unavailableSynthesis)
  });
}

export interface SeatCall<T> {
  readonly seat: RunSeat;
  /**
   * The call site WITHOUT a seat marker: the 80-20 ordinal hashes it
   * (`seatSiteOrdinal`), and the cooldown/hold records name it.
   */
  readonly callSiteKey: string;
  /**
   * An explicit 80-20 ordinal. The synthesis roles pass one: `seatSiteOrdinal`
   * over their role's run-level site, so every round of one run uses the same
   * member (A16c, controller carry 16).
   */
  readonly ordinal?: number;
  /**
   * A16a fix round 1: the slot a resumed pass restores — the one the ledger
   * says answered this site — tried FIRST in place of the 80-20 choice. It is a
   * preference, never a filter: the other member stays its backup (R4).
   */
  readonly prefer?: SeatSlot;
  /** A fairness rule a member must pass to answer THIS call (R5). */
  readonly eligible?: (member: SeatMember) => boolean;
  /**
   * A16c: the call's own FAIRNESS rule alone (R5 maker rules), without the
   * ledger's restrictions that `eligible` also carries — a planned member it
   * bars is passed over, never counted as a stand-in. Absent, every member is fair.
   */
  readonly fair?: (candidate: SeatIdentity) => boolean;
  /** A16c: a switch this resumed pass makes through the ledger (carry 8c). */
  readonly ledgerMove?: LedgerSeatMove;
  /** The member-specific base key (the panel names the answering route in its key). */
  readonly keyFor?: (member: SeatMember) => string;
  readonly call: (member: SeatMember, callSiteKey: string) => Promise<T>;
}

export interface SeatAnswer<T> {
  readonly value: T;
  /** The member that ANSWERED — every lineage record names this one. */
  readonly member: SeatMember;
  /** The key the call was recorded under, seat marker included. */
  readonly callSiteKey: string;
}

export interface SeatPlanOptions {
  readonly eligible?: (member: SeatMember) => boolean;
  readonly ordinal?: number;
  readonly prefer?: SeatSlot;
  /** Carried with a call's options; `plan` reads neither (A16c). */
  readonly fair?: (candidate: SeatIdentity) => boolean;
  readonly ledgerMove?: LedgerSeatMove;
}

export interface SeatCaller {
  /** The member `callSeat` would call first for this call site, or null when none is eligible. */
  plan(seat: RunSeat, callSiteKey: string, options?: SeatPlanOptions): SeatMember | null;
  callSeat<T>(input: SeatCall<T>): Promise<SeatAnswer<T>>;
  /** The routes that answered this role's calls, in call order. */
  answered(role: DebateRole): readonly string[];
  /**
   * Every switch of this run pass: the ones made at claim, then the ones made
   * during calls or through the ledger — exactly what this pass announces.
   */
  switches(): readonly BackupSwitchRecord[];
  /** A16c: every call a member answered in place of the one the assignment planned (see `BackupAnswer`). */
  backupAnswers(): readonly BackupAnswer[];
}

export interface SeatCallerOptions {
  readonly assigned: boolean;
  /**
   * The run whose sites this caller serves — part of every site's 80-20
   * ordinal (`seatSiteOrdinal`), so two runs split their sites differently.
   * Absent (a unit, a legacy book), the ordinal is the seat's and site's alone.
   */
  readonly runId?: string | null;
  /** Switches already made at claim (a main absent, its runner-up promoted). */
  readonly claimSwitches?: readonly BackupSwitchRecord[];
  /** Called once per switch made during a call or through the ledger, BEFORE the other member is called. */
  readonly onSwitch?: (record: BackupSwitchRecord) => Promise<void>;
}

/** The gateway's own oversized-packet refusal (`packages/providers/src/index.ts`), carried as a failure's cause. */
const PROVIDER_PACKET_TOO_LARGE = "PROVIDER_PACKET_TOO_LARGE";

function hasCode(error: unknown, code: string): boolean {
  return error instanceof TypedDomainError && error.code === code;
}

/**
 * Owner ruling R4 (2026-09-26) — WHICH FAILURES MOVE A SEAT TO ITS RUNNER-UP.
 *  · a transport failure AFTER the normal retries: `ProviderCallFailedError`
 *    means the gateway already spent every attempt the caller allowed;
 *  · a subscription usage cap, IMMEDIATELY: the gateway short-circuits it, so
 *    there is no retry to wait for.
 * NEVER: a wrong-format or schema failure (retried as today by the gateway's
 * repair loop, then refused as today); a run-wide spend or attempt stop (the
 * RUN's, never a seat's — V-28), bare or carried as a failure's cause; a key
 * at its per-site allowance (`CALL_BUDGET_EXHAUSTED`, which spent nothing);
 * anything else, including a changed model identity, an unsupported thinking
 * level or a context window a prompt cannot fit, or an oversized packet
 * (pre-flight fix F12). `Judge.assess` wraps every provider failure as a
 * `PanelMemberFailure`; the wrapped failure is its `cause` and is classified
 * the same way. Since pre-flight ruling F11 the gateway delivers a usage cap as
 * the `cause` of a `ProviderCallFailedError`; a bare cap is still recognised.
 */
export function seatFailureCause(error: unknown): BackupSwitchCause | null {
  const underlying = error instanceof PanelMemberFailure ? error.cause : error;
  if (underlying === undefined || isRunLevelSpendStop(underlying)) return null;
  if (hasCode(underlying, PROVIDER_USAGE_CAP)) return "USAGE_CAP";
  if (underlying instanceof ProviderCallFailedError) {
    const cause: unknown = underlying.cause;
    if (hasCode(cause, PROVIDER_USAGE_CAP)) return "USAGE_CAP";
    if (isRunLevelSpendStop(cause)) return null;
    // Pre-flight fix F12: an oversized packet also ends as PROVIDER_CALL_FAILED,
    // but it is deterministic — the gateway's packet cap is the same on every
    // route — so it is never a reason to switch.
    if (hasCode(cause, PROVIDER_PACKET_TOO_LARGE)) return null;
    return "TRANSPORT_FAILURE";
  }
  return null;
}

/**
 * Model scorecard A16a (controller carry 1) — THE 80-20 ORDINAL OF ONE SEAT
 * CALL SITE: the first 48 bits of sha256 over the canonical JSON of
 * `[runId ?? "", role, pinnedSeatIndex, seatBaseCallSiteKey(callSiteKey)]`, a
 * non-negative safe integer, the way `diversityOrdinalForRun` makes a run's.
 *
 * It is a PURE FUNCTION OF THE SITE: the run, the seat (its role and the index
 * the assignment PINNED, which claim-time compaction never moves) and the
 * site's base key (a seat marker, if one slipped in, is stripped). A resumed
 * pass — a fresh caller on a rebuilt book, visiting the sites in any order —
 * therefore sends every site to the member the first pass sent it to, which is
 * what DR-184-v5's per-site maximum needs (controller ruling A14). A per-seat
 * visit counter would not: it resets on restart and renumbers every site. The
 * seat is in the hash so the JUDGE seats of one node do not all turn to their
 * runner-ups together.
 */
export function seatSiteOrdinal(site: {
  readonly runId: string | null;
  readonly role: DebateRole;
  readonly pinnedSeatIndex: number;
  readonly callSiteKey: string;
}): number {
  const canonical = JSON.stringify([site.runId ?? "", site.role, site.pinnedSeatIndex, seatBaseCallSiteKey(site.callSiteKey)]);
  return createHash("sha256").update(canonical, "utf8").digest().readUIntBE(0, 6);
}

/**
 * Final review I2 — WHERE A MULTI-SEAT ROLE STARTS AT ONE NODE. The runner calls
 * at most `panel_size - 1` judges per node (DR-184-v5's per-node count), and it
 * used to take the FIRST eligible seats every time: with every judge seat
 * eligible at every node (non-debating judges, which R5 prefers), the last seat
 * the drawer lists never judged, and the cost estimate spread its share over a
 * seat that never worked. Each node now starts at this offset instead.
 *
 * Built the way `seatSiteOrdinal` is — the first 48 bits of sha256 over
 * canonical JSON of the run, the role and the node's BASE call-site key (a seat
 * marker, if one slipped in, is stripped) — plus a fixed tag, so it is never the
 * 80-20 ordinal of any seat at the same site. It is a PURE FUNCTION OF THE SITE:
 * a resumed pass, on a fresh book and in any visit order, starts every node
 * exactly where the first pass did, and the choice never depends on what an
 * earlier node did. Across nodes the start moves, so every seat serves.
 */
export function seatRotationOffset(site: {
  readonly runId: string | null;
  readonly role: DebateRole;
  readonly callSiteKey: string;
}): number {
  const canonical = JSON.stringify([site.runId ?? "", site.role, "SEAT_ROTATION", seatBaseCallSiteKey(site.callSiteKey)]);
  return createHash("sha256").update(canonical, "utf8").digest().readUIntBE(0, 6);
}

/**
 * Final review I2 — WHICH SEATS ONE NODE CALLS: going round the role's seats in
 * book order from `offset` (modulo their count), the first `cap` eligible ones.
 * The result is per seat, in book order, so a caller keeps the seats it calls in
 * the order it always used. When the cap does not bind — every eligible seat
 * fits, as on the legacy book — every eligible seat is chosen, whatever the offset.
 */
export function rotatedSeatSelection(eligible: readonly boolean[], cap: number, offset: number): readonly boolean[] {
  const count = eligible.length;
  const selected = eligible.map(() => false);
  let taken = 0;
  for (let step = 0; step < count && taken < cap; step += 1) {
    const index = (offset + step) % count;
    if (eligible[index] === true) {
      selected[index] = true;
      taken += 1;
    }
  }
  return Object.freeze(selected);
}

/**
 * Final review I2 (REVIEWER) — the role's seats in the order one node tries
 * them: starting at `offset` (modulo their count) and wrapping round. The
 * review rotation (`selectDifferentMakerReviewer`) takes the first seat whose
 * maker differs from the latest reviewer's, so an unrotated list could leave a
 * listed seat idle for a whole run (two reviewer seats of one maker, or a third
 * seat behind two that alternate); a site-pure start lets every seat serve.
 */
export function rotateSeats<T>(seats: readonly T[], offset: number): readonly T[] {
  if (seats.length === 0) return Object.freeze([]);
  const start = offset % seats.length;
  return Object.freeze([...seats.slice(start), ...seats.slice(0, start)]);
}

/**
 * A16c — the member R3's 80-20 split PLANS for one call site: the pinned
 * seat's choice at the site's ordinal (`seatSiteOrdinal`, or the explicit one a
 * synthesis call passes), read off the CLAIMED seat's share — exactly the member
 * `createSeatCaller` puts first when no resumed-pass preference, down mark or
 * fairness rule intervenes. A seat with no runner-up plans its only member.
 */
export function plannedSeatSlot(
  seat: RunSeat,
  callSiteKey: string,
  options: { readonly runId: string | null; readonly ordinal?: number }
): SeatSlot {
  if (seat.runnerUp === null || seat.pinned === null) return seat.main.pinnedAs;
  return selectSeatCandidate(
    { ...seat.pinned, diversityShare: seat.diversityShare },
    options.ordinal ?? seatSiteOrdinal({
      runId: options.runId, role: seat.role, pinnedSeatIndex: seat.pinnedSeatIndex, callSiteKey
    })
  ).via;
}

/**
 * A15/A16: every seat call goes through here.
 *
 * R3 — THE 80-20 SPLIT. A seat with a runner-up and a share sends a
 * deterministic share of its sites to the runner-up: `selectSeatCandidate`
 * reads the site's own ordinal (`seatSiteOrdinal`), or an explicit one (the
 * synthesis roles pass `seatSiteOrdinal` over their role's run-level site —
 * A16c, carry 16). The split only ORDERS the
 * members the call's fairness rule leaves (A15d's spent slot, restored root
 * writer, maker rules); it never adds one. A seat without a runner-up — every
 * legacy seat and every cross-exchange seat, which mirrors its root's writer —
 * never splits and has no backup.
 *
 * R4 — THE BACKUP. The runner-up is ALSO the main's backup, and the main the
 * runner-up's. A call whose member fails with a switching cause
 * (`seatFailureCause`) is answered by the other eligible member, under that
 * member's OWN key, inside the same sequence and with the same allowance; the
 * switch is recorded (and `onSwitch` awaited) BEFORE that member is called,
 * and the failed member stays down for the rest of this pass. Down marks live
 * in memory only (DR-184-v5 says so): what binds across restarts is the
 * ledger's per-key count.
 *
 * DR-184-v5 — ONE BACKUP SEQUENCE PER SITE. A site called AGAIN on this pass
 * is the cooldown's post-cooldown final retry, and it never switches: a
 * backup reached on the retry would open a fresh key at `judge + final`, one
 * sequence above v5's `2 * judge + final`. It goes back to the member that ran
 * the site's first sequence, under that member's already-used key, so the
 * retry adds only that key's remainder (`judge + final` to ONE key) — unless a
 * usage cap downed that member (R4: cap → switch NOW; A16a fix round 1): then
 * the retry goes to the OTHER member, never the capped key, and the site
 * spends `k + judge + final` with the capped key's `k <= judge` attempts. `plan`
 * called between the sequences names the member the retry goes to, and
 * `cooldownAttempt` asks the ledger about THAT member's other key before
 * granting it (A15d carry 3). When every eligible member is down at a site not
 * called before, the preferred one is called under its own key.
 *
 * A16a fix round 1 — `prefer`: a resumed pass passes the slot the ledger says
 * answered the site; it goes first in place of the 80-20 choice, and the other
 * member stays its backup.
 *
 * A15b fix round 1 (M5): a bare-key caller records every member of a seat
 * under ONE key, so a main and its runner-up would share one per-key allowance
 * and one lineage row; such a caller refuses a two-member seat.
 *
 * A16c — DISCLOSURE. A `ledgerMove` the runner passes (a resumed pass's own
 * hand-off, carry 8c) is recorded and announced before the other member is
 * called, once per seat slot per pass, never on a post-cooldown retry. Every
 * answer given by a member other than the one the ASSIGNMENT planned for the
 * site — the pinned seat's own share, so a runner-up absent at claim still owns
 * its sites — is a `BackupAnswer`, unless the call's fairness rule (`fair`)
 * barred the planned member.
 */
export function createSeatCaller(options: SeatCallerOptions): SeatCaller {
  const answeredRefs = new Map<DebateRole, string[]>();
  const switchRecords: BackupSwitchRecord[] = [...(options.claimSwitches ?? [])];
  const backupAnswerRecords: BackupAnswer[] = [];
  const runId = options.runId ?? null;
  // Pre-flight fix F12: why each downed slot went down, and which slots a switch record already names.
  const downFailures = new Map<string, Readonly<{ cause: BackupSwitchCause; callSiteKey: string }>>();
  const switchedFrom = new Set<string>();
  // The slot that ran each site's first sequence on this pass (DR-184-v5, above).
  const firstSlotAt = new Map<string, SeatSlot>();
  const always = (): boolean => true;
  const seatId = (seat: RunSeat): string => `${seat.role}#${String(seat.pinnedSeatIndex)}`;
  const slotId = (seat: RunSeat, member: SeatMember): string => `${seatId(seat)}#${member.pinnedAs}`;
  const siteId = (seat: RunSeat, callSiteKey: string): string => `${seatId(seat)}@${seatBaseCallSiteKey(callSiteKey)}`;
  const isDown = (seat: RunSeat, member: SeatMember): boolean => downFailures.has(slotId(seat, member));
  const keyOf = (input: Pick<SeatCall<unknown>, "callSiteKey" | "keyFor">, member: SeatMember): string => {
    const base = input.keyFor?.(member) ?? input.callSiteKey;
    return options.assigned ? seatCallSiteKey(base, member.pinnedAs === "MAIN" ? "main" : "runnerUp") : base;
  };
  /** The seat's members this call may use, in the order R3 prefers them. */
  const ordered = (seat: RunSeat, callSiteKey: string, plan: SeatPlanOptions): readonly SeatMember[] => {
    if (!options.assigned && seat.runnerUp !== null) {
      throw new TypedDomainError(
        "CALL_SITE_SEAT_MARKER_REQUIRED",
        `${seat.role} seat ${String(seat.pinnedSeatIndex)} has a runner-up, so its calls need a seat marker; this caller records bare keys`
      );
    }
    const eligible = plan.eligible ?? always;
    if (seat.runnerUp === null) return [seat.main].filter(eligible);
    // A16a fix round 1: a slot the ledger restores goes first; the other stays its backup.
    // Otherwise the CLAIMED seat's share decides (M2: no runner-up, no share); the pinned seat only names the candidates.
    const toRunnerUp = plan.prefer !== undefined
      ? plan.prefer === "RUNNER_UP"
      : plannedSeatSlot(seat, callSiteKey, { runId, ...(plan.ordinal === undefined ? {} : { ordinal: plan.ordinal }) }) === "RUNNER_UP";
    return (toRunnerUp ? [seat.runnerUp, seat.main] : [seat.main, seat.runnerUp]).filter(eligible);
  };
  const cappedAt = (seat: RunSeat, member: SeatMember): boolean =>
    downFailures.get(slotId(seat, member))?.cause === "USAGE_CAP";
  /**
   * The member this call calls first. A site's retry goes back to the member
   * that ran its first sequence — unless a usage cap downed that member (R4:
   * "cap → switch NOW"): then the other member takes the retry and the capped
   * key is never called again. Any other call takes the first member up.
   */
  const firstOf = (seat: RunSeat, callSiteKey: string, members: readonly SeatMember[]): SeatMember | undefined => {
    const firstSlot = firstSlotAt.get(siteId(seat, callSiteKey));
    const siteFirst = firstSlot === undefined ? undefined : members.find((member) => member.pinnedAs === firstSlot);
    if (siteFirst !== undefined) {
      return cappedAt(seat, siteFirst)
        ? members.find((member) => member !== siteFirst && !cappedAt(seat, member)) ?? siteFirst
        : siteFirst;
    }
    return members.find((member) => !isDown(seat, member)) ?? members[0];
  };
  return Object.freeze({
    plan: (seat: RunSeat, callSiteKey: string, planOptions: SeatPlanOptions = {}) =>
      firstOf(seat, callSiteKey, ordered(seat, callSiteKey, planOptions)) ?? null,
    callSeat: async <T>(input: SeatCall<T>): Promise<SeatAnswer<T>> => {
      const members = ordered(input.seat, input.callSiteKey, {
        ...(input.eligible === undefined ? {} : { eligible: input.eligible }),
        ...(input.ordinal === undefined ? {} : { ordinal: input.ordinal }),
        ...(input.prefer === undefined ? {} : { prefer: input.prefer })
      });
      const first = firstOf(input.seat, input.callSiteKey, members);
      if (first === undefined) {
        throw new TypedDomainError(
          "DEBATE_MAKER_UNRESOLVED",
          `${input.seat.role} seat ${String(input.seat.pinnedSeatIndex)} has no member eligible to answer ${input.callSiteKey}`
        );
      }
      const site = siteId(input.seat, input.callSiteKey);
      const retry = firstSlotAt.has(site);
      if (!retry) firstSlotAt.set(site, first.pinnedAs);
      // A16c: the member the ASSIGNMENT planned here (its own share), and whether the call's fairness rule allows it.
      const pinned = options.assigned ? input.seat.pinned : null;
      const plannedVia = pinned === null ? null : selectSeatCandidate(pinned, input.ordinal ?? seatSiteOrdinal({
        runId, role: input.seat.role, pinnedSeatIndex: input.seat.pinnedSeatIndex, callSiteKey: input.callSiteKey
      })).via;
      const plannedCandidate = pinned === null ? null : plannedVia === "RUNNER_UP" ? pinned.runnerUp : pinned.main;
      const plannedIsFair = plannedCandidate !== null && (input.fair?.(plannedCandidate) ?? true);
      const answer = async (member: SeatMember): Promise<SeatAnswer<T>> => {
        const callSiteKey = keyOf(input, member);
        const value = await input.call(member, callSiteKey);
        answeredRefs.set(input.seat.role, [...(answeredRefs.get(input.seat.role) ?? []), member.providerRef]);
        if (plannedVia !== null && plannedIsFair && member.pinnedAs !== plannedVia) {
          backupAnswerRecords.push(Object.freeze({
            role: input.seat.role,
            seatIndex: input.seat.pinnedSeatIndex,
            callSiteKey,
            plannedSlot: plannedVia,
            answeredSlot: member.pinnedAs,
            providerRef: member.providerRef
          }));
        }
        return Object.freeze({ value, member, callSiteKey });
      };
      const recordSwitch = async (
        from: SeatMember,
        to: SeatMember,
        cause: BackupSwitchCause,
        failedKey: string
      ): Promise<void> => {
        const record: BackupSwitchRecord = Object.freeze({
          role: input.seat.role,
          seatIndex: input.seat.pinnedSeatIndex,
          fromProviderRef: from.providerRef,
          fromCandidateId: from.candidate?.candidateId ?? null,
          toProviderRef: to.providerRef,
          toCandidateId: to.candidate?.candidateId ?? null,
          cause,
          callSiteKey: failedKey
        });
        switchRecords.push(record);
        switchedFrom.add(slotId(input.seat, from));
        await options.onSwitch?.(record);
      };
      // Pre-flight fix F12: a member marked down on a call its other member could
      // not take (a fairness rule barred it) has no switch record yet. The first
      // call that skips it IS the switch: record and announce it before the other
      // member answers, so no backup ever answers undisclosed.
      const skipped = members[0];
      if (skipped !== undefined && skipped !== first && !switchedFrom.has(slotId(input.seat, skipped))) {
        const downed = downFailures.get(slotId(input.seat, skipped));
        if (downed !== undefined) await recordSwitch(skipped, first, downed.cause, downed.callSiteKey);
      }
      // A16c (carry 8c): a resumed pass's own hand-off, made through the ledger — recorded and
      // announced before the other member answers, once per seat slot per pass, never on a retry.
      const moved = input.ledgerMove;
      if (!retry && moved !== undefined && first.pinnedAs !== moved.from) {
        const from = [input.seat.main, input.seat.runnerUp]
          .find((member): member is SeatMember => member !== null && member.pinnedAs === moved.from);
        if (from !== undefined && !switchedFrom.has(slotId(input.seat, from))) {
          await recordSwitch(from, first, "SPENT_ON_EARLIER_PASS", moved.callSiteKey);
        }
      }
      /** R4: a member that fails with a switching cause stays down for the rest of this pass. */
      const failed = (member: SeatMember, error: unknown): BackupSwitchCause | null => {
        const cause = seatFailureCause(error);
        if (cause !== null && !isDown(input.seat, member)) {
          downFailures.set(slotId(input.seat, member), Object.freeze({ cause, callSiteKey: keyOf(input, member) }));
        }
        return cause;
      };
      try {
        return await answer(first);
      } catch (error) {
        const cause = failed(first, error);
        if (cause === null) throw error;
        // DR-184-v5: the post-cooldown retry belongs to ONE key; it never opens the backup's.
        if (retry) throw error;
        const second = members.find((member) => member !== first && !isDown(input.seat, member));
        if (second === undefined) throw error;
        await recordSwitch(first, second, cause, keyOf(input, first));
        try {
          return await answer(second);
        } catch (backupError) {
          // The backup's own failure leaves as it arrived; it is down too, so the
          // seat's later sites call its preferred member under that member's key.
          failed(second, backupError);
          throw backupError;
        }
      }
    },
    answered: (role: DebateRole) => Object.freeze([...(answeredRefs.get(role) ?? [])]),
    switches: () => Object.freeze([...switchRecords]),
    backupAnswers: () => Object.freeze([...backupAnswerRecords])
  });
}

/**
 * A16c (owner rule; controller carries 10 and 15) — WHAT THE ANSWER DRAWER
 * SHOWS END USERS for BACKUP-MODEL-USED. `AnswerHonestyDrawer` renders a
 * record's scope, subject, reason and lift path word for word, so these are
 * plain words only: no seat, role, runner-up, route, call-site key or cause
 * code. Those live on the ledger rows and in the progress stream's switch
 * events, the owner/admin side. Each kind has its own subject, because the
 * drawer keys its list on mark + subject. English, like every condition-mark
 * text today; the owners choose the final wording (three phrasings per
 * sentence in the A16c report).
 */
export const BACKUP_MODEL_USED_WORDING = Object.freeze({
  /**
   * A planned model was replaced: a main answered by its runner-up (during a
   * call, at claim or on a resumed pass), or a role whose planned models were
   * all unavailable, answered by the debaters. Final review m1: "could not be
   * used", never "unavailable" — a main whose key reached its bound with only
   * OK answers on resumed passes is handed over too, and it was never down.
   */
  STAND_IN: Object.freeze({
    subject: "Planned AI models",
    reason: "One or more AI models planned for this debate could not be used, so other AI models answered in their place.",
    liftPath: "Ask again later to give the planned AI models another chance."
  }),
  /** Carry 12: a runner-up the 80-20 split chose for a call could not be used, so the main answered it. */
  USUAL: Object.freeze({
    subject: "Extra AI model",
    reason: "An AI model chosen to add variety to this debate could not be used, so the usual AI model answered in its place.",
    liftPath: "Ask again later if you want that extra variety."
  })
});

/**
 * A16c (R6; carries 8, 12, 15) — the answer's BACKUP-MODEL-USED records, one per
 * KIND of stand-in this answer's content came from, whatever its terminal.
 * Aggregated per run, never per switch: the user-facing text may name nothing a
 * per-switch record could tell apart, and the drawer keys on mark + subject.
 * `call_site_key` and the transport outcome stay NULL — migrations 0021/0025
 * refuse them on this mark — so the internals stay in the progress stream.
 */
export function backupModelUsedRecords(
  input: {
    readonly answers: readonly BackupAnswer[];
    /** Roles whose pinned seats were all absent at claim and whose calls the debaters answered (carry 8d). */
    readonly fallbackRoles: readonly string[];
  },
  servedRootNodeId: string
): readonly ConditionMarkRecord[] {
  const record = (wording: (typeof BACKUP_MODEL_USED_WORDING)[keyof typeof BACKUP_MODEL_USED_WORDING]): ConditionMarkRecord =>
    Object.freeze({
      mark: BACKUP_MODEL_USED_MARK,
      scope: "answer" as const,
      subjectRef: wording.subject,
      reason: wording.reason,
      liftPath: wording.liftPath,
      servedRootRule: null,
      affectedNodeIds: Object.freeze([servedRootNodeId]),
      callSiteKey: null,
      terminalTransportOutcome: null
    });
  const standIn = input.fallbackRoles.length > 0 || input.answers.some((answer) => answer.answeredSlot === "RUNNER_UP");
  const usual = input.answers.some((answer) => answer.answeredSlot === "MAIN");
  return Object.freeze([
    ...(standIn ? [record(BACKUP_MODEL_USED_WORDING.STAND_IN)] : []),
    ...(usual ? [record(BACKUP_MODEL_USED_WORDING.USUAL)] : [])
  ]);
}

/** A16 (R4): the progress-stream value for one switch; see `RunRepository.recordBackupSwitchEvent`. */
export function backupSwitchEventValue(record: BackupSwitchRecord): RunBackupSwitchLifecycleValue {
  return Object.freeze({
    state: "BACKUP_MODEL_ENGAGED" as const,
    role: record.role,
    seat_index: record.seatIndex,
    from_provider_ref: record.fromProviderRef,
    to_provider_ref: record.toProviderRef,
    cause: record.cause,
    call_site_key: record.callSiteKey
  });
}

/**
 * A16c (carry 8d): the progress-stream value for a role whose pinned seats
 * were all absent at claim, so the debaters sit in it (`fallbackRoles`).
 */
export function roleFallbackEventValue(
  role: "SUPPORT_ATTACK" | "JUDGE" | "REVIEWER",
  pinnedSeats: readonly RoleSeat[],
  seats: readonly RunSeat[]
): RunRoleFallbackLifecycleValue {
  const routes = (entries: readonly { readonly main: SeatIdentity; readonly runnerUp: SeatIdentity | null }[]): readonly string[] =>
    Object.freeze(entries.flatMap((entry) => entry.runnerUp === null
      ? [entry.main.providerRef]
      : [entry.main.providerRef, entry.runnerUp.providerRef]));
  return Object.freeze({
    state: "ROLE_FELL_BACK_TO_DEBATERS" as const,
    role,
    from_provider_refs: routes(pinnedSeats),
    to_provider_refs: routes(seats),
    cause: "ABSENT_AT_CLAIM" as const
  });
}

/** A16: the one route that answered for BOTH synthesis roles in this run, or null (smallest ref wins). */
export function effectiveSynthesisCollapse(
  writerRefs: readonly string[],
  checkerRefs: readonly string[]
): string | null {
  return [...new Set(writerRefs)].sort().find((ref) => checkerRefs.includes(ref)) ?? null;
}

/**
 * A16: on an assigned run DEGRADED-DIVERSITY is decided by who ACTUALLY
 * answered — a backup can collapse the writer and the checker onto one
 * identity, or undo a collapse the plan predicted. An existing mark keeps its
 * place in the answer's list. The legacy run keeps the sealed-ref rule the
 * serve chain applies (W2 / F-VS11-1) and never reaches this function.
 * A16c: a CRASH answer (components-only, envelope) is returned unchanged — the
 * mark is a property of a served answer, and the serve chain never puts it on
 * a crash class (W2).
 */
export function withEffectiveDegradedDiversity(result: ServeGateResult, collapsedIdentity: string | null): ServeGateResult {
  if ((result.crashClass ?? null) !== null) return result;
  if (collapsedIdentity === null) {
    return {
      ...result,
      conditionMarks: Object.freeze(result.conditionMarks.filter((mark) => mark !== DEGRADED_DIVERSITY_MARK)),
      degradedDiversity: null
    };
  }
  return {
    ...result,
    conditionMarks: result.conditionMarks.includes(DEGRADED_DIVERSITY_MARK)
      ? result.conditionMarks
      : Object.freeze([...result.conditionMarks, DEGRADED_DIVERSITY_MARK]),
    degradedDiversity: Object.freeze({ roles: SYNTHESIS_ROLE_NAMES, identity: collapsedIdentity })
  };
}
