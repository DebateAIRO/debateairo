"use client";

import { useEffect, useId, useRef, useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { continueRun, type ContinueOutcome } from "@/lib/v4/money";
import { pauseDate, pauseDay, pauseSentence, type PauseState } from "@/lib/v4/monthPause";
import { replayHighlight } from "@/lib/v4/highlight";
import { focusInPlace, useFocusHandOff } from "@/lib/v4/useFocusHandOff";

/*
 * Owner review 3 Nov 2026: the ONE pause block (wait-f2), the same on the waiting card, in a paused dig's panel and on a
 * dig's own page. It says the pause once (wait-f5): a still, hollow dot (no pulse, public-f17) and one sentence. Before the
 * month resets: "Paused: this month's quota is used up. You can continue from December 1." The owner's answers of 5 Nov
 * (question 19 A, journey-f14, public-d4 A): where Continue will be, a greyed button "Continue on December 1" (no dashed
 * outline: dashed is kept for "New", journey-f2), focusable and named by that sentence, its visible reason. Pressing it
 * early sends nothing and adds no sentence: the sentence gets the 1-second highlight and focus stays. Once the server says
 * it may continue (`can_continue`, public-f16): "Your new month has started." and the same button is the live Continue
 * (one element, so focus is never lost when the month turns). Both keep "What is already done is not paid for again."
 * Continue resumes the run itself (true resume); the page reads the run again and the pause goes.
 *
 * Motion (journey-d1 A): nothing moves here. When the block changes while it is on screen (the new month starts), it
 * changes at once and gets the 1-second soft highlight; the sentence itself is the written line, read out once.
 */

/** journey-d1 A: how long the soft highlight stays on a block that just changed. */
const CHANGED_HIGHLIGHT_MS = 1_000;

export function V4MonthPause({ runId, pause, catalog, locale, className, focusAfter }: Readonly<{
  /** The paused run (the debate, or the dig's own run): Continue resumes it. */
  runId: string;
  pause: PauseState;
  catalog: MessageCatalog;
  locale: string;
  className?: string;
  /**
   * W2L-4 (the wave-2 checks, 4 Nov): the block goes once the run continues. Where Continue held focus, it goes here then
   * (the panel's heading, the progress screen's question), without scrolling. Absent: nothing is moved.
   */
  focusAfter?: () => HTMLElement | null;
}>) {
  const [pressing, setPressing] = useState(false);
  const [outcome, setOutcome] = useState<ContinueOutcome | null>(null);
  const [highlight, setHighlight] = useState(false);
  const reasonId = useId();
  const reasonRef = useRef<HTMLParagraphElement | null>(null);
  const mounted = useRef(true);
  const shownReady = useRef(pause.canContinue);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The month reset while the block was on screen: it changes at once, with the soft highlight for a second.
  useEffect(() => {
    if (shownReady.current === pause.canContinue) return;
    shownReady.current = pause.canContinue;
    setOutcome(null);
    setHighlight(true);
    const timer = window.setTimeout(() => setHighlight(false), CHANGED_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [pause.canContinue]);

  const press = async (): Promise<void> => {
    setPressing(true);
    const next = await continueRun(runId);
    if (!mounted.current) return;
    setOutcome(next);
    setPressing(false);
  };
  const continuing = pressing || outcome?.kind === "CONTINUING";
  // W2L-4: Continue keeps its focus while the press is on its way (aria-disabled and aria-busy, never native disabled), and
  // when the block goes with it, focus is handed on (lib/v4/useFocusHandOff.ts).
  const handOff = useFocusHandOff(true, () => focusInPlace(focusAfter?.() ?? null));
  return (
    <div className={`v4Pause${highlight ? " v4Highlight" : ""}${className === undefined ? "" : ` ${className}`}`}>
      <p ref={reasonRef} id={reasonId} className="v4PauseLine" role="status">
        <span className="v4PauseDot" aria-hidden="true" />
        <span>{pauseSentence(pause, catalog, locale)}</span>
      </p>
      {/* Question 19 A: one button in one place, greyed before the reset and the live Continue after it. */}
      <button
        type="button"
        className={`v4Btn v4BtnPrimary v4PauseContinue${pause.canContinue ? "" : " v4DigWaiting"}`}
        aria-disabled={!pause.canContinue || continuing ? "true" : undefined}
        aria-busy={pause.canContinue && continuing ? "true" : undefined}
        aria-describedby={pause.canContinue ? undefined : reasonId}
        onClick={() => {
          if (!pause.canContinue) replayHighlight(reasonRef.current);
          else if (!continuing) void press();
        }}
        onFocus={handOff.onFocus}
        onBlur={handOff.onBlur}
      >
        {!pause.canContinue
          ? t(catalog, "v4.pause.continuesOn", { date: pauseDay(pause.until, locale) })
          : continuing ? t(catalog, "v4.money.continuing") : t(catalog, "v4.money.continue")}
      </button>
      <p className="v4Muted">{t(catalog, "v4.money.continueNote")}</p>
      {outcome?.kind === "TOO_EARLY" ? (
        <p role="status">{t(catalog, "v4.money.continueTooEarly", { date: pauseDate(outcome.until, locale) })}</p>
      ) : null}
      {outcome?.kind === "FAILED" ? <p role="status">{t(catalog, "v4.money.continueFailed")}</p> : null}
    </div>
  );
}
