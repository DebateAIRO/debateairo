import { createHash } from "node:crypto";
import { Judge, PanelMemberFailure } from "@debateai/judgement";
import { TypedDomainError, isRunLevelSpendStop, type DebateRole } from "@debateai/kernel";
import {
  PROVIDER_USAGE_CAP,
  ProviderCallFailedError,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import { selectSeatCandidate, type RoleAssignment, type RoleSeat, type SeatCandidate } from "@debateai/scorecard";
import { seatBaseCallSiteKey, seatCallSiteKey } from "@debateai/serve";

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

export type BackupSwitchCause = "TRANSPORT_FAILURE" | "USAGE_CAP" | "ABSENT_AT_CLAIM";

/**
 * One seat moving to its runner-up. Disclosed on the answer as a
 * `BACKUP-MODEL-USED` record, and as a lifecycle event where the run's progress
 * stream may carry one (A16).
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
    return Object.freeze({
      judge: new Judge(provider), provider, providerRef: maker.providerRef, maker: maker.maker, candidate, pinnedAs
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
  /** An explicit 80-20 ordinal (the synthesis roles pass `diversityOrdinalForRun`). */
  readonly ordinal?: number;
  /** A fairness rule a member must pass to answer THIS call (R5). */
  readonly eligible?: (member: SeatMember) => boolean;
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
}

export interface SeatCaller {
  /** The member `callSeat` would call first for this call site, or null when none is eligible. */
  plan(seat: RunSeat, callSiteKey: string, options?: SeatPlanOptions): SeatMember | null;
  callSeat<T>(input: SeatCall<T>): Promise<SeatAnswer<T>>;
  /** The routes that answered this role's calls, in call order. */
  answered(role: DebateRole): readonly string[];
  /** Every switch of this run pass: the ones made at claim, then the ones made during calls. */
  switches(): readonly BackupSwitchRecord[];
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
  /** Called once per switch made during a call, BEFORE the other member is called. */
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
 * A15/A16: every seat call goes through here.
 *
 * R3 — THE 80-20 SPLIT. A seat with a runner-up and a share sends a
 * deterministic share of its sites to the runner-up: `selectSeatCandidate`
 * reads the site's own ordinal (`seatSiteOrdinal`), or an explicit one (the
 * synthesis roles pass `diversityOrdinalForRun`). The split only ORDERS the
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
 * is the cooldown's post-cooldown final retry. It goes back to the member that
 * ran the site's first sequence, under that member's already-used key, so the
 * retry adds only that key's remainder (`judge + final` to ONE key), and it
 * never switches: a backup reached on the retry would open a fresh key at
 * `judge + final`, one sequence above v5's `2 * judge + final`. The member the
 * retry goes to is the one `plan` named before the first sequence, which is
 * the member whose OTHER key `cooldownAttempt` asks the ledger about before
 * granting the retry (A15d carry 3). When every eligible member is down at a
 * site not called before, the preferred one is called under its own key.
 *
 * A15b fix round 1 (M5): a bare-key caller records every member of a seat
 * under ONE key, so a main and its runner-up would share one per-key allowance
 * and one lineage row; such a caller refuses a two-member seat.
 */
export function createSeatCaller(options: SeatCallerOptions): SeatCaller {
  const answeredRefs = new Map<DebateRole, string[]>();
  const switchRecords: BackupSwitchRecord[] = [...(options.claimSwitches ?? [])];
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
    // The CLAIMED seat's share decides (M2: no runner-up, no share); the pinned seat only names the candidates.
    const toRunnerUp = seat.pinned !== null && selectSeatCandidate(
      { ...seat.pinned, diversityShare: seat.diversityShare },
      plan.ordinal ?? seatSiteOrdinal({ runId, role: seat.role, pinnedSeatIndex: seat.pinnedSeatIndex, callSiteKey })
    ).via === "RUNNER_UP";
    return (toRunnerUp ? [seat.runnerUp, seat.main] : [seat.main, seat.runnerUp]).filter(eligible);
  };
  /** The member this call calls first: a site's retry goes back to its first member; else the first one up. */
  const firstOf = (seat: RunSeat, callSiteKey: string, members: readonly SeatMember[]): SeatMember | undefined => {
    const firstSlot = firstSlotAt.get(siteId(seat, callSiteKey));
    return (firstSlot === undefined ? undefined : members.find((member) => member.pinnedAs === firstSlot))
      ?? members.find((member) => !isDown(seat, member))
      ?? members[0];
  };
  return Object.freeze({
    plan: (seat: RunSeat, callSiteKey: string, planOptions: SeatPlanOptions = {}) =>
      firstOf(seat, callSiteKey, ordered(seat, callSiteKey, planOptions)) ?? null,
    callSeat: async <T>(input: SeatCall<T>): Promise<SeatAnswer<T>> => {
      const members = ordered(input.seat, input.callSiteKey, {
        ...(input.eligible === undefined ? {} : { eligible: input.eligible }),
        ...(input.ordinal === undefined ? {} : { ordinal: input.ordinal })
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
      const answer = async (member: SeatMember): Promise<SeatAnswer<T>> => {
        const callSiteKey = keyOf(input, member);
        const value = await input.call(member, callSiteKey);
        answeredRefs.set(input.seat.role, [...(answeredRefs.get(input.seat.role) ?? []), member.providerRef]);
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
    switches: () => Object.freeze([...switchRecords])
  });
}
