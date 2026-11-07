import { RUN_STOPS_NOT_OURS } from "@debateai/battery";
import { costEnvelopeDay } from "@debateai/budget";
import { exhaustive } from "@debateai/kernel";
import type { ContinuedRunWake, RunHandoverPort } from "./month-pause.js";

/**
 * V4 start step, Task 57f (the owner's 7 Nov answers, his words: "whatever was already 'investigated' remains, because the user paid for it
 * already. we need to have a way to continue where it 'broke', and not charge the customer again ... Only if we can't re-use, then we need
 * to pay for this ourselves"; cards "Only what never ran" and "Button on the stopped page", both Recommended) — CONTINUE WHERE IT STOPPED.
 *
 * POST /v1/runs/{id}/continue, today's Continue of a debate paused at the month wall (./month-pause.ts), also continues the person's own
 * FAILED debate, a first question or a dig alike: the SAME work item goes back to be claimed (0165's core.continue_failed_run, one owner-checked
 * step that records each re-open, ids and times only) and its runner is woken; that copy resumes the debate from what it saved (0119's true
 * resume: every call already answered is replayed from the debate's own record, never bought again; a seat that sits out hands over to its
 * backup as on any copy). The person pays only for what never ran: the calls the copy really buys now are charged as on any run (their quota,
 * the site's day and the debate's ceiling apply), and a call an earlier copy paid for whose answer cannot be handed back is the site's once it
 * is bought again (0165's call waiver, written by the runner's replaying gateway).
 *
 * A debate is continuable (`failedRunContinuable`, which the FAILED read and the route share) when it is FAILED, its content is live, its stop
 * was ours (`stopIsOurs`: never the person's own act, a spending wall or a step's tries used up; a reason the runner recorded without a typed
 * code counts as ours), an upload did not set it aside (0123's waiver: it used none of the person's quota and its page says so), it was queued
 * as a debate (not a setup failure), never settled, not paused at the month wall, and not re-opened since it failed. A debate that failed before
 * Task 57e's automatic retry existed reads the same: nothing here asks for its retry row.
 */

/** What 0165's core.read_run_continue says of the person's debate (null: not theirs). Codes and flags only. */
export type RunContinueFacts = Readonly<{
  /** Its newest work item: NONE (no job yet: waiting or queued), OPEN (READY or CLAIMED), DONE or FAILED. */
  state: "NONE" | "OPEN" | "DONE" | "FAILED";
  terminal_reason: string | null;
  content_live: boolean;
  /** 0123's waiver: an upload set it aside. */
  waived: boolean;
  /** Its work item settled an attempt (a step's tries used up: CALL_BUDGET_EXHAUSTED). */
  settled: boolean;
  /** Its newest month-wall event is a pause. */
  paused: boolean;
  /** Its newest work item was re-opened by Continue (with OPEN: it is continuing now). */
  reopened: boolean;
}>;

/** The runner's own terminal reason for a stop it caught (apps/runner runnerTerminalFailureReason): the diagnostic after the colon. */
const RUNNER_FAILURE_PREFIX = "RUNNER_EXECUTION_FAILED:";

/**
 * Whether a recorded terminal reason is a stop on our side, read exactly as the runner decided its one automatic retry
 * (apps/runner runFailureRetriesOnce): every stop but the person's own act and the walls (RUN_STOPS_NOT_OURS). An upload's set-aside
 * (RUN_SET_ASIDE:…) and a debate never queued (RUN_SETUP_FAILED:…) are not continued; no reason, nothing to continue. A code outside the
 * runner's diagnostic alphabet is recorded as UNRECOGNIZED_DOMAIN_ERROR (INTERNAL_FUNDING_UNAVAILABLE among them) and reads as ours.
 */
export function stopIsOurs(terminalReason: string | null): boolean {
  if (terminalReason === null || terminalReason.trim() === "") return false;
  if (terminalReason.startsWith("RUN_SET_ASIDE:") || terminalReason.startsWith("RUN_SETUP_FAILED:")) return false;
  const code = terminalReason.startsWith(RUNNER_FAILURE_PREFIX) ? terminalReason.slice(RUNNER_FAILURE_PREFIX.length) : terminalReason;
  return !RUN_STOPS_NOT_OURS.has(code);
}

/** THE ONE RULE: whether Continue would continue this failed debate (the read's `continuable`, the route's re-open). */
export function failedRunContinuable(facts: RunContinueFacts | null): boolean {
  return facts !== null && facts.state === "FAILED" && facts.content_live && !facts.waived && !facts.settled && !facts.paused
    && stopIsOurs(facts.terminal_reason);
}

/** 0165's core.continue_failed_run: RECORDED (re-opened now), CONTINUING (re-opened already and still running), or why not. */
export type RunReopenOutcome = "RECORDED" | "CONTINUING" | "NOT_FAILED" | "NOT_CONTINUABLE" | "NOT_OWNED" | "NOT_CURRENT" | "VERSION_NOT_PASSED";

/** The database's half, on the API's own pool (packages/db PostgresDigModelRepository). */
export interface FailedRunContinuePort {
  readContinue(ownerRef: string, runId: string): Promise<RunContinueFacts | null>;
  /**
   * Re-opens the person's FAILED debate. `destination`: the release (and settings version) it moves to when it is an older release's
   * (./month-pause.ts RunHandoverPort, decision 12), in the same transaction; null when it is already this release's.
   */
  reopen(ownerRef: string, runId: string, destination: Readonly<{ releaseKey: string; registerVersion: number }> | null): Promise<RunReopenOutcome>;
}

/** Whether there is room for the rest of a continued debate: the person's quota and the site's day. */
export interface ContinueRoomReader {
  continueHasRoom(ownerRef: string, now: Date): Promise<boolean>;
}

/**
 * The room over the API's own parts (main.ts): the person's pool (the ask room's `readPersonPool`: every window of theirs, a team's month
 * for a funded person) is not empty, and the site's day is below its ceiling. Without a room (local mode) nothing is checked.
 */
export function continueRoomOf(ports: Readonly<{
  personPool(ownerRef: string, now: Date): Promise<Readonly<{ empty: boolean }>>;
  daySpentMicros(day: string): Promise<number>;
  dailyCeilingMicros: number;
}>): ContinueRoomReader {
  return Object.freeze({
    async continueHasRoom(ownerRef: string, now: Date) {
      if ((await ports.personPool(ownerRef, now)).empty) return false;
      return await ports.daySpentMicros(costEnvelopeDay(now)) < ports.dailyCeilingMicros;
    }
  });
}

/** ApiOptions.failedRunContinue: the store, and the room (absent: no limits, local mode). */
export type FailedRunContinueOptions = Readonly<{ store: FailedRunContinuePort; room?: ContinueRoomReader }>;

export type FailedContinueOutcome =
  | Readonly<{ kind: "CONTINUING" }>
  /** Neither FAILED nor re-opened: the route answers as before (the month wall's Continue, or 409 RUN_NOT_PAUSED). */
  | Readonly<{ kind: "NOT_FAILED" }>
  | Readonly<{ kind: "NOT_FOUND" }>
  | Readonly<{ kind: "NOT_CONTINUABLE" }>
  | Readonly<{ kind: "NO_ROOM" }>
  /** An upload is switching over this moment: nothing changed, the next press goes through. */
  | Readonly<{ kind: "TRY_AGAIN" }>;

/**
 * The failed debate's half of POST /v1/runs/{id}/continue. The person's own debate only (another's reads null: NOT_FOUND). Paused at the
 * month wall: NOT_FAILED, whatever its work item says, so the month wall's Continue answers it as before. Re-opened and
 * still running: CONTINUING (woken again, which sends nothing while a runner holds it), nothing re-opened twice. Not FAILED: NOT_FAILED, for the
 * route's month-wall path. A failed debate that is not continuable: NOT_CONTINUABLE. No room for the rest: NO_ROOM. Otherwise one re-open
 * (and the hand-over of an older release's debate, in the same transaction), then the wake.
 */
export async function continueFailedRun(input: Readonly<{ ownerRef: string; runId: string; now: Date }>, ports: Readonly<{
  store: FailedRunContinuePort; room?: ContinueRoomReader; wake?: ContinuedRunWake; handover?: RunHandoverPort; log?: (line: string) => void;
}>): Promise<FailedContinueOutcome> {
  const log = ports.log ?? ((line: string) => console.warn(line));
  const facts = await ports.store.readContinue(input.ownerRef, input.runId);
  if (facts === null) return Object.freeze({ kind: "NOT_FOUND" as const });
  // Paused at the month wall (a continued debate can reach it too): the month wall's Continue answers it, exactly as before.
  if (facts.paused) return Object.freeze({ kind: "NOT_FAILED" as const });
  if (facts.state === "OPEN" && facts.reopened) return woken(input.runId, ports.wake, log);
  if (facts.state !== "FAILED") return Object.freeze({ kind: "NOT_FAILED" as const });
  if (!failedRunContinuable(facts)) return Object.freeze({ kind: "NOT_CONTINUABLE" as const });
  if (ports.room !== undefined && !(await ports.room.continueHasRoom(input.ownerRef, input.now))) return Object.freeze({ kind: "NO_ROOM" as const });
  const destination = ports.handover === undefined ? null : await ports.handover.destinationOf(input.runId);
  const outcome = await ports.store.reopen(input.ownerRef, input.runId, destination);
  switch (outcome) {
    // RECORDED: re-opened now. CONTINUING: another press re-opened it first (the read above saw it FAILED).
    case "RECORDED":
    case "CONTINUING": return woken(input.runId, ports.wake, log);
    case "NOT_CURRENT":
    case "VERSION_NOT_PASSED": return Object.freeze({ kind: "TRY_AGAIN" as const });
    case "NOT_OWNED": return Object.freeze({ kind: "NOT_FOUND" as const });
    // Between the read and the re-open it ended otherwise (or the database refused what the read could not see): nothing changed.
    case "NOT_FAILED":
    case "NOT_CONTINUABLE": return Object.freeze({ kind: "NOT_CONTINUABLE" as const });
    default: return exhaustive(outcome);
  }
}

async function woken(runId: string, wake: ContinuedRunWake | undefined, log: (line: string) => void): Promise<FailedContinueOutcome> {
  try {
    await wake?.wake(runId);
  } catch (error) {
    // Content-free: a fixed kind and the error's own code when it has one. The runner's lapsed re-send takes the item anyway.
    const code = typeof (error as { code?: unknown } | null)?.code === "string" ? String((error as { code: string }).code) : "UNTYPED";
    log(JSON.stringify({ kind: "DEBATEAI_RUN_CONTINUE_WAKE", event: "WAKE_FAILED", code: /^[A-Z0-9_]{1,64}$/u.test(code) ? code : "UNTYPED" }));
  }
  return Object.freeze({ kind: "CONTINUING" as const });
}
