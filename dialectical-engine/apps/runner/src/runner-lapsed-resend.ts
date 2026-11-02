import type { DispatchableWorkItem, ReadyWorkItem } from "@debateai/battery";

/**
 * Side-by-side spec §2: today "only a fresh runner start re-sends lapsed claims" (the start-up re-send,
 * `runner-startup-reconciliation.ts`), so a debate whose copy died mid-debate waits, claimed, until the next restart.
 * With two releases live, the release that owns it may never restart again before it retires. So each release's runner
 * re-sends its own lapsed claims every five minutes (INTERFACE constants), under its own task name (main.ts), from a
 * work repository fenced to its release (§3): another release's debate is never listed, never sent.
 *
 * Plan B D4: this re-send takes only lapsed CLAIMED items. Young READY items stay with the API's stalled-start
 * re-send; sending queued READY items again every five minutes would flood Hatchet with duplicates. NV-25 amends D4
 * for READY items Hatchet has given up after its queue wait: those are re-sent by `startStaleReadyResend` below, at
 * most once per 35 minutes per item, each admitted by the day first.
 *
 *  · one pass every `everyMs`, a `setTimeout` chain re-armed only after the pass finished (never `setInterval`), so two
 *    passes never overlap however slow the database or Hatchet is; the timer never keeps the process alive;
 *  · at most `limit` items per pass (one more is listed to tell a full pass, LAPSED_RESEND_SATURATED); the rest wait
 *    for the next pass, oldest first;
 *  · a re-send that fails is logged by its work item id and the pass goes on; a list that fails is logged with its
 *    SQLSTATE only and the next pass still runs;
 *  · a re-send still unsettled after `everyMs` is given up the same way (LAPSED_RESEND_FAILED): one hung Hatchet call
 *    never stalls the chain, so later passes still run (the item is lapsed again and listed by a later pass);
 *  · while this release retires (claims stopped, spec §4) a pass lists nothing: its runner would answer NO_WORK, and
 *    the backstop sets those debates aside. A pass under way when it starts to retire, or when `stop()` is called,
 *    sends no further item;
 *  · R2 (final review): an item a task of THIS process still runs (its claim lapsed while its renewals failed) is never
 *    sent: it would come back to this same process as a second copy under the same worker id and pay for the debate
 *    again. The skip is counted (LAPSED_RESEND_SKIPPED_RUNNING); once that task ends, a later pass sends it.
 *
 * Lines are content-free (`kind: "DEBATEAI_RUNNER_RESEND"`): an event, counts, a work item id we mint, a SQLSTATE.
 */
export const LAPSED_RESEND = Object.freeze({ everyMs: 5 * 60 * 1_000, limit: 100 });

type ResendClock = Readonly<{ setTimeout(callback: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }>;

const systemClock: ResendClock = Object.freeze({
  setTimeout: (callback: () => void, ms: number) => {
    const timer = setTimeout(callback, ms);
    // The re-send never keeps a process alive on its own.
    timer.unref();
    return timer;
  },
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)
});

const KIND = "DEBATEAI_RUNNER_RESEND";

function sqlStateOf(error: unknown): Readonly<{ sqlState?: string }> {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code) ? { sqlState: code } : {};
}

/** "SENT" when `sending` settles first, "TIMED_OUT" when `ms` pass first; a rejection of `sending` rejects. */
async function sentWithin(sending: Promise<void>, clock: ResendClock, ms: number): Promise<"SENT" | "TIMED_OUT"> {
  let handle: unknown;
  const timeout = new Promise<"TIMED_OUT">((resolve) => { handle = clock.setTimeout(() => resolve("TIMED_OUT"), ms); });
  try {
    // Promise.race subscribes to `sending`, so a late rejection after a time-out is handled, never unhandled.
    return await Promise.race([sending.then(() => "SENT" as const), timeout]);
  } finally {
    clock.clearTimeout(handle);
  }
}

export function startLapsedClaimResend(input: Readonly<{
  work: Readonly<{ listLapsedClaimed(limit: number): Promise<readonly DispatchableWorkItem[]> }>;
  dispatch(item: DispatchableWorkItem): Promise<void>;
  paused(): boolean;
  /** R2: true while a task of this process runs the work item (main.ts: the task counter's `isWorkingOn`). */
  running(workItemId: string): boolean;
  log(line: Readonly<Record<string, string | number>>): void;
  clock?: ResendClock;
}>): Readonly<{ stop(): void }> {
  const clock = input.clock ?? systemClock;
  let stopped = false;
  let timer: unknown;

  const pass = async (): Promise<void> => {
    if (input.paused()) return;
    let listed: readonly DispatchableWorkItem[];
    try {
      listed = await input.work.listLapsedClaimed(LAPSED_RESEND.limit + 1);
    } catch (error) {
      input.log(Object.freeze({ kind: KIND, event: "LAPSED_RESEND_READ_FAILED", ...sqlStateOf(error) }));
      return;
    }
    if (listed.length > LAPSED_RESEND.limit) {
      input.log(Object.freeze({ kind: KIND, event: "LAPSED_RESEND_SATURATED", listed: listed.length }));
    }
    let count = 0;
    let skipped = 0;
    for (const item of listed.slice(0, LAPSED_RESEND.limit)) {
      // stop() or this release starting to retire takes effect mid-pass: no further item of it is sent.
      if (stopped || input.paused()) break;
      if (input.running(item.workItemId)) {
        skipped += 1;
        continue;
      }
      let sent = false;
      try {
        sent = await sentWithin(input.dispatch(item), clock, LAPSED_RESEND.everyMs) === "SENT";
      } catch {
        sent = false;
      }
      if (sent) count += 1;
      else input.log(Object.freeze({ kind: KIND, event: "LAPSED_RESEND_FAILED", workItemId: item.workItemId }));
    }
    if (skipped > 0) input.log(Object.freeze({ kind: KIND, event: "LAPSED_RESEND_SKIPPED_RUNNING", count: skipped }));
    if (count > 0) input.log(Object.freeze({ kind: KIND, event: "LAPSED_RESENT", count }));
  };

  const arm = (): void => {
    if (stopped) return;
    timer = clock.setTimeout(() => {
      timer = undefined;
      // A throwing pause check or log line never ends the chain: the next pass is armed either way.
      void pass().catch(() => undefined).finally(arm);
    }, LAPSED_RESEND.everyMs);
  };

  arm();
  return Object.freeze({
    stop() {
      stopped = true;
      if (timer !== undefined) clock.clearTimeout(timer);
      timer = undefined;
    }
  });
}

/**
 * NV-25 (security audit run 3) — READY WORK THE JOB SYSTEM GAVE UP. This amends plan B D4 for READY items Hatchet has
 * given up: a task waits at most RUNNER_QUEUE_WAIT_LIMIT in Hatchet's queue (`scheduleTimeout`), and without the room
 * nothing re-sent a READY item after that until some runner restarted. So each release's runner re-sends its own READY
 * items, under its own task name (main.ts), from a work repository fenced to its release (§3). Young READY items stay
 * with the API's stalled-start re-send.
 *
 *  · an item is eligible only once this process first saw it READY, or last attempted it, at least `staleAfterMs` ago:
 *    RUNNER_QUEUE_WAIT_LIMIT ("30m", apps/runner/src/index.ts) plus one pass, so any copy sent earlier (by the boot,
 *    the API or this re-send) has passed Hatchet's schedule timeout. This module does not import the runner's index; a
 *    unit test pins the relation. A first sighting is never sent, the instant is read for each item at its attempt,
 *    and the memory is pruned to the current listing (never more than `limit` + 1 entries);
 *  · every re-send is first admitted by the run's OWN version's daily guard (`admit`; main.ts: `staleReadyDayAdmission`,
 *    run-settings.ts), the rule, lock, reservation and amount a new run meets. A refusal (the day is reached) sends
 *    nothing, leaves the item's instant where it was and stops the pass: the daily rule refuses whatever the amount and
 *    every version's guard counts the same site day, so no later item of the pass could be admitted either (do not
 *    "optimise" the pass to try other versions). An admission that throws is logged with its SQLSTATE and also stops
 *    the pass. Nothing unadmitted is ever sent;
 *  · at most `capacity()` admitted attempts per pass (the worker's free places, read once per pass; one that throws or
 *    is not a number gives none), so neither Hatchet's queue nor the day's reservations fill with copies that would
 *    only wait and be dropped again; eligible items past that number stay eligible (STALE_READY_RESEND_DEFERRED);
 *  · an admitted attempt moves the item's instant whether its send works or not, and a send that fails, or is still
 *    unsettled after `everyMs`, stops the pass (STALE_READY_RESEND_FAILED): a failing Hatchet never multiplies copies,
 *    and costs at most one unused reservation per pass;
 *  · a pass stopped early (a refusal, an admission error, a failed send) gives the rest of its window no first sighting:
 *    their bound starts at a later pass, which only delays them;
 *  · as the lapsed re-send above: one pass every `everyMs`, never overlapping; at most `limit` items per pass (one more
 *    is listed to tell a full pass, STALE_READY_RESEND_SATURATED); nothing listed while this release retires; never an
 *    item a task of this process runs (R2, STALE_READY_RESEND_SKIPPED_RUNNING); a list that fails is logged with its
 *    SQLSTATE only and the next pass still runs.
 *
 * A copy that finds the item no longer READY answers NO_WORK without a write, so a duplicate is harmless.
 * Lines are content-free (`kind: "DEBATEAI_RUNNER_RESEND"`): an event, counts, a work item id we mint, a SQLSTATE.
 */
export const STALE_READY_RESEND = Object.freeze({ everyMs: 5 * 60 * 1_000, staleAfterMs: 35 * 60 * 1_000, limit: 100 });

export function startStaleReadyResend(input: Readonly<{
  work: Readonly<{ listReady(limit: number): Promise<readonly ReadyWorkItem[]> }>;
  /** The day's admission of one re-send (main.ts: `staleReadyDayAdmission`): false when the day is reached. */
  admit(item: ReadyWorkItem): Promise<boolean>;
  /** The worker's free places (main.ts: RUNNER_CAPACITY.concurrentRuns minus this process's running tasks). */
  capacity(): number;
  dispatch(item: ReadyWorkItem): Promise<void>;
  paused(): boolean;
  /** R2: true while a task of this process runs the work item (main.ts: the task counter's `isWorkingOn`). */
  running(workItemId: string): boolean;
  log(line: Readonly<Record<string, string | number>>): void;
  clock?: ResendClock;
  now?: () => number;
}>): Readonly<{ stop(): void }> {
  const clock = input.clock ?? systemClock;
  const now = input.now ?? Date.now;
  let stopped = false;
  let timer: unknown;
  // By work item id: when this process first saw the item READY, or last attempted it (admitted, sent or not).
  const touched = new Map<string, number>();

  const pass = async (): Promise<void> => {
    if (input.paused()) return;
    let listed: readonly ReadyWorkItem[];
    try {
      listed = await input.work.listReady(STALE_READY_RESEND.limit + 1);
    } catch (error) {
      input.log(Object.freeze({ kind: KIND, event: "STALE_READY_RESEND_READ_FAILED", ...sqlStateOf(error) }));
      return;
    }
    if (listed.length > STALE_READY_RESEND.limit) {
      input.log(Object.freeze({ kind: KIND, event: "STALE_READY_RESEND_SATURATED", listed: listed.length }));
    }
    const window = listed.slice(0, STALE_READY_RESEND.limit);
    const windowIds = new Set(window.map((item) => item.workItemId));
    for (const id of [...touched.keys()]) if (!windowIds.has(id)) touched.delete(id);
    let room = 0;
    try {
      const raw = input.capacity();
      room = Number.isFinite(raw) ? Math.max(0, Math.min(STALE_READY_RESEND.limit, Math.floor(raw))) : 0;
    } catch {
      room = 0;
    }
    let attempts = 0;
    let count = 0;
    let skipped = 0;
    let deferred = 0;
    for (const item of window) {
      // stop() or this release starting to retire takes effect mid-pass: no further item of it is sent.
      if (stopped || input.paused()) break;
      const id = item.workItemId;
      if (input.running(id)) {
        skipped += 1;
        continue;
      }
      const seenAt = now();
      const last = touched.get(id);
      if (last === undefined) {
        touched.set(id, seenAt);
        continue;
      }
      if (seenAt - last < STALE_READY_RESEND.staleAfterMs) continue;
      if (attempts >= room) {
        deferred += 1;
        continue;
      }
      let admitted: boolean;
      try {
        admitted = await input.admit(item);
      } catch (error) {
        input.log(Object.freeze({ kind: KIND, event: "STALE_READY_RESEND_ADMIT_FAILED", ...sqlStateOf(error) }));
        break;
      }
      if (!admitted) {
        // The instant stays where it was: the next pass asks the day again for this item first.
        input.log(Object.freeze({ kind: KIND, event: "STALE_READY_RESEND_NOT_ADMITTED", workItemId: id }));
        break;
      }
      attempts += 1;
      touched.set(id, now());
      let sent = false;
      try {
        sent = await sentWithin(input.dispatch(item), clock, STALE_READY_RESEND.everyMs) === "SENT";
      } catch {
        sent = false;
      }
      if (!sent) {
        input.log(Object.freeze({ kind: KIND, event: "STALE_READY_RESEND_FAILED", workItemId: id }));
        break;
      }
      count += 1;
    }
    if (skipped > 0) input.log(Object.freeze({ kind: KIND, event: "STALE_READY_RESEND_SKIPPED_RUNNING", count: skipped }));
    if (deferred > 0) input.log(Object.freeze({ kind: KIND, event: "STALE_READY_RESEND_DEFERRED", count: deferred }));
    if (count > 0) input.log(Object.freeze({ kind: KIND, event: "STALE_READY_RESENT", count }));
  };

  const arm = (): void => {
    if (stopped) return;
    timer = clock.setTimeout(() => {
      timer = undefined;
      // A throwing pause check or log line never ends the chain: the next pass is armed either way.
      void pass().catch(() => undefined).finally(arm);
    }, STALE_READY_RESEND.everyMs);
  };

  arm();
  return Object.freeze({
    stop() {
      stopped = true;
      if (timer !== undefined) clock.clearTimeout(timer);
      timer = undefined;
    }
  });
}
