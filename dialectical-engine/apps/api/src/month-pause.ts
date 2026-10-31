import type { MonthPause } from "@debateai/contract";
import { exhaustive } from "@debateai/kernel";

/**
 * The money rule (owner, 31 Oct 2026, point 5; plan 2026-10-30 dig-model revision W3-2) — THE MONTH PAUSE, the API's
 * half. At the month wall the runner records a pause (identity.run_pause_event, 0134) and holds the debate's remaining
 * planned calls and searches (apps/runner/src/month-pause.ts). The run read says so (`month_pause`), and the person
 * presses Continue once the month has reset and the room code finds room in it (`monthHasRoom`); then 0134's
 * resume_paused_run records it and the runner goes on where it stopped (true resume: nothing it finished is paid again).
 * Before the reset, Continue is refused with RUN_PAUSED_UNTIL_RESET and changes nothing (an upgrade inside the month
 * does not lift a pause early: the contract's refusal names the reset).
 */
export type RunPauseState = Readonly<{
  state: "NONE" | "PAUSED" | "RESUMED";
  resumable_at: string | null;
}>;

export interface MonthPausePort {
  /** 0134's read_run_pause: null when the debate is not this account's. */
  readPause(ownerRef: string, runId: string): Promise<RunPauseState | null>;
  /** 0134's resume_paused_run. */
  resume(ownerRef: string, runId: string): Promise<"RECORDED" | "NOT_PAUSED" | "NOT_OWNED">;
}

/** Whether the person's month has room for the paused work again (its limit less the reserve kept inside it). */
export interface MonthRoomReader {
  monthHasRoom(ownerRef: string, now: Date): Promise<boolean>;
}

/**
 * The run read's `month_pause`: present only while the debate's newest pause event is a pause. `can_continue` once the
 * month it waits for has begun (`now` at or past `until`) and has room.
 */
export function monthPauseOf(pause: RunPauseState | null, now: Date, monthHasRoom: boolean): MonthPause | null {
  if (pause === null || pause.state !== "PAUSED" || pause.resumable_at === null) return null;
  const until = new Date(pause.resumable_at);
  if (Number.isNaN(until.getTime())) throw new TypeError("RUN_PAUSE_ROW_INVALID");
  return Object.freeze({ until: until.toISOString(), can_continue: now.getTime() >= until.getTime() && monthHasRoom });
}

export type ContinueOutcome =
  | Readonly<{ kind: "CONTINUING" }>
  | Readonly<{ kind: "NOT_FOUND" }>
  | Readonly<{ kind: "NOT_PAUSED" }>
  | Readonly<{ kind: "UNTIL_RESET"; until: string }>;

/**
 * POST /v1/runs/{id}/continue: the ownership check (0134 answers null for another account's debate), the room check,
 * then the resume. A debate that is not paused has nothing to continue (409 RUN_NOT_PAUSED at the route).
 */
export async function continuePausedRun(input: Readonly<{ ownerRef: string; runId: string; now: Date }>,
  pauses: MonthPausePort, room: MonthRoomReader): Promise<ContinueOutcome> {
  const pause = await pauses.readPause(input.ownerRef, input.runId);
  if (pause === null) return Object.freeze({ kind: "NOT_FOUND" as const });
  const shown = monthPauseOf(pause, input.now, false);
  if (shown === null) return Object.freeze({ kind: "NOT_PAUSED" as const });
  if (input.now.getTime() < new Date(shown.until).getTime() || !(await room.monthHasRoom(input.ownerRef, input.now))) {
    return Object.freeze({ kind: "UNTIL_RESET" as const, until: shown.until });
  }
  const outcome = await pauses.resume(input.ownerRef, input.runId);
  switch (outcome) {
    case "RECORDED": return Object.freeze({ kind: "CONTINUING" as const });
    case "NOT_PAUSED": return Object.freeze({ kind: "NOT_PAUSED" as const });
    case "NOT_OWNED": return Object.freeze({ kind: "NOT_FOUND" as const });
    default: return exhaustive(outcome);
  }
}
