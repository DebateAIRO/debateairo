import { t, tPlural, type MessageCatalog } from "../i18n/translate.js";
import { draftTarget } from "./suggestions.js";
import type { DigTarget, V4DigDraft, V4OpenQuestion, V4Path, V4Selection } from "./types.js";

/*
 * V4 screen review, 3 Nov 2026 (OWNER-PICKS-2026-11-03.md: map-d4 A, map-f14, dig-f4): where the person's picks are dug.
 *  - map-f14: with one pick the dig button reads "Dig into this"; several picks keep the tray's words.
 *  - dig-f4: on a computer the tray appears only from the second pick, docked at the foot of the panel column; a phone
 *    has no tray (its pinned button carries the picks, and the Map sheet lists them with Clear).
 *  - map-d4 A: the panel's own dig button is pinned to the panel's foot. When that button already digs the picks, the
 *    docked tray offers no second one, so one pick never shows two dig buttons with different words (dig-f4).
 * Pure functions: nothing here fetches, stores or keeps anything.
 */

/** dig-f4: the tray is for combining picks, so it shows from this many on. */
export const TRAY_FROM_PICKS = 2;

/**
 * map-f14: a dig button's words. Several picks: "Dig into {count} together" (the tray's words); one pick: "Dig into this";
 * a whole path or an open question: "Dig here too" where a dig is already there (`again`), else the caller's own key.
 */
export function digButtonLabel(target: DigTarget, again: boolean, wholeKey: string, catalog: MessageCatalog, locale: string): string {
  if (target.kind === "picks" && target.picks.length >= TRAY_FROM_PICKS) {
    return tPlural(catalog, "v4.dig.trayDig", target.picks.length, locale);
  }
  if (target.kind === "picks" && target.picks.length === 1) return t(catalog, "v4.dig.intoThis");
  return t(catalog, again ? "v4.nest.digHereToo" : wholeKey);
}

/**
 * The picks' dig the main question's panel offers (null: none). "Your question" has nothing of its own to dig, so its
 * pinned button appears only when every pick is one of the open questions that panel lists (`listed`), so its "Dig into
 * this" is never about something the panel does not show.
 */
export function rootPicksTarget(listed: readonly V4OpenQuestion[], draft: V4DigDraft, paths: readonly V4Path[]): DigTarget | null {
  if (draft.picks.length === 0) return null;
  const ids = new Set(listed.map((question) => question.id));
  const all = draft.picks.every((pick) => pick.kind === "OPEN" && ids.has(pick.question.id));
  return all ? draftTarget(draft, paths) : null;
}

/**
 * Whether the panel open at `selection` digs the picks with its own pinned button: a path's panel when the picks are on
 * that path, and the main question's when it lists them all (`rootListed`, see rootPicksTarget).
 */
export function panelDigsPicks(selection: V4Selection, draft: V4DigDraft, rootListed: readonly V4OpenQuestion[],
  paths: readonly V4Path[]): boolean {
  if (draft.picks.length === 0) return false;
  if (selection === "root") return rootPicksTarget(rootListed, draft, paths) !== null;
  return draft.group !== null && selection === `path:${draft.group}`;
}

/** dig-f4: the tray shows on a computer only, and only from the second pick (null target: no picks). */
export function trayShows(target: DigTarget | null, phone: boolean): boolean {
  return !phone && target !== null && target.kind === "picks" && target.picks.length >= TRAY_FROM_PICKS;
}
