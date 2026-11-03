"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Owner's screen review, 3 Nov 2026 (wait-f19): how a waiting page asks the server for news. It checks at once, then
 * every `everyMs` while the tab is shown, and only rarely while the tab is hidden; it checks again at once when the tab
 * is shown again or the connection comes back, and when the person presses [Try now]. After a failed check it waits
 * longer before the next one and says so (`reconnecting`), until a check answers. One check is in flight at a time, and
 * everything stops when the page goes or the check says it is done. Nothing is kept in the browser.
 *
 * The check decides what an answer means: "AGAIN" (keep waiting), "DONE" (stop: the thing is ready, failed or gone),
 * or it throws (the page lost touch). It is given `stillWanted`: false once the page has gone or the checks started
 * afresh, so a late answer sets nothing. `checkedAt` is when a check last answered: the waiting card's
 * "Still working · checked 14:09" and its "taking longer than usual" compare with it, so nothing on the page ticks.
 */

export type WaitCheckOutcome = "AGAIN" | "DONE";
export type WaitCheck = (stillWanted: () => boolean) => Promise<WaitCheckOutcome>;

/** While the tab is hidden the page checks at most this often (rarely). */
export const WAIT_HIDDEN_EVERY_MS = 60_000;
/** After a failed check, the next one comes this much later (today's debate page backs off to 30 s too). */
export const WAIT_AFTER_FAILURE_MS = 30_000;

export type WaitPollingOptions = Readonly<{
  /** How often to check while the tab is shown. */
  everyMs: number;
  /** How often while the tab is hidden; never more often than `everyMs`. */
  hiddenEveryMs?: number;
  /** How long to wait after a failed check. */
  afterFailureMs?: number;
  /** False: no checks at all (nothing to wait for). Turning it on checks at once. */
  enabled?: boolean;
  /** A change starts the checks afresh, at once (another question, or a retry the page asks for). */
  restartKey?: string | number;
}>;

export type WaitPolling = Readonly<{
  /** When a check last answered (ms since 1970), or null before the first answer. */
  checkedAt: number | null;
  /** True after a failed check, until a check answers again. */
  reconnecting: boolean;
  /** Check now ([Try now]); does nothing while a check is in flight or once the checks are done. */
  tryNow: () => void;
}>;

function tabHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

export function useWaitPolling(check: WaitCheck, options: WaitPollingOptions): WaitPolling {
  const {
    everyMs,
    hiddenEveryMs = WAIT_HIDDEN_EVERY_MS,
    afterFailureMs = WAIT_AFTER_FAILURE_MS,
    enabled = true,
    restartKey = 0
  } = options;
  // The newest check, so a page may pass a fresh closure on every render without restarting the loop.
  const checkRef = useRef(check);
  useEffect(() => {
    checkRef.current = check;
  });
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const runNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let done = false;
    let inFlight = false;
    let failed = false;
    let timer: number | undefined;

    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = undefined;
      if (!active || done || inFlight) return;
      const base = failed ? afterFailureMs : everyMs;
      timer = window.setTimeout(() => void run(), tabHidden() ? Math.max(base, hiddenEveryMs) : base);
    };

    const run = async (): Promise<void> => {
      if (!active || done || inFlight) return;
      window.clearTimeout(timer);
      timer = undefined;
      inFlight = true;
      let outcome: WaitCheckOutcome | null;
      try {
        outcome = await checkRef.current(() => active);
      } catch {
        outcome = null;
      }
      inFlight = false;
      if (!active) return;
      failed = outcome === null;
      setReconnecting(failed);
      if (!failed) setCheckedAt(Date.now());
      if (outcome === "DONE") {
        done = true;
        return;
      }
      schedule();
    };

    // Shown again: check at once. Hidden: the next check comes the rare way.
    const onVisibility = (): void => {
      if (tabHidden()) schedule();
      else void run();
    };
    const onOnline = (): void => {
      void run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    runNowRef.current = () => {
      void run();
    };
    void run();
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      runNowRef.current = null;
    };
  }, [enabled, everyMs, hiddenEveryMs, afterFailureMs, restartKey]);

  const tryNow = useCallback(() => runNowRef.current?.(), []);
  return { checkedAt, reconnecting, tryNow };
}
