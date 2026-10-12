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
 * rest, each kind in arrival order. When a shared slot frees, debates take
 * turns (round robin) so one debate cannot starve another; a call held back
 * only by its own debate's limits never holds back another debate's call.
 *
 * The scheduler knows nothing about debate shape and touches no database.
 */

export const CALL_LANE_STOPPED = "CALL_LANE_STOPPED" as const;

export type CallPriority = "AUTHOR" | "PANEL" | "REVIEW" | "OTHER";
export interface CallSubject { readonly model: string; readonly vendor: string; readonly gate: string | null; }
export interface CallTicket extends CallSubject { readonly priority: CallPriority; }
export interface LaneStats {
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
  /** Waits for a slot under every limit, runs `call`, always releases. Rejects with TypedDomainError CALL_LANE_STOPPED if the lane is stopped while waiting. */
  run<T>(ticket: CallTicket, call: () => Promise<T>): Promise<T>;
  /** No new call starts; queued calls reject CALL_LANE_STOPPED; running calls are not touched. Idempotent. */
  stop(): void;
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

type Waiting = Readonly<{
  ticket: CallTicket;
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
  peakInFlight: number;
  readonly peakByModel: Map<string, number>;
  readonly waitedMsByModel: Map<string, number>;
  calls: number;
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

export function createCallScheduler(input: Readonly<{ policy: CallConcurrencyPolicy; now?: () => number }>): CallScheduler {
  const { policy } = input;
  const now = input.now ?? (() => performance.now());

  const lanes: Lane[] = [];
  let lastServed: Lane | null = null;

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

  const admissible = (lane: Lane, ticket: CallTicket): boolean =>
    lane.running < policy.perDebate
    && (lane.runningByModel.get(ticket.model) ?? 0) < policy.perModelPerDebate
    && (runnerRunningByModel.get(ticket.model) ?? 0) < runnerCapFor(ticket.vendor)
    && (ticket.gate === null || (gateRunning.get(ticket.gate) ?? 0) < gateLimitFor(ticket.gate));

  const start = (lane: Lane, index: number): void => {
    const [entry] = lane.waiting.splice(index, 1);
    const { model, gate } = entry!.ticket;

    lane.running += 1;
    lane.peakInFlight = Math.max(lane.peakInFlight, lane.running);
    raisePeak(lane.peakByModel, model, bump(lane.runningByModel, model));
    raisePeak(runnerPeakByModel, model, bump(runnerRunningByModel, model));
    if (gate !== null) raisePeak(gatePeak, gate, bump(gateRunning, gate));
    lane.calls += 1;
    lane.waitedMsByModel.set(model, (lane.waitedMsByModel.get(model) ?? 0) + Math.max(0, now() - entry!.queuedAt));

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      lane.running -= 1;
      drop(lane.runningByModel, model);
      drop(runnerRunningByModel, model);
      if (gate !== null) drop(gateRunning, gate);
      if (lane.running === 0) for (const resolve of lane.drainWaiters.splice(0)) resolve();
      pump();
    };
    entry!.launch(release);
  };

  /** Starts, round robin over lanes, the first admissible waiting call of each lane until none fits. Re-entrant calls fold into the running pass. */
  let pumping = false;
  let pumpAgain = false;
  const pump = (): void => {
    if (pumping) {
      pumpAgain = true;
      return;
    }
    pumping = true;
    try {
      do {
        pumpAgain = false;
        let progressed = true;
        while (progressed) {
          progressed = false;
          const from = lastServed === null ? 0 : lanes.indexOf(lastServed) + 1;
          const order = [...lanes.slice(from), ...lanes.slice(0, from)];
          for (const lane of order) {
            if (lane.stopped) continue;
            const index = lane.waiting.findIndex((entry) => admissible(lane, entry.ticket));
            if (index < 0) continue;
            lastServed = lane;
            start(lane, index);
            progressed = true;
          }
        }
      } while (pumpAgain);
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
      peakInFlight: 0,
      peakByModel: new Map(),
      waitedMsByModel: new Map(),
      calls: 0
    };
    lanes.push(lane);

    const stop = (): void => {
      if (lane.stopped) return;
      lane.stopped = true;
      for (const entry of lane.waiting.splice(0)) entry.fail(laneStoppedError(lane.debateId));
      pump();
    };

    return Object.freeze({
      run<T>(ticket: CallTicket, call: () => Promise<T>): Promise<T> {
        if (lane.stopped) return Promise.reject(laneStoppedError(lane.debateId));
        return new Promise<T>((resolve, reject) => {
          const entry: Waiting = Object.freeze({
            ticket,
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
      },
      stop,
      drained(): Promise<void> {
        if (lane.running === 0) return Promise.resolve();
        return new Promise<void>((resolve) => { lane.drainWaiters.push(resolve); });
      },
      close(): void {
        stop();
        const index = lanes.indexOf(lane);
        if (index >= 0) lanes.splice(index, 1);
        if (lastServed === lane) lastServed = index > 0 ? lanes[index - 1]! : null;
      },
      stats(): LaneStats {
        return Object.freeze({
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
