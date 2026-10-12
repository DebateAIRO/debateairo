/**
 * Preview practice, mode "debate": how many AI calls go at once, and what really happened.
 *
 * Plain words: the runner sends a debate's AI calls at the same time, within the register's call-concurrency setting
 * (spec docs/superpowers/specs/2026-10-12-parallel-calls-design.md). The practice measures that speed-up:
 *  - `--call-concurrency 12/3/default=50,deepinfra=150,anthropic=50` sets it for this practice only: calls at once in
 *    the debate / calls at once to one model in the debate / calls at once to one model across the runner, by vendor
 *    (`default` required). The setting is handed to the practice's runner directly; nothing is written to any register.
 *    Without the flag the practice uses the imported register's own row, and one call at a time when it has none.
 *  - the report then says how many calls really went at once (in the debate, per model, per gate), how long calls
 *    waited for a free slot, each gate's slots as read at the start (a gate that could not be read runs at 1 slot), and
 *    how many times each model's busy refusal made one call wait and try again for the others (a busy probe).
 */
import {
  callConcurrencyPolicyFromValue,
  type CallConcurrencyPolicy,
  type CallConcurrencyPolicyState
} from "@debateai/register";
import type { PreviewBusyCoordinator } from "@debateai/providers";
import type { CallScheduler, DebateCallLane, LaneStats, SchedulerStats } from "../../apps/runner/src/call-scheduler.js";
import { PracticeRefusal } from "./practice-settings.js";

const WHOLE = /^[1-9][0-9]*$/u;

function refuse(): never {
  throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--call-concurrency");
}

/** `<perDebate>/<perModelPerDebate>/<vendor>=<n>,…` → the register's policy, checked by the register's own rule. */
export function parsePracticeCallConcurrency(text: string): CallConcurrencyPolicy {
  const parts = text.split("/");
  if (parts.length !== 3) return refuse();
  const [perDebate, perModelPerDebate, vendors] = parts as [string, string, string];
  if (!WHOLE.test(perDebate) || !WHOLE.test(perModelPerDebate)) return refuse();
  const perModelPerRunner: Record<string, number> = {};
  for (const pair of vendors.split(",")) {
    const match = /^([^=]+)=([^=]+)$/u.exec(pair);
    if (match === null || !WHOLE.test(match[2]!) || Object.hasOwn(perModelPerRunner, match[1]!)) return refuse();
    perModelPerRunner[match[1]!] = Number(match[2]);
  }
  try {
    return callConcurrencyPolicyFromValue({ kind: "CALL_CONCURRENCY_POLICY", perDebate: Number(perDebate),
      perModelPerDebate: Number(perModelPerDebate), perModelPerRunner });
  } catch {
    return refuse();
  }
}

/** The policy written the way the flag takes it, `default` first. */
export function formatPracticeCallConcurrency(policy: CallConcurrencyPolicy): string {
  const vendors = Object.entries(policy.perModelPerRunner).filter(([vendor]) => vendor !== "default");
  return `${String(policy.perDebate)}/${String(policy.perModelPerDebate)}/`
    + [["default", policy.perModelPerRunner.default] as const, ...vendors].map(([vendor, n]) => `${vendor}=${String(n)}`).join(",");
}

/** FLAG: --call-concurrency. REGISTER: the imported register's row (`registerRow` says whether it had one). */
export type PracticeCallConcurrencySource = "FLAG" | "REGISTER";

export type PracticeGateSlots = Readonly<{ slots: number; read: boolean }>;

export type PracticeParallelBlock = Readonly<{
  /** The policy the runner ran with, as the flag writes it. */
  setting: string;
  source: PracticeCallConcurrencySource;
  /** With source REGISTER: SET (the register's row) or ABSENT (no row: one call at a time). Null with the flag. */
  registerRow: CallConcurrencyPolicyState["state"] | null;
  /** Each gate's slots as read from its `/remaining` at the start; `read: false` = unreadable, ran with 1 slot. */
  gateSlotsAtStart: Readonly<Record<string, PracticeGateSlots>>;
  /** The debate's lanes (one per debate run; 0 when the ask was refused). */
  lanes: number;
  calls: number;
  peakInFlight: number;
  peakByModel: Readonly<Record<string, number>>;
  /** Time calls waited for a free slot, in whole milliseconds, per model. */
  waitedMsByModel: Readonly<Record<string, number>>;
  peakByGate: Readonly<Record<string, number>>;
  /** The calls that met a busy refusal and became that model's one probe (wait, then resend), per model. */
  busyProbesByModel: Readonly<Record<string, number>>;
}>;

/** The report's block from the lanes' and the scheduler's own stats (several lanes: peaks are the highest, the rest add up). */
export function practiceParallelBlock(input: Readonly<{
  policy: CallConcurrencyPolicy;
  source: PracticeCallConcurrencySource;
  registerRow: CallConcurrencyPolicyState["state"] | null;
  gateSlotsAtStart: Readonly<Record<string, PracticeGateSlots>>;
  lanes: readonly LaneStats[];
  scheduler: SchedulerStats;
  busyProbesByModel: Readonly<Record<string, number>>;
}>): PracticeParallelBlock {
  const peakByModel: Record<string, number> = {};
  const waited: Record<string, number> = {};
  for (const lane of input.lanes) {
    for (const [model, peak] of Object.entries(lane.peakByModel)) peakByModel[model] = Math.max(peakByModel[model] ?? 0, peak);
    for (const [model, ms] of Object.entries(lane.waitedMsByModel)) waited[model] = (waited[model] ?? 0) + ms;
  }
  return Object.freeze({
    setting: formatPracticeCallConcurrency(input.policy),
    source: input.source,
    registerRow: input.registerRow,
    gateSlotsAtStart: Object.freeze(Object.fromEntries(Object.entries(input.gateSlotsAtStart)
      .map(([gate, slots]) => [gate, Object.freeze({ ...slots })]))),
    lanes: input.lanes.length,
    calls: input.lanes.reduce((sum, lane) => sum + lane.calls, 0),
    peakInFlight: input.lanes.reduce((most, lane) => Math.max(most, lane.peakInFlight), 0),
    peakByModel: Object.freeze(peakByModel),
    waitedMsByModel: Object.freeze(Object.fromEntries(Object.entries(waited).map(([model, ms]) => [model, Math.round(ms)]))),
    peakByGate: Object.freeze({ ...input.scheduler.peakByGate }),
    busyProbesByModel: Object.freeze({ ...input.busyProbesByModel })
  });
}

/**
 * Watches the practice runner's one call scheduler and one busy coordinator, changing nothing they do: it keeps every
 * lane the runner opens (its stats outlive its close), each gate's slots as set at the start, and each model's probes.
 */
export class PracticeCallStats {
  #policy: CallConcurrencyPolicy | null = null;
  #source: PracticeCallConcurrencySource = "REGISTER";
  #registerRow: CallConcurrencyPolicyState["state"] | null = null;
  #scheduler: CallScheduler | null = null;
  readonly #lanes: DebateCallLane[] = [];
  readonly #gateSlots = new Map<string, number>();
  readonly #gatesUnread = new Set<string>();
  readonly #probes = new Map<string, number>();

  /** The register's row as read (only when no flag was given); passes it on unchanged. */
  readonly noteRegisterRow = <T extends CallConcurrencyPolicyState>(state: T): T => {
    this.#registerRow = state.state;
    return state;
  };

  notePolicy(policy: CallConcurrencyPolicy, source: PracticeCallConcurrencySource): void {
    this.#policy = policy;
    this.#source = source;
    if (source === "FLAG") this.#registerRow = null;
  }

  /** The `log` of applyPreviewGateCapacities: notes a gate whose `/remaining` could not be read (it runs at 1 slot). */
  readonly gateCapacityLog = (line: string): void => {
    try {
      const parsed = JSON.parse(line) as { event?: unknown; gate?: unknown };
      if (parsed.event === "GATE_CAPACITY_UNREAD" && typeof parsed.gate === "string") this.#gatesUnread.add(parsed.gate);
    } catch { /* not a scheduler line */ }
  };

  observeScheduler(scheduler: CallScheduler): CallScheduler {
    this.#scheduler = scheduler;
    return Object.freeze({
      openLane: (debateId: string) => {
        const lane = scheduler.openLane(debateId);
        this.#lanes.push(lane);
        return lane;
      },
      setGateCapacity: (gate: string, slots: number) => {
        this.#gateSlots.set(gate, slots);
        scheduler.setGateCapacity(gate, slots);
      },
      markGateUnhealthy: (gate: string) => { scheduler.markGateUnhealthy(gate); },
      markGateHealthy: (gate: string) => { scheduler.markGateHealthy(gate); },
      stats: () => scheduler.stats()
    });
  }

  observeBusy(busy: PreviewBusyCoordinator): PreviewBusyCoordinator {
    return Object.freeze({
      admit: (model: string) => busy.admit(model),
      refusedBusy: (model: string, retryAfterSeconds: number | undefined) => busy.refusedBusy(model, retryAfterSeconds).then((turn) => {
        if (turn === "PROBE") this.#probes.set(model, (this.#probes.get(model) ?? 0) + 1);
        return turn;
      }),
      probeOutcome: (model: string, outcome: "ANSWERED" | "BUSY" | "OTHER", retryAfterSeconds?: number) => {
        busy.probeOutcome(model, outcome, retryAfterSeconds);
      },
      answered: (model: string) => { busy.answered(model); }
    });
  }

  summary(): PracticeParallelBlock {
    if (this.#policy === null || this.#scheduler === null) throw new TypeError("PRACTICE_CALL_STATS_NOT_STARTED");
    return practiceParallelBlock({
      policy: this.#policy,
      source: this.#source,
      registerRow: this.#registerRow,
      gateSlotsAtStart: Object.fromEntries([...this.#gateSlots].map(([gate, slots]) => [gate, { slots, read: !this.#gatesUnread.has(gate) }])),
      lanes: this.#lanes.map((lane) => lane.stats()),
      scheduler: this.#scheduler.stats(),
      busyProbesByModel: Object.fromEntries(this.#probes)
    });
  }
}

/** The report's plain-words lines for the block. */
export function practiceParallelLines(block: PracticeParallelBlock): readonly string[] {
  const where = block.source === "FLAG" ? "from --call-concurrency"
    : block.registerRow === "SET" ? "from the register's call-concurrency row"
      : "the register has no call-concurrency row: one call at a time";
  const lines = ["Calls at once (debate):", "",
    `- setting (calls at once in the debate / to one model in the debate / to one model in all, by vendor): ${block.setting} (${where})`];
  for (const [gate, slots] of Object.entries(block.gateSlotsAtStart)) {
    lines.push(slots.read
      ? `- ${gate} gate: ${String(slots.slots)} slots, read from the gate at the start`
      : `- ${gate} gate: could not be read at the start, so it ran with 1 slot`);
  }
  lines.push(`- most calls at once in the debate: ${String(block.peakInFlight)} (${String(block.calls)} calls)`);
  const gates = Object.entries(block.peakByGate);
  if (gates.length > 0) lines.push(`- most calls at once through each gate: ${gates.map(([gate, n]) => `${gate} ${String(n)}`).join(", ")}`);
  const models = [...new Set([...Object.keys(block.peakByModel), ...Object.keys(block.waitedMsByModel),
    ...Object.keys(block.busyProbesByModel)])].sort();
  for (const model of models) {
    lines.push(`- ${model}: most at once ${String(block.peakByModel[model] ?? 0)}, waited for a slot `
      + `${((block.waitedMsByModel[model] ?? 0) / 1000).toFixed(1)} s in all, busy probes ${String(block.busyProbesByModel[model] ?? 0)}`);
  }
  lines.push("");
  return lines;
}
