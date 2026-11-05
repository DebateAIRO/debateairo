import type { RunProjection } from "@debateai/contract";
import { formatDate, t, type MessageCatalog } from "../i18n/translate.js";
import type { DigView } from "./types.js";

/*
 * Owner review 3 Nov 2026 (wait-f2, wait-f5, map-f31, public-f16, public-f17): one pause, said once, everywhere a debate
 * or a dig stopped at the month wall shows. The server decides both facts: until when (`month_pause.until`) and whether
 * it may continue now (`month_pause.can_continue`, true once the person's new month has started). The page never works
 * either out from the clock. The owner's answers of 5 Nov (question 19 A): before the reset a greyed "Continue on 1
 * December" (public-d4 A's words) stays where Continue will be, with the pause's one sentence as the visible line that says
 * why (journey-f14); pressing it sends nothing. After the reset the same button is the live Continue. Nothing pulses while
 * paused: the mark is a still, hollow dot. Nothing is kept anywhere.
 */

/** One pause as the pages show it. */
export type PauseState = Readonly<{ until: string; canContinue: boolean }>;

/** The pause of a running debate (its own page, or a dig's own page), or null. */
export function pauseOfRun(run: RunProjection): PauseState | null {
  const pause = run.month_pause;
  return pause === undefined ? null : Object.freeze({ until: pause.until, canContinue: pause.can_continue });
}

/** The pause of a dig on the map, or null (only a dig still running can be paused). */
export function pauseOfDig(dig: DigView): PauseState | null {
  if (dig.state !== "RUNNING" || dig.pausedUntil === undefined) return null;
  return Object.freeze({ until: dig.pausedUntil, canContinue: dig.canContinue === true });
}

/**
 * The month pause's date, in one form everywhere (journey-f22's "Paused until 1 December", journey-f15: every page writes
 * the reset the same way; the wave-2 checks, 4 Nov): the day and the month's name in the page's language, no year, in a
 * sentence and on a card alike (the same form as lib/v4/stateWords.ts dayText and the month's reset in money.ts).
 */
export function pauseDate(until: string, locale: string): string {
  return formatDate(locale, until, { day: "numeric", month: "long" });
}

/** The date on a card or label: the same one form as in a sentence (pauseDate). */
export function pauseDay(until: string, locale: string): string {
  return pauseDate(until, locale);
}

/** The pause's one sentence: before the reset, until when; after it, that the new month has started. */
export function pauseSentence(pause: PauseState, catalog: MessageCatalog, locale: string): string {
  return pause.canContinue
    ? t(catalog, "v4.money.pausedReady")
    : t(catalog, "v4.money.paused", { date: pauseDate(pause.until, locale) });
}

/** A paused dig's card line: "Dig · paused until 1 Dec", then "Dig · ready to continue" once the month has reset. */
export function digPauseCardLine(pause: PauseState, catalog: MessageCatalog, locale: string): string {
  return pause.canContinue
    ? t(catalog, "v4.pause.digCardReady")
    : t(catalog, "v4.pause.digCard", { date: pauseDay(pause.until, locale) });
}

/**
 * For the phone's pinned bar (the bottom-stack track draws it): its word "Paused", then the button's words: "Continue"
 * after the reset, the greyed "Continue on 1 December" before it (question 19 A), with `reason`, the pause's one sentence,
 * as the visible line right above the bar (journey-f14; null after the reset). Together they read "Paused · Continue".
 */
export type PausePhoneBar = Readonly<{ label: string; continueLabel: string | null; untilLabel: string | null; reason: string | null }>;

export function pausePhoneBar(pause: PauseState, catalog: MessageCatalog, locale: string): PausePhoneBar {
  return Object.freeze({
    label: t(catalog, "v4.pause.phoneBar"),
    continueLabel: pause.canContinue ? t(catalog, "v4.money.continue") : null,
    untilLabel: pause.canContinue ? null : t(catalog, "v4.pause.continuesOn", { date: pauseDay(pause.until, locale) }),
    reason: pause.canContinue ? null : pauseSentence(pause, catalog, locale)
  });
}

/** How many digs are paused at the month wall (the rail counts them apart from the running ones). */
export function pausedDigCount(digs: readonly DigView[]): number {
  return digs.filter((dig) => pauseOfDig(dig) !== null).length;
}
