import type { DispatchableWorkItem } from "@debateai/battery";

/**
 * Side-by-side spec §2: today "only a fresh runner start re-sends lapsed claims" (the start-up re-send,
 * `runner-startup-reconciliation.ts`), so a debate whose copy died mid-debate waits, claimed, until the next restart.
 * With two releases live, the release that owns it may never restart again before it retires. So each release's runner
 * re-sends its own lapsed claims every five minutes (INTERFACE constants), under its own task name (main.ts), from a
 * work repository fenced to its release (§3): another release's debate is never listed, never sent.
 *
 * Plan B D4: only lapsed CLAIMED items. READY items stay with the API's stalled-start re-send; sending queued READY
 * items again every five minutes would flood Hatchet with duplicates.
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
 *    sends no further item.
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
    for (const item of listed.slice(0, LAPSED_RESEND.limit)) {
      // stop() or this release starting to retire takes effect mid-pass: no further item of it is sent.
      if (stopped || input.paused()) break;
      let sent = false;
      try {
        sent = await sentWithin(input.dispatch(item), clock, LAPSED_RESEND.everyMs) === "SENT";
      } catch {
        sent = false;
      }
      if (sent) count += 1;
      else input.log(Object.freeze({ kind: KIND, event: "LAPSED_RESEND_FAILED", workItemId: item.workItemId }));
    }
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
