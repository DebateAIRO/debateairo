import { TypedDomainError } from "@debateai/kernel";
import type { CallConcurrencyPolicy } from "@debateai/register";

/**
 * Parallel AI calls (spec 2026-10-12 §3.2) — the runner-wide call scheduler.
 *
 * One scheduler per runner process; one lane per debate. Every model call of a
 * debate passes through its lane and starts only when it fits under every limit:
 *
 *  · the debate's own slots (`perDebate`),
 *  · the model's slots inside that debate (`perModelPerDebate`),
 *  · the model's slots across the whole runner (`perModelPerRunner[vendor]`,
 *    else `perModelPerRunner.default`),
 *  · and, for a call through a gate that announced its slots, the gate's slots
 *    (ONE while the gate cannot reach its vendor, spec §3.4).
 *
 * Waiting calls of a debate go author first, then panel, then review, then the
 * rest, each kind in arrival order. Debates take turns (round robin) on each
 * SHARED slot — a model's runner-wide slots, a gate's slots — separately: the
 * debate served longest ago on the slot that is tightest for its call goes
 * first, so one debate cannot starve another however busy a third debate is
 * elsewhere. A call held back only by its own debate's limits never holds back
 * another debate's call.
 *
 * A debate may also give its lane a START GUARD (spec §2.3, O6): asked, synchronously, each time the lane would start
 * one of its calls, whether that call may still start. A call it refuses is never sent; the lane runs on.
 *
 * The scheduler knows nothing about debate shape and touches no database.
 */

export const CALL_LANE_STOPPED = "CALL_LANE_STOPPED" as const;
/** A call the lane's start guard refused (the debate's arguing had stopped): never sent. Never a debate's failure. */
export const CALL_LANE_HELD_BACK = "CALL_LANE_HELD_BACK" as const;

export type CallPriority = "AUTHOR" | "PANEL" | "REVIEW" | "OTHER";
export interface CallSubject { readonly model: string; readonly vendor: string; readonly gate: string | null; }
export interface CallTicket extends CallSubject { readonly priority: CallPriority; }
/** Whether a call may still start; asked synchronously, at the moment the lane would start it. */
export type CallStartGuard = (ticket: CallTicket) => boolean;
export interface LaneStats {
  /** This lane's calls running now. */
  readonly running: number;
  /** Calls the start guard refused (never sent). */
  readonly heldBack: number;
  readonly peakInFlight: number;
  readonly peakByModel: Readonly<Record<string, number>>;
  readonly waitedMsByModel: Readonly<Record<string, number>>;
  readonly calls: number;
}
export interface SchedulerStats {
  readonly peakByGate: Readonly<Record<string, number>>;
  readonly peakByModel: Readonly<Record<string, number>>;
}
export interface DebateCallLane {
  /** How many of this debate's calls may run at once (the policy's `perDebate`): 1 is one call at a time. */
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
  openLane(debateId: string): DebateCallLane;
  /** The gate's own slots (preview /remaining max_concurrent_calls); absent gate = unlimited. */
  setGateCapacity(gate: string, slots: number): void;
  /** While unhealthy a gate admits ONE call in flight (spec §3.4). */
  markGateUnhealthy(gate: string): void;
  markGateHealthy(gate: string): void;
  stats(): SchedulerStats;
}

const PRIORITY_RANK: Readonly<Record<CallPriority, number>> = Object.freeze({ AUTHOR: 0, PANEL: 1, REVIEW: 2, OTHER: 3 });

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

  const runnerCapFor = (vendor: string): number =>
    Object.hasOwn(policy.perModelPerRunner, vendor) ? policy.perModelPerRunner[vendor]! : policy.perModelPerRunner.default;

  const gateLimitFor = (gate: string): number => {
    if (unhealthyGates.has(gate)) return 1;
    return gateCapacity.get(gate) ?? Number.POSITIVE_INFINITY;
  };

  const admissible = (lane: Lane, entry: Waiting): boolean => {
    const { ticket, takes } = entry;
    return (!takes.debate || lane.running < policy.perDebate)
      && (!takes.model || ((lane.runningByModel.get(ticket.model) ?? 0) < policy.perModelPerDebate
        && (runnerRunningByModel.get(ticket.model) ?? 0) < runnerCapFor(ticket.vendor)))
      && (!takes.gate || ticket.gate === null || (gateRunning.get(ticket.gate) ?? 0) < gateLimitFor(ticket.gate));
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

    if (takes.debate) {
      lane.running += 1;
      lane.peakInFlight = Math.max(lane.peakInFlight, lane.running);
    }
    if (takes.model) {
      raisePeak(lane.peakByModel, model, bump(lane.runningByModel, model));
      raisePeak(runnerPeakByModel, model, bump(runnerRunningByModel, model));
    }
    if (takes.gate && gate !== null) raisePeak(gatePeak, gate, bump(gateRunning, gate));
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
        let chosen: Readonly<{ lane: Lane; index: number; turn: number }> | null = null;
        for (const lane of lanes) {
          if (lane.stopped) continue;
          // Spec §2.3 (O6): the debate's start guard is asked before any of its waiting calls may start.
          holdBackRefused(lane);
          const index = lane.waiting.findIndex((entry) => admissible(lane, entry));
          if (index < 0) continue;
          const turn = turnOf(lane, lane.waiting[index]!);
          if (chosen === null || turn < chosen.turn) chosen = { lane, index, turn };
        }
        if (chosen === null) return;
        start(chosen.lane, chosen.index);
      }
    } finally {
      pumping = false;
    }
  };

  const openLane = (debateId: string): DebateCallLane => {
    const lane: Lane = {
      debateId,
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
          rank: PRIORITY_RANK[ticket.priority],
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
      callsAtOnce: policy.perDebate,
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
