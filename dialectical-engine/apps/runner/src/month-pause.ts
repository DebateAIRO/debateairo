import { isMonthWallReached, type WebSearchCostSeam } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderCostEnvelopeSeam } from "@debateai/providers";

/**
 * The money rule (owner, 31 Oct 2026, point 5; plan 2026-10-30 dig-model revision W3-2, made durable in W3-8) — THE
 * MONTH PAUSE, the runner's half.
 *
 * At a billingPlans v4 month's wall the shared wall refuses a call while the debate is argued with
 * `MonthWallReachedError` (packages/budget, `decideMonthWall`). Here, around each walled call's admission:
 *  - a refusal at the month wall records the pause once (0134's `record_run_pause`, reason MONTH_WALL, from the month's
 *    reset, with the planned work held at the wall: the refused call or search, and what the run's arguing may still
 *    spend, `plannedMicros`), and the call ends with RUN_MONTH_PAUSED instead of being sent;
 *  - a debate whose newest pause event is PAUSED is not continued: its every further walled call and search ends so too.
 * RUN_MONTH_PAUSED is a PLANNED STOP of this copy (apps/runner/src/index.ts): the arguing ends at once as at a lost
 * claim, nothing more is saved, no answer is written, the work item is not recorded FAILED and its claim is released.
 * The database then keeps the debate paused (W3-8): no runner claims, lists or re-sends a work item whose debate is
 * paused (packages/battery `WorkItemRepository`), so a runner restart or a day's wait changes nothing. When the person
 * presses Continue in the new month (the API records RESUMED once the month has room, apps/api/src/month-pause.ts), the
 * item is handed to a runner again; that copy replays every call already answered from the record (run-replay.ts: never
 * asked or paid again) and goes on (true resume). Nothing waits in memory: the pause can only end with Continue, which
 * comes after the month's reset, so holding the debate's slot and connections for hours bought nothing (W3-2's two-hour
 * wait is gone). A debate that is no live private debate (0134 answers NOT_LIVE: no owner, or erased) cannot be paused,
 * so its call ends with the month's own refusal, which stops the arguing as before (the answer is still written).
 * Calls already in flight at the wall are not stopped; they finish within the month's tolerance and their record is
 * replayed later. Calls the wall never measures (the first position's own call, the answer, the story, a dig's path
 * rewrite) are never refused here.
 */
export interface MonthPauseStore {
  recordPause(input: Readonly<{ runId: string; reason: "MONTH_WALL"; resumableAt: Date; plannedCalls: number;
    plannedSearches: number; plannedMicros: number }>): Promise<"RECORDED" | "ALREADY_PAUSED" | "NOT_LIVE">;
  readPause(runId: string): Promise<Readonly<{ state: "NONE" | "PAUSED" | "RESUMED" }> | null>;
}

/** The planned stop at the month wall: this copy ends, the debate stays paused in the database until Continue. */
export const RUN_MONTH_PAUSED = "RUN_MONTH_PAUSED" as const;

export function monthPausedStop(): TypedDomainError {
  return new TypedDomainError(RUN_MONTH_PAUSED, "The debate reached the month wall and is paused until the person continues");
}

export function isMonthPausedStop(error: unknown): boolean {
  return error instanceof TypedDomainError && error.code === RUN_MONTH_PAUSED;
}

/** 0134's bound on `planned_micros`. */
const PLANNED_MICROS_MAX = 1_000_000_000;

export type MonthPauseOptions = Readonly<{
  store: MonthPauseStore;
  /** A content-free line when the planned work's estimate could not be read (the pause is still recorded, with 0). */
  log?: (line: string) => void;
}>;

type Kind = "call" | "search";

export class MonthPause {
  readonly #store: MonthPauseStore;
  readonly #log: (line: string) => void;

  constructor(options: MonthPauseOptions) {
    this.#store = options.store;
    this.#log = options.log ?? ((line) => console.warn(line));
  }

  /**
   * One walled admission under the month pause: a paused debate's call ends at once; at the wall the pause is recorded
   * and the call ends (RUN_MONTH_PAUSED). Any other refusal passes through untouched. `plannedMicros` estimates what is
   * left of the debate's planned work (main.ts: the run's body room left, `CostEnvelopeGuard.bodyMicrosLeft`).
   */
  async admit<T>(runId: string, kind: Kind, admitOnce: () => Promise<T>, plannedMicros?: () => Promise<number>): Promise<T> {
    if ((await this.#store.readPause(runId))?.state === "PAUSED") throw monthPausedStop();
    try {
      return await admitOnce();
    } catch (error) {
      if (!isMonthWallReached(error)) throw error;
      const recorded = await this.#store.recordPause({ runId, reason: "MONTH_WALL", resumableAt: error.resumableAt,
        plannedCalls: kind === "call" ? 1 : 0, plannedSearches: kind === "search" ? 1 : 0,
        plannedMicros: await this.#plannedMicros(plannedMicros) });
      // No live private debate: nothing can keep it paused, so the month's own refusal stops the arguing as before.
      if (recorded === "NOT_LIVE") throw error;
      throw monthPausedStop();
    }
  }

  async #plannedMicros(read: (() => Promise<number>) | undefined): Promise<number> {
    if (read === undefined) return 0;
    try {
      const micros = await read();
      return Number.isSafeInteger(micros) ? Math.min(PLANNED_MICROS_MAX, Math.max(0, micros)) : 0;
    } catch (error) {
      const code = error instanceof TypedDomainError ? error.code : "UNTYPED";
      this.#log(JSON.stringify({ kind: "DEBATEAI_MONTH_PAUSE", event: "PLANNED_MICROS_UNREAD", code }));
      return 0;
    }
  }
}

/**
 * The composition's hook (main.ts and the practice runner, the same statement): a call the month wall measures — one
 * made while arguing (BODY) and walled (APPLY, not the first position's own call) — is admitted under the month pause;
 * every other seam (an answer-writing call, the first position's) is returned as it is, so it never pauses.
 * `plannedMicros` estimates the planned work left for the pause record (the run's body room left).
 */
export function monthPaused<S extends ProviderCostEnvelopeSeam>(seam: S, call: Readonly<{ runId: string; phase: "BODY" | "SERVE";
  sharedWall: "APPLY" | "EXEMPT"; pause: MonthPause; plannedMicros?: () => Promise<number> }>): S {
  return call.phase === "BODY" && call.sharedWall === "APPLY" ? withMonthPause(seam, call.runId, call.pause, call.plannedMicros) : seam;
}

/** A provider call's money seam under the month pause: only its admission is wrapped; charging is never refused. */
export function withMonthPause<S extends ProviderCostEnvelopeSeam>(seam: S, runId: string, pause: MonthPause,
  plannedMicros?: () => Promise<number>): S {
  return Object.freeze({
    ...seam,
    assertCallAllowed: (projection: Parameters<ProviderCostEnvelopeSeam["assertCallAllowed"]>[0]) =>
      pause.admit(runId, "call", async () => seam.assertCallAllowed(projection), plannedMicros)
  });
}

/** A web search's money seam under the month pause (for the web step's search seam, W3-1). */
export function withMonthPauseSearch(seam: WebSearchCostSeam, runId: string, pause: MonthPause,
  plannedMicros?: () => Promise<number>): WebSearchCostSeam {
  return Object.freeze({
    ...seam,
    assertSearchAllowed: (options?: Parameters<WebSearchCostSeam["assertSearchAllowed"]>[0]) =>
      pause.admit(runId, "search", () => seam.assertSearchAllowed(options), plannedMicros)
  });
}
