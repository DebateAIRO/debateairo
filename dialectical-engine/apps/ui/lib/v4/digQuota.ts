import type { AskRoom } from "../billing/room.js";
import { t, tPlural, type MessageCatalog } from "../i18n/translate.js";
import { limitLine, limitWindowOf, resetText, sharePeriodOf, type LimitWindow } from "./money.js";
import type { DigTarget } from "./types.js";

/*
 * The owner's screen review (3 Nov 2026): what every dig button on the map says about the quota, in one place. Pure
 * functions: nothing here reads or keeps anything.
 *  - journey-f13 / public-d3 A: one dig button, "Dig here · up to 3%"; dig-f5: with picks, "Dig into your picks · up to
 *    6%" ("your pick" for one); the tray, "Dig into these · up to 5%". "Dig here too" and "Dig deeper here" are gone. The
 *    share is on the button (the Undo note repeats it) and in no other line. dig-f5: "up to", not "about", until the
 *    server's estimate stops counting every rewrite above a deep dig as if every level changes (still so on 4 Nov:
 *    apps/api ask-room.ts #digUpdatesPartMicros); the word is one catalogue line (v4.undo.barShare), so the switch to
 *    "about" is one line.
 *  - dig-f5: each button's share comes from its own check with the server (lib/v4/useDigQuota.ts): a whole path or one
 *    open question has one share, the person's picks another; a button whose share is not known shows its words alone.
 *  - public-d3 A / journey-f8: the period is named once, by the Quick look / Thorough switch, with the approved
 *    reassurance: "of today · you can still finish your report" ("of this month" on Free; the window the server names,
 *    map-f33). A share that changed shows its change in grey for 2 seconds ("+4%", "−2%"), never in red.
 *  - dig-f11 / journey-f14 / journey-f15: while new digs wait for a reset, every dig button stays where it is, greyed,
 *    with the reset time on it ("Dig here · after 08:00"), and a visible line beside it says why and from when (the
 *    approved day line; the week's and the month's own lines). Nothing starts by itself.
 */

/** The share the page knows per kind of dig (null: not known). */
export type DigShares = Readonly<{ whole: number | null; picks: number | null }>;

/** While new digs wait for a reset: which window holds them, and until when. */
export type DigWait = LimitWindow;

/** New digs wait for this window's reset (public-f24: whichever server switch is in force); null while digs can start. */
export function digWaitOf(room: AskRoom | null): DigWait | null {
  return limitWindowOf(room);
}

/** This dig's share: the picks' read for the picks, the whole read for a whole path or one open question; else none. */
export function shareOfTarget(target: DigTarget, shares: DigShares): number | null {
  if (target.kind === "picks") return shares.picks;
  if (target.kind === "open" && target.questions.length !== 1) return null;
  return shares.whole;
}

/** "after 08:00", "after Monday 09:00", or "on December 1" (journey-f15: one way to write a reset). */
export function waitWords(wait: DigWait, catalog: MessageCatalog, locale: string): string {
  const when = resetText(wait.at, wait.scope, locale);
  return wait.scope === "PERSON_MONTH" ? t(catalog, "v4.dig.on", { date: when }) : t(catalog, "v4.dig.after", { time: when });
}

/** The button's own words: "Dig here", "Dig into your pick(s)", or in the tray, for several picks, "Dig into these". */
export function digWords(target: DigTarget, catalog: MessageCatalog, locale: string, tray = false): string {
  if (target.kind !== "picks") return t(catalog, "v4.panel.dig");
  if (tray && target.picks.length >= 2) return t(catalog, "v4.dig.trayDigThese");
  return tPlural(catalog, "v4.dig.yourPicks", target.picks.length, locale);
}

/**
 * The dig button's whole label: "Dig here · up to 3%"; while new digs wait for a reset, "Dig here · after 08:00";
 * without a known share, the words alone.
 */
export function digButtonLabel(input: Readonly<{
  target: DigTarget; share: number | null; wait: DigWait | null; catalog: MessageCatalog; locale: string; tray?: boolean;
}>): string {
  const { target, share, wait, catalog, locale } = input;
  const words = digWords(target, catalog, locale, input.tray === true);
  if (wait !== null) return `${words} · ${waitWords(wait, catalog, locale)}`;
  return share === null ? words : `${words} · ${t(catalog, "v4.undo.barShare", { percent: share })}`;
}

/** public-d3 A: the period, once, by the Quick look / Thorough switch: "of today · you can still finish your report". */
export function digPeriodLine(room: AskRoom | null, catalog: MessageCatalog): string {
  return t(catalog, `v4.dig.period.${sharePeriodOf(room)}`);
}

/**
 * dig-f11: the line beside a greyed dig button. The day: the approved "You've used what today allows for digging. Write
 * your report now, or keep digging after 14:00."; the week and the month: the V4 limit line of that window (public-f24).
 * Null while digs can start.
 */
export function digWaitLine(room: AskRoom | null, catalog: MessageCatalog, locale: string): string | null {
  const wait = digWaitOf(room);
  if (wait === null) return null;
  if (wait.scope === "PERSON_DAY") return t(catalog, "v4.dig.quotaDayUsed", { time: resetText(wait.at, wait.scope, locale) });
  const line = limitLine(room, locale);
  return line === null ? null : t(catalog, line.key, line.values);
}

/** journey-f8: a share that changed, as its grey mark: "+4%" or "−2%" (the real minus sign); null when it did not change. */
export function shareChangeText(before: number, after: number): string | null {
  const change = after - before;
  if (change === 0) return null;
  return change > 0 ? `+${change}%` : `−${-change}%`;
}

/** What the page lends the panel and the tray for the dig buttons' quota words (V4Panel's optional `digQuota`). */
export type V4DigQuota = Readonly<{
  /** The button's whole label for a dig of this target (`tray`: the tray's own words for several picks). */
  label: (target: DigTarget, tray?: boolean) => string;
  /** The share shown on the button for this target (for its grey change mark), or null. */
  share: (target: DigTarget) => number | null;
  /** The period line by the switch; null when no share is known or new digs wait. */
  periodLine: string | null;
  /** New digs wait for a reset: the visible line saying why and from when; null while digs can start. */
  waitLine: string | null;
}>;
