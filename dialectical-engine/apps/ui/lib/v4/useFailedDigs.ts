"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { V4FailedDigs } from "@/components/v4/V4DigFailed";
import type { AskRoom } from "@/lib/billing/room";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { effectiveDigMode } from "./askConfig.js";
import { digQuestion } from "./askText.js";
import { digRetryOf, retryPending } from "./digRetry.js";
import { addDig, DIG_UNDO_MS, readDigUndo, waitingDigFor, type DigUndoResult } from "./digUndo.js";
import { digFailureMessage } from "./failedRun.js";
import { continueStopped, limitLine } from "./money.js";
import type { DigMode, DigTarget, DigView, PendingDig, V4Map } from "./types.js";
import { sentDigOf } from "./useSentDigs.js";

/*
 * A dig that did not finish (owner review 3 Nov, dig-f12 / wait-f18): its reason, and "Try this dig again". The digs this
 * visit sends are remembered as sent (memory only), so a retry digs exactly the same picks; the retry goes through the
 * same 10-second Undo note as any dig (the page's dig queue), with the failed dig's own Quick/Thorough choice. Moved out of
 * V4DebateClient so the page only wires it. The owner's answer to question 3 (5 Nov 2026, A): the reason is said about the
 * dig, one V4 line per reason group (lib/v4/failedRun.ts digFailureMessage), no longer the question's sentence.
 *
 * V4 start step, Task 57i (the owner's answer of 7 Nov afternoon, his card "Continue the same dig (Recommended)": "Same as the new
 * debate button: what the first try finished is kept, the person pays only for what never ran, and anything we must redo is on us"):
 * where the dig's own run read says `continuable`, the same button continues THAT dig. It waits out the same 10-second dig Undo (the
 * site-wide note of lib/v4/digUndo.ts, no share said: continuing pays only for what has not run), then one POST
 * /v1/runs/{digRunId}/continue (lib/v4/money.ts continueStopped, the stopped page's call); no new ask and no new dig. CONTINUING: the
 * dig keeps its place and id on the map and shows as running again (the page's `rereadDig`). NOT_CONTINUABLE: the note goes quietly,
 * the dig is read again, and the button digs afresh from then on (as before 57i). NO_ROOM: the usual quota words (the page's room
 * read, as the stopped page says them); else the dig's own "We couldn't start this dig. Please try again.", and the button can be
 * pressed again. One waiting dig per place, as for any dig: a second press while it waits does nothing.
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
  /** No longer read (question 3 A: the dig's reason is a V4 line); kept so the page's call stays as it is. */
  homeCatalog?: MessageCatalog;
  locale: string;
  /** Task 57i: the page's room read, for the quota words of a continue refused for no room (null: none). */
  room?: AskRoom | null;
  /** Task 57i: the debates above this one (top first): their report pages wait for a dig continued from here too. */
  aboveRunIds?: readonly string[];
  /** Task 57i: reads a dig again; `running`, it was just continued, so it shows as running at once. */
  rereadDig?: (childRunId: string, running: boolean) => void;
}>): V4FailedDigs | undefined {
  const { map, digs, canDig, digMode, planTier, servedQuestionLine, queueDig, catalog, locale } = input;
  // Task 57i: the digs the API would not continue (in this visit): their button digs afresh, whatever a late read says.
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set());
  const latest = useRef({ room: input.room ?? null, aboveRunIds: input.aboveRunIds ?? [], rereadDig: input.rereadDig, catalog, locale });
  useEffect(() => {
    latest.current = { room: input.room ?? null, aboveRunIds: input.aboveRunIds ?? [], rereadDig: input.rereadDig, catalog, locale };
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useMemo<V4FailedDigs | undefined>(() => {
    if (map === null) return undefined;
    // A dig rebuilt from its link is offered only when it would ask exactly what the failed one asked.
    const asked = (line: string): string => line.replace(/\s+/gu, " ").trim();
    const retryOf = (dig: DigView) => {
      const { continuable: _refused, ...asIfNot } = dig;
      return digRetryOf(refused.has(dig.link.childRunId) ? asIfNot : dig, digs, map, sentDigOf(dig.link.childRunId), (target) =>
        servedQuestionLine !== null && dig.questionLine !== undefined
          && asked(digQuestion(target, servedQuestionLine, catalog, locale)) === asked(dig.questionLine));
    };
    // Task 57i: what the continue's answer makes of the dig's note.
    const continueSend = async (childRunId: string): Promise<DigUndoResult> => {
      const outcome = await continueStopped(childRunId);
      const now = latest.current;
      if (outcome.kind === "CONTINUING") {
        now.rereadDig?.(childRunId, true);
        return { kind: "STARTED", childRunId, startedAt: new Date().toISOString() };
      }
      if (outcome.kind === "NOT_CONTINUABLE") {
        setRefused((before) => new Set([...before, childRunId]));
        now.rereadDig?.(childRunId, false);
        return { kind: "STOPPED" };
      }
      const held = outcome.kind === "NO_ROOM" ? limitLine(now.room, now.locale) : null;
      return { kind: "REFUSED", message: held === null ? t(now.catalog, "v4.dig.failed") : t(now.catalog, held.key, held.values) };
    };
    const continueDig = (childRunId: string, target: DigTarget, mode: DigMode): void => {
      if (waitingDigFor(readDigUndo(), map.runId, target) !== null) return;
      addDig({
        parentRunId: map.runId,
        runIds: latest.current.aboveRunIds,
        dig: { target, mode, sendsAt: Date.now() + DIG_UNDO_MS },
        // Continuing pays only for what has not run yet: no share of a whole dig is said.
        sharePercent: null,
        showMode: planTier !== "free",
        send: () => continueSend(childRunId),
        failedLine: t(catalog, "v4.dig.failed"),
        alive: () => mounted.current
      });
    };
    return {
      retryOf,
      onRetry: (dig: DigView) => {
        const retry = retryOf(dig);
        if (retry.kind !== "OFFER" || !canDig) return;
        const mode = effectiveDigMode(retry.mode ?? digMode, planTier);
        if (retry.continues === true) continueDig(dig.link.childRunId, retry.target, mode);
        else queueDig(retryPending(retry, mode, Date.now(), DIG_UNDO_MS));
      },
      reasonText: (reason, keepsFailing) => digFailureMessage(reason, catalog, keepsFailing === true)
    };
  }, [map, digs, canDig, digMode, planTier, servedQuestionLine, catalog, locale, queueDig, refused]);
}
