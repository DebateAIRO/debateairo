"use client";

import { useState } from "react";
import type { DigProgress, DigProgressRead } from "./digProgress.js";
import { loadDigProgress } from "./load.js";
import { digIsWorking } from "./mapLooks.js";
import type { DigView } from "./types.js";
import { useWaitPolling } from "./useWaitPolling.js";

/*
 * dig-d1 B (owner's screen review, 3 Nov): the steps and checked findings of the ONE dig whose panel is open, while it is at
 * work (running, or rewriting the path it came from). It asks through the shared waiting checks (lib/v4/useWaitPolling.ts:
 * rarely while the tab is hidden, at once when it is shown again), one read at a time. A read that says there is no
 * progress (today's API, which has no such read) stops the asking until the dig's state moves on, so the page costs today's
 * server one extra read per dig and state. A failed read keeps what was shown. Nothing is kept in the browser.
 */

/** How often the open dig's progress is read while it works (the dig's own state is read every 15 s by the page). */
export const DIG_PROGRESS_EVERY_MS = 10_000;

export type DigProgressLoader = (runId: string) => Promise<DigProgressRead>;

export type OpenDigProgress = Readonly<{
  /** What the server reported for this dig, or null: none (yet, or today's API has no such read). */
  progress: DigProgress | null;
  /** When a read last answered (ms since 1970), for the waiting card's "Still working · checked 14:09"; null before one. */
  checkedAt: number | null;
}>;

/** The dig is at work and not held at the month wall: the only time its progress means something. */
function workingDig(dig: DigView | null): dig is DigView {
  return dig !== null && dig.state !== "WAITING" && digIsWorking(dig) && dig.pausedUntil === undefined;
}

export function useDigProgress(dig: DigView | null, load: DigProgressLoader = loadDigProgress): OpenDigProgress {
  const live = workingDig(dig);
  const runId = dig?.link.childRunId ?? null;
  // A new read for every state the dig moves into (running, then rewriting), so "no progress" never outlives its state.
  const key = live ? `${dig.link.childRunId}|${dig.state}|${dig.rewrite?.state ?? ""}` : "";
  const [read, setRead] = useState<Readonly<{ runId: string; read: DigProgressRead }> | null>(null);
  const polling = useWaitPolling(async (stillWanted) => {
    if (!live || runId === null) return "DONE";
    const next = await load(runId);
    if (stillWanted()) setRead({ runId, read: next });
    return next.kind === "ABSENT" ? "DONE" : "AGAIN";
  }, { everyMs: DIG_PROGRESS_EVERY_MS, enabled: live, restartKey: key });
  // Only this dig's read. When its state moves on, what was shown stays until the next read lands (no flash of nothing).
  const shown = live && read !== null && read.runId === runId && read.read.kind === "SHOWN" ? read.read.progress : null;
  return { progress: shown, checkedAt: live ? polling.checkedAt : null };
}
