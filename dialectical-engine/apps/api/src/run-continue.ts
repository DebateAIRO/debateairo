import { RUN_PATH_SET_REFUSALS, RUN_STOPS_NOT_OURS } from "@debateai/battery";
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
 * code counts as ours), it was queued as a debate (not a setup failure), its stored path set does not refuse it for good (Task 57h), never
 * settled, and not paused at the month wall. An upload's set-aside continues only where Continue moves it to the release that is current
 * (Task 57j, below). Continue stops after 2 continues that fail on our side (Task 57m); a re-open an update set aside is never one of them
 * (Task 57m-fix, the owner's answer of 8 Nov, "Update doesn't count": 0168 leaves it out of `failed_continues`). A debate that failed before
 * Task 57e's automatic retry existed reads the same: nothing here asks for its retry row.
 *
 * Task 57j (the owner's answer of 7 Nov afternoon, "Continue, they pay the rest", over 57f's ruling that a set-aside is not continued): a
 * debate an upload SET ASIDE (`RUN_SET_ASIDE:…`, `stopIsSetAside`) is continuable too, exactly where Continue moves it to this release (the
 * route's hand-over has a destination): every set-aside is bound to the debate's own release (its runner retired, a version it cannot run, the
 * owner's stop), so on that release the same wall would meet it again. What ran before the set-aside stays the site's (0123's waiver); what runs
 * after Continue is the person's, as on any run (0168's bound). The waiver no longer refuses Continue by itself.
 */

/** What 0165's core.read_run_continue says of the person's debate (null: not theirs). Codes and flags only. */
export type RunContinueFacts = Readonly<{
  /** Its newest work item: NONE (no job yet: waiting or queued), OPEN (READY or CLAIMED), DONE or FAILED. */
  state: "NONE" | "OPEN" | "DONE" | "FAILED";
  terminal_reason: string | null;
  content_live: boolean;
  /** 0123's waiver: an upload set it aside once (Task 57j: read, never a refusal by itself). */
  waived: boolean;
  /** Its work item settled an attempt (a step's tries used up: CALL_BUDGET_EXHAUSTED). */
  settled: boolean;
  /** Its newest month-wall event is a pause. */
  paused: boolean;
  /** Its newest work item was re-opened by Continue (with OPEN: it is continuing now). */
  reopened: boolean;
  /**
   * Task 57j (the coordinator's addendum): how many of its newest work item's re-opens ended FAILED again on their own (0168). Task 57m-fix
   * (the owner's answer of 8 Nov, "Update doesn't count"): a re-open that ended in an update's set-aside is never counted, the newest (set
   * aside now) nor an earlier one (0168 knows it by the next Continue of a set-aside). Task 57m (the owner's rule "stop after 2 continues that
   * fail"): at FAILED_CONTINUES_MAX the rule below says no, and the read says `keeps_failing`.
   */
  failed_continues: number;
}>;

/** The runner's own terminal reason for a stop it caught (apps/runner runnerTerminalFailureReason): the diagnostic after the colon. */
const RUNNER_FAILURE_PREFIX = "RUNNER_EXECUTION_FAILED:";

/**
 * Whether a recorded terminal reason is a stop on our side, read exactly as the runner decided its one automatic retry
 * (apps/runner runFailureRetriesOnce): every stop but the person's own act and the walls (RUN_STOPS_NOT_OURS). An upload's set-aside
 * (RUN_SET_ASIDE:…, as recorded or wrapped: `stopIsSetAside`; Task 57j continues it only where it moves) and a debate never queued
 * (RUN_SETUP_FAILED:…) are not the debate's own stop; no reason, nothing to continue. A code outside the
 * runner's diagnostic alphabet is recorded as UNRECOGNIZED_DOMAIN_ERROR (INTERNAL_FUNDING_UNAVAILABLE among them) and reads as ours.
 * Task 57h: nor is a path debate the runner refused at its claim because its stored set can never run (RUN_PATH_SET_REFUSALS, recorded as
 * they are): ours, but every copy would meet it again, so it is not continued (and 0165 gives its path-list charge back).
 */
export function stopIsOurs(terminalReason: string | null): boolean {
  if (terminalReason === null || terminalReason.trim() === "") return false;
  if (stopIsSetAside(terminalReason) || terminalReason.startsWith("RUN_SETUP_FAILED:")) return false;
  const code = terminalReason.startsWith(RUNNER_FAILURE_PREFIX) ? terminalReason.slice(RUNNER_FAILURE_PREFIX.length) : terminalReason;
  return !RUN_STOPS_NOT_OURS.has(code) && !RUN_PATH_SET_REFUSALS.has(code);
}

/**
 * Task 57j: whether a recorded terminal reason is an upload's set-aside (packages/battery runSetAsideReason), as recorded or as the runner's
 * catch would wrap it (the site reads both SET_ASIDE). 0168's core.continue_failed_run and its money bound read the same two forms.
 */
export function stopIsSetAside(terminalReason: string | null): boolean {
  if (terminalReason === null) return false;
  const code = terminalReason.startsWith(RUNNER_FAILURE_PREFIX) ? terminalReason.slice(RUNNER_FAILURE_PREFIX.length) : terminalReason;
  return code.startsWith("RUN_SET_ASIDE:");
}

/**
 * Task 57m (owner 8 Nov: "We should stop after 2 continues that fail"; "Yes, same rule" for a whole debate): after this many continues that
 * ended FAILED again on our side (0168's `failed_continues`, which never counts an update's set-aside), a debate or a dig is no longer
 * continued.
 */
const FAILED_CONTINUES_MAX = 2;

/** Every condition of the rule below but the count of failed continues. */
function continuableButForRepeats(facts: RunContinueFacts | null, moves: boolean): facts is RunContinueFacts {
  return facts !== null && facts.state === "FAILED" && facts.content_live && !facts.settled && !facts.paused
    && (stopIsOurs(facts.terminal_reason) || (moves && stopIsSetAside(facts.terminal_reason)));
}

/**
 * THE ONE RULE: whether Continue would continue this failed debate (the read's `continuable`, the route's re-open). `moves`: Continue would
 * move it to this release (the route's hand-over has a destination), which a set-aside needs (Task 57j). Task 57m: never once
 * FAILED_CONTINUES_MAX continues of it failed.
 */
export function failedRunContinuable(facts: RunContinueFacts | null, moves = false): boolean {
  return continuableButForRepeats(facts, moves) && facts.failed_continues < FAILED_CONTINUES_MAX;
}

/**
 * Task 57m: the read's `keeps_failing`: it would be continuable but for its FAILED_CONTINUES_MAX continues that failed. A debate refused for
 * any other reason never reads it.
 */
export function failedRunKeepsFailing(facts: RunContinueFacts | null, moves = false): boolean {
  return continuableButForRepeats(facts, moves) && facts.failed_continues >= FAILED_CONTINUES_MAX;
}

/**
 * The FAILED read's `continuable` (Task 57j): the rule above over the store's facts, a set-aside's destination asked of the hand-over (absent
 * hand-over: it never moves). The read and the route ask the same.
 */
export async function readFailedRunContinuable(input: Readonly<{ ownerRef: string; runId: string }>, ports: Readonly<{
  store: FailedRunContinuePort; handover?: RunHandoverPort;
}>): Promise<boolean> {
  return await readFailedRunMark(input, ports) === "CONTINUABLE";
}

/**
 * Task 57m: the FAILED read's mark: CONTINUABLE (`continuable`), KEEPS_FAILING (`keeps_failing`: continuable but for the continues that
 * failed), or null (neither). One read of the facts, the same destination as the route.
 */
export async function readFailedRunMark(input: Readonly<{ ownerRef: string; runId: string }>, ports: Readonly<{
  store: FailedRunContinuePort; handover?: RunHandoverPort;
}>): Promise<"CONTINUABLE" | "KEEPS_FAILING" | null> {
  const facts = await ports.store.readContinue(input.ownerRef, input.runId);
  if (facts === null) return null;
  const moves = await setAsideDestination(facts, input.runId, ports.handover) !== null;
  if (failedRunContinuable(facts, moves)) return "CONTINUABLE";
  return failedRunKeepsFailing(facts, moves) ? "KEEPS_FAILING" : null;
}

/** A set-aside debate's destination (null: none, or not a set-aside), asked of the hand-over only for a FAILED set-aside. */
async function setAsideDestination(facts: RunContinueFacts, runId: string, handover: RunHandoverPort | undefined) {
  if (handover === undefined || facts.state !== "FAILED" || !stopIsSetAside(facts.terminal_reason)) return null;
  return await handover.destinationOf(runId);
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
  // Task 57j: a set-aside continues only where it moves to this release, so its destination is asked first.
  const setAside = stopIsSetAside(facts.terminal_reason);
  const moving = await setAsideDestination(facts, input.runId, ports.handover);
  if (!failedRunContinuable(facts, moving !== null)) return Object.freeze({ kind: "NOT_CONTINUABLE" as const });
  if (ports.room !== undefined && !(await ports.room.continueHasRoom(input.ownerRef, input.now))) return Object.freeze({ kind: "NO_ROOM" as const });
  const destination = setAside ? moving : ports.handover === undefined ? null : await ports.handover.destinationOf(input.runId);
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
