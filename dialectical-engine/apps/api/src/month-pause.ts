import type { MonthPause } from "@debateai/contract";
import { exhaustive } from "@debateai/kernel";

/**
 * The money rule (owner, 31 Oct 2026, point 5; plan 2026-10-30 dig-model revision W3-2, durable since W3-8) — THE MONTH
 * PAUSE, the API's half. At the month wall the runner records a pause (identity.run_pause_event, 0134), stops the
 * debate's copy as a planned stop and releases its work item, which no runner claims or re-sends while the debate is
 * paused (apps/runner/src/month-pause.ts). The run read says so (`month_pause`), and the person presses Continue
 * (POST /v1/runs/{id}/continue) once the month has reset and the room code finds room in it (`monthHasRoom`); then 0134's
 * resume_paused_run records it, the item is handed to its runner again (`ContinuedRunWake`) and that copy replays what was
 * finished and goes on (true resume: nothing it finished is paid again). A debate whose release is no longer this one is
 * handed over first (`RunHandoverPort`).
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

/**
 * Plan 2026-10-31 decision 12 — THE HAND-OVER. A debate's month pause can outlast its release: uploads come every few days.
 * Continue therefore moves a debate that is not this release's into this release, in one transaction with the resume
 * (0143): everything found, answered and paid stays under the same run, and the debate goes on here. It stays on its own
 * settings version when this release has passed it (the same words, so every answer replays); else on the version a new
 * debate would start on now. Which recorded answers stand then, and why one step never mixes two wordings, is the runner's
 * rule (apps/runner/src/run-replay.ts). No new hold is opened and nothing is charged here: the run keeps its one hold.
 */
export interface RunHandoverPort {
  /** Where this debate would move; null when it is already this release's (Continue is the plain resume). */
  destinationOf(runId: string): Promise<Readonly<{ releaseKey: string; registerVersion: number }> | null>;
  /** 0143's continue_paused_run_in_release. */
  resumeInRelease(ownerRef: string, runId: string, releaseKey: string, registerVersion: number)
    : Promise<"RECORDED" | "NOT_PAUSED" | "NOT_OWNED" | "NOT_CURRENT" | "VERSION_NOT_PASSED">;
}

/** The port over the API's own parts: this release, the version reads and 0143's two definers. */
export function runHandoverOf(ports: Readonly<{
  ownReleaseKey: string;
  readRunReleaseNow(runId: string): Promise<Readonly<{ releaseKey: string; registerVersion: number }> | null>;
  versionPassed(registerVersion: number): Promise<boolean>;
  activeVersion(): Promise<number>;
  resumeInRelease: RunHandoverPort["resumeInRelease"];
}>): RunHandoverPort {
  return Object.freeze({
    async destinationOf(runId: string) {
      // A `legacy` process (development, tests) has one release and nothing to hand over to.
      if (ports.ownReleaseKey === "legacy") return null;
      const now = await ports.readRunReleaseNow(runId);
      if (now === null || now.releaseKey === ports.ownReleaseKey) return null;
      const registerVersion = await ports.versionPassed(now.registerVersion) ? now.registerVersion : await ports.activeVersion();
      return Object.freeze({ releaseKey: ports.ownReleaseKey, registerVersion });
    },
    resumeInRelease: ports.resumeInRelease
  });
}

export type ContinueOutcome =
  | Readonly<{ kind: "CONTINUING" }>
  | Readonly<{ kind: "TRY_AGAIN" }>
  | Readonly<{ kind: "NOT_FOUND" }>
  | Readonly<{ kind: "NOT_PAUSED" }>
  | Readonly<{ kind: "UNTIL_RESET"; until: string }>;

/**
 * R22 W3-8 — THE WAKE after Continue. At the wall the runner released the debate's work item (a planned stop: not
 * FAILED, no answer written) and no runner re-sends a paused debate. Once Continue is recorded the API hands the item
 * to its release's runner again (the routed dispatcher); that copy replays every call already answered (free) and goes
 * on. Best effort: a wake that fails is only logged, as the runner's own five-minute lapsed re-send picks the item up
 * anyway now that its debate is no longer paused.
 */
export interface ContinuedRunWake {
  wake(runId: string): Promise<void>;
}

/** The wake over the API's own parts: the run's claimable work item (none: nothing to send) and the routed dispatcher. */
export function continuedRunWake(ports: Readonly<{
  claimableWorkItemOf(runId: string): Promise<string | null>;
  dispatch(input: Readonly<{ runId: string; workItemId: string }>): Promise<void>;
}>): ContinuedRunWake {
  return Object.freeze({
    async wake(runId: string) {
      const workItemId = await ports.claimableWorkItemOf(runId);
      if (workItemId !== null) await ports.dispatch({ runId, workItemId });
    }
  });
}

/**
 * POST /v1/runs/{id}/continue: the ownership check (0134 answers null for another account's debate), the room check,
 * then the resume and the wake. A debate never paused has nothing to continue (409 RUN_NOT_PAUSED at the route). A second
 * press is idempotent: a debate whose newest pause event is already RESUMED answers CONTINUING again (and is woken again,
 * which sends nothing while a runner holds it), as does a press that lost the race to record the resume.
 */
export async function continuePausedRun(input: Readonly<{ ownerRef: string; runId: string; now: Date }>,
  pauses: MonthPausePort, room: MonthRoomReader, wake?: ContinuedRunWake,
  log: (line: string) => void = (line) => console.warn(line), handover?: RunHandoverPort): Promise<ContinueOutcome> {
  const pause = await pauses.readPause(input.ownerRef, input.runId);
  if (pause === null) return Object.freeze({ kind: "NOT_FOUND" as const });
  if (pause.state === "RESUMED") return woken(input.runId, wake, log);
  const shown = monthPauseOf(pause, input.now, false);
  if (shown === null) return Object.freeze({ kind: "NOT_PAUSED" as const });
  if (input.now.getTime() < new Date(shown.until).getTime() || !(await room.monthHasRoom(input.ownerRef, input.now))) {
    return Object.freeze({ kind: "UNTIL_RESET" as const, until: shown.until });
  }
  const destination = handover === undefined ? null : await handover.destinationOf(input.runId);
  const outcome = destination === null ? await pauses.resume(input.ownerRef, input.runId)
    : await handover!.resumeInRelease(input.ownerRef, input.runId, destination.releaseKey, destination.registerVersion);
  switch (outcome) {
    // A switch of releases is under way, or this release has not passed the version: nothing changed, ask again.
    case "NOT_CURRENT":
    case "VERSION_NOT_PASSED": return Object.freeze({ kind: "TRY_AGAIN" as const });
    // NOT_PAUSED here: another press recorded the resume first (the read above saw it paused).
    case "RECORDED":
    case "NOT_PAUSED": return woken(input.runId, wake, log);
    case "NOT_OWNED": return Object.freeze({ kind: "NOT_FOUND" as const });
    default: return exhaustive(outcome);
  }
}

async function woken(runId: string, wake: ContinuedRunWake | undefined, log: (line: string) => void): Promise<ContinueOutcome> {
  try {
    await wake?.wake(runId);
  } catch (error) {
    // Content-free: a fixed kind and the error's own code when it has one.
    const code = typeof (error as { code?: unknown } | null)?.code === "string" ? String((error as { code: string }).code) : "UNTYPED";
    log(JSON.stringify({ kind: "DEBATEAI_MONTH_PAUSE_WAKE", event: "WAKE_FAILED", code: /^[A-Z0-9_]{1,64}$/u.test(code) ? code : "UNTYPED" }));
  }
  return Object.freeze({ kind: "CONTINUING" as const });
}
