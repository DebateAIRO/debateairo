import type { Answer, AnswerStory } from "@debateai/contract";
import { TRUST_WORDS, type TrustBasis, type TrustCounts, type TrustWord, type V4Point } from "./types.js";
import { ranOnFree, sourcesOf } from "./web.js";

/*
 * V4 initial (2026-10-28): the four trust words (row D decision 2), worked out from today's V3 answer. First-version
 * mapping, to be revalidated by the owner:
 *   the position of a ready story path whose fate is FELL  → DIDNT_HOLD / FELL (fix wave 1, Decision B)
 *   no second-AI review                           → no word yet (decision 6: left out of the groups and the bar)
 *   dispute                                       → STILL_ARGUED / DISPUTED
 *   cannot-assess                                 → STILL_ARGUED / COULD_NOT_CHECK
 *   agree, not FRESH                              → SURE_FOR_CASE / AGREED_BUT_DATED (asOf = relevant_as_of)
 *   agree, REASONING                              → SURE_FOR_CASE / ARGUED_AND_AGREED
 *   agree, LOOKED_UP or RAN, no checked flag      → SURE_FOR_CASE / LOOKED_UP_AND_AGREED
 *   agree, the server's checked looked-up flag    → SURE / WEB_CHECKED_AND_AGREED (never on Free)
 * Perplexity plan W2-6 (owner, 30 Oct): "Sure" only on a point resting on a page this debate looked up — the server's
 * `looked_up_checked` (its locator is one of its own checked extracts) — with the second AI agreeing and the point fresh.
 * Without the flag a point is at most "Sure, for the case named": a remembered citation, a worked sum, and every debate
 * served before R22 (owner Q17: old debates get the new rule). Free never searches and never shows "Sure".
 * Edges are not read (DATA-1/RULES-2): serve sends "defeat" only at edges, and node.defeater_refs means "an objection
 * was recorded", not "it won" (morning question). No other point is marked DIDNT_HOLD tonight.
 * Scores (base_score, final_strength) are never read here: no number from the engine reaches a V4 page.
 */

type AnswerNode = Answer["nodes"][number];

type Placed = Readonly<{ trust: TrustWord | null; basis: TrustBasis | null }>;

function placeReviewed(node: AnswerNode, free: boolean): Placed {
  const review = node.review;
  if (review === null) return { trust: null, basis: null };
  if (review.outcome === "dispute") return { trust: "STILL_ARGUED", basis: "DISPUTED" };
  if (review.outcome === "cannot-assess") return { trust: "STILL_ARGUED", basis: "COULD_NOT_CHECK" };
  if (node.staleness_state !== "FRESH") return { trust: "SURE_FOR_CASE", basis: "AGREED_BUT_DATED" };
  if (node.way_of_knowing === "REASONING") return { trust: "SURE_FOR_CASE", basis: "ARGUED_AND_AGREED" };
  if (node.way_of_knowing === "LOOKED_UP" && node.looked_up_checked === true && !free) {
    return { trust: "SURE", basis: "WEB_CHECKED_AND_AGREED" };
  }
  return { trust: "SURE_FOR_CASE", basis: "LOOKED_UP_AND_AGREED" };
}

/** Decision B: the position nodes of a ready story's FELL paths (none without a ready story body). */
export function fellPositionsOf(story: AnswerStory | null): ReadonlySet<string> {
  const fell = new Set<string>();
  if (story === null || story.story === null) return fell;
  if (story.status !== "READY" && story.status !== "READY_WITH_RESERVATION") return fell;
  for (const path of story.story.short.paths) {
    if (path.fate === "FELL") fell.add(path.position_ref);
  }
  return fell;
}

/**
 * Every point of the answer with its trust word, keyed by node id, in the answer's order (first copy of an id wins).
 * `story` (optional) adds Decision B: a FELL path's position does not hold, whatever its review said.
 */
export function pointsOf(answer: Answer, story: AnswerStory | null = null): ReadonlyMap<string, V4Point> {
  const fell = fellPositionsOf(story);
  const free = ranOnFree(answer);
  const points = new Map<string, V4Point>();
  for (const node of answer.nodes) {
    if (points.has(node.node_id)) continue;
    const reasons = node.review === null ? [] : [...node.review.reasons];
    const placed: Placed = fell.has(node.node_id) ? { trust: "DIDNT_HOLD", basis: "FELL" } : placeReviewed(node, free);
    points.set(node.node_id, {
      id: node.node_id,
      text: node.claim,
      trust: placed.trust,
      basis: placed.basis,
      reasons,
      answeredBy: null,
      asOf: placed.basis === "AGREED_BUT_DATED" ? node.relevant_as_of : null,
      sources: sourcesOf(node)
    });
  }
  return points;
}

export function emptyCounts(): TrustCounts {
  return { SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 };
}

/** Counts per trust word; points no second AI has checked are counted apart (decision 6). */
export function countTrust(points: readonly V4Point[]): Readonly<{ counts: TrustCounts; unchecked: number }> {
  const counts: Record<TrustWord, number> = { ...emptyCounts() };
  let unchecked = 0;
  for (const point of points) {
    if (point.trust === null) unchecked += 1;
    else counts[point.trust] += 1;
  }
  return { counts, unchecked };
}

export function addCounts(a: TrustCounts, b: TrustCounts): TrustCounts {
  const sum: Record<TrustWord, number> = { ...emptyCounts() };
  for (const word of TRUST_WORDS) sum[word] = a[word] + b[word];
  return sum;
}
