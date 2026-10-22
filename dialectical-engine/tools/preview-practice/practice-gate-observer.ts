/**
 * Preview practice: the watcher on the two spending gates.
 *
 * Plain words: every paid call of a practice goes through one of the two gates (DeepInfra, Anthropic) over the
 * gate's own local protocol. This wraps the real gate port the app already uses (createPreviewBudgetRpcPort), so
 * nothing about the request or the gate's answer changes. It only watches: which model was asked, how long the gate
 * took, whether the vendor answered, whether the gate refused the call as "not billed", and the token counts the
 * vendor reported (with the part read from the vendor's prompt cache). It keeps no request or reply text.
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
 * moves nothing here either. The run is counted the way the gate counts its streak (preview_budget_authority.py
 * release_unsent and release_unbilled with busy=False): a vendor answer resets it; a connection failure or a vendor
 * error that was not billed and is not "busy" adds to it; a vendor refusal or a cool-off neither adds to it nor resets it.
 *
 * Under concurrency (formats mode sends to several models at once) the run is counted in completion order, and a call
 * is only sent while the run plus the calls already in flight on that gate stays under the brake: if every call in
 * flight came back "not reached", the gate's own count would still stay under its five. A call that would break that
 * waits until a call in flight settles.
 *
 * The unbilled refusals the app's port tells apart (packages/providers/src/preview-test.ts previewAuthorityRefusal):
 *  - the vendor refused, not billed (PROVIDER_REFUSED_UNBILLED, PreviewVendorRefusedUnbilled): the model is busy;
 *  - the model is cooling off (MODEL_COOLING, PreviewModelCooling): the model is busy;
 *  - the gate no longer serves this model or price (MODEL_NOT_ALLOWED, RESERVATION_MISMATCH, side-by-side §9;
 *    PreviewModelNotServed): not busy, but the runner makes it sit out the same way; neither;
 *  - the vendor was not reached (PROVIDER_NOT_REACHED): counts in the run;
 *  - the vendor answered with an error that was not billed and is not "busy" (PROVIDER_ERROR_UNBILLED, review
 *    2026-10-12: Anthropic's 400/404/413/500; a plain PreviewUnbilledRefusal): counts in the run, as the gate counts
 *    it (release_unbilled busy=False grows unsent_streak); never "busy";
 *  - the gate's own "too many calls in flight" (CONCURRENCY_LIMIT_REACHED): neither.
 */
import { TypedDomainError } from "@debateai/kernel";
import {
  PROVIDER_CHARGE_BOOKED_MAX,
  PROVIDER_GATE_UNAVAILABLE,
  PreviewChargeBookedMax,
  PreviewModelCooling,
  PreviewModelNotServed,
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
  /**
   * The gate proved the call was never billed (vendor 429/529, a model cooling off, not reached, a vendor error that was
   * not billed, or the gate's own concurrency limit).
   */
  | "UNBILLED"
  /**
   * The gate refused for money, or stopped (halted or refused the request). A halted gate reaches the app as
   * PROVIDER_GATE_UNAVAILABLE (run resilience fix (c): the port reads /remaining after a STOPPED refusal, and gate v4
   * says AUTHORITY_HALTED outright) or, when that read fails, as RUN_COST_ENVELOPE_MONEY_REACHED.
   */
  | "GATE_REFUSED"
  /**
   * Slow answer (owner ruling 2026-10-12): the call was sent, then its vendor connection timed out (the gate's 1,200 s)
   * or broke; the gate charged it its full reservation (settled_reserved_max) and kept going. Billed; never a reason to
   * stop sending to the gate, and it neither adds to nor resets the not-reached run (as the gate's own streak).
   */
  | "BOOKED_MAX"
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
  /** A cool-off's own end, when the gate named it (MODEL_COOLING retry_after, seconds); null otherwise. */
  retryAfterSeconds?: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  /**
   * The input tokens the vendor read from its prompt cache (DeepInfra: usage.prompt_tokens_details.cached_tokens;
   * Anthropic: usage.cache_read_input_tokens), part of `inputTokens`. Present only when the vendor reported it (absent
   * in logs written before it was recorded). The gateway does not keep it in the stored artifact (four counters only).
   */
  cachedInputTokens?: number;
  /**
   * LG-B: present only on a final-writer request (the request's own `callTier`, the gate's sixth key), so the practice
   * prices its output at the final-writer bound; absent on a standard request (and in older logs).
   */
  callTier?: "FINAL_WRITER";
}>;

export type PracticeGateStop = Readonly<{ gate: PracticeGateName; reason: string; atSeq: number }>;

/**
 * The vendor refused, not billed (busy); the model is cooling off (busy); the gate no longer serves this model or price
 * (side-by-side §9, not busy); the vendor was not reached; the vendor answered with an error that was not billed and
 * is not "busy" (PROVIDER_ERROR_UNBILLED); the gate's own in-flight limit.
 */
export type PracticeUnbilledKind =
  "VENDOR_REFUSED" | "MODEL_COOLING" | "NOT_SERVED" | "NOT_REACHED" | "VENDOR_ERROR_UNBILLED" | "GATE_IN_FLIGHT";

/** The unbilled refusals the gate adds to its own streak (unsent_streak): they count in the brake's run. */
const COUNTED_IN_THE_RUN: ReadonlySet<PracticeUnbilledKind> = new Set<PracticeUnbilledKind>(["NOT_REACHED", "VENDOR_ERROR_UNBILLED"]);

/** Which unbilled refusal an error is, read as the app's port raises them. */
export function practiceUnbilledKind(error: PreviewUnbilledRefusal): PracticeUnbilledKind {
  // PreviewModelNotServed and PreviewModelCooling are PreviewVendorRefusedUnbilled too, so they are tested first: a
  // model the gate no longer serves is never labelled the vendor's busy refusal.
  if (error instanceof PreviewModelNotServed) return "NOT_SERVED";
  if (error instanceof PreviewModelCooling) return "MODEL_COOLING";
  if (error instanceof PreviewVendorRefusedUnbilled) return "VENDOR_REFUSED";
  if (/calls in flight/u.test(error.message)) return "GATE_IN_FLIGHT";
  // PROVIDER_ERROR_UNBILLED: the port's plain refusal with its own words (previewAuthorityRefusal).
  return /answered with an error/u.test(error.message) ? "VENDOR_ERROR_UNBILLED" : "NOT_REACHED";
}

/**
 * A stop the practice made itself for connection failures in a row (and unbilled vendor errors, which the gate counts
 * in the same run): the gate was not halted and nothing was billed,
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
  /** Every refusal the gate proved unbilled: the kinds below and the gate's own in-flight limit. */
  unbilled: number;
  /** The vendor refused, not billed (429/529): the model is busy. */
  vendorRefused: number;
  /** The model cooling off after such refusals (gate v4): the model is busy. */
  modelCooling: number;
  /** The gate no longer serves this model or price (side-by-side §9): not busy; the runner makes it sit out. */
  notServed: number;
  /** The connection failed before anything was sent: these count in a row toward the brake. */
  notReached: number;
  /** The vendor answered with an error that was not billed and is not "busy" (PROVIDER_ERROR_UNBILLED): these count in the run too. */
  vendorErrorUnbilled: number;
  concurrencyLimit: number;
  gateRefused: number;
  /** Calls the gate booked at their maximum: sent, then timed out, cut off or answered a server error without a bill (PROVIDER_CHARGE_BOOKED_MAX). Billed. */
  bookedMax: number;
  transportFailed: number;
  stoppedLocally: number;
  /**
   * The longest run of connection failures (and unbilled vendor errors) in a row, counting the run the gate already had
   * at the start.
   */
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

/**
 * The vendor's own usage block, read leniently (DeepInfra: OpenAI-shaped; Anthropic: Messages-shaped).
 *
 * Input tokens are counted as the engine counts them (packages/providers/src/anthropic-messages.ts
 * anthropicUsageAsEngineUsage): for Anthropic `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`
 * (Anthropic's own `input_tokens` leaves the cached part out); for DeepInfra `prompt_tokens`, which already holds it.
 * `cachedInputTokens` is the part read from the vendor's prompt cache (Anthropic `cache_read_input_tokens`, DeepInfra
 * `prompt_tokens_details.cached_tokens`, else a top-level `cached_tokens`, as the gate's helper reads it), null when the
 * vendor did not report it.
 */
export function vendorUsage(gate: PracticeGateName, vendorBody: string): Readonly<{
  inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null; cachedInputTokens: number | null;
}> {
  const none = { inputTokens: null, outputTokens: null, reasoningTokens: null, cachedInputTokens: null };
  let parsed: unknown;
  try { parsed = JSON.parse(vendorBody); } catch { return none; }
  const usage = typeof parsed === "object" && parsed !== null ? (parsed as { usage?: unknown }).usage : undefined;
  if (typeof usage !== "object" || usage === null) return none;
  const row = usage as Record<string, unknown>;
  if (gate === "anthropic") {
    const input = count(row.input_tokens);
    const absentOrCount = (value: unknown) => value === undefined || value === null || count(value) !== null;
    const cacheWrite = count(row.cache_creation_input_tokens) ?? 0;
    const cacheRead = count(row.cache_read_input_tokens);
    return {
      inputTokens: input === null || !absentOrCount(row.cache_creation_input_tokens) || !absentOrCount(row.cache_read_input_tokens)
        ? null : input + cacheWrite + (cacheRead ?? 0),
      outputTokens: count(row.output_tokens),
      // Spec 2026-10-12 §4.6: Haiku's thinking, which `output_tokens` already includes.
      reasoningTokens: typeof row.output_tokens_details === "object" && row.output_tokens_details !== null
        ? count((row.output_tokens_details as Record<string, unknown>).thinking_tokens) : null,
      cachedInputTokens: cacheRead
    };
  }
  const details = row.completion_tokens_details;
  const promptDetails = row.prompt_tokens_details;
  const cachedInDetails = typeof promptDetails === "object" && promptDetails !== null
    ? count((promptDetails as Record<string, unknown>).cached_tokens) : null;
  return {
    inputTokens: count(row.prompt_tokens),
    outputTokens: count(row.completion_tokens),
    reasoningTokens: typeof details === "object" && details !== null
      ? count((details as Record<string, unknown>).reasoning_tokens) : null,
    cachedInputTokens: cachedInDetails ?? count(row.cached_tokens)
  };
}

/** What a listener hears: every recorded event and every stop, in the order they happen (the samples log, practice.ts). */
export type PracticeObserverListener = Readonly<{
  event?: (event: PracticeWireEvent) => void;
  stop?: (stop: PracticeGateStop) => void;
}>;

export class PracticeGateObserver {
  readonly #maxConsecutiveNotReached: number;
  readonly #atStart: Readonly<Partial<Record<PracticeGateName, number>>>;
  readonly #now: () => number;
  readonly #events: PracticeWireEvent[] = [];
  readonly #consecutive = new Map<PracticeGateName, number>();
  readonly #maxConsecutive = new Map<PracticeGateName, number>();
  readonly #stops = new Map<PracticeGateName, PracticeGateStop>();
  readonly #inFlight = new Map<PracticeGateName, number>();
  readonly #waiting = new Map<PracticeGateName, Set<() => void>>();
  readonly #listeners: PracticeObserverListener[] = [];
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

  /** The calls sent to a gate that have not settled yet. */
  inFlight(gate: PracticeGateName): number { return this.#inFlight.get(gate) ?? 0; }

  /** Hears every later event and stop; the stops already made are told at once. Returns the way to stop listening. */
  listen(listener: PracticeObserverListener): () => void {
    this.#listeners.push(listener);
    for (const stop of this.#stops.values()) listener.stop?.(stop);
    return () => { const at = this.#listeners.indexOf(listener); if (at >= 0) this.#listeners.splice(at, 1); };
  }

  /**
   * A fresh observer with recorded events and stops played back in their order (the report rebuilt from the samples
   * log): the brake's counts and stops come out as they were.
   */
  static replay(lines: Iterable<Readonly<{ event: PracticeWireEvent } | { stop: PracticeGateStop }>>,
    options: ConstructorParameters<typeof PracticeGateObserver>[0] = {}): PracticeGateObserver {
    const observer = new PracticeGateObserver(options);
    for (const line of lines) {
      if ("event" in line) {
        const { seq, ...event } = line.event;
        void seq; // renumbered in the replay, in the same order
        observer.#record(event);
      } else {
        observer.stop(line.stop.gate, line.stop.reason);
      }
    }
    return observer;
  }

  /**
   * The models whose LAST call through the gates ended refused by the vendor, not billed, cooling off, or not served by
   * the gate: in a finished debate, the members the runner made sit out (apps/runner/src/run-sit-out.ts reads the same
   * refusals, providerCallEndedVendorRefusedUnbilled, which covers all three), so they were not exercised to the end.
   */
  modelsEndingBusy(): readonly string[] {
    const last = new Map<string, PracticeWireEvent>();
    for (const event of this.#events) if (event.outcome !== "STOPPED") last.set(event.model, event);
    return Object.freeze([...last.values()]
      .filter((event) => event.unbilledKind === "VENDOR_REFUSED" || event.unbilledKind === "MODEL_COOLING"
        || event.unbilledKind === "NOT_SERVED")
      .map((event) => event.model).sort());
  }

  stopped(gate: PracticeGateName): PracticeGateStop | null { return this.#stops.get(gate) ?? null; }

  /** Stops one gate by hand (e.g. the operator's interrupt): no later call is sent to it. */
  stop(gate: PracticeGateName, reason: string): void {
    if (this.#stops.has(gate)) return;
    const stop: PracticeGateStop = Object.freeze({ gate, reason, atSeq: this.#seq });
    this.#stops.set(gate, stop);
    for (const listener of [...this.#listeners]) listener.stop?.(stop);
    this.#wake(gate);
  }

  #wake(gate: PracticeGateName): void {
    for (const wake of [...this.#waiting.get(gate) ?? []]) wake();
  }

  /**
   * Waits until one more call fits under the brake: the run so far plus the calls in flight on the gate (each could
   * still come back "not reached") plus this one stays within the brake. On true the call is counted in flight at once
   * (in the same step as the check, so calls arriving together cannot all pass it); false means the gate is stopped
   * (the caller then records the stop). One call at a time never waits here.
   */
  async #admit(gate: PracticeGateName, signal?: AbortSignal): Promise<boolean> {
    for (;;) {
      if (this.#stops.has(gate)) return false;
      if ((this.#consecutive.get(gate) ?? 0) + this.inFlight(gate) + 1 <= this.#maxConsecutiveNotReached) {
        this.#inFlight.set(gate, this.inFlight(gate) + 1);
        return true;
      }
      if (signal?.aborted === true) throw signal.reason ?? new Error("PRACTICE_CALL_ABORTED");
      await new Promise<void>((resolve) => {
        const waiting = this.#waiting.get(gate) ?? new Set<() => void>();
        this.#waiting.set(gate, waiting);
        const done = () => { waiting.delete(done); signal?.removeEventListener("abort", done); resolve(); };
        waiting.add(done);
        signal?.addEventListener("abort", done, { once: true });
      });
    }
  }

  #leave(gate: PracticeGateName): void {
    this.#inFlight.set(gate, this.inFlight(gate) - 1);
    this.#wake(gate);
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
      notServed: kind("NOT_SERVED"),
      notReached: kind("NOT_REACHED"),
      vendorErrorUnbilled: kind("VENDOR_ERROR_UNBILLED"),
      concurrencyLimit: mine.filter((event) => event.concurrencyLimit).length,
      gateRefused: of("GATE_REFUSED"),
      bookedMax: of("BOOKED_MAX"),
      transportFailed: of("TRANSPORT_FAILED"),
      stoppedLocally: of("STOPPED"),
      longestNotReachedRun: this.#maxConsecutive.get(gate) ?? 0,
      unsentStreakAtStart: this.#atStart[gate] ?? null,
      stop: this.stopped(gate)
    });
  }

  #record(event: Omit<PracticeWireEvent, "seq">): void {
    this.#seq += 1;
    const recorded: PracticeWireEvent = Object.freeze({ seq: this.#seq, ...event });
    this.#events.push(recorded);
    for (const listener of [...this.#listeners]) listener.event?.(recorded);
    const gate = event.gate;
    // A booked-at-maximum call neither stops the gate nor touches the run (the gate keeps going and keeps its streak).
    if (event.outcome === "STOPPED" || event.outcome === "BOOKED_MAX") return;
    if (event.outcome === "UNBILLED") {
      // Only "not reached" and a vendor error that was not billed (not busy) count in the run, as the gate's own streak
      // does. A vendor refusal and a model's cool-off neither add to the run nor reset it; the gate's own in-flight limit
      // is refused before it reserves anything.
      if (event.unbilledKind === null || !COUNTED_IN_THE_RUN.has(event.unbilledKind)) return;
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
        let admitted = await this.#admit(gate, signal);
        // A stop made while this call waited for its turn: it is not sent.
        if (admitted && this.#stops.has(gate)) { this.#leave(gate); admitted = false; }
        const startedAt = new Date().toISOString();
        const base = { gate, model, startedAt, concurrencyLimit: false, unbilledKind: null,
          inputTokens: null, outputTokens: null, reasoningTokens: null,
          ...(input.callTier === "FINAL_WRITER" ? { callTier: input.callTier } : {}) } as const;
        if (!admitted) {
          this.#record({ ...base, latencyMs: 0, outcome: "STOPPED", vendorStatus: null, refusalCode: PRACTICE_GATE_STOPPED });
          throw new TypedDomainError(PRACTICE_GATE_STOPPED, `The practice stopped sending to the ${gate} gate`);
        }
        const started = this.#now();
        try {
          const result = await port.execute(input, signal);
          const latencyMs = Math.round(this.#now() - started);
          const { cachedInputTokens, ...usage } = vendorUsage(gate, result.body);
          this.#record({ ...base, latencyMs, outcome: result.status === 200 ? "VENDOR_OK" : "VENDOR_ERROR",
            vendorStatus: result.status, refusalCode: null, ...usage, ...(cachedInputTokens === null ? {} : { cachedInputTokens }) });
          return result;
        } catch (error: unknown) {
          const latencyMs = Math.round(this.#now() - started);
          const code = error instanceof TypedDomainError ? error.code : "UNTYPED";
          if (error instanceof PreviewUnbilledRefusal) {
            const unbilledKind = practiceUnbilledKind(error);
            this.#record({ ...base, latencyMs, outcome: "UNBILLED", vendorStatus: null, refusalCode: code,
              concurrencyLimit: unbilledKind === "GATE_IN_FLIGHT", unbilledKind,
              retryAfterSeconds: error instanceof PreviewModelCooling ? error.retryAfterSeconds ?? null : null });
          } else if (error instanceof PreviewChargeBookedMax) {
            this.#record({ ...base, latencyMs, outcome: "BOOKED_MAX", vendorStatus: null, refusalCode: PROVIDER_CHARGE_BOOKED_MAX });
          } else if (code === "DAILY_COST_ENVELOPE_REACHED" || code === "RUN_COST_ENVELOPE_MONEY_REACHED"
            || code === PROVIDER_GATE_UNAVAILABLE) {
            this.#record({ ...base, latencyMs, outcome: "GATE_REFUSED", vendorStatus: null, refusalCode: code });
          } else {
            this.#record({ ...base, latencyMs, outcome: "TRANSPORT_FAILED", vendorStatus: null, refusalCode: code });
          }
          throw error;
        } finally {
          this.#leave(gate);
        }
      }
    });
  }
}
