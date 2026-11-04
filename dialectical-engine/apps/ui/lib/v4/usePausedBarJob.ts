"use client";

import { useState } from "react";
import type { MessageCatalog } from "@/lib/i18n/translate";
import { continueRun } from "./money.js";
import { pauseOfDig, pausePhoneBar } from "./monthPause.js";
import type { DigView, V4Selection } from "./types.js";

/*
 * Owner review 3 Nov (wait-f2): the phone's pinned bar says "Paused · Continue" while the place open in the panel is a dig
 * paused at the month wall. Before the reset its second half is the plain "Continues on 1 Dec" label (nothing to press,
 * map-f31); once the server says the new month has started, Continue presses the run's own continue (as V4MonthPause
 * does). The words are lib/v4/monthPause.ts pausePhoneBar's. Memory only.
 */

export type PausedBarJob = Readonly<{
  kind: "paused";
  /** "Paused". */
  label: string;
  /** "Continue" once the new month has started; null before. */
  continueLabel: string | null;
  /** "Continues on 1 Dec" before the reset; null after. */
  untilLabel: string | null;
  /** Continue was pressed and the dig still reads as paused. */
  busy: boolean;
  onContinue: () => void;
}>;

/** The dig open in the panel (a `dig:<run>` selection), or null. */
export function selectedDigOf(digs: readonly DigView[], selection: V4Selection): DigView | null {
  if (!selection.startsWith("dig:")) return null;
  const childRunId = selection.slice("dig:".length);
  return digs.find((dig) => dig.link.childRunId === childRunId) ?? null;
}

export function usePausedBarJob(dig: DigView | null, catalog: MessageCatalog, locale: string): PausedBarJob | null {
  // The digs whose Continue was pressed (until the dig reads as running again, or the press failed).
  const [pressed, setPressed] = useState<ReadonlySet<string>>(() => new Set());
  const pause = dig === null ? null : pauseOfDig(dig);
  if (dig === null || pause === null) return null;
  const childRunId = dig.link.childRunId;
  const words = pausePhoneBar(pause, catalog, locale);
  return {
    kind: "paused",
    ...words,
    busy: pressed.has(childRunId),
    onContinue: () => {
      if (pressed.has(childRunId)) return;
      setPressed((before) => new Set([...before, childRunId]));
      void continueRun(childRunId).then((outcome) => {
        // CONTINUING: the dig's next read shows it running; anything else lets the person press again.
        if (outcome.kind === "CONTINUING") return;
        setPressed((before) => new Set([...before].filter((id) => id !== childRunId)));
      });
    }
  };
}
