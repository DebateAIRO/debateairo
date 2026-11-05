import type { RunProjection } from "@debateai/contract";
import { formatDate, formatDateAndTime, t, type MessageCatalog } from "../i18n/translate.js";
import { CLOCK_24H } from "./clock.js";
import type { DigState } from "./types.js";

/*
 * Owner's screen review, 3 Nov 2026 (journey-f22): ONE short list of state words, the same on the waiting card, the map's
 * cards, the rail, "Your questions", the report and (later) the emails:
 *   "Looking into it" · "Waiting · starts after 08:00" · "Paused until 1 December" (only for the month's quota) ·
 *   "Ready" · "Didn't finish"; for the report the working word is "Being written".
 * Two waits that are not the month's pause keep their own words from the same review, so "Paused" means one thing only:
 * a question waiting for the person's own other question (wait-f6: no time, the server's time there is only its next
 * check) and the server's short hold (wait-f20: "Taking a short break"). After the month resets, a paused debate is
 * "Ready to continue" (wait-f2).
 * Times are clock times from the server (journey-f15, journey-f16): never "N minutes ago", never a guessed duration.
 * Nothing here is kept in the browser.
 */

export const WAIT_STATE_KINDS = [
  "LOOKING",
  "WAITING",
  "WAITING_OWN",
  "SHORT_BREAK",
  "PAUSED",
  "READY",
  "DIDNT_FINISH",
  "BEING_WRITTEN"
] as const;
export type WaitStateKind = (typeof WAIT_STATE_KINDS)[number];

export type WaitState =
  /** The AIs are working on it (a question, a dig or a path). */
  | Readonly<{ kind: "LOOKING" }>
  /** It waits for the quota to reset and starts by itself after `startsAfter` (ISO); null: the server gave no time. */
  | Readonly<{ kind: "WAITING"; startsAfter: string | null }>
  /** It waits for the person's own other question to finish first. */
  | Readonly<{ kind: "WAITING_OWN" }>
  /** The server holds it for a moment; it goes on by itself about `continuesAbout` (ISO), or null when not known. */
  | Readonly<{ kind: "SHORT_BREAK"; continuesAbout: string | null }>
  /** The month's quota is used up: paused until `until` (ISO); `canContinue` once the new month has started. */
  | Readonly<{ kind: "PAUSED"; until: string; canContinue: boolean }>
  | Readonly<{ kind: "READY" }>
  | Readonly<{ kind: "DIDNT_FINISH" }>
  /** The report is being written. */
  | Readonly<{ kind: "BEING_WRITTEN" }>;

/** The dot beside the word: one slow pulse while the AIs work, hollow and still while it waits, solid when ready. */
export type WaitDot = "PULSE" | "HOLLOW" | "SOLID" | "NONE";

/** One line to show: its catalogue key and the values its placeholders take. */
export type StateWord = Readonly<{ key: string; values: Readonly<Record<string, string>> }>;

/** True while the AIs work on it right now: the pulse, "Still working · checked …" and "taking longer than usual". */
export function isWorking(state: WaitState): boolean {
  return state.kind === "LOOKING" || state.kind === "BEING_WRITTEN";
}

/** True while it goes on, or starts or continues by itself: the card says the person can leave the page. */
export function keepsGoing(state: WaitState): boolean {
  return isWorking(state) || state.kind === "WAITING" || state.kind === "WAITING_OWN" || state.kind === "SHORT_BREAK";
}

export function waitDotOf(state: WaitState): WaitDot {
  if (isWorking(state)) return "PULSE";
  if (state.kind === "READY") return "SOLID";
  if (state.kind === "DIDNT_FINISH") return "NONE";
  // Waiting, a short break and the month's pause: still and hollow (wait-f5: no pulse while nothing runs).
  return "HOLLOW";
}

function validDate(value: string | number | Date): Date | null {
  const when = value instanceof Date ? value : new Date(value);
  return Number.isNaN(when.getTime()) ? null : when;
}

/**
 * "14:31" in the page's language, on the 24-hour clock of every V4 page (journey-f15, lib/v4/clock.ts: the same form as
 * the reset times of lib/v4/money.ts), or null when unreadable.
 */
export function clockText(value: string | number | Date, locale: string): string | null {
  const when = validDate(value);
  return when === null ? null : formatDate(locale, when, CLOCK_24H);
}

/**
 * A clock time that names its day only when it is not today: "14:31", or "3 November 2026, 14:31" on another day (a
 * report or a question started before midnight, a wait that ends tomorrow). `now` is the moment the page compares with.
 * The owner's answers of 5 Nov 2026: question 4 A (the long form with the year for every date but the month reset) and
 * the third round ("Started 4 November 2026, 14:02" on the report page, the map's report line, the waiting card and the
 * list of your questions alike; a same-day start stays "Started 14:02"). This is the one helper all of them use, so they
 * always agree. English joins the date and the clock as the owner's record writes them ("29 October 2026, 14:30");
 * every other language lets its own date format join them (German "4. November 2026 um 14:02"). 24 hours everywhere.
 */
export function whenText(value: string | number | Date, locale: string, now: number = Date.now()): string | null {
  const when = validDate(value);
  if (when === null) return null;
  if (when.toDateString() === new Date(now).toDateString()) return clockText(when, locale);
  return formatDateAndTime(locale, when);
}

/** "1 December": the day the month's pause ends, in the page's language. */
export function dayText(value: string | number | Date, locale: string): string | null {
  const when = validDate(value);
  return when === null ? null : formatDate(locale, when, { day: "numeric", month: "long" });
}

/** The state's word as a catalogue key and its values. `now` decides whether a time also names its day. */
export function stateWordOf(state: WaitState, locale: string, now: number = Date.now()): StateWord {
  switch (state.kind) {
    case "LOOKING":
      return { key: "v4.state.LOOKING", values: {} };
    case "WAITING": {
      const time = state.startsAfter === null ? null : whenText(state.startsAfter, locale, now);
      return time === null ? { key: "v4.state.WAITING.noTime", values: {} } : { key: "v4.state.WAITING", values: { time } };
    }
    case "WAITING_OWN":
      return { key: "v4.state.WAITING_OWN", values: {} };
    case "SHORT_BREAK": {
      const time = state.continuesAbout === null ? null : whenText(state.continuesAbout, locale, now);
      return time === null ? { key: "v4.state.SHORT_BREAK.noTime", values: {} } : { key: "v4.state.SHORT_BREAK", values: { time } };
    }
    case "PAUSED": {
      if (state.canContinue) return { key: "v4.state.PAUSED.canContinue", values: {} };
      const date = dayText(state.until, locale);
      return date === null ? { key: "v4.state.PAUSED.noDate", values: {} } : { key: "v4.state.PAUSED", values: { date } };
    }
    case "READY":
      return { key: "v4.state.READY", values: {} };
    case "DIDNT_FINISH":
      return { key: "v4.state.DIDNT_FINISH", values: {} };
    case "BEING_WRITTEN":
      return { key: "v4.state.BEING_WRITTEN", values: {} };
  }
}

export function stateWordText(state: WaitState, catalog: MessageCatalog, locale: string, now: number = Date.now()): string {
  const word = stateWordOf(state, locale, now);
  return t(catalog, word.key, word.values);
}

/** The fields of a question's status read that say what it is doing (RunProjection). */
export type RunStateFields = Pick<RunProjection, "state" | "hold_until" | "waits_until" | "waits_for" | "month_pause">;

/**
 * A question's status read as one of the state words. Starting, running and writing up the answer are all "Looking into
 * it" (one true line, journey-d2); the month's pause wins over the run state, as the server pauses a running debate.
 */
export function waitStateOfRun(run: RunStateFields): WaitState {
  const pause = run.month_pause ?? null;
  if (pause !== null) return { kind: "PAUSED", until: pause.until, canContinue: pause.can_continue };
  switch (run.state) {
    case "WAITING":
      return run.waits_for === "OWN_DEBATES" ? { kind: "WAITING_OWN" } : { kind: "WAITING", startsAfter: run.waits_until ?? null };
    case "HOLDING":
      return { kind: "SHORT_BREAK", continuesAbout: run.hold_until };
    case "FAILED":
      return { kind: "DIDNT_FINISH" };
    case "QUEUED":
    case "CLAIMED":
    case "RUNNING":
    case "SETTLED":
      return { kind: "LOOKING" };
  }
}

/**
 * A dig as one of the state words: its state, and the month's pause when its own run is paused (`pausedUntil`, and
 * `canContinue` when the page knows it; absent: not yet).
 */
export function waitStateOfDig(dig: Readonly<{ state: DigState; pausedUntil?: string; canContinue?: boolean }>): WaitState {
  if (dig.pausedUntil !== undefined && (dig.state === "RUNNING" || dig.state === "WAITING")) {
    return { kind: "PAUSED", until: dig.pausedUntil, canContinue: dig.canContinue === true };
  }
  switch (dig.state) {
    case "WAITING":
      return { kind: "WAITING", startsAfter: null };
    case "RUNNING":
      return { kind: "LOOKING" };
    case "DONE":
      return { kind: "READY" };
    case "FAILED":
      return { kind: "DIDNT_FINISH" };
  }
}
