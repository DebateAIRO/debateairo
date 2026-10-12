/**
 * Preview practice: the watcher on the two spending gates.
 *
 * Plain words: every paid call of a practice goes through one of the two gates (DeepInfra, Anthropic) over the
 * gate's own local protocol. This wraps the real gate port the app already uses (createPreviewBudgetRpcPort), so
 * nothing about the request or the gate's answer changes. It only watches: which model was asked, how long the gate
 * took, whether the vendor answered, whether the gate refused the call as "too busy, not billed", and the token
 * counts the vendor reported. It keeps no request or reply text.
 *
 * It is also the brake, a safety net behind the per-model rule (formats: a model whose call ends refused as busy is
 * skipped for the rest of the practice; debate: the runner makes it sit out). The live site shares each gate's halt
 * counters: five refusals "not reached" or "refused, not billed" in a row halt the gate (a settled reply resets that
 * run), and the twentieth "refused, not billed" of one Bucharest day halts it too. So the practice never sends to a
 * gate again
 *  - after FOUR such refusals in a row on it (any vendor answer resets the run, as the gate's does), or
 *  - once the day's count (root's `status` at the start, plus those seen in this practice) reaches TWELVE, so the
 *    next one would pass twelve and the live site keeps room under the gate's twenty, or
 *  - after any gate answer that is neither a vendor answer nor an unbilled refusal (the gate refused or halted).
 * Every later call to that gate fails at once, before the socket is opened. The gate's own "too many calls in flight"
 * refusal is refused before the gate reserves anything and moves neither of its counters, so it moves neither here.
 *
 * The three unbilled refusals the app's port tells apart (packages/providers/src/preview-test.ts
 * previewAuthorityRefusal), counted as the gate counts them:
 *  - the vendor refused, not billed (PROVIDER_REFUSED_UNBILLED, PreviewVendorRefusedUnbilled): the run in a row AND
 *    the day's count (the gate keeps it as a released_unbilled entry);
 *  - the vendor was not reached (PROVIDER_NOT_REACHED): the run in a row only (the gate keeps no entry); the
 *    Anthropic gate's not-busy error answers (PROVIDER_ERROR_UNBILLED, review 2026-10-12: 400/404/413/500) arrive as
 *    the same plain refusal and are counted the same way (the gate adds them to its streak too, and keeps a $0 entry);
 *  - the gate's own "too many calls in flight" (CONCURRENCY_LIMIT_REACHED): neither (refused before it reserves).
 */
import { TypedDomainError } from "@debateai/kernel";
import {
  PROVIDER_GATE_UNAVAILABLE,
  PreviewUnbilledRefusal,
  PreviewVendorRefusedUnbilled,
  type PreviewBudgetExecution,
  type PreviewBudgetPort
} from "@debateai/providers";

export type PracticeGateName = "deepinfra" | "anthropic";

/** The brake in a row: one below the gate's own five-in-a-row halt. */
const PRACTICE_MAX_CONSECUTIVE_UNBILLED = 4;
/** The brake for the day: the gate halts at its twentieth unbilled release of a day; the live site keeps the rest. */
const PRACTICE_BRAKE_UNBILLED_TODAY = 12;
/** The code every call carries once a gate's brake is on. Nothing was sent. */
export const PRACTICE_GATE_STOPPED = "PRACTICE_GATE_STOPPED" as const;

export type PracticeWireOutcome =
  /** The gate returned the vendor's answer with status 200. */
  | "VENDOR_OK"
  /** The gate returned a vendor answer with another status (in real life the gate halts on this). */
  | "VENDOR_ERROR"
  /** The gate proved the call was never billed (vendor 429/529, not reached, or the gate's own concurrency limit). */
  | "UNBILLED"
  /**
   * The gate refused for money, or stopped (halted or refused the request). A halted gate reaches the app as
   * PROVIDER_GATE_UNAVAILABLE (run resilience fix (c): the port reads /remaining after a STOPPED refusal) or, when that
   * read fails, as RUN_COST_ENVELOPE_MONEY_REACHED.
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

/** The vendor refused, not billed; the vendor was not reached; the gate's own in-flight limit. */
export type PracticeUnbilledKind = "VENDOR_REFUSED" | "NOT_REACHED" | "GATE_IN_FLIGHT";

/** Which unbilled refusal an error is, read as the app's port raises them. */
export function practiceUnbilledKind(error: PreviewUnbilledRefusal): PracticeUnbilledKind {
  if (error instanceof PreviewVendorRefusedUnbilled) return "VENDOR_REFUSED";
  return /calls in flight/u.test(error.message) ? "GATE_IN_FLIGHT" : "NOT_REACHED";
}

/**
 * A stop for busy refusals only (in a row, or the day's room), as opposed to a gate that refused, halted or could not
 * be read. A busy pause proves nothing wrong with the release: the models behind it were not exercised (NOT_PROVEN).
 */
export function practiceStopIsBusyPause(stop: PracticeGateStop | null): boolean {
  return stop !== null && /^UNBILLED_/u.test(stop.reason);
}

export type PracticeGateSummary = Readonly<{
  calls: number;
  vendorOk: number;
  vendorError: number;
  unbilled: number;
  concurrencyLimit: number;
  gateRefused: number;
  transportFailed: number;
  stoppedLocally: number;
  maxConsecutiveUnbilled: number;
  /** Root's `status` count of the day's unbilled releases at the start (null when not given). */
  unbilledTodayAtStart: number | null;
  /** The vendor's unbilled refusals seen in this practice: the ones the gate's day count includes. */
  unbilledCounted: number;
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
  readonly #maxConsecutiveUnbilled: number;
  readonly #maxUnbilledToday: number;
  readonly #atStart: Readonly<Partial<Record<PracticeGateName, number>>>;
  readonly #now: () => number;
  readonly #events: PracticeWireEvent[] = [];
  readonly #consecutive = new Map<PracticeGateName, number>();
  readonly #maxConsecutive = new Map<PracticeGateName, number>();
  readonly #counted = new Map<PracticeGateName, number>();
  readonly #stops = new Map<PracticeGateName, PracticeGateStop>();
  #seq = 0;

  constructor(options: Readonly<{
    maxConsecutiveUnbilled?: number;
    maxUnbilledToday?: number;
    /** Root's `status` count of each gate's unbilled releases today, read at the start. */
    unbilledTodayAtStart?: Readonly<Partial<Record<PracticeGateName, number>>>;
    now?: () => number;
  }> = {}) {
    const limit = options.maxConsecutiveUnbilled ?? PRACTICE_MAX_CONSECUTIVE_UNBILLED;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("PRACTICE_BRAKE_LIMIT_INVALID");
    const day = options.maxUnbilledToday ?? PRACTICE_BRAKE_UNBILLED_TODAY;
    if (!Number.isSafeInteger(day) || day < 1) throw new TypeError("PRACTICE_BRAKE_LIMIT_INVALID");
    const atStart = options.unbilledTodayAtStart ?? {};
    if (Object.values(atStart).some((value) => !Number.isSafeInteger(value) || value! < 0)) throw new TypeError("PRACTICE_BRAKE_LIMIT_INVALID");
    this.#maxConsecutiveUnbilled = limit;
    this.#maxUnbilledToday = day;
    this.#atStart = Object.freeze({ ...atStart });
    this.#now = options.now ?? (() => performance.now());
    for (const gate of ["deepinfra", "anthropic"] as const) this.#checkDay(gate);
  }

  get events(): readonly PracticeWireEvent[] { return this.#events; }

  /** The gate's day count as far as the practice knows it: root's count at the start plus the refusals seen since. */
  #dayCount(gate: PracticeGateName): number {
    return (this.#atStart[gate] ?? 0) + (this.#counted.get(gate) ?? 0);
  }

  /** Stops the gate once one more busy refusal would pass the day's cap. */
  #checkDay(gate: PracticeGateName): void {
    const count = this.#dayCount(gate);
    if (count >= this.#maxUnbilledToday) this.stop(gate, `UNBILLED_TODAY_${String(count)}`);
  }

  /**
   * The models whose LAST call through the gates ended refused by the vendor, not billed: in a finished debate,
   * exactly the members the runner made sit out for being busy (apps/runner/src/run-sit-out.ts reads the same
   * refusal, providerCallEndedVendorRefusedUnbilled), so they were not exercised to the end.
   */
  modelsEndingBusy(): readonly string[] {
    const last = new Map<string, PracticeWireEvent>();
    for (const event of this.#events) if (event.outcome !== "STOPPED") last.set(event.model, event);
    return Object.freeze([...last.values()].filter((event) => event.unbilledKind === "VENDOR_REFUSED").map((event) => event.model).sort());
  }

  stopped(gate: PracticeGateName): PracticeGateStop | null { return this.#stops.get(gate) ?? null; }

  /** Stops one gate by hand (e.g. the operator's interrupt): no later call is sent to it. */
  stop(gate: PracticeGateName, reason: string): void {
    if (!this.#stops.has(gate)) this.#stops.set(gate, Object.freeze({ gate, reason, atSeq: this.#seq }));
  }

  summary(gate: PracticeGateName): PracticeGateSummary {
    const mine = this.#events.filter((event) => event.gate === gate);
    const of = (outcome: PracticeWireOutcome) => mine.filter((event) => event.outcome === outcome).length;
    return Object.freeze({
      calls: mine.filter((event) => event.outcome !== "STOPPED").length,
      vendorOk: of("VENDOR_OK"),
      vendorError: of("VENDOR_ERROR"),
      unbilled: of("UNBILLED"),
      concurrencyLimit: mine.filter((event) => event.concurrencyLimit).length,
      gateRefused: of("GATE_REFUSED"),
      transportFailed: of("TRANSPORT_FAILED"),
      stoppedLocally: of("STOPPED"),
      maxConsecutiveUnbilled: this.#maxConsecutive.get(gate) ?? 0,
      unbilledTodayAtStart: this.#atStart[gate] ?? null,
      unbilledCounted: this.#counted.get(gate) ?? 0,
      stop: this.stopped(gate)
    });
  }

  #record(event: Omit<PracticeWireEvent, "seq">): void {
    this.#seq += 1;
    this.#events.push(Object.freeze({ seq: this.#seq, ...event }));
    const gate = event.gate;
    if (event.outcome === "STOPPED") return;
    if (event.outcome === "UNBILLED") {
      // The gate's own in-flight limit refuses before it reserves anything: neither of its counters moves.
      if (event.unbilledKind === "GATE_IN_FLIGHT") return;
      const run = (this.#consecutive.get(gate) ?? 0) + 1;
      this.#consecutive.set(gate, run);
      this.#maxConsecutive.set(gate, Math.max(run, this.#maxConsecutive.get(gate) ?? 0));
      // Only the vendor's refusal stays on the gate's day record (released_unbilled).
      if (event.unbilledKind === "VENDOR_REFUSED") this.#counted.set(gate, (this.#counted.get(gate) ?? 0) + 1);
      if (run >= this.#maxConsecutiveUnbilled) this.stop(gate, `UNBILLED_IN_A_ROW_${String(run)}`);
      this.#checkDay(gate);
      return;
    }
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
