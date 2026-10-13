/**
 * Debate shape — the two choices the propagated numbers make (pure code; no model is asked):
 *  · adaptive deeper rounds (spec §3.3 step 5): at the round-1 boundary, per position, the `deeperTopPoints` chosen
 *    points with the highest ROOT leverage (resolveLeverage: the largest change in any root when the point is
 *    removed) keep their chains; a frozen (ε) or unscored point never does. Later rounds extend the same chains.
 *  · scrutiny (step 7): after the planned rounds, nodes ranked by need — a spread at or above the disagreement
 *    threshold, a reviewer dispute, or root leverage ≥ leverageMin with base strength < weakBelow — then leverage,
 *    then plan order; at most `pointsPerDebate`.
 */
export function shapeSelectChains(input: Readonly<{ chainsByRoot: ReadonlyMap<number, readonly number[]>;
  leverageOf: (position: number) => number | null; frozen: ReadonlySet<number>; perRoot: number }>): ReadonlySet<number> {
  const selected = new Set<number>();
  const bound = Math.max(0, input.perRoot);
  for (const chains of input.chainsByRoot.values()) {
    const scored = chains.flatMap((position) => {
      if (input.frozen.has(position)) return [];
      const leverage = input.leverageOf(position);
      return leverage === null ? [] : [{ position, leverage }];
    });
    scored.sort((left, right) => right.leverage - left.leverage || left.position - right.position);
    for (const entry of scored.slice(0, bound)) selected.add(entry.position);
  }
  return selected;
}

export type ScrutinyCandidate = Readonly<{ position: number; rootIndex: number; dispersion: number | null; disputed: boolean;
  rootLeverage: number | null; baseTau: number }>;

export function shapeRankScrutiny(input: Readonly<{ candidates: readonly ScrutinyCandidate[]; disagreementThreshold: number;
  leverageMin: number; weakBelow: number; pointsPerDebate: number }>): readonly ScrutinyCandidate[] {
  const needs = (node: ScrutinyCandidate): number =>
    (node.dispersion !== null && node.dispersion >= input.disagreementThreshold ? 1 : 0)
    + (node.disputed ? 1 : 0)
    + (node.rootLeverage !== null && node.rootLeverage >= input.leverageMin && node.baseTau < input.weakBelow ? 1 : 0);
  const budget = Math.max(0, input.pointsPerDebate);
  return Object.freeze(input.candidates
    .map((node) => ({ node, needs: needs(node) }))
    .filter((entry) => entry.needs > 0)
    .sort((left, right) => right.needs - left.needs
      || (right.node.rootLeverage ?? -1) - (left.node.rootLeverage ?? -1)
      || left.node.position - right.node.position)
    .slice(0, budget)
    .map((entry) => entry.node));
}
