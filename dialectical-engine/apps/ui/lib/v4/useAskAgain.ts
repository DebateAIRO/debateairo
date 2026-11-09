"use client";

import { useEffect, useState } from "react";
import { contractClient } from "@/lib/api";
import type { MessageCatalog } from "@/lib/i18n/translate";
import { askAgainContinuable, askAgainQuestion } from "./failedRun.js";
import type { ReadingLevel } from "./types.js";

/*
 * Owner review 3 Nov 2026 (wait-f11, map-f30): "Ask this again" opens the ask step with the question filled in. The page
 * address names only the debate (`/v4?again=<run id>`); its words are read back from the server (the person's own debate,
 * asker-scoped), never carried in the address. Nothing starts by itself: the person reads, changes and presses Next.
 *
 * V4 start step, Task 75d (owner, 5 Nov): it also carries the failed debate's own reading level, read back with its words (the
 * run read's `reading_level`); a debate asked without one gives none, so the ask step stays on Plain words. Never from the address.
 *
 * V4 start step, Task 57g (the owner's 7 Nov answers, replacing Task 57e's re-use link and its `again_of`): whether the stopped debate can
 * continue where it stopped (`continuable`, failedRun.ts askAgainContinuable). Opened from the stopped page's "Change the question", the
 * words left as they were then continue that debate on its map, with no reading and no new charge (V4AskClient); changed words are a new
 * question. False: today's "Ask this again".
 */

/** What "Ask this again" fills in from the earlier debate. */
export type AskAgain = Readonly<{
  /** Its question (null: none to fill in: a dig, or empty words). */
  question: string | null;
  /** The level it was asked at (null: asked without one). */
  level: ReadingLevel | null;
  /** Task 57g: the server would continue the stopped debate itself (false: the same words are a new question, as before). */
  continuable: boolean;
}>;

/** What to fill in from run `runId` (null: none named, not read yet, or unreadable). Never throws. */
export function useAskAgain(runId: string | null, catalog: MessageCatalog): AskAgain | null {
  const [again, setAgain] = useState<AskAgain | null>(null);
  useEffect(() => {
    if (runId === null) return;
    let active = true;
    Promise.resolve().then(() => contractClient.readRun(runId)).then(
      (run) => {
        if (active) setAgain(Object.freeze({ question: askAgainQuestion(run, catalog), level: run.reading_level ?? null, continuable: askAgainContinuable(run, catalog) }));
      },
      () => { /* quiet: the ask step stays as it is */ }
    );
    return () => {
      active = false;
    };
  }, [runId, catalog]);
  return again;
}
