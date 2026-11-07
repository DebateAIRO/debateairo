"use client";

import { useEffect, useRef } from "react";
import { quotaChanged } from "./quotaPulse.js";
import type { DigView } from "./types.js";

/*
 * wait-f22 / map-f9 / public-f15 (owner's screen review, 3 Nov 2026): the map page tells the quota figures to read again
 * (lib/v4/quotaPulse.ts) at the moments quota is used: when the question's answer arrives after the page saw it running
 * (the wait), when a dig starts (it appears among the page's digs once sent), and when a dig finishes or fails. A debate
 * already answered when the page opened, and digs already done then, are not a moment. Nothing is kept anywhere.
 * The wave-2 review (4 Nov): the page's digs arrive over several reads (the records, the question list, each dig's state,
 * shown meanwhile as working), so the first digs are taken as the starting point only once the page has read them all
 * (`settled`); an old dig found late is then never "a dig that just started" nor "a dig that just finished".
 */

function finished(state: DigView["state"]): boolean {
  return state === "DONE" || state === "FAILED";
}

/** What changes count as a quota moment, given the digs seen before (id → state) and now. Exported for its test. */
export function quotaMomentBetween(before: ReadonlyMap<string, DigView["state"]>, now: readonly DigView[]): boolean {
  return now.some((dig) => {
    const was = before.get(dig.link.childRunId);
    // A dig new to the page that is still going was just started (or reached from elsewhere): its share is being used.
    if (was === undefined) return !finished(dig.state);
    return was !== dig.state && (finished(dig.state) || dig.state === "RUNNING");
  });
}

export function useQuotaMoments(input: Readonly<{
  /** The page shows the question still running (its waiting card): its answer arriving later is a moment. */
  running: boolean;
  served: boolean;
  digs: readonly DigView[];
  /** The page has read every dig it knows of (records, question list, each dig's state). */
  settled: boolean;
}>): void {
  const { running, served, digs, settled } = input;
  const sawRunning = useRef(false);
  const wasServed = useRef(served);
  const seen = useRef<ReadonlyMap<string, DigView["state"]> | null>(null);
  useEffect(() => {
    if (running) sawRunning.current = true;
    let moment = served && !wasServed.current && sawRunning.current;
    wasServed.current = served;
    const now = new Map(digs.map((dig) => [dig.link.childRunId, dig.state] as const));
    // The first digs the page has read in full are where it starts from, not a moment.
    if (seen.current !== null && quotaMomentBetween(seen.current, digs)) moment = true;
    if (served && (seen.current !== null || settled)) seen.current = now;
    if (moment) quotaChanged();
  }, [running, served, digs, settled]);
}
