import type { PathRewrite } from "@debateai/contract";
import { isFinishedRewrite, uniqueOpenQuestions } from "./mapModel.js";
import { TRUST_WORDS, type DigTarget, type DigView, type TrustCounts, type TrustWord, type V4Map, type V4OpenQuestion, type V4Path } from "./types.js";

/*
 * V4 screen review (owner picks of 3 Nov, OWNER-PICKS-2026-11-03.md): what the map's cards say and look like, worked out
 * from data the page already has. Nothing here fetches, stores or shows a number from the engine.
 *   - journey-f2: one look per state: OPEN ground (hatched, "Open", the only state that carries the star), LOOKING (a dig
 *     is working there: hatched with a slow pulse ring), NEW (a path a dig opened: dashed), SETTLED (solid, with its bar).
 *   - map-f8: the "How sure" sentence, from a small fixed set, built only from the findings' trust words.
 *   - dig-d4 / journey-f11: a finished dig's result: "Corrected", "Added to", "Confirmed", or nothing new found.
 *   - map-f26 / dig-f29: the open-question count drops only when a dig comes back Confirmed or Corrected, and "Good time to
 *     write your report" follows the same count.
 *   - map-f25 / map-f29 / dig-f20: card titles without the outcome words, dig titles in the words of what was dug.
 */

// ── map-f8: "How sure", from the trust words only ──────────────────────────────────────────────────────────────────

/** The main sentence by the word with the largest share: alone ("all") or with others ("most"). */
const MAIN_KEYS: Readonly<Record<TrustWord, Readonly<{ all: string; most: string }>>> = Object.freeze({
  SURE: { all: "v4.sure.SURE.all", most: "v4.sure.SURE.most" },
  SURE_FOR_CASE: { all: "v4.sure.SURE_FOR_CASE.all", most: "v4.sure.SURE_FOR_CASE.most" },
  STILL_ARGUED: { all: "v4.sure.STILL_ARGUED.all", most: "v4.sure.STILL_ARGUED.most" },
  DIDNT_HOLD: { all: "v4.sure.DIDNT_HOLD.all", most: "v4.sure.DIDNT_HOLD.most" }
});

/** The word that carries more than half of the checked points (Sure and Sure for the case named together), else null. */
function mostOf(counts: TrustCounts, total: number): TrustWord | null {
  if ((counts.SURE + counts.SURE_FOR_CASE) * 2 > total) return counts.SURE_FOR_CASE >= counts.SURE ? "SURE_FOR_CASE" : "SURE";
  if (counts.STILL_ARGUED * 2 > total) return "STILL_ARGUED";
  if (counts.DIDNT_HOLD * 2 > total) return "DIDNT_HOLD";
  return null;
}

/**
 * map-f8 (3 Nov): one plain "How sure" line from a small fixed set, at every reading level, built only from the trust words
 * of the findings — never a number. The main sentence: the one word when only one is there ("Sure."), else the word that
 * carries more than half ("Mostly sure for the case named.", the sure words counted together, the less sure of the two
 * named on a tie), else "The findings are mixed."; then one sentence each for points still argued and points that didn't
 * hold, unless the main sentence already says it; then, with `unchecked`, that some points were not checked. Nothing
 * checked: one sentence saying so.
 */
export function howSureKeys(counts: TrustCounts, unchecked = 0): readonly string[] {
  const present = TRUST_WORDS.filter((word) => counts[word] > 0);
  if (present.length === 0) return ["v4.sure.none"];
  const total = present.reduce((sum, word) => sum + counts[word], 0);
  const main = present.length === 1 ? present[0]! : mostOf(counts, total);
  const keys = [main === null ? "v4.sure.mixed" : present.length === 1 ? MAIN_KEYS[main].all : MAIN_KEYS[main].most];
  if (main !== "STILL_ARGUED" && counts.STILL_ARGUED > 0) keys.push(counts.STILL_ARGUED === 1 ? "v4.sure.argued.one" : "v4.sure.argued.some");
  if (main !== "DIDNT_HOLD" && counts.DIDNT_HOLD > 0) keys.push(counts.DIDNT_HOLD === 1 ? "v4.sure.fell.one" : "v4.sure.fell.some");
  if (unchecked > 0) keys.push("v4.sure.unchecked");
  return keys;
}

// ── dig-d4 / journey-f11: what a finished dig did ──────────────────────────────────────────────────────────────────

/** journey-f11 (3 Nov): the three result tags; "Still open" is gone (it read like "Still argued" and "Open"). */
export const DIG_RESULTS = ["CORRECTED", "ADDED_TO", "CONFIRMED"] as const;
export type DigResult = (typeof DIG_RESULTS)[number];
/** A finished dig's outcome: one of the three tags, or nothing new found (no tag: "Nothing new was found"). */
export type DigOutcome = DigResult | "NOTHING_NEW";

/** A dig still at work: waiting, running, or rewriting the path it came from (as the map's dig cards tell it). */
export function digIsWorking(dig: DigView): boolean {
  return dig.state === "WAITING" || dig.state === "RUNNING" || (dig.state === "DONE" && dig.rewrite?.state === "WRITING");
}

/** At least one of the dig's own points came out "Sure" or "Sure, for the case named" (null: the page cannot tell). */
function digPointsHeld(dig: DigView): boolean | null {
  if (dig.points !== undefined) return dig.points.some((point) => point.trust === "SURE" || point.trust === "SURE_FOR_CASE");
  if (dig.counts !== null) return dig.counts.SURE + dig.counts.SURE_FOR_CASE > 0;
  return null;
}

/** The points a rewrite rests on that came out sure (the server's words, W4-8), when it names them. */
function restingPointsHeld(rewrite: Extract<PathRewrite, { state: "READY" | "READY_WITH_RESERVATION" }>): boolean | null {
  if (rewrite.trust === undefined || rewrite.rests_on === undefined) return null;
  const rests = new Set(rewrite.rests_on);
  return rewrite.trust.some((point) => rests.has(point.node_id) && (point.word === "SURE" || point.word === "SURE_FOR_CASE"));
}

/**
 * dig-d4 A's rules, with journey-f11's three tags: a rewrite that changed the path's text is "Corrected" when the path's
 * outcome moved with it, else "Added to"; a rewrite that changed nothing is "Confirmed" when at least one point the dig
 * found came out sure, else nothing new was found. null: the rewrite is not finished, or the page cannot tell.
 */
export function rewriteOutcome(rewrite: PathRewrite, held: boolean | null): DigOutcome | null {
  if (!isFinishedRewrite(rewrite)) return null;
  if (rewrite.changed) return rewrite.fate_before !== rewrite.text.fate ? "CORRECTED" : "ADDED_TO";
  const sure = held ?? restingPointsHeld(rewrite);
  if (sure === null) return null;
  return sure ? "CONFIRMED" : "NOTHING_NEW";
}

/**
 * What a finished dig did. A dig of one of the main question's own open questions rewrites no path and changes no text,
 * so the same rule as an unchanged rewrite applies to its own points. null while it works, when it (or its rewrite)
 * failed, for a dig from before R22 (it wrote its own story and is told by its headline), and for a dig of a path whose
 * rewrite the page has not read yet.
 */
export function digOutcome(dig: DigView): DigOutcome | null {
  if (dig.state !== "DONE" || dig.rewrite === undefined) return null;
  if (dig.rewrite === null) {
    if (dig.link.openQuestionIds.some((place) => place.startsWith("path:"))) return null;
    const held = digPointsHeld(dig);
    return held === null ? null : held ? "CONFIRMED" : "NOTHING_NEW";
  }
  return rewriteOutcome(dig.rewrite, digPointsHeld(dig));
}

/** The newest finished rewrite of a path and its outcome (the tag its card carries), or null when none. */
export function pathOutcome(path: V4Path, digs: readonly DigView[]): Readonly<{ rewrite: PathRewrite; outcome: DigOutcome }> | null {
  const newest = (path.rewrites?.history ?? []).filter(isFinishedRewrite).at(-1);
  if (newest === undefined) return null;
  const dig = digs.find((candidate) => candidate.link.childRunId === newest.dig_run_id);
  const outcome = rewriteOutcome(newest, dig === undefined ? null : digPointsHeld(dig));
  return outcome === null ? null : { rewrite: newest, outcome };
}

/** dig-d4 B: a path holds when its own trust word is sure (its fate, when it has no word yet). */
export function pathHolds(path: V4Path): boolean {
  if (path.trust === "SURE" || path.trust === "SURE_FOR_CASE") return true;
  if (path.trust !== undefined && path.trust !== null) return false;
  return path.fate === "HELD_UP" || path.fate === "PARTLY_HELD";
}

// ── map-f26 / dig-f29 / map-f5: what is still open ─────────────────────────────────────────────────────────────────

/** The open questions a dig that did not fail covers (running ones included): the star moves off these (map-f5). */
export function dugIds(digs: readonly DigView[]): ReadonlySet<string> {
  return new Set(digs.filter((dig) => dig.state !== "FAILED").flatMap((dig) => dig.link.openQuestionIds));
}

/** map-f26: the open questions a dig came back from Confirmed or Corrected: only these leave the count. */
export function settledIds(digs: readonly DigView[]): ReadonlySet<string> {
  return new Set(digs.filter((dig) => {
    const outcome = digOutcome(dig);
    return outcome === "CONFIRMED" || outcome === "CORRECTED";
  }).flatMap((dig) => dig.link.openQuestionIds));
}

/** map-f26: open questions that could still change the answer, each once; a dig only starting does not lower it. */
export function openLeftCount(map: V4Map, digs: readonly DigView[]): number {
  const settled = settledIds(digs);
  return uniqueOpenQuestions(map).filter((question) => !settled.has(question.id)).length;
}

/** dig-f29: GOOD, "Good time to write your report"; DIG_DONE, the neutral "Your dig is done…" line; null: neither. */
export type ReportMoment = "GOOD" | "DIG_DONE" | null;

/**
 * dig-f29 (3 Nov): "Good time to write your report" only when nothing is running and either no open question is left to
 * look into (map-f26's count), or the question first starred has been looked into and nothing open could still change the
 * answer. Otherwise, once a dig is done and none runs, the neutral line, with no "good time" claim.
 */
export function reportMoment(map: V4Map, digs: readonly DigView[], firstStarId: string | null): ReportMoment {
  if (digs.some(digIsWorking)) return null;
  const settled = settledIds(digs);
  const open = uniqueOpenQuestions(map).filter((question) => !settled.has(question.id));
  if (open.length === 0) return "GOOD";
  const starLooked = firstStarId !== null
    && digs.some((dig) => dig.state === "DONE" && dig.link.openQuestionIds.includes(firstStarId));
  const wouldChange = open.some((question) => question.kind === "WOULD_CHANGE");
  if (starLooked && !wouldChange) return "GOOD";
  return digs.some((dig) => dig.state === "DONE") ? "DIG_DONE" : null;
}

/** The open question that carries the star on this map (null: none). */
export function starOf(map: V4Map): V4OpenQuestion | null {
  return [...map.open, ...map.paths.flatMap((path) => path.open)].find((question) => question.star) ?? null;
}

// ── journey-f2: one look per state ─────────────────────────────────────────────────────────────────────────────────

export const GROUNDS = ["OPEN", "LOOKING", "NEW", "SETTLED"] as const;
export type Ground = (typeof GROUNDS)[number];

/** The look of a dig's card: LOOKING while it works (a dig paused at the month wall is not working), else SETTLED. */
export function digGround(dig: DigView): Ground {
  return digIsWorking(dig) && dig.pausedUntil === undefined ? "LOOKING" : "SETTLED";
}

/** The class a card of this ground carries (v4-map-looks.css). */
export function groundClass(ground: Ground): string {
  return `v4Ground v4Ground${ground}`;
}

// ── map-f25 / map-f29 / dig-f20: titles ────────────────────────────────────────────────────────────────────────────

/**
 * map-f25: a story line often starts with its own short label and outcome ("Mostly renewables, plus some nuclear: held
 * up. The cheapest…"). A card shows the label alone, so no outcome words reach the card; the panel keeps the whole line.
 * The shape is read, not the words: a label of a few words, a colon, a clause of at most four words ending the sentence.
 */
const LABEL_AND_OUTCOME = /^([^:\n]{3,90}?):\s+[^\s.!?:;。！？]+(?:\s+[^\s.!?:;。！？]+){0,3}[.!?。！？](?:\s|$)/u;

export function cardLabel(line: string): string {
  const clean = line.replace(/\s+/gu, " ").trim();
  const match = LABEL_AND_OUTCOME.exec(clean);
  const label = match?.[1]?.trim() ?? "";
  return label.length >= 3 ? label : clean;
}

/** dig-f20: who wrote the first thing a dig looks into: the person (their own view, or their edit of a suggestion), or not. */
export function firstByOf(target: DigTarget): "AI" | "PERSON" {
  if (target.kind !== "picks") return "AI";
  const first = target.picks[0];
  if (first === undefined) return "AI";
  if (first.kind === "OWN_VIEW") return "PERSON";
  if (first.kind === "SUGGESTION") return first.text.trim() === first.suggestion.text.trim() ? "AI" : "PERSON";
  return "AI";
}
