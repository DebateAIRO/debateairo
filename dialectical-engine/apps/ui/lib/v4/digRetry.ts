import type { StartPaths } from "@debateai/contract";
import { sameItemText } from "./askText.js";
import { findOpenQuestion } from "./mapModel.js";
import { openPick, suggestionPick } from "./suggestions.js";
import type { DigLink, DigMode, DigTarget, DigView, PendingDig, V4DigPick, V4Map } from "./types.js";

/*
 * Owner review 3 Nov 2026 (dig-f12, wait-f18): a dig that did not finish is not a dead end. Its panel offers "Try this dig
 * again", which digs the same picks with the same Quick/Thorough choice through the usual 10-second Undo (nothing is sent
 * before it ends). After a second failure of the same dig the panel says "This keeps failing…" instead.
 *
 * The same picks: a dig started in this visit is remembered exactly as it was sent (in memory only, like the dig links of
 * this visit: never in the browser's storage). A dig from another visit or device is rebuilt from what its link keeps (its
 * places and the texts it dug) against the map: an open question by its place, a suggestion of its path by its text, and
 * any other text as the person's own view at that path; it is offered only when it would ask exactly what the failed run
 * asked (else nothing is offered). Server need (track report): the dig's picks on its run read or its dig-link record, so
 * any dig can be tried again exactly as sent.
 */

/** What a failed dig's panel offers. */
export type DigRetry =
  /**
   * "Try this dig again": this target, with this mode (null: unknown, the page's own choice then). V4 start step, Task 79
   * review: `paths`, the paths a path debate's dig went with (DIG_PICKS), sent again with it; absent, none were sent or known.
   */
  | Readonly<{ kind: "OFFER"; target: DigTarget; mode: DigMode | null; paths?: StartPaths }>
  /** The same dig failed twice: "This keeps failing. Write your report…". */
  | Readonly<{ kind: "KEEPS_FAILING" }>
  /** A later try of the same dig is running or done: nothing more is offered here. */
  | Readonly<{ kind: "RETRIED" }>
  /** Not a failed dig, or its picks are no longer on the map. */
  | Readonly<{ kind: "NONE" }>;

const NONE: DigRetry = Object.freeze({ kind: "NONE" });
const RETRIED: DigRetry = Object.freeze({ kind: "RETRIED" });
const KEEPS_FAILING: DigRetry = Object.freeze({ kind: "KEEPS_FAILING" });

/** A dig as sent, remembered for this visit (Task 79 review: with the paths it went with, when it sent any). */
export type SentDig = Readonly<{ target: DigTarget; mode: DigMode; paths?: StartPaths }>;

function oneLine(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** Whether two digs dug the same: the same earlier debate, the same places (in any order) and the same texts (in order). */
export function sameDig(a: DigLink, b: DigLink): boolean {
  if (a.parentRunId.toLowerCase() !== b.parentRunId.toLowerCase()) return false;
  const places = (link: DigLink) => [...new Set(link.openQuestionIds)].sort().join("\u0000");
  const texts = (link: DigLink) => link.questions.map(oneLine).filter((text) => text.length > 0);
  const left = texts(a);
  const right = texts(b);
  return places(a) === places(b) && left.length === right.length && left.every((text, index) => text === right[index]);
}

/**
 * The dig `link` made, rebuilt against `map` (another visit's dig): null when a place it dug is no longer on the map, or it
 * names no text. Open questions are found by their place; at a path, each text is an open question of it, else one of
 * its suggestions as written, else the person's own view.
 */
export function rebuildDigTarget(link: DigLink, map: V4Map): DigTarget | null {
  const named = link.questions.map(oneLine).filter((text) => text.length > 0);
  if (named.length === 0) return null;
  const pathPlaces = link.openQuestionIds.filter((place) => place.startsWith("path:"));
  const placed = link.openQuestionIds.filter((place) => !place.startsWith("path:")).map((place) => findOpenQuestion(map, place));
  const questions = placed.filter((question): question is NonNullable<typeof question> => question !== null);
  if (pathPlaces.length === 0) {
    // Open questions only: every place must still be an open question of this map, one per text.
    return questions.length === placed.length && questions.length === named.length ? Object.freeze({ kind: "open", questions }) : null;
  }
  // At a path, a place may also be where a suggestion rests (a point that is not open): only the path must be there.
  const pathId = pathPlaces[0]!.slice("path:".length);
  const path = map.paths.find((candidate) => candidate.id === pathId);
  if (path === undefined) return null;
  // A dig found again by its question's text names the path's line first, before its picks.
  const texts = named.length > 1 && sameItemText(named[0]!, path.line) ? named.slice(1) : named;
  // The whole path: its one text is the path's own line.
  if (questions.length === 0 && texts.length === 1 && sameItemText(texts[0]!, path.line)) return Object.freeze({ kind: "path", path });
  const picks = texts.map((text, index): V4DigPick => {
    const open = questions.find((question) => sameItemText(text, question.text));
    if (open !== undefined) return openPick(open);
    const suggestion = (path.suggestions ?? []).find((candidate) => sameItemText(text, candidate.text));
    if (suggestion !== undefined) return suggestionPick(path.id, suggestion);
    // Its own key, so sending it never takes a pick of the person's current choice off the tray.
    return Object.freeze({ kind: "OWN_VIEW", key: `retry:${link.childRunId}:${index}`, group: path.id, text });
  });
  return Object.freeze({ kind: "picks", path, picks });
}

/**
 * What the panel of `dig` offers (`digs`: every dig of this map, oldest first, as the page lists them). A later try of the
 * same dig that has not failed means it was tried again; two failures of the same dig mean it keeps failing. A dig sent in
 * this visit is tried again exactly as sent; one rebuilt from its link only when `asksTheSame` says the rebuilt dig would
 * ask exactly what the failed one asked (the page compares the question it would send with the failed run's own).
 */
export function digRetryOf(dig: DigView, digs: readonly DigView[], map: V4Map, sent: SentDig | null,
  asksTheSame: (target: DigTarget) => boolean): DigRetry {
  if (dig.state !== "FAILED") return NONE;
  const at = digs.findIndex((other) => other.link.childRunId === dig.link.childRunId);
  const same = digs.filter((other) => sameDig(other.link, dig.link));
  const later = at === -1 ? [] : digs.slice(at + 1).filter((other) => sameDig(other.link, dig.link));
  if (later.some((other) => other.state !== "FAILED")) return RETRIED;
  if (same.filter((other) => other.state === "FAILED").length >= 2) return KEEPS_FAILING;
  if (sent !== null) {
    return Object.freeze({ kind: "OFFER", target: sent.target, mode: sent.mode, ...(sent.paths === undefined ? {} : { paths: sent.paths }) });
  }
  const target = rebuildDigTarget(dig.link, map);
  if (target === null || !asksTheSame(target)) return NONE;
  return Object.freeze({ kind: "OFFER", target, mode: dig.link.mode });
}

/** The pending dig a retry makes: the same target, mode and paths (Task 79 review), through the usual Undo window. */
export function retryPending(offer: Extract<DigRetry, { kind: "OFFER" }>, mode: DigMode, now: number, undoMs: number): PendingDig {
  return Object.freeze({ target: offer.target, mode, sendsAt: now + undoMs, ...(offer.paths === undefined ? {} : { paths: offer.paths }) });
}
