"use client";

import { useEffect, useState } from "react";
import { contractClient } from "@/lib/api";
import type { MessageCatalog } from "@/lib/i18n/translate";
import { askAgainQuestion } from "./failedRun.js";

/*
 * Owner review 3 Nov 2026 (wait-f11, map-f30): "Ask this again" opens the ask step with the question filled in. The page
 * address names only the debate (`/v4?again=<run id>`); its words are read back from the server (the person's own debate,
 * asker-scoped), never carried in the address. Nothing starts by itself: the person reads, changes and presses Next.
 */

/** The question to fill in from run `runId` (null: none named, not read yet, unreadable, or a dig). Never throws. */
export function useAskAgain(runId: string | null, catalog: MessageCatalog): string | null {
  const [question, setQuestion] = useState<string | null>(null);
  useEffect(() => {
    if (runId === null) return;
    let active = true;
    Promise.resolve().then(() => contractClient.readRun(runId)).then(
      (run) => {
        if (active) setQuestion(askAgainQuestion(run, catalog));
      },
      () => { /* quiet: the ask step stays as it is */ }
    );
    return () => {
      active = false;
    };
  }, [runId, catalog]);
  return question;
}
