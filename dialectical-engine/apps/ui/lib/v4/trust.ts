import type { Answer } from "@debateai/contract";
import { TRUST_WORDS, type TrustBasis, type TrustCounts, type TrustWord, type V4Point } from "./types.js";

/*
 * V4 initial (2026-10-28): the four trust words (row D decision 2), worked out from today's V3 answer. First-version
 * mapping, to be revalidated by the owner:
 *   an incoming "defeat" edge (target_kind NODE)  → DIDNT_HOLD / ANSWERED (answeredBy = the defeating point's claim)
 *   no second-AI review                           → no word yet (decision 6: left out of the groups and the bar)
 *   dispute                                       → STILL_ARGUED / DISPUTED
 *   cannot-assess                                 → STILL_ARGUED / COULD_NOT_CHECK
 *   agree, not FRESH                              → SURE_FOR_CASE / AGREED_BUT_DATED (asOf = relevant_as_of)
 *   agree, REASONING                              → SURE_FOR_CASE / ARGUED_AND_AGREED
 *   agree, LOOKED_UP or RAN                       → SURE / LOOKED_UP_AND_AGREED
 * Scores (base_score, final_strength) are never read here: no number from the engine reaches a V4 page.
 */

type AnswerNode = Answer["nodes"][number];

type Placed = Readonly<{ trust: TrustWord | null; basis: TrustBasis | null }>;

function placeReviewed(node: AnswerNode): Placed {
  const review = node.review;
  if (review === null) return { trust: null, basis: null };
  if (review.outcome === "dispute") return { trust: "STILL_ARGUED", basis: "DISPUTED" };
  if (review.outcome === "cannot-assess") return { trust: "STILL_ARGUED", basis: "COULD_NOT_CHECK" };
  if (node.staleness_state !== "FRESH") return { trust: "SURE_FOR_CASE", basis: "AGREED_BUT_DATED" };
  if (node.way_of_knowing === "REASONING") return { trust: "SURE_FOR_CASE", basis: "ARGUED_AND_AGREED" };
  return { trust: "SURE", basis: "LOOKED_UP_AND_AGREED" };
}

/** Every point of the answer with its trust word, keyed by node id, in the answer's order (first copy of an id wins). */
export function pointsOf(answer: Answer): ReadonlyMap<string, V4Point> {
  const claimOf = new Map<string, string>();
  for (const node of answer.nodes) {
    if (!claimOf.has(node.node_id)) claimOf.set(node.node_id, node.claim);
  }
  // The first defeat edge aimed at a point names who answered it.
  const defeatedBy = new Map<string, string>();
  for (const edge of answer.edges) {
    if (edge.relation !== "defeat" || edge.target_kind !== "NODE") continue;
    if (!defeatedBy.has(edge.target_ref)) defeatedBy.set(edge.target_ref, edge.from_node_ref);
  }
  const points = new Map<string, V4Point>();
  for (const node of answer.nodes) {
    if (points.has(node.node_id)) continue;
    const reasons = node.review === null ? [] : [...node.review.reasons];
    const defeater = defeatedBy.get(node.node_id);
    if (defeater !== undefined) {
      // DIDNT_HOLD beats every other rule, a review or not.
      points.set(node.node_id, {
        id: node.node_id,
        text: node.claim,
        trust: "DIDNT_HOLD",
        basis: "ANSWERED",
        reasons,
        answeredBy: claimOf.get(defeater) ?? null,
        asOf: null
      });
      continue;
    }
    const placed = placeReviewed(node);
    points.set(node.node_id, {
      id: node.node_id,
      text: node.claim,
      trust: placed.trust,
      basis: placed.basis,
      reasons,
      answeredBy: null,
      asOf: placed.basis === "AGREED_BUT_DATED" ? node.relevant_as_of : null
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
