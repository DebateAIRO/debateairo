"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { RunProjection } from "@debateai/contract";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { runFailureMessage } from "@/lib/v3/runFailure";
import { ownWords } from "@/lib/v4/askText";
import type { DigRetry } from "@/lib/v4/digRetry";
import { continuingReason, digFailureMessage, failedQuotaKey, keepsFailingReason, quotaSomeUsed } from "@/lib/v4/failedRun";

/*
 * Owner review 3 Nov 2026 (wait-f11, map-f30): the page of a debate that did not finish. Its plain reason sentence (one of
 * the fixed sentences, lib/v3/runFailure.ts), what the AIs found before an update stopped it (decision 12), then the way
 * on. The main button is "Ask this again": it opens the ask step with the same question filled in, read back from the
 * server by the debate's id (only the id travels in the address, never the words), and nothing starts by itself. A grey
 * line under it says what is kept and that the paths list is made again like any new question. "Ask a new question" is a
 * small link under it. "Nothing was taken for the failed try." shows only when the server confirms it (lib/v4/failedRun.ts).
 *
 * A dig's own page (the dig did not finish) does not offer "Ask this again" (its question is the site's text for the AIs):
 * it leads back to the map it was dug from, where its panel offers "Try this dig again".
 *
 * The owner's answers of 5 Nov 2026: a dig's own page says its reason about the dig (question 3 A, the same line as its
 * panel), never the question's sentence. Under the reason, one quota line at most (question 20 A): a question says
 * "Nothing was taken for the failed try." when the server confirms nothing was used, and "The part that ran used some of
 * your quota." when it says some was; a dig says "Nothing was taken from your quota for this." only when nothing was used.
 * The wave-4 browser check (5 Nov): a dig's own page names the dig, not a question: "Your dig" above it and "This dig didn't
 * finish" as its heading (so its tab says it too; a drafted line). It draws no classic-view link: "Open in the classic view"
 * is in the account menu only (question 12 B, the owner's answers of 5 Nov).
 * The owner's third round (5 Nov afternoon): a dig that keeps failing because the AIs were unavailable drops "You can try
 * it again in a while." here too, as in its panel. The page says what the parent map offers (`digRetry`, worked out by the
 * page from the map's digs: the start-step session's wiring): "You can try this dig again from the map." only when the map
 * offers that try; absent, the page is as it was.
 * V4 start step, Task 57g (the owner's 7 Nov answers; agreed with the review session, which owns this screen's words): two optional props.
 * Given `onContinue` (the page gives it only when the run read says `continuable`), a question's page draws the primary button "Continue
 * where it stopped" and "Ask this again" says "Change the question" (the same link, the plain button beside it). The line under the button
 * ("What already ran is kept. Continuing pays only for what has not run yet.") shows only when the server says some quota was used; with
 * none, the screen keeps only "Nothing was taken for the failed try." (never both lines). Without `onContinue` the screen is as before.
 * Owner 7 Nov, question 41 A ("say both ways"; OPEN-OWNER-QUESTIONS-2026-11-04.md, sixth round): with `onContinue`, the grey line under
 * "Change the question" says what each way does (v4.failed.changeQuestionNote, or …NotePicks with the picks kept): changed, it is a new
 * question; left as it is, this debate continues where it stopped. Without `onContinue` the grey line is the one above, as before.
 * Owner 7 Nov, questions 42 A and 43 A (relayed by the review session): with `onContinue`, a question's reason drops its "ask again" ending
 * (lib/v4/failedRun.ts continuingReason; a reason without one keeps the shared sentence), and the three quota lines are the owner's, as built.
 * V4 start step, Task 57m (owner 8 Nov: "We should stop after 2 continues that fail, and say that we're investigating this and a future fix
 * will solve this"; "Yes, same rule" and "Use these drafts"): a question whose read says `keeps_failing` gets no Continue; under its reason
 * (cut of its "ask again" ending, as with Continue: the way on is "Change the question") it says "This keeps failing. We're looking into it,
 * and a future fix will solve it."; "Change the question" is the primary link, with the grey line from before Continue.
 * Task 57n (owner 8 Nov: "Drop it, like digs" and "Yes, same line"): that question's reason promises no other try (AIs unavailable drops
 * "Please try again in a while.", lib/v4/failedRun.ts keepsFailingReason). A dig's own page whose read says `keeps_failing` says its
 * reason in the dig's keeps-failing form, then the panel's line ("…You can still write your report…"), and drops the try-again note.
 */

export function V4FailedScreen({
  run, askAgainHref, askHref, dig, picksKept = false, digRetry, onContinue, continueNote, catalog, homeCatalog
}: Readonly<{
  run: RunProjection;
  /**
   * The ask step, filled from this debate (lib/v4/failedRun.ts askAgainHref). Task 75d: its words and its reading level are read
   * back from the server there, so the address names only the debate.
   */
  askAgainHref: string;
  /** The empty ask step. */
  askHref: string;
  /** This debate is a dig: the map it was dug from (null: not known), else null for a first debate. */
  dig: Readonly<{ backHref: string | null }> | null;
  /**
   * The person's picks come back with the question (the start-step's paths ticked again, and the place, time and purpose
   * once the server sends them back): the grey line then says the picks are kept too. Until then it says the question is.
   */
  picksKept?: boolean;
  /**
   * A dig only: what the parent map's panel offers for this dig (lib/v4/digRetry.ts DigRetry's kind). "OFFER": the map
   * offers "Try this dig again", so the page says so. "KEEPS_FAILING": the same dig failed again, so the page promises no
   * try (no note, and an AIs-unavailable reason without "You can try it again in a while."). "RETRIED" or "NONE": a later
   * try already runs, or the map cannot offer one, so no note. Absent: not known, the page as it was (the note shows).
   * Ignored for a first question.
   */
  digRetry?: DigRetry["kind"];
  /**
   * "Continue where it stopped", pressed (the page's Undo window comes first, then POST /v1/runs/{id}/continue). Absent:
   * no button, no line, and "Ask this again" as before. Ignored for a dig.
   */
  onContinue?: () => void;
  /** Task 57g: what a press of it shows right under the button (the shared Undo note, then its outcome). Only with `onContinue`. */
  continueNote?: ReactNode;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
}>) {
  const quotaKey = failedQuotaKey(run, dig !== null);
  const continuing = onContinue !== undefined;
  // Task 57m: a question whose two continues failed again (the read's `keeps_failing`): no Continue, its own line, "Change the question".
  const questionKeepsFailing = dig === null && !continuing && run.keeps_failing === true;
  // Task 57n (owner 8 Nov, "Yes, same line"): a dig's own page whose read says `keeps_failing` says the panel's line and offers no try.
  const digKeepsFailing = dig !== null && run.keeps_failing === true;
  const keepsFailing = digRetry === "KEEPS_FAILING" || digKeepsFailing;
  const mapOffersTry = !digKeepsFailing && (digRetry === undefined || digRetry === "OFFER");
  return (
    <section className="v4Card v4DebStatus v4DebFailed">
      <p className="v4Eyebrow">{t(catalog, dig === null ? "v4.debate.yourQuestion" : "v4.seed.yourDig")}</p>
      <p className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{ownWords(run.question_line)}</p>
      <h1 className="v4DebStatusTitle">{t(catalog, dig === null ? "v4.debate.failedTitle" : "v4.debate.digFailedTitle")}</h1>
      <p>
        {dig !== null
          ? digFailureMessage(run.terminal_reason, catalog, keepsFailing)
          : (questionKeepsFailing
            ? keepsFailingReason(run.terminal_reason, catalog)
            : continuing ? continuingReason(run.terminal_reason, catalog) : null)
            ?? runFailureMessage(run.terminal_reason, homeCatalog)}
      </p>
      {questionKeepsFailing ? <p>{t(catalog, "v4.failed.keepsFailing")}</p> : null}
      {digKeepsFailing ? <p>{t(catalog, "v4.digFailed.keepsFailingContinues")}</p> : null}
      {quotaKey === null ? null : <p>{t(catalog, quotaKey)}</p>}
      {/* Decision 12: what the AIs found before an update stopped this debate stays readable here. */}
      {run.found === undefined || run.found.length === 0 ? null : (
        <section>
          <h2>{t(catalog, "v4.debate.foundTitle")}</h2>
          <ul>
            {run.found.map((page) => (
              <li key={page.url}>
                <a className="v4Link" href={page.url} rel="noopener noreferrer" target="_blank">{page.title}</a>
                {page.note === null ? null : <p data-ai-generated="true">{page.note}</p>}
                {page.quotes.map((quote) => <blockquote key={quote}>{quote}</blockquote>)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {dig === null ? (
        <div className="v4DebFailedAgain">
          {continuing ? (
            <>
              <button type="button" className="v4Btn v4BtnPrimary v4DebFailedContinue" onClick={onContinue}>{t(catalog, "v4.failed.continue")}</button>
              {continueNote}
              {quotaSomeUsed(run) ? <p className="v4Muted v4DebFailedNote">{t(catalog, "v4.failed.continueLine")}</p> : null}
            </>
          ) : null}
          <Link className={continuing ? "v4Btn" : "v4Btn v4BtnPrimary"} href={askAgainHref}>
            {t(catalog, continuing || questionKeepsFailing ? "v4.failed.changeQuestion" : "v4.debate.askAgain")}
          </Link>
          <p className="v4Muted v4DebFailedNote">
            {t(catalog, continuing
              ? (picksKept ? "v4.failed.changeQuestionNotePicks" : "v4.failed.changeQuestionNote")
              : (picksKept ? "v4.debate.askAgainNote" : "v4.debate.askAgainNoteQuestion"))}
          </p>
        </div>
      ) : dig.backHref !== null ? (
        <div className="v4DebFailedAgain">
          <Link className="v4Btn v4BtnPrimary" href={dig.backHref}>{t(catalog, "v4.report.backToMap")}</Link>
          {mapOffersTry ? <p className="v4Muted v4DebFailedNote">{t(catalog, "v4.debate.digFailedBackNote")}</p> : null}
        </div>
      ) : null}
      <div className="v4DebStatusActions v4DebFailedLinks">
        <Link className={dig !== null && dig.backHref === null ? "v4Btn v4BtnPrimary" : "v4Link v4DebFailedNew"} href={askHref}>
          {t(catalog, "v4.debate.askNew")}
        </Link>
      </div>
    </section>
  );
}
