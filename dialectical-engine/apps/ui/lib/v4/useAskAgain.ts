"use client";

import { useEffect, useState } from "react";
import { contractClient } from "@/lib/api";
import type { MessageCatalog } from "@/lib/i18n/translate";
import { askAgainQuestion, askAgainReuseOf, type AskAgainReuse } from "./failedRun.js";
import type { ReadingLevel } from "./types.js";

/*
 * Owner review 3 Nov 2026 (wait-f11, map-f30): "Ask this again" opens the ask step with the question filled in. The page
 * address names only the debate (`/v4?again=<run id>`); its words are read back from the server (the person's own debate,
 * asker-scoped), never carried in the address. Nothing starts by itself: the person reads, changes and presses Next.
 *
 * V4 start step, Task 75d (owner, 5 Nov): it also carries the failed debate's own reading level, read back with its words (the
 * run read's `reading_level`); a debate asked without one gives none, so the ask step stays on Plain words. Never from the address.
 *
 * V4 start step, Task 57e (the owner's 6 Nov rule: "re-use what we already paid for"): when the failed debate's read says `reusable`, the
 * re-use link too (`reuse`, failedRun.ts askAgainReuseOf): the ask that sends it as `again_of`, with that line unchanged, starts the question
 * again on its kept clarifying answers and paths, with no call before Start and no new charge. Null: today's "Ask this again".
 */

/** What "Ask this again" fills in from the earlier debate. */
export type AskAgain = Readonly<{
  /** Its question (null: none to fill in: a dig, or empty words). */
  question: string | null;
  /** The level it was asked at (null: asked without one). */
  level: ReadingLevel | null;
  /** Task 57e: what the failed question kept for the next try (null: nothing; the ask is today's). */
  reuse: AskAgainReuse | null;
}>;

/** What to fill in from run `runId` (null: none named, not read yet, or unreadable). Never throws. */
export function useAskAgain(runId: string | null, catalog: MessageCatalog): AskAgain | null {
  const [again, setAgain] = useState<AskAgain | null>(null);
  useEffect(() => {
    if (runId === null) return;
    let active = true;
    Promise.resolve().then(() => contractClient.readRun(runId)).then(
      (run) => {
        if (active) setAgain(Object.freeze({ question: askAgainQuestion(run, catalog), level: run.reading_level ?? null, reuse: askAgainReuseOf(run, catalog) }));
      },
      () => { /* quiet: the ask step stays as it is */ }
    );
    return () => {
      active = false;
    };
  }, [runId, catalog]);
  return again;
}
