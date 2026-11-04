"use client";

import { useMemo } from "react";
import type { V4FailedDigs } from "@/components/v4/V4DigFailed";
import type { MessageCatalog } from "@/lib/i18n/translate";
import { runFailureMessage } from "@/lib/v3/runFailure";
import { effectiveDigMode } from "./askConfig.js";
import { digQuestion } from "./askText.js";
import { digRetryOf, retryPending } from "./digRetry.js";
import { DIG_UNDO_MS } from "./digUndo.js";
import type { DigMode, DigView, PendingDig, V4Map } from "./types.js";
import { sentDigOf } from "./useSentDigs.js";

/*
 * A dig that did not finish (owner review 3 Nov, dig-f12 / wait-f18): its reason, and "Try this dig again". The digs this
 * visit sends are remembered as sent (memory only), so a retry digs exactly the same picks; the retry goes through the
 * same 10-second Undo note as any dig (the page's dig queue), with the failed dig's own Quick/Thorough choice. Moved out of
 * V4DebateClient so the page only wires it.
 */
export function useFailedDigs(input: Readonly<{
  map: V4Map | null;
  digs: readonly DigView[];
  canDig: boolean;
  digMode: DigMode;
  planTier: "free" | "premium";
  /** The whole text sent for the debate the map shows (null until it is served). */
  servedQuestionLine: string | null;
  queueDig: (dig: PendingDig) => void;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  locale: string;
}>): V4FailedDigs | undefined {
  const { map, digs, canDig, digMode, planTier, servedQuestionLine, queueDig, catalog, homeCatalog, locale } = input;
  return useMemo<V4FailedDigs | undefined>(() => {
    if (map === null) return undefined;
    // A dig rebuilt from its link is offered only when it would ask exactly what the failed one asked.
    const asked = (line: string): string => line.replace(/\s+/gu, " ").trim();
    const retryOf = (dig: DigView) => digRetryOf(dig, digs, map, sentDigOf(dig.link.childRunId), (target) =>
      servedQuestionLine !== null && dig.questionLine !== undefined
        && asked(digQuestion(target, servedQuestionLine, catalog, locale)) === asked(dig.questionLine));
    return {
      retryOf,
      onRetry: (dig: DigView) => {
        const retry = retryOf(dig);
        if (retry.kind !== "OFFER" || !canDig) return;
        queueDig(retryPending(retry, effectiveDigMode(retry.mode ?? digMode, planTier), Date.now(), DIG_UNDO_MS));
      },
      reasonText: (reason) => runFailureMessage(reason, homeCatalog)
    };
  }, [map, digs, canDig, digMode, planTier, homeCatalog, servedQuestionLine, catalog, locale, queueDig]);
}
