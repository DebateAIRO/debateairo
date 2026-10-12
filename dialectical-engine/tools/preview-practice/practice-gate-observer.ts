/**
 * Preview practice: the watcher on the two spending gates.
 *
 * Plain words: every paid call of a practice goes through one of the two gates (DeepInfra, Anthropic) over the
 * gate's own local protocol. This wraps the real gate port the app already uses (createPreviewBudgetRpcPort), so
 * nothing about the request or the gate's answer changes. It only watches: which model was asked, how long the gate
 * took, whether the vendor answered, whether the gate refused the call as "not billed", and the token counts the
 * vendor reported. It keeps no request or reply text.
 *
 * It is also the brake, a safety net behind the per-model rule (formats: a model whose call ends refused as busy is
 * skipped for the rest of the practice; debate: the runner makes it sit out). The live gate halts on its own at five
 * connection failures in a row ("not reached": the connection failed before anything was sent, so nothing was
 * billed). So the practice never sends to a gate again
 *  - after FOUR connection failures in a row on it, counting the run the gate already had at the start (root's
 *    `status` `unsent_streak`), so the gate's own count stays under its five, or
 *  - after any gate answer that is neither a vendor answer nor an unbilled refusal (the gate refused or halted).
 * Every later call to that gate fails at once, before the socket is opened.
 *
 * Nothing else stops a gate. A vendor refusal, not billed (the vendor's 429 or 529), and a model's cool-off
 * (MODEL_COOLING, gate v4) mark only that model busy (modelsEndingBusy); the gate itself keeps going. The gate's own
 * "too many calls in flight" refusal (CONCURRENCY_LIMIT_REACHED) is refused before the gate reserves anything, so it
 * moves nothing here either. The run is counted the way the gate counts its streak: a vendor answer resets it; a
 * vendor refusal or a cool-off neither adds to it nor resets it.
 *
 * The unbilled refusals the app's port tells apart (packages/providers/src/preview-test.ts previewAuthorityRefusal):
 *  - the vendor refused, not billed (PROVIDER_REFUSED_UNBILLED, PreviewVendorRefusedUnbilled): the model is busy;
 *  - the model is cooling off (MODEL_COOLING, PreviewModelCooling): the model is busy;
 *  - the vendor was not reached (PROVIDER_NOT_REACHED): counts in the run only; the Anthropic gate's not-busy error
 *    answers (PROVIDER_ERROR_UNBILLED, review 2026-10-12: 400/404/413/500) arrive as the same plain refusal and are
 *    counted the same way (the gate adds them to its streak too, and keeps a $0 entry);
 *  - the gate's own "too many calls in flight" (CONCURRENCY_LIMIT_REACHED): neither.
 */
import { TypedDomainError } from "@debateai/kernel";
import {
  PROVIDER_GATE_UNAVAILABLE,
  PreviewModelCooling,
  PreviewUnbilledRefusal,
  PreviewVendorRefusedUnbilled,
  type PreviewBudgetExecution,
  type PreviewBudgetPort
} from "@debateai/providers";

export type PracticeGateName = "deepinfra" | "anthropic";

/** The brake in a row: one below the gate's own five-in-a-row halt (provider_unreachable). */
const PRACTICE_MAX_CONSECUTIVE_NOT_REACHED = 4;
/** The code every call carries once a gate's brake is on. Nothing was sent. */
export const PRACTICE_GATE_STOPPED = "PRACTICE_GATE_STOPPED" as const;

export type PracticeWireOutcome =
  /** The gate returned the vendor's answer with status 200. */
  | "VENDOR_OK"
  /** The gate returned a vendor answer with another status (in real life the gate halts on this). */
  | "VENDOR_ERROR"
  /** The gate proved the call was never billed (vendor 429/529, a model cooling off, not reached, or the gate's own concurrency limit). */
  | "UNBILLED"
  /**
   * The gate refused for money, or stopped (halted or refused the request). A halted gate reaches the app as
   * PROVIDER_GATE_UNAVAILABLE (run resilience fix (c): the port reads /remaining after a STOPPED refusal, and gate v4
   * says AUTHORITY_HALTED outright) or, when that read fails, as RUN_COST_ENVELOPE_MONEY_REACHED.
   */
  | "GATE_REFUSED"
  /** The gate could not be reached or its answer could not be read. */
  | "TRANSPORT_FAILED"
  /** The practice's own brake: never sent. */
  | "STOPPED";

export type PracticeWireEvent = Readonly<{
  seq: number;
  gate: PracticeGateName;
  model: string;
  startedAt: string;
  latencyMs: number;
  outcome: PracticeWireOutcome;
  /** The vendor status inside the gate's answer, when there was one. */
  vendorStatus: number | null;
  /** The engine's code for a refusal, e.g. PROVIDER_CALL_FAILED (unbilled) or DAILY_COST_ENVELOPE_REACHED. */
  refusalCode: string | null;
  /** True when the unbilled refusal was the gate's own "too many calls in flight". */
  concurrencyLimit: boolean;
  /** Which unbilled refusal it was (null for any other outcome). */
  unbilledKind: PracticeUnbilledKind | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
}>;

export type PracticeGateStop = Readonly<{ gate: PracticeGateName; reason: string; atSeq: number }>;

/** The vendor refused, not billed; the model is cooling off; the vendor was not reached; the gate's own in-flight limit. */
export type PracticeUnbilledKind = "VENDOR_REFUSED" | "MODEL_COOLING" | "NOT_REACHED" | "GATE_IN_FLIGHT";

/** Which unbilled refusal an error is, read as the app's port raises them. */
export function practiceUnbilledKind(error: PreviewUnbilledRefusal): PracticeUnbilledKind {
  // PreviewModelCooling is a PreviewVendorRefusedUnbilled too, so it is tested first.
  if (error instanceof PreviewModelCooling) return "MODEL_COOLING";
  if (error instanceof PreviewVendorRefusedUnbilled) return "VENDOR_REFUSED";
  return /calls in flight/u.test(error.message) ? "GATE_IN_FLIGHT" : "NOT_REACHED";
}

/**
 * A stop the practice made itself for connection failures in a row: the gate was not halted and nothing was billed,
 * but the models behind it were not exercised, so the verdict is NOT_PROVEN, never FAIL. Any other stop (a gate
 * refusal, a vendor error, an unreadable answer) is a failure to investigate.
 */
export function practiceStopIsPause(stop: PracticeGateStop | null): boolean {
  return stop !== null && /^NOT_REACHED_IN_A_ROW_/u.test(stop.reason);
}

export type PracticeGateSummary = Readonly<{
  calls: number;
  vendorOk: number;
  vendorError: number;
  /** Every refusal the gate proved unbilled: the four kinds below. */
  unbilled: number;
  /** The vendor refused, not billed (429/529): the model is busy. */
  vendorRefused: number;
  /** The model cooling off after such refusals (gate v4): the model is busy. */
  modelCooling: number;
  /** The connection failed before anything was sent: these count in a row toward the brake. */
  notReached: number;
  concurrencyLimit: number;
  gateRefused: number;
  transportFailed: number;
  stoppedLocally: number;
  /** The longest run of connection failures in a row, counting the run the gate already had at the start. */
  longestNotReachedRun: number;
  /** Root's `status` `unsent_streak` (connection failures in a row) at the start (null when not given). */
  unsentStreakAtStart: number | null;
  stop: PracticeGateStop | null;
}>;

function modelOf(requestBody: string): string {
  try {
    const parsed = JSON.parse(requestBody) as { model?: unknown };
    return typeof parsed.model === "string" ? parsed.model : "unknown";
  } catch {
    return "unknown";
  }
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** The vendor's own usage block, read leniently (DeepInfra: OpenAI-shaped; Anthropic: Messages-shaped). */
export function vendorUsage(gate: PracticeGateName, vendorBody: string): Readonly<{
  inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null;
}> {
  let parsed: unknown;
  try { parsed = JSON.parse(vendorBody); } catch { return { inputTokens: null, outputTokens: null, reasoningTokens: null }; }
  const usage = typeof parsed === "object" && parsed !== null ? (parsed as { usage?: unknown }).usage : undefined;
  if (typeof usage !== "object" || usage === null) return { inputTokens: null, outputTokens: null, reasoningTokens: null };
  const row = usage as Record<string, unknown>;
  if (gate === "anthropic") {
    return { inputTokens: count(row.input_tokens), outputTokens: count(row.output_tokens), reasoningTokens: null };
  }
  const details = row.completion_tokens_details;
  return {
    inputTokens: count(row.prompt_tokens),
    outputTokens: count(row.completion_tokens),
    reasoningTokens: typeof details === "object" && details !== null
      ? count((details as Record<string, unknown>).reasoning_tokens) : null
  };
}

export class PracticeGateObserver {
  readonly #maxConsecutiveNotReached: number;
  readonly #atStart: Readonly<Partial<Record<PracticeGateName, number>>>;
  readonly #now: () => number;
  readonly #events: PracticeWireEvent[] = [];
  readonly #consecutive = new Map<PracticeGateName, number>();
  readonly #maxConsecutive = new Map<PracticeGateName, number>();
  readonly #stops = new Map<PracticeGateName, PracticeGateStop>();
  #seq = 0;

  constructor(options: Readonly<{
    maxConsecutiveNotReached?: number;
    /** Root's `status` `unsent_streak` of each gate at the start: the connection failures the gate already has in a row. */
    unsentStreakAtStart?: Readonly<Partial<Record<PracticeGateName, number>>>;
    now?: () => number;
  }> = {}) {
    const limit = options.maxConsecutiveNotReached ?? PRACTICE_MAX_CONSECUTIVE_NOT_REACHED;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("PRACTICE_BRAKE_LIMIT_INVALID");
    const atStart = options.unsentStreakAtStart ?? {};
    if (Object.values(atStart).some((value) => !Number.isSafeInteger(value) || value! < 0)) throw new TypeError("PRACTICE_BRAKE_LIMIT_INVALID");
    this.#maxConsecutiveNotReached = limit;
    this.#atStart = Object.freeze({ ...atStart });
    this.#now = options.now ?? (() => performance.now());
    for (const gate of ["deepinfra", "anthropic"] as const) {
      // The run the gate already has counts toward the brake, so the practice never takes the gate to its own halt.
      const streak = this.#atStart[gate] ?? 0;
      this.#consecutive.set(gate, streak);
      this.#maxConsecutive.set(gate, streak);
      if (streak >= limit) this.stop(gate, `NOT_REACHED_IN_A_ROW_${String(streak)}`);
    }
  }

  get events(): readonly PracticeWireEvent[] { return this.#events; }

  /**
   * The models whose LAST call through the gates ended refused by the vendor, not billed, or cooling off: in a finished
   * debate, the members the runner made sit out for being busy (apps/runner/src/run-sit-out.ts reads the same refusals,
   * providerCallEndedVendorRefusedUnbilled, which covers both), so they were not exercised to the end.
   */
  modelsEndingBusy(): readonly string[] {
    const last = new Map<string, PracticeWireEvent>();
    for (const event of this.#events) if (event.outcome !== "STOPPED") last.set(event.model, event);
    return Object.freeze([...last.values()]
      .filter((event) => event.unbilledKind === "VENDOR_REFUSED" || event.unbilledKind === "MODEL_COOLING")
      .map((event) => event.model).sort());
  }

  stopped(gate: PracticeGateName): PracticeGateStop | null { return this.#stops.get(gate) ?? null; }

  /** Stops one gate by hand (e.g. the operator's interrupt): no later call is sent to it. */
  stop(gate: PracticeGateName, reason: string): void {
    if (!this.#stops.has(gate)) this.#stops.set(gate, Object.freeze({ gate, reason, atSeq: this.#seq }));
  }

  summary(gate: PracticeGateName): PracticeGateSummary {
    const mine = this.#events.filter((event) => event.gate === gate);
    const of = (outcome: PracticeWireOutcome) => mine.filter((event) => event.outcome === outcome).length;
    const kind = (unbilledKind: PracticeUnbilledKind) => mine.filter((event) => event.unbilledKind === unbilledKind).length;
    return Object.freeze({
      calls: mine.filter((event) => event.outcome !== "STOPPED").length,
      vendorOk: of("VENDOR_OK"),
      vendorError: of("VENDOR_ERROR"),
      unbilled: of("UNBILLED"),
      vendorRefused: kind("VENDOR_REFUSED"),
      modelCooling: kind("MODEL_COOLING"),
      notReached: kind("NOT_REACHED"),
      concurrencyLimit: mine.filter((event) => event.concurrencyLimit).length,
      gateRefused: of("GATE_REFUSED"),
      transportFailed: of("TRANSPORT_FAILED"),
      stoppedLocally: of("STOPPED"),
      longestNotReachedRun: this.#maxConsecutive.get(gate) ?? 0,
      unsentStreakAtStart: this.#atStart[gate] ?? null,
      stop: this.stopped(gate)
    });
  }

  #record(event: Omit<PracticeWireEvent, "seq">): void {
    this.#seq += 1;
    this.#events.push(Object.freeze({ seq: this.#seq, ...event }));
    const gate = event.gate;
    if (event.outcome === "STOPPED") return;
    if (event.outcome === "UNBILLED") {
      // Only "not reached" counts in the run, as the gate's own streak does. A vendor refusal and a model's cool-off
      // neither add to the run nor reset it; the gate's own in-flight limit is refused before it reserves anything.
      if (event.unbilledKind !== "NOT_REACHED") return;
      const run = (this.#consecutive.get(gate) ?? 0) + 1;
      this.#consecutive.set(gate, run);
      this.#maxConsecutive.set(gate, Math.max(run, this.#maxConsecutive.get(gate) ?? 0));
      if (run >= this.#maxConsecutiveNotReached) this.stop(gate, `NOT_REACHED_IN_A_ROW_${String(run)}`);
      return;
    }
    // A settled answer ends the run, as the gate's own streak does.
    this.#consecutive.set(gate, 0);
    if (event.outcome === "VENDOR_ERROR") this.stop(gate, `VENDOR_STATUS_${String(event.vendorStatus)}`);
    if (event.outcome === "GATE_REFUSED") this.stop(gate, `GATE_REFUSED_${event.refusalCode ?? "UNKNOWN"}`);
    if (event.outcome === "TRANSPORT_FAILED") this.stop(gate, `GATE_UNREADABLE_${event.refusalCode ?? "UNKNOWN"}`);
  }

  /** The same port, watched. Request and reply pass through untouched. */
  wrap(gate: PracticeGateName, port: PreviewBudgetPort): PreviewBudgetPort {
    return Object.freeze({
      execute: async (input: PreviewBudgetExecution, signal?: AbortSignal) => {
        const model = modelOf(input.requestBody);
        const startedAt = new Date().toISOString();
        const base = { gate, model, startedAt, concurrencyLimit: false, unbilledKind: null,
          inputTokens: null, outputTokens: null, reasoningTokens: null } as const;
        if (this.#stops.has(gate)) {
          this.#record({ ...base, latencyMs: 0, outcome: "STOPPED", vendorStatus: null, refusalCode: PRACTICE_GATE_STOPPED });
          throw new TypedDomainError(PRACTICE_GATE_STOPPED, `The practice stopped sending to the ${gate} gate`);
        }
        const started = this.#now();
        try {
          const result = await port.execute(input, signal);
          const latencyMs = Math.round(this.#now() - started);
          this.#record({ ...base, latencyMs, outcome: result.status === 200 ? "VENDOR_OK" : "VENDOR_ERROR",
            vendorStatus: result.status, refusalCode: null, ...vendorUsage(gate, result.body) });
          return result;
        } catch (error: unknown) {
          const latencyMs = Math.round(this.#now() - started);
          const code = error instanceof TypedDomainError ? error.code : "UNTYPED";
          if (error instanceof PreviewUnbilledRefusal) {
            const unbilledKind = practiceUnbilledKind(error);
            this.#record({ ...base, latencyMs, outcome: "UNBILLED", vendorStatus: null, refusalCode: code,
              concurrencyLimit: unbilledKind === "GATE_IN_FLIGHT", unbilledKind });
          } else if (code === "DAILY_COST_ENVELOPE_REACHED" || code === "RUN_COST_ENVELOPE_MONEY_REACHED"
            || code === PROVIDER_GATE_UNAVAILABLE) {
            this.#record({ ...base, latencyMs, outcome: "GATE_REFUSED", vendorStatus: null, refusalCode: code });
          } else {
            this.#record({ ...base, latencyMs, outcome: "TRANSPORT_FAILED", vendorStatus: null, refusalCode: code });
          }
          throw error;
        }
      }
    });
  }
}
