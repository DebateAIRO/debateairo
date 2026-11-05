"use client";

import type { RunProjection } from "@debateai/contract";
import { V4MonthPause } from "@/components/v4/V4MonthPause";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { ownWords } from "@/lib/v4/askText";
import { pauseOfRun } from "@/lib/v4/monthPause";

/*
 * Owner review 3 Nov 2026 (wait-f5, public-f17): the waiting card of a debate (or a dig's own page) paused at the month
 * wall. The question, then the one pause block (V4MonthPause): its still dot takes the place of the working pulse, and
 * its sentence is the only state line, so the pause is said once. No "usually takes" line and no ticking time: nothing
 * runs while it is paused.
 *
 * The owner's answers of 5 Nov (question 12 B, journey-f19): "Open in the classic view" is in the account menu only, so the
 * card no longer draws it (`classicHref` is still accepted).
 *
 * Where it goes: V4DebateClient shows it in place of ProgressScreen while the run read carries `month_pause` (a thin
 * switch, so ProgressScreen itself is untouched). When the start-step's new wait view lands, this card's body (the block)
 * belongs inside that view in place of its state line; the switch then goes.
 */

/**
 * W2L-4 (the wave-2 checks, 4 Nov): once the run continues, the progress screen takes this card's place. Where Continue held
 * focus, it goes to that screen's question (its heading), found on the page, so the progress screen itself is untouched.
 */
function progressHeading(): HTMLElement | null {
  const heading = document.querySelector<HTMLElement>(".v4DebProgress .v4DebStatusQuestion");
  if (heading !== null && !heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  return heading;
}

export function V4PausedScreen({ run, runId, reconnecting, catalog, locale }: Readonly<{
  run: RunProjection;
  runId: string;
  reconnecting: boolean;
  /** Still accepted, never drawn (question 12 B: the classic view is in the account menu only). */
  classicHref?: string;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const pause = pauseOfRun(run);
  if (pause === null) return null;
  return (
    <section className="v4Card v4DebStatus v4DebProgress v4DebPausedCard">
      <p className="v4Eyebrow">{t(catalog, "v4.debate.yourQuestion")}</p>
      {/* The person's own words (the tab title follows this heading); the added lines are not a title. */}
      <h1 className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{ownWords(run.question_line)}</h1>
      <V4MonthPause runId={runId} pause={pause} catalog={catalog} locale={locale} focusAfter={progressHeading} />
      {reconnecting ? <p className="v4Muted">{t(catalog, "v4.debate.reconnecting")}</p> : null}
    </section>
  );
}
