/**
 * Preview practice: the watcher on the two spending gates.
 *
 * Plain words: every paid call of a practice goes through one of the two gates (DeepInfra, Anthropic) over the
 * gate's own local protocol. This wraps the real gate port the app already uses (createPreviewBudgetRpcPort), so
 * nothing about the request or the gate's answer changes. It only watches: which model was asked, how long the gate
 * took, whether the vendor answered, whether the gate refused the call as "too busy, not billed", and the token
 * counts the vendor reported. It keeps no request or reply text.
 *
 * It is also the brake. The live site shares each gate's halt counters (five unbilled refusals in a row halt the
 * gate). After THREE unbilled refusals in a row on one gate, or after any gate answer that is neither a vendor
 * answer nor an unbilled refusal (the gate refused or halted), the practice never sends to that gate again: every
 * later call fails at once, before the socket is opened.
 */
import { TypedDomainError } from "@debateai/kernel";
import {
  PreviewUnbilledRefusal,
  type PreviewBudgetExecution,
  type PreviewBudgetPort
} from "@debateai/providers";

export type PracticeGateName = "deepinfra" | "anthropic";

/** The default brake: one below the gate's own five-in-a-row halt, with room for the live site. */
const PRACTICE_MAX_CONSECUTIVE_UNBILLED = 3;
/** The code every call carries once a gate's brake is on. Nothing was sent. */
export const PRACTICE_GATE_STOPPED = "PRACTICE_GATE_STOPPED" as const;

export type PracticeWireOutcome =
  /** The gate returned the vendor's answer with status 200. */
  | "VENDOR_OK"
  /** The gate returned a vendor answer with another status (in real life the gate halts on this). */
  | "VENDOR_ERROR"
  /** The gate proved the call was never billed (vendor 429/529, not reached, or the gate's own concurrency limit). */
  | "UNBILLED"
  /** The gate refused for money, or stopped (halted or refused the request). */
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
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
}>;

export type PracticeGateStop = Readonly<{ gate: PracticeGateName; reason: string; atSeq: number }>;

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
  readonly #now: () => number;
  readonly #events: PracticeWireEvent[] = [];
  readonly #consecutive = new Map<PracticeGateName, number>();
  readonly #maxConsecutive = new Map<PracticeGateName, number>();
  readonly #stops = new Map<PracticeGateName, PracticeGateStop>();
  #seq = 0;

  constructor(options: Readonly<{ maxConsecutiveUnbilled?: number; now?: () => number }> = {}) {
    const limit = options.maxConsecutiveUnbilled ?? PRACTICE_MAX_CONSECUTIVE_UNBILLED;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("PRACTICE_BRAKE_LIMIT_INVALID");
    this.#maxConsecutiveUnbilled = limit;
    this.#now = options.now ?? (() => performance.now());
  }

  get events(): readonly PracticeWireEvent[] { return this.#events; }

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
      stop: this.stopped(gate)
    });
  }

  #record(event: Omit<PracticeWireEvent, "seq">): void {
    this.#seq += 1;
    this.#events.push(Object.freeze({ seq: this.#seq, ...event }));
    const gate = event.gate;
    if (event.outcome === "STOPPED") return;
    if (event.outcome === "UNBILLED") {
      const run = (this.#consecutive.get(gate) ?? 0) + 1;
      this.#consecutive.set(gate, run);
      this.#maxConsecutive.set(gate, Math.max(run, this.#maxConsecutive.get(gate) ?? 0));
      if (run >= this.#maxConsecutiveUnbilled) this.stop(gate, `UNBILLED_IN_A_ROW_${String(run)}`);
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
        const base = { gate, model, startedAt, concurrencyLimit: false,
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
            this.#record({ ...base, latencyMs, outcome: "UNBILLED", vendorStatus: null, refusalCode: code,
              concurrencyLimit: /calls in flight/u.test(error.message) });
          } else if (code === "DAILY_COST_ENVELOPE_REACHED" || code === "RUN_COST_ENVELOPE_MONEY_REACHED") {
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
