import { Judge } from "@debateai/judgement";
import { TypedDomainError, type DebateRole } from "@debateai/kernel";
import type { ProviderCallRequest, ProviderGateway } from "@debateai/providers";
import type { RoleAssignment, RoleSeat, SeatCandidate } from "@debateai/scorecard";
import { seatCallSiteKey } from "@debateai/serve";

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
    droppedPositionSeats: Object.freeze(droppedPositionSeats),
    unavailableSynthesis: Object.freeze(unavailableSynthesis)
  });
}

export interface SeatCall<T> {
  readonly seat: RunSeat;
  /** The call site WITHOUT a seat marker: the ordinal memo and the cooldown/hold records name it. */
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
}

/**
 * A15: every seat call goes through here. This version calls the first
 * eligible member (the main, else the runner-up); A16 adds the 80-20 split and
 * the backup.
 *
 * DR-184-v5 is exact only if a call site's eligible members, their order and
 * the main-vs-runner-up choice are the SAME on every run pass, a resumed one
 * included (controller ruling A14). So the member is a pure function of the
 * seat, the call's fairness rule and (from A16) its site: this caller keeps no
 * visit-order counter, and a fresh caller on a resumed pass plans exactly what
 * the first pass did. `answered` is a record for disclosure, never an input to
 * the choice.
 */
export function createSeatCaller(options: { readonly assigned: boolean }): SeatCaller {
  const answeredRefs = new Map<DebateRole, string[]>();
  const always = (): boolean => true;
  const keyOf = (input: Pick<SeatCall<unknown>, "callSiteKey" | "keyFor">, member: SeatMember): string => {
    const base = input.keyFor?.(member) ?? input.callSiteKey;
    return options.assigned ? seatCallSiteKey(base, member.pinnedAs === "MAIN" ? "main" : "runnerUp") : base;
  };
  const eligibleMembers = (seat: RunSeat, eligible: (member: SeatMember) => boolean): readonly SeatMember[] => {
    // A15b fix round 1 (M5): a bare-key caller records every member of a seat
    // under ONE key, so a main and its runner-up would share one per-key
    // allowance and one lineage row. Such a caller refuses a two-member seat.
    if (!options.assigned && seat.runnerUp !== null) {
      throw new TypedDomainError(
        "CALL_SITE_SEAT_MARKER_REQUIRED",
        `${seat.role} seat ${String(seat.pinnedSeatIndex)} has a runner-up, so its calls need a seat marker; this caller records bare keys`
      );
    }
    return (seat.runnerUp === null ? [seat.main] : [seat.main, seat.runnerUp]).filter(eligible);
  };
  return Object.freeze({
    plan: (seat: RunSeat, _callSiteKey: string, planOptions: SeatPlanOptions = {}) =>
      eligibleMembers(seat, planOptions.eligible ?? always)[0] ?? null,
    callSeat: async <T>(input: SeatCall<T>): Promise<SeatAnswer<T>> => {
      const member = eligibleMembers(input.seat, input.eligible ?? always)[0];
      if (member === undefined) {
        throw new TypedDomainError(
          "DEBATE_MAKER_UNRESOLVED",
          `${input.seat.role} seat ${String(input.seat.pinnedSeatIndex)} has no member eligible to answer ${input.callSiteKey}`
        );
      }
      const callSiteKey = keyOf(input, member);
      const value = await input.call(member, callSiteKey);
      answeredRefs.set(input.seat.role, [...(answeredRefs.get(input.seat.role) ?? []), member.providerRef]);
      return Object.freeze({ value, member, callSiteKey });
    },
    answered: (role: DebateRole) => Object.freeze([...(answeredRefs.get(role) ?? [])])
  });
}
