import { TypedDomainError } from "@debateai/kernel";
import { CALL_CONCURRENCY_LIMITS, type CallConcurrencyPolicy } from "@debateai/register";

/**
 * Parallel AI calls (spec 2026-10-12 §3.2) — the runner-wide call scheduler.
 *
 * One scheduler per runner process; one lane per debate. A lane opens with its debate's own limits (`openLane`'s
 * `limits`, side-by-side spec §13 runner point 5); opened without them it runs on the policy's two per-debate members.
 * Every model call of a debate passes through its lane and starts only when it fits under every limit:
 *
 *  · the debate's own slots (`perDebate`, from the debate's settings version, side-by-side spec §13 runner point 5),
 *  · the model's slots inside that debate (`perModelPerDebate`, the same source as `perDebate`),
 *  · the model's slots across the whole runner (`perModelPerRunner[vendor]`,
 *    else `perModelPerRunner.default`: the scheduler's own policy, never a debate's),
 *  · for a call through a gate that announced its slots, the gate's slots
 *    (ONE while the gate cannot reach its vendor, spec §3.4),
 *  · and, for a final writer (LG-B) through a gate that announced final-writer
 *    slots, those too: a further final writer waits here, holding no slot, while
 *    the gate's other slots serve every other call.
 *
 * Waiting calls of a debate go author first, then panel, then review, then the
 * rest, each kind in arrival order. Debates take turns (round robin) on each
 * SHARED slot — a model's runner-wide slots, a gate's slots — separately: the
 * debate served longest ago on the slot that is tightest for its call goes
 * first, so one debate cannot starve another however busy a third debate is
 * elsewhere. A call held back only by its own debate's limits never holds back
 * another debate's call. A call made FOR a running call (`runWithin`, the
 * structure repair) goes before every other waiting call.
 *
 * A debate may also give its lane a START GUARD (spec §2.3, O6): asked, synchronously, each time the lane would start
 * one of its calls, whether that call may still start. A call it refuses is never sent; the lane runs on.
 *
 * The scheduler knows nothing about debate shape and touches no database.
 */

export const CALL_LANE_STOPPED = "CALL_LANE_STOPPED" as const;
/** A call the lane's start guard refused (the debate's arguing had stopped): never sent. Never a debate's failure. */
export const CALL_LANE_HELD_BACK = "CALL_LANE_HELD_BACK" as const;
/**
 * The limits a lane was opened with are outside CALL_CONCURRENCY_LIMITS or not whole numbers (side-by-side spec §13):
 * `openLane` throws TypeError with this message, and opens no lane.
 */
export const CALL_LANE_LIMITS_INVALID = "CALL_LANE_LIMITS_INVALID" as const;

export type CallPriority = "AUTHOR" | "PANEL" | "REVIEW" | "OTHER";
export interface CallSubject { readonly model: string; readonly vendor: string; readonly gate: string | null; }
export interface CallTicket extends CallSubject {
  readonly priority: CallPriority;
  /**
   * LG-B (Task 5, fix round 1): the call is a final writer (the preview's final-writer tier, `previewCallTierOf`). Through
   * a gate that announced final-writer slots (`setGateFinalWriterCapacity`) it also needs one of those. Absent: no.
   */
  readonly finalWriter?: true;
}
/** Whether a call may still start; asked synchronously, at the moment the lane would start it. */
export type CallStartGuard = (ticket: CallTicket) => boolean;
/**
 * What a lane counted. LG-A (Task 13 review): a call made for a running call through `runWithin` (a structure repair on
 * a slot it had to take) counts in `calls`, `peakByModel` and `waitedMsByModel` of the model it took; it takes no debate
 * slot, so `running` and `peakInFlight` never count it. A repair that took nothing (Haiku repairing its own reply) and a
 * repair made outside any lane never reach the lane and are counted nowhere here.
 */
export interface LaneStats {
  /** This lane's calls running now (repairs made for them excluded). */
  readonly running: number;
  /** Calls the start guard refused (never sent). */
  readonly heldBack: number;
  /** The most of this lane's calls running at once; repairs excluded (they use their own call's debate slot). */
  readonly peakInFlight: number;
  readonly peakByModel: Readonly<Record<string, number>>;
  readonly waitedMsByModel: Readonly<Record<string, number>>;
  /** Calls started: every `run` call, and every `runWithin` repair that took a slot. */
  readonly calls: number;
}
export interface SchedulerStats {
  readonly peakByGate: Readonly<Record<string, number>>;
  readonly peakByModel: Readonly<Record<string, number>>;
}
export interface DebateCallLane {
  /** How many of this debate's calls may run at once (the lane's own `perDebate`, side-by-side spec §13): 1 is one call at a time. */
  readonly callsAtOnce: number;
  /** Waits for a slot under every limit, runs `call`, always releases. Rejects with TypedDomainError CALL_LANE_STOPPED if the lane is stopped while waiting. */
  run<T>(ticket: CallTicket, call: () => Promise<T>): Promise<T>;
  /**
   * LG-A (the structure-repair call; the owner's parallel-call limits, spec 2026-10-12 §3.2): a call made FOR one of
   * this lane's running calls, by that call's own gateway once its own POST has ended, while it keeps its slot (`held`:
   * the running call's subject). It takes the slots `slotsTakenWithin` names: never a debate slot (the running call's
   * is used), and of the model's and the gate's slots only those the running call does not already hold. So every POST
   * in flight stays under every limit, and the call never waits for a slot its own running call holds (no deadlock: a
   * call that holds the repair model's slots never waits for another). Taking nothing, it runs at once. It is never
   * held back by the start guard: it stands in for a follow-up inside the running call, which no guard is asked about.
   * Rejects with CALL_LANE_STOPPED as `run` does.
   */
  runWithin<T>(held: CallSubject, ticket: CallTicket, call: () => Promise<T>): Promise<T>;
  /** No new call starts; queued calls reject CALL_LANE_STOPPED; running calls are not touched. Idempotent. */
  stop(): void;
  /**
   * Installs this lane's start guard (`null` removes it). Every time the lane would start one of its calls — a call
   * arriving, or a waiting call when a slot frees — it first asks the guard: a call the guard refuses is never sent and
   * rejects with TypedDomainError CALL_LANE_HELD_BACK, and the rest of the lane runs on. Running calls are not touched.
   */
  guardStarts(guard: CallStartGuard | null): void;
  /** Resolves when no call of this lane is running. */
  drained(): Promise<void>;
  /** stop() + forget the lane's queues and counters (call once, at the end of the run). */
  close(): void;
  stats(): LaneStats;
}
export interface CallScheduler {
  /**
   * Opens the lane of one debate. `limits` are that debate's own slots (its settings version's `perDebate` and
   * `perModelPerDebate`, side-by-side spec §13 runner point 5); absent, the scheduler policy's two members. Each must be a
   * whole number inside CALL_CONCURRENCY_LIMITS, else TypeError CALL_LANE_LIMITS_INVALID and no lane opens. The runner-wide
   * `perModelPerRunner` is never a lane's: it stays the scheduler's, and caps every lane together.
   */
  openLane(debateId: string, limits?: Readonly<{ perDebate: number; perModelPerDebate: number }>): DebateCallLane;
  /** The gate's own slots (preview /remaining max_concurrent_calls); absent gate = unlimited. */
  setGateCapacity(gate: string, slots: number): void;
  /**
   * LG-B (Task 5, fix round 1): how many final writers the gate takes at once (preview /remaining
   * final_writer_max_in_flight). Never set (a gate that names none): final writers take only the gate's own slots.
   */
  setGateFinalWriterCapacity(gate: string, slots: number): void;
  /** While unhealthy a gate admits ONE call in flight (spec §3.4). */
  markGateUnhealthy(gate: string): void;
  markGateHealthy(gate: string): void;
  stats(): SchedulerStats;
}

const PRIORITY_RANK: Readonly<Record<CallPriority, number>> = Object.freeze({ AUTHOR: 0, PANEL: 1, REVIEW: 2, OTHER: 3 });
/** A call made for a running call (`runWithin`) ranks ahead of every `run` call, in its lane and across the lanes. */
const WITHIN_RANK = -1;

/** The kind of call a call-site key names: the judge's review calls, panel calls, the judge's own (author) calls, the rest. */
export function callPriorityOf(callSiteKey: string): CallPriority {
  if (callSiteKey.startsWith("JUDGE:review:")) return "REVIEW";
  if (callSiteKey.startsWith("PANEL:")) return "PANEL";
  if (callSiteKey === "JUDGE" || callSiteKey.startsWith("JUDGE:")) return "AUTHOR";
  return "OTHER";
}

/** Which of a call's slots it takes: every call through `run` takes all three; a call through `runWithin` fewer. */
export type SlotsTaken = Readonly<{ debate: boolean; model: boolean; gate: boolean }>;
const EVERY_SLOT: SlotsTaken = Object.freeze({ debate: true, model: true, gate: true });

/** The slots a call made for a running call takes (`DebateCallLane.runWithin`): only those the running call does not hold. */
export function slotsTakenWithin(held: CallSubject, subject: CallSubject): SlotsTaken {
  return Object.freeze({
    debate: false,
    model: held.model !== subject.model,
    gate: subject.gate !== null && held.gate !== subject.gate
  });
}

type Waiting = Readonly<{
  ticket: CallTicket;
  takes: SlotsTaken;
  rank: number;
  queuedAt: number;
  launch: (release: () => void) => void;
  fail: (error: unknown) => void;
}>;

type Lane = {
  readonly debateId: string;
  /** The debate's own slots, fixed when the lane opens (`openLane`'s limits, or the policy's two members when absent). */
  readonly limits: Readonly<{ perDebate: number; perModelPerDebate: number }>;
  stopped: boolean;
  running: number;
  readonly runningByModel: Map<string, number>;
  readonly waiting: Waiting[];
  readonly drainWaiters: Array<() => void>;
  /** The start guard (`guardStarts`); null: every call may start. */
  guard: CallStartGuard | null;
  heldBack: number;
  peakInFlight: number;
  readonly peakByModel: Map<string, number>;
  readonly waitedMsByModel: Map<string, number>;
  calls: number;
  /** Shared slot ("model:…" / "gate:…") → the serve tick of this lane's latest call that took it. */
  readonly lastServedOn: Map<string, number>;
};

function bump(counts: Map<string, number>, key: string): number {
  const next = (counts.get(key) ?? 0) + 1;
  counts.set(key, next);
  return next;
}

function drop(counts: Map<string, number>, key: string): void {
  const next = (counts.get(key) ?? 0) - 1;
  if (next > 0) counts.set(key, next);
  else counts.delete(key);
}

function raisePeak(peaks: Map<string, number>, key: string, value: number): void {
  if (value > (peaks.get(key) ?? 0)) peaks.set(key, value);
}

function frozenRecord(counts: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(counts));
}

function laneStoppedError(debateId: string): TypedDomainError {
  return new TypedDomainError(CALL_LANE_STOPPED, `The call lane of debate ${debateId} is stopped; the call was not sent`);
}

function heldBackError(debateId: string): TypedDomainError {
  return new TypedDomainError(CALL_LANE_HELD_BACK, `The arguing of debate ${debateId} has stopped; the call was not sent`);
}

/** The guard's answer; a guard that throws refuses (a call is never sent on a question that could not be answered). */
function mayStart(guard: CallStartGuard, ticket: CallTicket): boolean {
  try {
    return guard(ticket);
  } catch {
    return false;
  }
}

/** Takes every waiting call the lane's start guard now refuses out of its queue, and refuses it, unsent. */
function holdBackRefused(lane: Lane): void {
  const guard = lane.guard;
  if (guard === null) return;
  for (let index = 0; index < lane.waiting.length;) {
    const entry = lane.waiting[index]!;
    // A call made for a running call (`runWithin`) is never held back.
    if (!entry.takes.debate || mayStart(guard, entry.ticket)) {
      index += 1;
      continue;
    }
    lane.waiting.splice(index, 1);
    lane.heldBack += 1;
    entry.fail(heldBackError(lane.debateId));
  }
}

export function createCallScheduler(input: Readonly<{ policy: CallConcurrencyPolicy; now?: () => number }>): CallScheduler {
  const { policy } = input;
  const now = input.now ?? (() => performance.now());

  const lanes: Lane[] = [];
  let serveTick = 0;

  const runnerRunningByModel = new Map<string, number>();
  const runnerPeakByModel = new Map<string, number>();
  const gateRunning = new Map<string, number>();
  const gatePeak = new Map<string, number>();
  const gateCapacity = new Map<string, number>();
  const unhealthyGates = new Set<string>();
  const gateFinalWriterRunning = new Map<string, number>();
  const gateFinalWriterCapacity = new Map<string, number>();

  const runnerCapFor = (vendor: string): number =>
    Object.hasOwn(policy.perModelPerRunner, vendor) ? policy.perModelPerRunner[vendor]! : policy.perModelPerRunner.default;

  const gateLimitFor = (gate: string): number => {
    if (unhealthyGates.has(gate)) return 1;
    return gateCapacity.get(gate) ?? Number.POSITIVE_INFINITY;
  };

  /** The gate whose final-writer slots this call takes (a final writer through a gate that announced them), else null. */
  const finalWriterGateOf = (ticket: CallTicket, takes: SlotsTaken): string | null =>
    takes.gate && ticket.finalWriter === true && ticket.gate !== null && gateFinalWriterCapacity.has(ticket.gate) ? ticket.gate : null;

  const admissible = (lane: Lane, entry: Waiting): boolean => {
    const { ticket, takes } = entry;
    const finalWriterGate = finalWriterGateOf(ticket, takes);
    return (!takes.debate || lane.running < lane.limits.perDebate)
      && (!takes.model || ((lane.runningByModel.get(ticket.model) ?? 0) < lane.limits.perModelPerDebate
        && (runnerRunningByModel.get(ticket.model) ?? 0) < runnerCapFor(ticket.vendor)))
      && (!takes.gate || ticket.gate === null || (gateRunning.get(ticket.gate) ?? 0) < gateLimitFor(ticket.gate))
      && (finalWriterGate === null
        || (gateFinalWriterRunning.get(finalWriterGate) ?? 0) < gateFinalWriterCapacity.get(finalWriterGate)!);
  };

  type SharedSlot = Readonly<{ key: string; headroom: number }>;
  const sharedSlotsOf = (ticket: CallTicket, takes: SlotsTaken): SharedSlot[] => {
    const slots: SharedSlot[] = takes.model ? [{
      key: `model:${ticket.model}`,
      headroom: runnerCapFor(ticket.vendor) - (runnerRunningByModel.get(ticket.model) ?? 0)
    }] : [];
    if (takes.gate && ticket.gate !== null) {
      slots.push({ key: `gate:${ticket.gate}`, headroom: gateLimitFor(ticket.gate) - (gateRunning.get(ticket.gate) ?? 0) });
    }
    // LG-B: debates take turns on a gate's final-writer slots too.
    const finalWriterGate = finalWriterGateOf(ticket, takes);
    if (finalWriterGate !== null) {
      slots.push({ key: `final-writer:${finalWriterGate}`,
        headroom: gateFinalWriterCapacity.get(finalWriterGate)! - (gateFinalWriterRunning.get(finalWriterGate) ?? 0) });
    }
    return slots;
  };

  /**
   * Whose turn it is: when this lane was last served on the shared slot its call is shortest of (the most recent such
   * serve when two are equally short). Never served = -1. Lower goes first.
   */
  const turnOf = (lane: Lane, entry: Waiting): number => {
    const slots = sharedSlotsOf(entry.ticket, entry.takes);
    if (slots.length === 0) return -1;
    const tightest = Math.min(...slots.map((slot) => slot.headroom));
    return Math.max(...slots.filter((slot) => slot.headroom === tightest).map((slot) => lane.lastServedOn.get(slot.key) ?? -1));
  };

  const start = (lane: Lane, index: number): void => {
    const [entry] = lane.waiting.splice(index, 1);
    const { model, gate } = entry!.ticket;
    const { takes } = entry!;
    // Read once at the start: the slot taken here is the one released, whatever is announced meanwhile.
    const finalWriterGate = finalWriterGateOf(entry!.ticket, takes);

    if (takes.debate) {
      lane.running += 1;
      lane.peakInFlight = Math.max(lane.peakInFlight, lane.running);
    }
    if (takes.model) {
      raisePeak(lane.peakByModel, model, bump(lane.runningByModel, model));
      raisePeak(runnerPeakByModel, model, bump(runnerRunningByModel, model));
    }
    if (takes.gate && gate !== null) raisePeak(gatePeak, gate, bump(gateRunning, gate));
    if (finalWriterGate !== null) bump(gateFinalWriterRunning, finalWriterGate);
    lane.calls += 1;
    serveTick += 1;
    for (const slot of sharedSlotsOf(entry!.ticket, takes)) lane.lastServedOn.set(slot.key, serveTick);
    lane.waitedMsByModel.set(model, (lane.waitedMsByModel.get(model) ?? 0) + Math.max(0, now() - entry!.queuedAt));

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      if (takes.debate) lane.running -= 1;
      if (takes.model) {
        drop(lane.runningByModel, model);
        drop(runnerRunningByModel, model);
      }
      if (takes.gate && gate !== null) drop(gateRunning, gate);
      if (finalWriterGate !== null) drop(gateFinalWriterRunning, finalWriterGate);
      if (takes.debate && lane.running === 0) for (const resolve of lane.drainWaiters.splice(0)) resolve();
      pump();
    };
    entry!.launch(release);
  };

  /**
   * Starts admissible waiting calls one at a time until none fits: each lane offers its first admissible call (priority,
   * then arrival); the lane whose turn it is (`turnOf`, then the older lane) starts it. A call started here may call back
   * into the scheduler; that re-entrant `pump` returns at once and the next scan of this loop sees what it changed.
   */
  let pumping = false;
  const pump = (): void => {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        let chosen: Readonly<{ lane: Lane; index: number; turn: number; within: boolean }> | null = null;
        for (const lane of lanes) {
          if (lane.stopped) continue;
          // Spec §2.3 (O6): the debate's start guard is asked before any of its waiting calls may start.
          holdBackRefused(lane);
          const index = lane.waiting.findIndex((entry) => admissible(lane, entry));
          if (index < 0) continue;
          const turn = turnOf(lane, lane.waiting[index]!);
          // A call made for a running call (`runWithin`) takes a freed slot before any lane's `run` call; among the
          // `run` calls (and among those made for running calls) the turns decide, as before.
          const within = !lane.waiting[index]!.takes.debate;
          if (chosen === null || (within && !chosen.within) || (within === chosen.within && turn < chosen.turn)) {
            chosen = { lane, index, turn, within };
          }
        }
        if (chosen === null) return;
        start(chosen.lane, chosen.index);
      }
    } finally {
      pumping = false;
    }
  };

  /**
   * A lane's own slots: the debate's limits as given, each a whole number inside CALL_CONCURRENCY_LIMITS (refused otherwise,
   * before any lane opens); absent, the scheduler policy's two members. Copied, so a later change to the caller's object
   * never reaches the lane (side-by-side spec §13 runner point 5).
   */
  const laneLimitsOf = (limits: Readonly<{ perDebate: number; perModelPerDebate: number }> | undefined): Lane["limits"] => {
    if (limits === undefined) return Object.freeze({ perDebate: policy.perDebate, perModelPerDebate: policy.perModelPerDebate });
    const whole = (value: number, max: number): boolean => Number.isInteger(value) && value >= 1 && value <= max;
    if (!whole(limits.perDebate, CALL_CONCURRENCY_LIMITS.perDebateMax)
      || !whole(limits.perModelPerDebate, CALL_CONCURRENCY_LIMITS.perModelPerDebateMax)) {
      throw new TypeError(CALL_LANE_LIMITS_INVALID);
    }
    return Object.freeze({ perDebate: limits.perDebate, perModelPerDebate: limits.perModelPerDebate });
  };

  const openLane = (debateId: string, limits?: Readonly<{ perDebate: number; perModelPerDebate: number }>): DebateCallLane => {
    const laneLimits = laneLimitsOf(limits);
    const lane: Lane = {
      debateId,
      limits: laneLimits,
      stopped: false,
      running: 0,
      runningByModel: new Map(),
      waiting: [],
      drainWaiters: [],
      guard: null,
      heldBack: 0,
      peakInFlight: 0,
      peakByModel: new Map(),
      waitedMsByModel: new Map(),
      calls: 0,
      lastServedOn: new Map()
    };
    lanes.push(lane);

    const stop = (): void => {
      if (lane.stopped) return;
      lane.stopped = true;
      for (const entry of lane.waiting.splice(0)) entry.fail(laneStoppedError(lane.debateId));
      pump();
    };

    /** Queues a call that takes `takes` of its slots (every call: EVERY_SLOT; `runWithin`: fewer). */
    const enqueue = <T>(ticket: CallTicket, takes: SlotsTaken, call: () => Promise<T>): Promise<T> => {
      if (lane.stopped) return Promise.reject(laneStoppedError(lane.debateId));
      return new Promise<T>((resolve, reject) => {
        const entry: Waiting = Object.freeze({
          ticket,
          takes,
          // Task 13 review: a call made for a running call goes first (it sits on that call's held slot).
          rank: takes.debate ? PRIORITY_RANK[ticket.priority] : WITHIN_RANK,
          queuedAt: now(),
          launch: (release: () => void) => {
            let settled: Promise<T>;
            try {
              settled = Promise.resolve(call());
            } catch (error) {
              settled = Promise.reject(error);
            }
            settled.then(
              (value) => { release(); resolve(value); },
              (error: unknown) => { release(); reject(error); }
            );
          },
          fail: reject
        });
        // Kept sorted by [priority, arrival]: a newcomer goes after every call of its own or a higher priority.
        const at = lane.waiting.findIndex((other) => other.rank > entry.rank);
        lane.waiting.splice(at < 0 ? lane.waiting.length : at, 0, entry);
        pump();
      });
    };

    return Object.freeze({
      callsAtOnce: laneLimits.perDebate,
      run<T>(ticket: CallTicket, call: () => Promise<T>): Promise<T> {
        return enqueue(ticket, EVERY_SLOT, call);
      },
      runWithin<T>(held: CallSubject, ticket: CallTicket, call: () => Promise<T>): Promise<T> {
        const takes = slotsTakenWithin(held, ticket);
        if (!takes.model && !takes.gate) {
          if (lane.stopped) return Promise.reject(laneStoppedError(lane.debateId));
          try { return Promise.resolve(call()); } catch (error) { return Promise.reject(error); }
        }
        return enqueue(ticket, takes, call);
      },
      stop,
      guardStarts(guard: CallStartGuard | null): void {
        lane.guard = guard;
        pump();
      },
      drained(): Promise<void> {
        if (lane.running === 0) return Promise.resolve();
        return new Promise<void>((resolve) => { lane.drainWaiters.push(resolve); });
      },
      close(): void {
        stop();
        const index = lanes.indexOf(lane);
        if (index >= 0) lanes.splice(index, 1);
      },
      stats(): LaneStats {
        return Object.freeze({
          running: lane.running,
          heldBack: lane.heldBack,
          peakInFlight: lane.peakInFlight,
          peakByModel: frozenRecord(lane.peakByModel),
          waitedMsByModel: frozenRecord(lane.waitedMsByModel),
          calls: lane.calls
        });
      }
    });
  };

  return Object.freeze({
    openLane,
    setGateCapacity(gate: string, slots: number): void {
      gateCapacity.set(gate, slots);
      pump();
    },
    setGateFinalWriterCapacity(gate: string, slots: number): void {
      gateFinalWriterCapacity.set(gate, slots);
      pump();
    },
    markGateUnhealthy(gate: string): void {
      unhealthyGates.add(gate);
    },
    markGateHealthy(gate: string): void {
      unhealthyGates.delete(gate);
      pump();
    },
    stats(): SchedulerStats {
      return Object.freeze({ peakByGate: frozenRecord(gatePeak), peakByModel: frozenRecord(runnerPeakByModel) });
    }
  });
}
