import type { StoryFate, TrustWord } from "@debateai/contract";

/*
 * Round 2, r2-20 (owner, 3 Nov 2026: A, "four trust words everywhere"): on the report page and in its PDF a path shows its
 * bar and ONE trust word, never an outcome tag ("Held up", "Partly held", "Set aside", "Fell"). The word is worked out from
 * the evidence by code, never by an AI, with the start-step build's rule (its contract's pathTrustWordOf, not on this branch
 * yet): no checked point gives no word; nothing that held gives "Didn't hold"; otherwise the weakest word that held. A path
 * the debate weighed as an answer and found did not hold (fate FELL) reads "Didn't hold", as its position does on the map.
 */

/** Strongest first: the weakest of these that a path's points hold is its word. */
const HELD_ORDER: readonly TrustWord[] = Object.freeze(["SURE", "SURE_FOR_CASE", "STILL_ARGUED"]);

/** A path's one trust word from what became of it and its points' words (null: a point no second AI checked). */
export function pathTrustWord(fate: StoryFate | null, pointWords: readonly (TrustWord | null)[]): TrustWord | null {
  if (fate === "FELL") return "DIDNT_HOLD";
  const given = pointWords.filter((word): word is TrustWord => word !== null);
  if (given.length === 0) return null;
  const held = given.filter((word) => word !== "DIDNT_HOLD");
  if (held.length === 0) return "DIDNT_HOLD";
  return held.reduce((weakest, word) => HELD_ORDER.indexOf(word) > HELD_ORDER.indexOf(weakest) ? word : weakest);
}
