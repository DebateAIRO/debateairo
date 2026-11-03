"use client";

import { useEffect, useRef, useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { continueRun, type ContinueOutcome } from "@/lib/v4/money";
import { pauseDate, pauseDay, pauseSentence, type PauseState } from "@/lib/v4/monthPause";

/*
 * Owner review 3 Nov 2026: the ONE pause block (wait-f2), the same on the waiting card, in a paused dig's panel and on a
 * dig's own page. It says the pause once (wait-f5): a still, hollow dot (no pulse, public-f17) and one sentence. Before the
 * month resets: "Paused: this month's quota is used up. You can continue from 1 Dec 2026." and a plain label "Continues on
 * 1 Dec" where the button will be (map-f31: nothing that looks pressable before it can work). Once the server says it may
 * continue (`can_continue`, public-f16): "Your new month has started." and Continue. Both keep "What is already done is not
 * paid for again." Continue resumes the run itself (true resume); the page reads the run again and the pause goes.
 *
 * Motion (journey-d1 A): nothing moves here. When the block changes while it is on screen (the new month starts), it
 * changes at once and gets the 1-second soft highlight; the sentence itself is the written line, read out once.
 */

/** journey-d1 A: how long the soft highlight stays on a block that just changed. */
const CHANGED_HIGHLIGHT_MS = 1_000;

export function V4MonthPause({ runId, pause, catalog, locale, className }: Readonly<{
  /** The paused run (the debate, or the dig's own run): Continue resumes it. */
  runId: string;
  pause: PauseState;
  catalog: MessageCatalog;
  locale: string;
  className?: string;
}>) {
  const [pressing, setPressing] = useState(false);
  const [outcome, setOutcome] = useState<ContinueOutcome | null>(null);
  const [highlight, setHighlight] = useState(false);
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
  return (
    <div className={`v4Pause${highlight ? " v4PauseChanged" : ""}${className === undefined ? "" : ` ${className}`}`}>
      <p className="v4PauseLine" role="status">
        <span className="v4PauseDot" aria-hidden="true" />
        <span>{pauseSentence(pause, catalog, locale)}</span>
      </p>
      {pause.canContinue ? (
        <button type="button" className="v4Btn v4BtnPrimary v4PauseContinue" disabled={continuing} onClick={() => void press()}>
          {continuing ? t(catalog, "v4.money.continuing") : t(catalog, "v4.money.continue")}
        </button>
      ) : (
        <p className="v4PauseUntil">{t(catalog, "v4.pause.continuesOn", { date: pauseDay(pause.until, locale) })}</p>
      )}
      <p className="v4Muted">{t(catalog, "v4.money.continueNote")}</p>
      {outcome?.kind === "TOO_EARLY" ? (
        <p role="status">{t(catalog, "v4.money.continueTooEarly", { date: pauseDate(outcome.until, locale) })}</p>
      ) : null}
      {outcome?.kind === "FAILED" ? <p role="status">{t(catalog, "v4.money.continueFailed")}</p> : null}
    </div>
  );
}
